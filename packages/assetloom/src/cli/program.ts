import path from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import { clean, generate } from '../api/generate.js';
import { loadConfiguration } from '../config/load.js';
import { asLoomError, LoomError } from '../domain/errors.js';
import type { TargetPlatform } from '../domain/types.js';
import { createGenerationPlan, parseTarget } from '../planner/index.js';
import { verify } from '../verification/index.js';
import { printError, printResult } from './output.js';

interface CommonCommandOptions {
  config: string[];
  target?: string;
}

interface VerifyCommandOptions extends CommonCommandOptions {
  native?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function addCommonOptions(command: Command): Command {
  return command
    .requiredOption(
      '-c, --config <file>',
      'configuration file; repeat in merge order',
      collect,
      [],
    )
    .addOption(
      new Option(
        '--target <target>',
        'generate only android or ios resources',
      ),
    );
}

function targetOption(value?: string): TargetPlatform | undefined {
  return value === undefined ? undefined : parseTarget(value);
}

function relativePlan(
  projectRoot: string,
  tasks: Awaited<ReturnType<typeof createGenerationPlan>>['tasks'],
) {
  return tasks.map((task) => ({
    ...task,
    destination: path
      .relative(projectRoot, task.destination)
      .split(path.sep)
      .join('/'),
    sourceDependencies: task.sourceDependencies.map((source) =>
      path.relative(projectRoot, source).split(path.sep).join('/'),
    ),
  }));
}

function rootOptions(command: Command): { json: boolean; verbose: boolean } {
  const options = command.optsWithGlobals<{
    json?: boolean;
    verbose?: boolean;
  }>();
  return {
    json: options.json === true,
    verbose: options.verbose === true,
  };
}

export function createProgram(): Command {
  const program = new Command()
    .name('assetloom')
    .description(
      'Generate deterministic native Android and iOS application resources.',
    )
    .version('0.1.0')
    .option('--json', 'emit machine-readable JSON')
    .option('--verbose', 'include diagnostic stack traces')
    .showHelpAfterError()
    .exitOverride();

  addCommonOptions(
    program.command('plan').description('print the deterministic generation plan'),
  ).action(async (options: CommonCommandOptions, command: Command) => {
    const loaded = await loadConfiguration(options.config);
    const plan = await createGenerationPlan(
      loaded,
      targetOption(options.target),
    );
    const tasks = relativePlan(loaded.projectRoot, plan.tasks);
    printResult(
      { ok: true, plan: { targets: plan.targets, tasks } },
      rootOptions(command),
      tasks
        .map(
          (task) =>
            `${task.operation.padEnd(14)} ${task.target.padEnd(7)} ${task.destination}`,
        )
        .join('\n'),
    );
  });

  addCommonOptions(
    program.command('generate').description('generate and publish native resources'),
  ).action(async (options: CommonCommandOptions, command: Command) => {
    const loaded = await loadConfiguration(options.config);
    const target = targetOption(options.target);
    const result = await generate(loaded, {
      ...(target === undefined ? {} : { target }),
    });
    printResult(
      {
        ok: true,
        result: {
          targets: result.plan.targets,
          written: result.written.map((item) =>
            path.relative(loaded.projectRoot, item).split(path.sep).join('/'),
          ),
          unchanged: result.unchanged.map((item) =>
            path.relative(loaded.projectRoot, item).split(path.sep).join('/'),
          ),
          removed: result.removed.map((item) =>
            path.relative(loaded.projectRoot, item).split(path.sep).join('/'),
          ),
        },
      },
      rootOptions(command),
      `Generated ${result.written.length} changed file(s); ${result.unchanged.length} unchanged; ${result.removed.length} stale file(s) removed.`,
    );
  });

  addCommonOptions(
    program.command('verify').description('verify generated native resources'),
  )
    .option('--native', 'also compile resources with native platform tools')
    .action(async (options: VerifyCommandOptions, command: Command) => {
      const loaded = await loadConfiguration(options.config);
      const target = targetOption(options.target);
      const result = await verify(loaded, {
        ...(target === undefined ? {} : { target }),
        ...(options.native === true ? { native: true } : {}),
      });
      printResult(
        { ok: true, result },
        rootOptions(command),
        `Verified ${result.checked.length} generated file(s).`,
      );
    });

  addCommonOptions(
    program.command('clean').description('remove only Assetloom-owned outputs'),
  ).action(async (options: CommonCommandOptions, command: Command) => {
    const loaded = await loadConfiguration(options.config);
    const removed = await clean(loaded, targetOption(options.target));
    printResult(
      {
        ok: true,
        result: {
          removed: removed.map((item) =>
            path.relative(loaded.projectRoot, item).split(path.sep).join('/'),
          ),
        },
      },
      rootOptions(command),
      `Removed ${removed.length} Assetloom-owned file(s).`,
    );
  });

  return program;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const program = createProgram();
  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === 'commander.helpDisplayed' ||
        error.code === 'commander.version'
      ) {
        return 0;
      }
      const loomError = new LoomError({
        code: 'LOOM_CLI_USAGE',
        message: error.message,
        cause: error,
      });
      printError(loomError, {
        json: program.opts<{ json?: boolean }>().json === true,
        verbose: program.opts<{ verbose?: boolean }>().verbose === true,
      });
      return error.exitCode || 2;
    }
    const loomError = asLoomError(error);
    printError(loomError, {
      json: program.opts<{ json?: boolean }>().json === true,
      verbose: program.opts<{ verbose?: boolean }>().verbose === true,
    });
    return 1;
  }
}
