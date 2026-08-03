import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const temporary = mkdtempSync(path.join(tmpdir(), 'assetloom-pack-'));
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(packageRoot, '../..');

function run(command, args, cwd) {
  const npmCandidates = [
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  const npmCli = npmCandidates.find((candidate) => existsSync(candidate));
  const useNpmCli = command === 'npm' && npmCli !== undefined;
  const yarnCli = path.join(path.dirname(process.execPath), 'node_modules/corepack/dist/yarn.js');
  const useYarnCli = command === 'yarn' && existsSync(yarnCli);
  const executable = useNpmCli || useYarnCli ? process.execPath : command;
  const commandArguments = useNpmCli
    ? [npmCli, ...args]
    : useYarnCli ? [yarnCli, ...args] : args;
  const result = spawnSync(executable, commandArguments, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packages = [
  ['@sapkalabs/assetloom-core', 'core.tgz'],
  ['@sapkalabs/assetloom-images', 'images.tgz'],
  ['@sapkalabs/assetloom-native', 'native.tgz'],
  ['@sapkalabs/assetloom-web', 'web.tgz'],
  ['@sapkalabs/assetloom', 'assetloom.tgz'],
];

const expectedDependencies = {
  '@sapkalabs/assetloom-core': [],
  '@sapkalabs/assetloom-images': ['@sapkalabs/assetloom-core'],
  '@sapkalabs/assetloom-native': [
    '@sapkalabs/assetloom-core',
    '@sapkalabs/assetloom-images',
  ],
  '@sapkalabs/assetloom-web': [
    '@sapkalabs/assetloom-core',
    '@sapkalabs/assetloom-images',
  ],
  '@sapkalabs/assetloom': [
    '@sapkalabs/assetloom-core',
    '@sapkalabs/assetloom-images',
    '@sapkalabs/assetloom-native',
    '@sapkalabs/assetloom-web',
  ],
};

function packageText(directory) {
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((filename) => /(?:\.js|\.d\.ts|\.json|README\.md)$/u.test(filename));
  return files.map((filename) => readFileSync(filename, 'utf8')).join('\n');
}

try {
  const tarballs = packages.map(([name, filename]) => {
    const output = path.join(temporary, filename);
    run('yarn', ['workspace', name, 'pack', '--out', output], workspaceRoot);
    return output;
  });
  run('npm', ['init', '-y'], temporary);
  run('npm', ['install', '--ignore-scripts', ...tarballs], temporary);
  const scope = path.join(temporary, 'node_modules', '@sapkalabs');
  for (const [name] of packages) {
    const shortName = name.slice('@sapkalabs/'.length);
    const installed = path.join(scope, shortName);
    const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
    const rootExport = manifest.exports?.['.'];
    assert(
      rootExport?.types === './lib/index.d.ts' && rootExport?.default === './lib/index.js',
      `${name} does not expose its public root declaration and runtime entry.`,
    );
    assert(manifest.version === '0.2.0', `${name} is outside the lockstep version.`);
    const internalDependencies = Object.keys(manifest.dependencies ?? {})
      .filter((dependency) => dependency.startsWith('@sapkalabs/assetloom'))
      .sort();
    assert(
      JSON.stringify(internalDependencies) ===
        JSON.stringify([...expectedDependencies[name]].sort()),
      `${name} has an invalid focused-package dependency graph.`,
    );
    assert(
      !JSON.stringify(manifest).includes('workspace:'),
      `${name} retained a workspace protocol in its packed manifest.`,
    );
    assert(
      name === '@sapkalabs/assetloom'
        ? manifest.bin === './lib/cli.js'
        : manifest.bin === undefined,
      `${name} has an invalid executable declaration.`,
    );
    const packedText = packageText(installed);
    if (/integrate-project|update-project|ProjectIntegration|IntegrationReceipt|ProjectFileGateway|GitIgnoreManager|HtmlHeadAdapter|StaticWebAppConfigAdapter/u.test(packedText)) {
      throw new Error(`${name} contains a removed consumer-project mutation capability.`);
    }
  }
  run('node', ['--input-type=module', '-e', [
    "import {sha256} from '@sapkalabs/assetloom-core'",
    "import {imageRendererCompatibilityVersion} from '@sapkalabs/assetloom-images'",
    "import {assertNativeResourceName} from '@sapkalabs/assetloom-native'",
    "import {resolveWebPublicPath} from '@sapkalabs/assetloom-web'",
    "import {stableGenerationResultJson} from '@sapkalabs/assetloom'",
    "if(!sha256('x')||!imageRendererCompatibilityVersion||assertNativeResourceName('android','icon')!=='icon'||resolveWebPublicPath('/','a')!=='/a'||typeof stableGenerationResultJson!=='function')process.exit(2)",
  ].join(';')], temporary);

  writeFileSync(path.join(temporary, 'consumer.mts'), `
import { sha256, type GenerationResultV1 } from '@sapkalabs/assetloom-core';
import { inspectImage, type ImageRecipeV1 } from '@sapkalabs/assetloom-images';
import { createNativeResourceUsageV1 } from '@sapkalabs/assetloom-native';
import { webContentHashToken, type WebCacheBustPolicy } from '@sapkalabs/assetloom-web';
import { stableGenerationResultJson, type LoadedVersionedConfiguration } from '@sapkalabs/assetloom';
const digest = sha256('consumer');
const recipe: ImageRecipeV1 = { version: 1, format: 'png' };
const policy: WebCacheBustPolicy = 'filename';
const result = {} as GenerationResultV1;
const loaded = {} as LoadedVersionedConfiguration;
void [inspectImage, createNativeResourceUsageV1, webContentHashToken(digest), stableGenerationResultJson, recipe, policy, result, loaded];
`);
  writeFileSync(path.join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['./consumer.mts'],
  }));
  run(
    'node',
    [path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'],
    temporary,
  );

  const cli = path.join(scope, 'assetloom', 'lib', 'cli.js');
  run('node', [cli, '--help'], temporary);
  writeFileSync(path.join(temporary, 'source.txt'), 'packed consumer bytes\n');
  writeFileSync(path.join(temporary, 'assetloom.json'), JSON.stringify({
    schemaVersion: 2,
    project: { root: '.' },
    targets: { output: { kind: 'directory', root: './generated' } },
    resources: {
      file: {
        type: 'files',
        source: { file: './source.txt' },
        outputs: [{ target: 'output', directory: '.' }],
      },
    },
  }));
  const human = run('node', [cli, 'generate', '-c', 'assetloom.json'], temporary);
  assert(
    human.stdout.includes('Generated 1 changed artifact(s); 0 unchanged'),
    'Installed CLI human generation did not report the created artifact.',
  );
  assert(human.stderr === '', 'Installed CLI human generation wrote unexpected stderr.');
  const outputPath = path.join(temporary, 'generated', 'source.txt');
  const initialModified = statSync(outputPath).mtimeMs;
  const json = run(
    'node',
    [cli, '--json', 'generate', '-c', 'assetloom.json'],
    temporary,
  );
  const parsed = JSON.parse(json.stdout);
  assert(parsed.resultVersion === 1, 'Installed CLI did not emit GenerationResultV1 directly.');
  assert(
    parsed.artifacts.length === 1 && parsed.artifacts[0].disposition === 'unchanged',
    'Installed CLI repeat did not return the complete unchanged artifact catalog.',
  );
  assert(json.stderr === '', 'Installed CLI JSON generation wrote unexpected stderr.');
  assert(
    statSync(outputPath).mtimeMs === initialModified,
    'Installed CLI rewrote output content during an unchanged run.',
  );
  const resultFile = run(
    'node',
    [
      cli,
      '--json',
      'generate',
      '-c',
      'assetloom.json',
      '--result-file',
      'installed.json',
    ],
    temporary,
  );
  assert(
    readFileSync(path.join(temporary, '.assetloom', 'results', 'installed.json'), 'utf8') ===
      resultFile.stdout,
    'Installed CLI result file differs from canonical JSON stdout.',
  );
  process.stdout.write('Package smoke test passed for core, images, native, web, and facade tarballs.\n');
} finally {
  rmSync(temporary, { force: true, recursive: true });
}
