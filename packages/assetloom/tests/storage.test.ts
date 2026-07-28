import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitIgnoreManager } from '../src/storage/gitignore-manager.js';

describe('local Git ignore management', () => {
  it('preserves existing content and other monorepo project entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-ignore-'));
    const project = path.join(root, 'apps', 'brand');
    await mkdir(path.join(root, '.git', 'info'), { recursive: true });
    await mkdir(project, { recursive: true });
    await writeFile(
      path.join(root, '.git', 'info', 'exclude'),
      `*.local

# >>> assetloom generated resources >>>
/apps/other/.assetloom/
/apps/other/generated.png
# <<< assetloom generated resources <<<
`,
    );

    await new GitIgnoreManager(project).update([
      path.join(project, 'android', 'generated.png'),
    ]);
    const content = await readFile(
      path.join(root, '.git', 'info', 'exclude'),
      'utf8',
    );
    expect(content).toContain('*.local');
    expect(content).toContain('/apps/other/generated.png');
    expect(content).toContain('/apps/brand/.assetloom/');
    expect(content).toContain('/apps/brand/android/generated.png');
  });

  it('rejects malformed managed marker blocks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-ignore-'));
    await mkdir(path.join(root, '.git', 'info'), { recursive: true });
    await writeFile(
      path.join(root, '.git', 'info', 'exclude'),
      '# >>> assetloom generated resources >>>\n/generated.png\n',
    );
    await expect(
      new GitIgnoreManager(root).update([]),
    ).rejects.toMatchObject({ code: 'LOOM_GITIGNORE_INVALID_BLOCK' });
  });
});
