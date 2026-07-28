import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temporary = mkdtempSync(path.join(tmpdir(), 'assetloom-pack-'));

function run(command, args, cwd) {
  const npmCandidates = [
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(
      path.dirname(process.execPath),
      '../lib/node_modules/npm/bin/npm-cli.js',
    ),
  ];
  const npmCli = npmCandidates.find((candidate) => existsSync(candidate));
  const useNpmCli = command === 'npm' && npmCli !== undefined;
  const executable = useNpmCli ? process.execPath : command;
  const commandArguments = useNpmCli ? [npmCli, ...args] : args;
  const result = spawnSync(executable, commandArguments, {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result.stdout;
}

try {
  const packOutput = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', temporary], process.cwd()),
  );
  const tarball = path.join(temporary, packOutput[0].filename);
  run('npm', ['init', '-y'], temporary);
  run('npm', ['install', '--ignore-scripts', tarball], temporary);
  const installed = path.join(
    temporary,
    'node_modules',
    '@sapkalabs',
    'assetloom',
  );
  const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json')));
  if (Object.keys(manifest.exports).some((key) => key.includes('expo'))) {
    throw new Error('Packed package contains an out-of-scope framework export.');
  }
  run(
    'node',
    [path.join(installed, 'lib', 'cli.js'), '--help'],
    temporary,
  );
  process.stdout.write(`Package smoke test passed: ${path.basename(tarball)}\n`);
} finally {
  rmSync(temporary, { force: true, recursive: true });
}
