import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { CatalogMaterializationContext } from '../src/application/execution/contracts.js';
import type { PlanningContext } from '../src/application/planning/contracts.js';
import type {
  CopyFileArtifact,
  WriteTextArtifact,
} from '../src/domain/catalog/planning.js';
import type { ResolvedCatalogTarget } from '../src/domain/catalog/targets.js';
import { targetId } from '../src/domain/catalog/targets.js';
import { LoomError } from '../src/domain/errors.js';
import { NodeSourceResolver } from '../src/infrastructure/sources/node-source-resolver.js';
import { FilesResourceHandler } from '../src/resources/files/handler.js';
import { CopyFileMaterializer } from '../src/resources/files/materialize.js';
import { FontFamilyResourceHandler } from '../src/resources/font-family/handler.js';
import { WriteTextMaterializer } from '../src/resources/font-family/materialize.js';
import { SvgComponentsResourceHandler } from '../src/resources/svg-components/handler.js';
import { SvgComponentMaterializer } from '../src/resources/svg-components/materialize.js';

const fixtures: string[] = [];
const decoder = new TextDecoder();

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'assetloom-resources-'));
  fixtures.push(directory);
  await writeFile(path.join(directory, 'package.json'), '{"private":true}');
  return directory;
}

function planningContext(projectRoot: string): PlanningContext {
  const root = path.join(projectRoot, 'generated');
  const configuration = { kind: 'directory' as const, root };
  const target: ResolvedCatalogTarget = {
    id: targetId('generated'),
    kind: 'directory',
    root,
    configuration,
  };
  return {
    projectRoot,
    normalizedConfiguration: '{}',
    sourceResolver: new NodeSourceResolver({ projectRoot }),
    resolveTarget(id) {
      if (id !== target.id) {
        throw new Error(`Unexpected target: ${id}`);
      }
      return target;
    },
  };
}

function materializationContext(
  projectRoot: string,
  referencedValue: string | number | Uint8Array = 'unused',
): CatalogMaterializationContext {
  return {
    projectRoot,
    normalizedConfiguration: '{}',
    cache: {
      get: () => Promise.resolve(undefined),
      getAlias: () => Promise.resolve(undefined),
      put: () => Promise.resolve('unused'),
      putAlias: () => Promise.resolve(),
    },
    outputs: {
      get() {
        throw new Error('No artifact outputs are expected in this test.');
      },
      resolve() {
        return referencedValue;
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('files resource', () => {
  it('plans deterministic copies with configurable path templates', async () => {
    const projectRoot = await fixture();
    await mkdir(path.join(projectRoot, 'input/nested'), { recursive: true });
    const sourcePath = path.join(projectRoot, 'input/nested/readme.txt');
    await writeFile(sourcePath, 'resource bytes');
    const handler = new FilesResourceHandler();
    const resource = {
      type: 'files' as const,
      source: { root: 'input', include: ['**/*.txt'], required: true },
      outputs: [
        {
          target: 'generated',
          directory: 'assets',
          path: 'copied/{baseName}.{extension}',
        },
      ],
    };
    handler.validate(resource);

    const artifacts = await handler.plan(
      'documents',
      resource,
      planningContext(projectRoot),
    );
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      operation: 'copy-file',
      ownership: 'generated',
      publication: { mode: 'stable' },
      dependsOn: [],
      sourceDependencies: [sourcePath],
      source: sourcePath,
      destination: path.join(projectRoot, 'generated/assets/copied/readme.txt'),
    });
    const artifact = artifacts[0];
    if (artifact === undefined) {
      throw new Error('Expected a copy artifact.');
    }
    const output = await new CopyFileMaterializer().materialize(artifact);
    expect(decoder.decode(output.content)).toBe('resource bytes');
  });
});

describe('svg-components resource', () => {
  it('preserves canonical SVG DOM tags and ignores the process cwd', async () => {
    const projectRoot = await fixture();
    const sourceDirectory = path.join(projectRoot, 'icons');
    await mkdir(sourceDirectory);
    await writeFile(
      path.join(projectRoot, '.prettierrc'),
      '{"semi":true,"singleQuote":false,"printWidth":40}',
    );
    await writeFile(
      path.join(sourceDirectory, 'gradient.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><defs><linearGradient id="linear"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient><radialGradient id="radial"><stop offset="0" stop-color="#fedcba"/><stop offset="1" stop-color="#654321"/></radialGradient><clipPath id="clip"><circle cx="10" cy="10" r="9"/></clipPath></defs><g clip-path="url(#clip)"><rect width="10" height="20" fill="url(#linear)"/><rect x="10" width="10" height="20" fill="url(#radial)"/></g></svg>',
    );
    const artifacts = await new SvgComponentsResourceHandler().plan(
      'gradient-icons',
      {
        type: 'svg-components',
        source: { file: 'icons/gradient.svg' },
        outputs: [
          {
            target: 'generated',
            directory: 'web',
            runtime: 'react-dom',
            preset: 'themed-icon-v1',
            naming: 'pascal-case',
          },
        ],
      },
      planningContext(projectRoot),
    );
    const artifact = artifacts[0];
    if (artifact === undefined || artifact.operation !== 'transform-svg') {
      throw new Error('Expected a DOM SVG transform artifact.');
    }
    const materializer = new SvgComponentMaterializer();
    const originalCwd = process.cwd();
    let fromProject: Uint8Array;
    let fromParent: Uint8Array;
    try {
      process.chdir(projectRoot);
      fromProject = (await materializer.materialize(artifact)).content;
      process.chdir(path.dirname(projectRoot));
      fromParent = (await materializer.materialize(artifact)).content;
    } finally {
      process.chdir(originalCwd);
    }
    const transformed = decoder.decode(fromProject);
    expect(fromParent).toEqual(fromProject);
    expect(transformed).toContain("import * as React from 'react'\n");
    expect(transformed).toContain('<clipPath');
    expect(transformed).toContain('</clipPath>');
    expect(transformed).toContain('<linearGradient');
    expect(transformed).toContain('</linearGradient>');
    expect(transformed).toContain('<radialGradient');
    expect(transformed).toContain('</radialGradient>');
    expect(transformed).not.toContain('<clippath');
    expect(transformed).not.toContain('<lineargradient');
    expect(transformed).not.toContain('<radialgradient');
    expect(transformed).toContain('width={props.width ?? 24}');
    expect(transformed).toContain('height={props.height ?? 24}');
  });

  it('preserves configured parent-prefix React Native and DOM transformations', async () => {
    const projectRoot = await fixture();
    await mkdir(path.join(projectRoot, 'icons/F_Feature'), { recursive: true });
    await mkdir(path.join(projectRoot, 'icons/common'), { recursive: true });
    const featureSource = await readFile(
      new URL('./fixtures/inphiz-svg/F_Feature/add-icon.svg', import.meta.url),
    );
    const ordinarySource = await readFile(
      new URL('./fixtures/inphiz-svg/common/plain-icon.svg', import.meta.url),
    );
    await writeFile(
      path.join(projectRoot, 'icons/F_Feature/add-icon.svg'),
      featureSource,
    );
    await writeFile(
      path.join(projectRoot, 'icons/common/plain-icon.svg'),
      ordinarySource,
    );
    const handler = new SvgComponentsResourceHandler();
    const resource = {
      type: 'svg-components' as const,
      source: { root: 'icons', include: ['**/*.svg'], required: true },
      outputs: [
        {
          target: 'generated',
          directory: 'native',
          runtime: 'react-native' as const,
          preset: 'themed-icon-v1',
          naming: 'pascal-case' as const,
          componentNaming: {
            parentDirectoryPrefix: 'F_',
            separator: '_',
          },
          generateBarrel: true,
        },
        {
          target: 'generated',
          directory: 'web',
          runtime: 'react-dom' as const,
          preset: 'themed-icon-v1',
          naming: 'pascal-case' as const,
          componentNaming: {
            parentDirectoryPrefix: 'F_',
            separator: '_',
          },
        },
      ],
    };
    handler.validate(resource);

    const artifacts = await handler.plan(
      'icons',
      resource,
      planningContext(projectRoot),
    );
    expect(artifacts).toHaveLength(5);
    const components = artifacts.filter(
      (artifact) => artifact.operation === 'transform-svg',
    );
    expect(components.map((artifact) => artifact.componentName)).toEqual([
      'F_Feature_AddIcon',
      'PlainIcon',
      'F_Feature_AddIcon',
      'PlainIcon',
    ]);
    expect(artifacts.every((artifact) => artifact.publication.mode === 'stable')).toBe(true);
    expect(components.every((artifact) => artifact.dependsOn.length === 0)).toBe(true);

    const materializer = new SvgComponentMaterializer();
    const nativeArtifact = components.find(
      (artifact) =>
        artifact.runtime === 'react-native' &&
        artifact.componentName === 'F_Feature_AddIcon',
    );
    const ordinaryNativeArtifact = components.find(
      (artifact) =>
        artifact.runtime === 'react-native' &&
        artifact.componentName === 'PlainIcon',
    );
    const domArtifact = components.find(
      (artifact) =>
        artifact.runtime === 'react-dom' &&
        artifact.componentName === 'F_Feature_AddIcon',
    );
    const ordinaryDomArtifact = components.find(
      (artifact) =>
        artifact.runtime === 'react-dom' && artifact.componentName === 'PlainIcon',
    );
    if (
      nativeArtifact === undefined ||
      ordinaryNativeArtifact === undefined ||
      domArtifact === undefined ||
      ordinaryDomArtifact === undefined
    ) {
      throw new Error('Expected native and DOM SVG artifacts.');
    }
    const native = decoder.decode(
      (await materializer.materialize(nativeArtifact)).content,
    );
    const dom = decoder.decode(
      (await materializer.materialize(domArtifact)).content,
    );
    const ordinaryNative = decoder.decode(
      (await materializer.materialize(ordinaryNativeArtifact)).content,
    );
    const ordinaryDom = decoder.decode(
      (await materializer.materialize(ordinaryDomArtifact)).content,
    );
    expect(native).toContain('// @ts-nocheck');
    expect(native).toContain("from 'react-native-svg'");
    expect(native).toContain('width={props.width ?? 24}');
    expect(native).toContain("fill={props.color ?? '#ABC'}");
    expect(native).toContain('stroke="currentColor"');
    expect(dom).toContain('This file is auto-generated.');
    expect(dom).toContain('<path');
    expect(dom).toContain("stroke={props.color ?? 'currentColor'}");
    expect(ordinaryNative).toContain('const PlainIcon =');
    expect(ordinaryNative).toContain("fill={props.color ?? '#123'}");
    expect(ordinaryNative).not.toContain('stroke={props.color');
    expect(ordinaryDom).toContain('const PlainIcon =');
    expect(ordinaryDom).toContain("fill={props.color ?? '#123'}");
    expect(ordinaryDom).not.toContain('stroke={props.color');
    const barrel = artifacts.find(
      (artifact) => artifact.operation === 'write-text',
    );
    expect(barrel).toMatchObject({
      dependsOn: [nativeArtifact.id, ordinaryNativeArtifact.id],
      destination: path.join(projectRoot, 'generated/native/index.ts'),
      content:
        "export { default as F_Feature_AddIcon } from './F_Feature/AddIcon';\n" +
        "export { default as PlainIcon } from './common/PlainIcon';\n",
    });

    const genericNames = await handler.plan(
      'generic-icons',
      {
        type: 'svg-components',
        source: { root: 'icons', include: ['**/*.svg'], required: true },
        outputs: [
          {
            target: 'generated',
            directory: 'generic',
            runtime: 'react-dom',
            preset: 'themed-icon-v1',
            naming: 'pascal-case',
          },
        ],
      },
      planningContext(projectRoot),
    );
    expect(
      genericNames
        .filter((artifact) => artifact.operation === 'transform-svg')
        .map((artifact) => artifact.componentName),
    ).toEqual(['AddIcon', 'PlainIcon']);
  });
});

describe('font-family resource', () => {
  it('copies arbitrary font bytes and emits deterministic alias-based CSS', async () => {
    const projectRoot = await fixture();
    await mkdir(path.join(projectRoot, 'fonts'));
    const regular = path.join(projectRoot, 'fonts/Demo-Regular.woff2');
    const bold = path.join(projectRoot, 'fonts/Demo-Bold.ttf');
    await writeFile(regular, new Uint8Array([1, 2, 3]));
    await writeFile(bold, new Uint8Array([4, 5, 6]));
    const handler = new FontFamilyResourceHandler();
    const resource = {
      type: 'font-family' as const,
      family: 'Demo',
      faces: [
        {
          source: 'fonts/Demo-Bold.ttf',
          alias: 'Demo Bold',
          weight: 700,
          style: 'normal' as const,
        },
        {
          source: 'fonts/Demo-Regular.woff2',
          alias: 'Demo Regular',
          weight: 400,
          style: 'normal' as const,
        },
      ],
      outputs: [
        {
          target: 'generated',
          directory: 'public/fonts',
          stylesheet: 'styles/fonts.css',
        },
      ],
    };
    handler.validate(resource);

    const artifacts = await handler.plan(
      'demo-font',
      resource,
      planningContext(projectRoot),
    );
    expect(artifacts.map((artifact) => artifact.operation)).toEqual([
      'copy-file',
      'copy-file',
      'write-text',
    ]);
    const stylesheet = artifacts[2];
    if (stylesheet === undefined || stylesheet.operation !== 'write-text') {
      throw new Error('Expected a stylesheet artifact.');
    }
    expect(stylesheet.dependsOn).toEqual(
      artifacts.slice(0, 2).map((artifact) => artifact.id),
    );
    const css = decoder.decode(
      (
        await new WriteTextMaterializer().materialize(
          stylesheet,
          materializationContext(projectRoot),
        )
      ).content,
    );
    expect(css.indexOf("font-family: 'Demo Regular'")).toBeLessThan(
      css.indexOf("font-family: 'Demo Bold'"),
    );
    expect(css).toContain("url('../public/fonts/Demo-Regular.woff2') format('woff2')");
    expect(css).toContain("url('../public/fonts/Demo-Bold.ttf') format('truetype')");
    expect(artifacts.every((artifact) => artifact.publication.mode === 'stable')).toBe(true);
  });

  it('rejects output entries that cannot emit an artifact', () => {
    const handler = new FontFamilyResourceHandler();
    expect(() =>
      handler.validate({
        type: 'font-family',
        family: 'Demo',
        faces: [],
        outputs: [{ target: 'generated' }],
      }),
    ).toThrow(LoomError);
  });

  it('validates TTF, OTF, WOFF, and WOFF2 signatures while copying', async () => {
    const projectRoot = await fixture();
    const formats = [
      ['ttf', [0x00, 0x01, 0x00, 0x00]],
      ['otf', [0x4f, 0x54, 0x54, 0x4f]],
      ['woff', [0x77, 0x4f, 0x46, 0x46]],
      ['woff2', [0x77, 0x4f, 0x46, 0x32]],
    ] as const;
    const materializer = new CopyFileMaterializer();
    for (const [format, signature] of formats) {
      const source = path.join(projectRoot, `valid.${format}`);
      const bytes = new Uint8Array([...signature, 0x01, 0x02]);
      await writeFile(source, bytes);
      const artifact: CopyFileArtifact = {
        id: `font:${format}`,
        resourceId: 'font',
        resourceType: 'font-family',
        target: targetId('generated'),
        operation: 'copy-file',
        ownership: 'generated',
        publication: { mode: 'stable' },
        dependsOn: [],
        sourceDependencies: [source],
        source,
        destination: path.join(projectRoot, `out.${format}`),
        presetVersion: 'font-family-v1',
      };
      const materialized = await materializer.materialize(artifact);
      expect(Array.from(materialized.content)).toEqual(Array.from(bytes));
    }

    const invalidSource = path.join(projectRoot, 'invalid.ttf');
    await writeFile(invalidSource, new Uint8Array([0x42, 0x41, 0x44]));
    const invalidArtifact: CopyFileArtifact = {
      id: 'font:invalid',
      resourceId: 'font',
      resourceType: 'font-family',
      target: targetId('generated'),
      operation: 'copy-file',
      ownership: 'generated',
      publication: { mode: 'stable' },
      dependsOn: [],
      sourceDependencies: [invalidSource],
      source: invalidSource,
      destination: path.join(projectRoot, 'invalid.ttf'),
      presetVersion: 'font-family-v1',
    };
    await expect(materializer.materialize(invalidArtifact)).rejects.toMatchObject({
      code: 'LOOM_RENDER_FAILED',
    });
  });

  it('preserves referenced binary content in the generic text materializer', async () => {
    const projectRoot = await fixture();
    const bytes = new Uint8Array([0x00, 0xff, 0x42]);
    const artifact: WriteTextArtifact = {
      id: 'referenced-text',
      resourceId: 'font',
      resourceType: 'font-family',
      target: targetId('generated'),
      operation: 'write-text',
      ownership: 'generated',
      publication: { mode: 'stable' },
      dependsOn: ['producer'],
      sourceDependencies: [],
      destination: path.join(projectRoot, 'referenced.bin'),
      presetVersion: 'font-family-v1',
      content: {
        kind: 'artifact-output',
        artifactId: 'producer',
        value: 'content',
      },
      encoding: 'utf8',
    };

    const output = await new WriteTextMaterializer().materialize(
      artifact,
      materializationContext(projectRoot, bytes),
    );
    expect(output.content).toBe(bytes);
  });
});
