import { stat, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { LoomError } from '../domain/errors.js';
import { compareCodePoints } from '../domain/ordering.js';
import { AtomicWriter } from './atomic-writer.js';

const BEGIN = '# >>> assetloom generated resources >>>';
const END = '# <<< assetloom generated resources <<<';

async function findGitDirectory(start: string): Promise<string | undefined> {
  let current = path.resolve(start);
  for (;;) {
    const candidate = path.join(current, '.git');
    try {
      if ((await stat(candidate)).isDirectory()) {
        return candidate;
      }
    } catch {
      // Continue toward the filesystem root.
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function replaceManagedBlock(content: string, patterns: readonly string[]): string {
  const beginIndex = content.indexOf(BEGIN);
  const endIndex = content.indexOf(END);
  if (
    (beginIndex === -1) !== (endIndex === -1) ||
    (beginIndex !== -1 && endIndex < beginIndex) ||
    content.indexOf(BEGIN, beginIndex + BEGIN.length) !== -1 ||
    content.indexOf(END, endIndex + END.length) !== -1
  ) {
    throw new LoomError({
      code: 'LOOM_GITIGNORE_INVALID_BLOCK',
      message: 'The Assetloom Git ignore block is malformed.',
    });
  }

  const block = [BEGIN, ...patterns, END].join('\n');
  if (beginIndex === -1) {
    const separator =
      content === '' ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    return `${content}${separator}${block}\n`;
  }
  return `${content.slice(0, beginIndex)}${block}${content.slice(
    endIndex + END.length,
  )}`;
}

export class GitIgnoreManager {
  readonly #projectRoot: string;

  constructor(projectRoot: string) {
    this.#projectRoot = path.resolve(projectRoot);
  }

  async update(generatedFiles: readonly string[]): Promise<void> {
    const gitDirectory = await findGitDirectory(this.#projectRoot);
    if (gitDirectory === undefined) {
      return;
    }
    const repositoryRoot = path.dirname(gitDirectory);
    const excludeFile = path.join(gitDirectory, 'info', 'exclude');
    const patterns = new Set<string>();
    patterns.add(
      `/${path
        .relative(repositoryRoot, path.join(this.#projectRoot, '.assetloom'))
        .split(path.sep)
        .join('/')}/`,
    );
    for (const filename of generatedFiles) {
      patterns.add(
        `/${path.relative(repositoryRoot, filename).split(path.sep).join('/')}`,
      );
    }

    try {
      let content = '';
      try {
        content = await readFile(excludeFile, 'utf8');
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;
        if (code !== 'ENOENT') {
          throw error;
        }
      }
      const projectRelative = path
        .relative(repositoryRoot, this.#projectRoot)
        .split(path.sep)
        .join('/');
      const projectPrefix =
        projectRelative === '' ? '/' : `/${projectRelative}/`;
      const beginIndex = content.indexOf(BEGIN);
      const endIndex = content.indexOf(END);
      if (beginIndex !== -1 && endIndex > beginIndex) {
        const existingPatterns = content
          .slice(beginIndex + BEGIN.length, endIndex)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(
            (line) =>
              line.startsWith('/') && !line.startsWith(projectPrefix),
          );
        for (const pattern of existingPatterns) {
          patterns.add(pattern);
        }
      }
      await mkdir(path.dirname(excludeFile), { recursive: true });
      const next = replaceManagedBlock(
        content,
        [...patterns].sort(compareCodePoints),
      );
      const writer = new AtomicWriter(repositoryRoot);
      await writer.writeIfChanged(excludeFile, Buffer.from(next));
      const published = await readFile(excludeFile, 'utf8');
      const publishedLines = new Set(published.split(/\r?\n/));
      if (![...patterns].every((pattern) => publishedLines.has(pattern))) {
        throw new LoomError({
          code: 'LOOM_GITIGNORE_VERIFICATION_FAILED',
          message: 'The local Assetloom Git ignore block could not be verified.',
          context: { excludeFile },
        });
      }
    } catch (cause) {
      if (cause instanceof LoomError) {
        throw cause;
      }
      throw new LoomError({
        code: 'LOOM_GITIGNORE_FAILED',
        message: 'Failed to update the local Assetloom Git ignore block.',
        cause,
        context: { excludeFile },
      });
    }
  }
}
