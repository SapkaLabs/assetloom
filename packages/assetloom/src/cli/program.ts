import path from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import { clean } from '../api/generate.js';
import { cleanV2 } from '../api/clean-v2.js';
import { generateVersioned } from '../api/generate-v2.js';
import { createCatalogReport } from '../api/report-v2.js';
import { createHtmlReport } from '../api/report.js';
import { verifyV2 } from '../api/verify-v2.js';
import { loadVersionedConfiguration } from '../config/load.js';
import { asLoomError, LoomError } from '../domain/errors.js';
import type {
  GenerationTask,
  LoadedConfiguration,
  LoadedVersionedConfiguration,
  TargetPlatform,
} from '../domain/types.js';
import { createDefaultCatalogRuntime } from '../infrastructure/composition/default-catalog-runtime.js';
import {
  createCompositeGenerationPlan,
  type CompositePlannedArtifact,
} from '../application/planning/composite-planner.js';
import { createGenerationPlan, parseTarget } from '../planner/index.js';
import { verify } from '../verification/index.js';
import {
  printError,
  printGenerationResult,
  printInformation,
  printResult,
} from './output.js';
import { writeCliGenerationResultFile } from './result-file.js';

interface CommonCommandOptions {
  config: string[];
  target?: string;
}

interface VerifyCommandOptions extends CommonCommandOptions {
  native?: boolean;
}

interface GenerateCommandOptions extends CommonCommandOptions {
  report?: boolean;
  reportOutput?: string;
  resultFile?: string;
}

interface ReportCommandOptions extends CommonCommandOptions {
  output?: string;
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function addCommonOptions(command: Command): Command {
  return command
    .requiredOption(
      '-c, --config <file>',
      'configuration file; repeat in merge order',
      collect,
    )
    .addOption(
      new Option(
        '--target <target>',
        'process only one named target (schema v1: android or ios)',
      ),
    );
}

function targetOption(value?: string): TargetPlatform | undefined {
  return value === undefined ? undefined : parseTarget(value);
}

function legacyLoaded(
  loaded: LoadedVersionedConfiguration,
): LoadedConfiguration {
  if (loaded.config.schemaVersion !== 1) {
    throw new LoomError({
      code: 'LOOM_INTERNAL',
      message: 'A schema-v2 configuration reached the legacy command path.',
    });
  }
  return { ...loaded, config: loaded.config };
}

function portableRelative(projectRoot: string, destination: string): string {
  return path.relative(projectRoot, destination).split(path.sep).join('/');
}

function relativeNativePlan(
  projectRoot: string,
  tasks: readonly GenerationTask[],
) {
  return tasks.map((task) => ({
    ...task,
    destination: portableRelative(projectRoot, task.destination),
    sourceDependencies: task.sourceDependencies.map((source) =>
      portableRelative(projectRoot, source),
    ),
  }));
}

function relativeCompositePlan(
  projectRoot: string,
  artifacts: readonly CompositePlannedArtifact[],
) {
  return artifacts.map((artifact) => ({
    ...artifact,
    destination: portableRelative(projectRoot, artifact.destination),
    sourceDependencies: artifact.sourceDependencies.map((source) =>
      portableRelative(projectRoot, source),
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
      'Generate deterministic native and configurable application resources.',
    )
    .version('0.2.0')
    .option('--json', 'emit machine-readable JSON')
    .option('--verbose', 'include diagnostic stack traces')
    .showHelpAfterError()
    .configureOutput({ writeErr: () => undefined })
    .exitOverride();

  addCommonOptions(
    program.command('plan').description('print the deterministic generation plan'),
  ).action(async (options: CommonCommandOptions, command: Command) => {
    const loaded = await loadVersionedConfiguration(options.config);
    if (loaded.config.schemaVersion === 1) {
      const nativeLoaded = legacyLoaded(loaded);
      const plan = await createGenerationPlan(
        nativeLoaded,
        targetOption(options.target),
      );
      const tasks = relativeNativePlan(nativeLoaded.projectRoot, plan.tasks);
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
      return;
    }

    const runtime = createDefaultCatalogRuntime(loaded);
    const plan = await createCompositeGenerationPlan(
      loaded,
      runtime.resourceHandlers,
      runtime.planningContext,
      options.target,
    );
    const artifacts = relativeCompositePlan(
      loaded.projectRoot,
      plan.artifacts,
    );
    printResult(
      { ok: true, plan: { targets: plan.targets, artifacts } },
      rootOptions(command),
      artifacts
        .map(
          (artifact) =>
            `${artifact.operation.padEnd(18)} ${artifact.target.padEnd(12)} ${artifact.destination}`,
        )
        .join('\n'),
    );
  });

  addCommonOptions(
    program.command('generate').description('generate and publish resources'),
  )
    .option('--report', 'also create a self-contained HTML asset report')
    .option(
      '--report-output <file>',
      'report path relative to the project root; implies --report',
    )
    .option(
      '--result-file <file>',
      'stable result JSON path relative to .assetloom/results',
    )
    .action(async (options: GenerateCommandOptions, command: Command) => {
      const loaded = await loadVersionedConfiguration(options.config);
      const runtime = createDefaultCatalogRuntime(loaded);
      const result = await generateVersioned(loaded, {
        ...runtime,
        ...(options.target === undefined ? {} : { target: options.target }),
      });
      const legacyReportTarget =
        loaded.config.schemaVersion === 1 && options.target !== undefined
          ? targetOption(options.target)
          : undefined;
      const report =
        options.report === true || options.reportOutput !== undefined
          ? loaded.config.schemaVersion === 1
            ? await createHtmlReport(legacyLoaded(loaded), {
                ...(legacyReportTarget === undefined
                  ? {}
                  : { target: legacyReportTarget }),
                ...(options.reportOutput === undefined
                  ? {}
                  : { output: options.reportOutput }),
              })
            : await createCatalogReport(loaded, {
                ...runtime,
                ...(options.target === undefined
                  ? {}
                  : { target: options.target }),
                ...(options.reportOutput === undefined
                  ? {}
                  : { output: options.reportOutput }),
              })
          : undefined;
      const resultFile =
        options.resultFile === undefined
          ? undefined
          : await writeCliGenerationResultFile(
              loaded.projectRoot,
              options.resultFile,
              result,
            );
      const reportSummary =
        report === undefined
          ? ''
          : `\nReport: ${portableRelative(loaded.projectRoot, report.path)} (${report.healthy ? 'all outputs verified' : `${report.issues} issue(s)`}).`;
      const resultFileSummary =
        resultFile === undefined
          ? ''
          : `\nResult: ${resultFile.path} (${resultFile.disposition}).`;
      const changed = result.artifacts.filter(
        (artifact) => artifact.disposition !== 'unchanged',
      ).length;
      const unchanged = result.artifacts.length - changed;
      const outputOptions = rootOptions(command);
      if (outputOptions.json && report !== undefined) {
        printInformation(
          `Report: ${portableRelative(loaded.projectRoot, report.path)}.`,
        );
      }
      printGenerationResult(
        result,
        outputOptions,
        `Generated ${changed} changed artifact(s); ${unchanged} unchanged; ${result.removed.length} stale owned artifact(s) removed.${resultFileSummary}${reportSummary}`,
      );
    });

  addCommonOptions(
    program
      .command('report')
      .description('create a self-contained HTML review of generated assets'),
  )
    .option('-o, --output <file>', 'report path relative to the project root')
    .action(async (options: ReportCommandOptions, command: Command) => {
      const loaded = await loadVersionedConfiguration(options.config);
      if (loaded.config.schemaVersion === 1) {
        const nativeLoaded = legacyLoaded(loaded);
        const target = targetOption(options.target);
        const result = await createHtmlReport(nativeLoaded, {
          ...(target === undefined ? {} : { target }),
          ...(options.output === undefined ? {} : { output: options.output }),
        });
        const reportPath = portableRelative(nativeLoaded.projectRoot, result.path);
        printResult(
          { ok: true, result: { ...result, path: reportPath } },
          rootOptions(command),
          `Created ${reportPath} for "${result.configurationName}": ${result.outputs} output(s), ${result.sources} source(s), ${result.issues} issue(s).`,
        );
        return;
      }

      const runtime = createDefaultCatalogRuntime(loaded);
      const result = await createCatalogReport(loaded, {
        ...runtime,
        ...(options.target === undefined ? {} : { target: options.target }),
        ...(options.output === undefined ? {} : { output: options.output }),
      });
      const reportPath = portableRelative(loaded.projectRoot, result.path);
      printResult(
        { ok: true, result: { ...result, path: reportPath } },
        rootOptions(command),
        `Created ${reportPath}: ${result.outputs} output(s), ${result.issues} issue(s).`,
      );
    });

  addCommonOptions(
    program.command('verify').description('verify generated resources'),
  )
    .option('--native', 'also compile resources with native platform tools')
    .action(async (options: VerifyCommandOptions, command: Command) => {
      const loaded = await loadVersionedConfiguration(options.config);
      if (loaded.config.schemaVersion === 1) {
        const nativeLoaded = legacyLoaded(loaded);
        const target = targetOption(options.target);
        const result = await verify(nativeLoaded, {
          ...(target === undefined ? {} : { target }),
          ...(options.native === true ? { native: true } : {}),
        });
        printResult(
          { ok: true, result },
          rootOptions(command),
          `Verified ${result.checked.length} generated file(s).`,
        );
        return;
      }

      const runtime = createDefaultCatalogRuntime(loaded);
      const result = await verifyV2(loaded, {
        ...runtime,
        ...(options.target === undefined ? {} : { target: options.target }),
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
    const loaded = await loadVersionedConfiguration(options.config);
    if (loaded.config.schemaVersion === 1) {
      const nativeLoaded = legacyLoaded(loaded);
      const removed = await clean(nativeLoaded, targetOption(options.target));
      printResult(
        {
          ok: true,
          result: {
            removed: removed.map((item) =>
              portableRelative(nativeLoaded.projectRoot, item),
            ),
          },
        },
        rootOptions(command),
        `Removed ${removed.length} Assetloom-owned file(s).`,
      );
      return;
    }

    const result = await cleanV2(loaded, {
      ...(options.target === undefined ? {} : { target: options.target }),
    });
    const removed = result.removed.map((item) =>
      portableRelative(loaded.projectRoot, item),
    );
    printResult(
      {
        ok: true,
        result: { removed },
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
      return 2;
    }
    const loomError = asLoomError(error);
    printError(loomError, {
      json: program.opts<{ json?: boolean }>().json === true,
      verbose: program.opts<{ verbose?: boolean }>().verbose === true,
    });
    return 1;
  }
}
