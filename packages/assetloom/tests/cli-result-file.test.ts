import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli/program.js';
import {
  stableGenerationResultJson,
  validateGenerationResultV1,
} from '../src/domain/generation-result.js';
import { writeCliGenerationResultFile } from '../src/cli/result-file.js';
import { generationResultFixture } from './fixtures/generation-result-v1.js';

afterEach(() => {
  vi.restoreAllMocks();
});

async function cliFixture(): Promise<{
  readonly configPath: string;
  readonly projectRoot: string;
}> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-result-'));
  const configPath = path.join(projectRoot, 'assetloom.json');
  await writeFile(path.join(projectRoot, 'source.txt'), 'portable result\n');
  await writeFile(
    configPath,
    JSON.stringify({
      schemaVersion: 2,
      project: { root: projectRoot },
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
  return { configPath, projectRoot };
}

async function capture(args: readonly string[]): Promise<{
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
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

describe('CLI generation result files', () => {
  it('writes the same stable result as JSON stdout beneath state', async () => {
    const fixture = await cliFixture();
    const captured = await capture([
      '--json',
      'generate',
      '-c',
      fixture.configPath,
      '--result-file',
      'nested/result.json',
    ]);
    expect(captured.code, captured.stderr).toBe(0);
    expect(captured.stderr).toBe('');
    const result = validateGenerationResultV1(JSON.parse(captured.stdout));
    const resultFile = await readFile(
      path.join(
        fixture.projectRoot,
        '.assetloom/results/nested/result.json',
      ),
      'utf8',
    );
    expect(captured.stdout).toBe(stableGenerationResultJson(result));
    expect(resultFile).toBe(captured.stdout);
  });

  it('uses atomic write-if-changed for identical stable result bytes', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-result-'));
    const first = await writeCliGenerationResultFile(
      projectRoot,
      'result.json',
      generationResultFixture,
    );
    const second = await writeCliGenerationResultFile(
      projectRoot,
      'result.json',
      generationResultFixture,
    );
    expect(first.disposition).toBe('written');
    expect(second.disposition).toBe('unchanged');
    expect(
      await readFile(path.join(projectRoot, '.assetloom/results/result.json'), 'utf8'),
    ).toBe(stableGenerationResultJson(generationResultFixture));
  });

  it.each(['', '../result.json', 'nested/../result.json', '/result.json', 'C:\\result.json', 'bad\0result.json'])(
    'rejects unsafe configured result path %j',
    async (configuredPath) => {
      const projectRoot = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-result-'));
      await expect(
        writeCliGenerationResultFile(
          projectRoot,
          configuredPath,
          generationResultFixture,
        ),
      ).rejects.toMatchObject({ code: 'LOOM_CFG_PATH_INVALID' });
    },
  );

  it('rejects a result path that escapes through a directory link', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-result-'));
    const resultRoot = path.join(projectRoot, '.assetloom/results');
    const outside = await mkdtemp(path.join(tmpdir(), 'assetloom-cli-outside-'));
    await mkdir(resultRoot, { recursive: true });
    await symlink(outside, path.join(resultRoot, 'escape'), 'junction');
    expect((await lstat(path.join(resultRoot, 'escape'))).isSymbolicLink()).toBe(true);
    await expect(
      writeCliGenerationResultFile(
        projectRoot,
        'escape/result.json',
        generationResultFixture,
      ),
    ).rejects.toMatchObject({ code: 'LOOM_STATE_PATH_UNSAFE' });
    await expect(readFile(path.join(outside, 'result.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps JSON stdout empty when result-file publication fails', async () => {
    const fixture = await cliFixture();
    await mkdir(path.join(fixture.projectRoot, '.assetloom'), { recursive: true });
    await writeFile(path.join(fixture.projectRoot, '.assetloom/results'), 'blocked');
    const captured = await capture([
      '--json',
      'generate',
      '-c',
      fixture.configPath,
      '--result-file',
      'result.json',
    ]);
    expect(captured.code).toBe(1);
    expect(captured.stdout).toBe('');
    const errorDocument: unknown = JSON.parse(captured.stderr);
    expect(errorDocument).toMatchObject({ ok: false });
    const errorCode = (
      errorDocument as { readonly error?: { readonly code?: unknown } }
    ).error?.code;
    expect(errorCode).toEqual(expect.stringMatching(/^LOOM_/u));
  });
});
