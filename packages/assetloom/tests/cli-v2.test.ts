import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfiguration } from '../src/config/load.js';
import { loadVersionedConfiguration } from '../src/config/load.js';
import { runCli } from '../src/cli/program.js';
import { createGenerationPlan } from '../src/planner/index.js';
import type { GenerationResultV1 } from '../src/domain/generation-result.js';
import {
  stableGenerationResultJson,
  validateGenerationResultV1,
} from '../src/domain/generation-result.js';
import { generateVersioned } from '../src/api/generate-v2.js';
import { createDefaultCatalogRuntime } from '../src/infrastructure/composition/default-catalog-runtime.js';

interface JsonCommandResult {
  readonly ok: boolean;
  readonly plan?: {
    readonly targets: readonly string[];
    readonly tasks?: ReadonlyArray<Readonly<Record<string, unknown>>>;
    readonly artifacts?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  };
  readonly result?: Readonly<Record<string, unknown>>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function captureCommand(args: readonly string[]): Promise<{
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  vi.restoreAllMocks();
  let stdout = '';
  let stderr = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const code = await runCli(args);
  return { code, stderr, stdout };
}

async function jsonCommand(args: readonly string[]): Promise<JsonCommandResult> {
  const { code, stderr, stdout } = await captureCommand(['--json', ...args]);
  expect(code, stderr).toBe(0);
  expect(stderr).toBe('');
  return JSON.parse(stdout) as JsonCommandResult;
}

async function generationCommand(
  args: readonly string[],
): Promise<GenerationResultV1> {
  const { code, stderr, stdout } = await captureCommand(['--json', ...args]);
  expect(code, stderr).toBe(0);
  expect(stderr).toBe('');
  const parsed: unknown = JSON.parse(stdout);
  expect(parsed).not.toHaveProperty('ok');
  expect(stdout.trim().endsWith('}')).toBe(true);
  return validateGenerationResultV1(parsed);
}

describe('versioned CLI composition', () => {
  it('matches the authoritative Node result in an independent fixture', async () => {
    const createFixture = async (prefix: string) => {
      const directory = await mkdtemp(path.join(tmpdir(), prefix));
      const configPath = path.join(directory, 'assetloom.json');
      await writeFile(path.join(directory, 'source.txt'), 'same portable bytes\n');
      await writeFile(
        configPath,
        JSON.stringify({
          schemaVersion: 2,
          project: { root: directory },
          targets: { archive: { kind: 'directory', root: './out' } },
          resources: {
            copied: {
              type: 'files',
              source: { file: './source.txt' },
              outputs: [
                { target: 'archive', directory: '.', path: 'copied.txt' },
              ],
            },
          },
        }),
      );
      return { configPath, directory };
    };
    const cliFixture = await createFixture('assetloom-cli-equality-');
    const nodeFixture = await createFixture('assetloom-node-equality-');
    const cliResult = await generationCommand([
      'generate',
      '-c',
      cliFixture.configPath,
    ]);
    const loaded = await loadVersionedConfiguration([nodeFixture.configPath]);
    const nodeResult = await generateVersioned(
      loaded,
      createDefaultCatalogRuntime(loaded),
    );
    expect(stableGenerationResultJson(cliResult)).toBe(
      stableGenerationResultJson(nodeResult),
    );
  });

  it('preserves the exact schema-v1 plan JSON contract', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-v1-'));
    const configPath = path.join(directory, 'assetloom.json');
    await writeFile(
      path.join(directory, 'icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    );
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 1,
        project: { root: directory },
        targets: {
          android: {
            enabled: true,
            resourceDirectory: './android/res',
          },
        },
        resources: {
          icon: {
            type: 'app-icon',
            android: { legacy: { source: './icon.svg' } },
          },
        },
      }),
    );
    const loaded = await loadConfiguration([configPath]);
    const legacyPlan = await createGenerationPlan(loaded);

    const result = await jsonCommand(['plan', '-c', configPath]);

    expect(result).toEqual({
      ok: true,
      plan: {
        targets: legacyPlan.targets,
        tasks: legacyPlan.tasks.map((task) => ({
          ...task,
          destination: path
            .relative(directory, task.destination)
            .split(path.sep)
            .join('/'),
          sourceDependencies: task.sourceDependencies.map((source) =>
            path.relative(directory, source).split(path.sep).join('/'),
          ),
        })),
      },
    });
    expect(result.plan).not.toHaveProperty('artifacts');

    const generated = await generationCommand([
      'generate',
      '-c',
      configPath,
      '--target',
      'android',
    ]);
    expect(generated).toMatchObject({
      resultVersion: 1,
      targets: ['android'],
    });
    expect(generated.artifacts.length).toBeGreaterThan(0);
  });

  it('runs the schema-v2 plan/generate/no-op/verify/report/clean lifecycle', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-v2-'));
    const configPath = path.join(directory, 'assetloom.json');
    await writeFile(path.join(directory, 'source.txt'), 'configurable asset\n');
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        metadata: { name: 'CLI catalog fixture' },
        project: { root: directory },
        targets: {
          archive: { kind: 'directory', root: './out' },
        },
        resources: {
          copied: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [
              {
                target: 'archive',
                directory: '.',
                path: 'copied.txt',
              },
            ],
          },
        },
      }),
    );

    const plan = await jsonCommand([
      'plan',
      '-c',
      configPath,
      '--target',
      'archive',
    ]);
    expect(plan).toEqual({
      ok: true,
      plan: {
        targets: ['archive'],
        artifacts: [
          expect.objectContaining({
            id: 'copied:archive:file:0:0',
            resourceType: 'files',
            target: 'archive',
            operation: 'copy-file',
            destination: 'out/copied.txt',
          }),
        ],
      },
    });
    expect(plan.plan).not.toHaveProperty('tasks');

    const first = await generationCommand([
      'generate',
      '-c',
      configPath,
      '--target',
      'archive',
    ]);
    expect(first).toMatchObject({
      resultVersion: 1,
      targets: ['archive'],
      removed: [],
    });
    expect(first.artifacts).toEqual([
      expect.objectContaining({
        relativePath: 'copied.txt',
        disposition: 'created',
      }),
    ]);
    expect(await readFile(path.join(directory, 'out/copied.txt'), 'utf8')).toBe(
      'configurable asset\n',
    );

    const second = await generationCommand([
      'generate',
      '-c',
      configPath,
      '--target',
      'archive',
    ]);
    expect(second).toMatchObject({
      resultVersion: 1,
      targets: ['archive'],
      removed: [],
    });
    expect(second.artifacts).toEqual([
      expect.objectContaining({
        relativePath: 'copied.txt',
        disposition: 'unchanged',
      }),
    ]);

    const verified = await jsonCommand([
      'verify',
      '-c',
      configPath,
      '--target',
      'archive',
    ]);
    expect(verified.result).toMatchObject({ ok: true });

    const report = await jsonCommand([
      'report',
      '-c',
      configPath,
      '--target',
      'archive',
      '--output',
      '.assetloom/catalog.html',
    ]);
    expect(report.result).toMatchObject({
      path: '.assetloom/catalog.html',
      healthy: true,
      outputs: 1,
      issues: 0,
    });
    const reportHtml = await readFile(
      path.join(directory, '.assetloom/catalog.html'),
      'utf8',
    );
    expect(reportHtml).toContain('CLI catalog fixture');
    expect(reportHtml).toContain('Generated file browser');
    expect(reportHtml).toContain('role="tree"');
    expect(reportHtml).toContain('Preview &amp; details');

    const cleaned = await jsonCommand([
      'clean',
      '-c',
      configPath,
      '--target',
      'archive',
    ]);
    expect(cleaned.result).toEqual({ removed: ['out/copied.txt'] });
    await expect(
      readFile(path.join(directory, 'out/copied.txt')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('generates and verifies mixed native and catalog target scopes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-mixed-'));
    const configPath = path.join(directory, 'assetloom.json');
    await writeFile(
      path.join(directory, 'icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    );
    await writeFile(path.join(directory, 'source.txt'), 'shared\n');
    await mkdir(path.join(directory, 'android'), { recursive: true });
    await writeFile(
      path.join(directory, 'android/AndroidManifest.xml'),
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="Fixture"></application></manifest>',
    );
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        project: { root: directory },
        targets: {
          android: {
            enabled: true,
            resourceDirectory: './android/res',
          },
          archive: { kind: 'directory', root: './out' },
        },
        resources: {
          nativeIcon: {
            type: 'app-icon',
            android: { legacy: { source: './icon.svg' } },
          },
          copied: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [
              { target: 'archive', directory: '.', path: 'copied.txt' },
            ],
          },
        },
      }),
    );

    const result = await jsonCommand(['plan', '-c', configPath]);
    const artifacts = result.plan?.artifacts ?? [];
    expect(result.plan?.targets).toEqual(['android', 'archive']);
    expect(artifacts.some((artifact) => artifact['target'] === 'android')).toBe(
      true,
    );
    expect(
      artifacts.some(
        (artifact) =>
          artifact['target'] === 'android' && !('ownership' in artifact),
      ),
    ).toBe(true);
    expect(artifacts).toContainEqual(
      expect.objectContaining({
        id: 'copied:archive:file:0:0',
        target: 'archive',
        operation: 'copy-file',
        ownership: 'generated',
        destination: 'out/copied.txt',
      }),
    );

    const generated = await generationCommand(['generate', '-c', configPath]);
    expect(generated).toMatchObject({
      resultVersion: 1,
      targets: ['android', 'archive'],
    });
    expect(await readFile(path.join(directory, 'out/copied.txt'), 'utf8')).toBe(
      'shared\n',
    );
    await expect(
      jsonCommand(['verify', '-c', configPath]),
    ).resolves.toMatchObject({ result: { ok: true } });
    await expect(
      jsonCommand(['verify', '-c', configPath, '--target', 'android']),
    ).resolves.toMatchObject({ result: { ok: true } });
  });

  it('rejects catalog target roots outside the configured project root', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-root-'));
    const configPath = path.join(directory, 'assetloom.json');
    await writeFile(path.join(directory, 'source.txt'), 'shared\n');
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        project: { root: directory },
        targets: {
          escaped: { kind: 'directory', root: '../outside' },
        },
        resources: {
          copied: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [{ target: 'escaped', directory: '.' }],
          },
        },
      }),
    );

    let stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    const code = await runCli(['--json', 'plan', '-c', configPath]);
    expect(code).toBe(1);
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      error: { code: 'LOOM_CFG_PATH_INVALID' },
    });
  });

  it('keeps human summaries, result/report paths, and JSON report logs separated', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-human-'));
    const configPath = path.join(directory, 'assetloom.json');
    await writeFile(path.join(directory, 'source.txt'), 'human output\n');
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        metadata: { name: 'Human CLI fixture' },
        project: { root: directory },
        targets: { archive: { kind: 'directory', root: './out' } },
        resources: {
          copied: {
            type: 'files',
            source: { file: './source.txt' },
            outputs: [{ target: 'archive', directory: '.', path: 'copied.txt' }],
          },
        },
      }),
    );
    const first = await captureCommand([
      'generate',
      '-c',
      configPath,
      '--result-file',
      'human.json',
      '--report-output',
      '.assetloom/human-report.html',
    ]);
    expect(first).toMatchObject({ code: 0, stderr: '' });
    expect(first.stdout).toContain('Generated 1 changed artifact(s); 0 unchanged');
    expect(first.stdout).toContain('Result: .assetloom/results/human.json (written).');
    expect(first.stdout).toContain('Report: .assetloom/human-report.html');

    const second = await captureCommand(['generate', '-c', configPath]);
    expect(second).toMatchObject({ code: 0, stderr: '' });
    expect(second.stdout).toContain('Generated 0 changed artifact(s); 1 unchanged');

    const jsonReport = await captureCommand([
      '--json',
      'generate',
      '-c',
      configPath,
      '--report-output',
      '.assetloom/json-report.html',
    ]);
    expect(jsonReport.code).toBe(0);
    expect(validateGenerationResultV1(JSON.parse(jsonReport.stdout))).toMatchObject({
      resultVersion: 1,
    });
    expect(jsonReport.stderr).toBe('Report: .assetloom/json-report.html.\n');
  });

  it('retains success, usage, and runtime exit code classes', async () => {
    expect((await captureCommand(['--help'])).code).toBe(0);
    expect((await captureCommand(['--version'])).code).toBe(0);
    const usage = await captureCommand(['--json', 'generate']);
    expect(usage.code).toBe(2);
    expect(usage.stdout).toBe('');
    expect(JSON.parse(usage.stderr)).toMatchObject({
      ok: false,
      error: { code: 'LOOM_CLI_USAGE' },
    });
    const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-error-'));
    const configPath = path.join(directory, 'assetloom.json');
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        project: { root: directory },
        targets: { archive: { kind: 'directory', root: './out' } },
        resources: {
          missing: {
            type: 'files',
            source: { file: './missing.txt' },
            outputs: [{ target: 'archive', directory: '.' }],
          },
        },
      }),
    );
    const runtime = await captureCommand([
      '--json',
      'generate',
      '-c',
      configPath,
    ]);
    expect(runtime.code).toBe(1);
    expect(runtime.stdout).toBe('');
    expect(JSON.parse(runtime.stderr)).toMatchObject({
      ok: false,
      error: { code: 'LOOM_SRC_NOT_FOUND' },
    });
  });
});
