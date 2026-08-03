import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface PublicationFixture {
  readonly projectRoot: string;
  readonly outputRoot: string;
  readonly stateRoot: string;
  cleanup(): Promise<void>;
  read(relativePath: string): Promise<Uint8Array>;
  write(relativePath: string, content: string | Uint8Array): Promise<string>;
}

export async function createPublicationFixture(
  prefix = 'assetloom-publication-',
): Promise<PublicationFixture> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), prefix));
  const outputRoot = path.join(projectRoot, 'generated');
  const stateRoot = path.join(projectRoot, '.assetloom');
  await Promise.all([
    mkdir(outputRoot, { recursive: true }),
    mkdir(stateRoot, { recursive: true }),
  ]);
  return {
    projectRoot,
    outputRoot,
    stateRoot,
    cleanup: () => rm(projectRoot, { recursive: true, force: true }),
    read: (relativePath) => readFile(path.join(projectRoot, relativePath)),
    async write(relativePath, content) {
      const destination = path.join(projectRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
      return destination;
    },
  };
}

export interface ContentWriteSpy {
  readonly destinations: readonly string[];
  record(destination: string): void;
}

export function createContentWriteSpy(): ContentWriteSpy {
  const destinations: string[] = [];
  return {
    destinations,
    record(destination) {
      destinations.push(destination);
    },
  };
}
