import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/api/generate.js';
import { loadConfiguration } from '../src/config/load.js';
import { verify } from '../src/verification/index.js';

const project = `// !$*UTF8*$!
{
  objects = {
/* Begin PBXBuildFile section */
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
/* End PBXFileReference section */
/* Begin PBXGroup section */
    A = {
      isa = PBXGroup;
      children = (
      );
    };
/* End PBXGroup section */
/* Begin PBXResourcesBuildPhase section */
    B = {
      isa = PBXResourcesBuildPhase;
      files = (
      );
    };
/* End PBXResourcesBuildPhase section */
    C = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_NAME = Demo;
      };
    };
  };
}
`;

describe('Icon Composer passthrough', () => {
  it('copies an opaque .icon package and integrates it idempotently', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'assetloom-icon-'));
    await mkdir(path.join(root, 'source', 'Brand.icon'), { recursive: true });
    await mkdir(path.join(root, 'ios', 'Demo.xcodeproj'), { recursive: true });
    await mkdir(path.join(root, 'ios', 'Demo', 'Images.xcassets'), {
      recursive: true,
    });
    await writeFile(
      path.join(root, 'source', 'Brand.icon', 'icon.json'),
      '{"opaque":"fixture"}\n',
    );
    await writeFile(
      path.join(root, 'ios', 'Demo.xcodeproj', 'project.pbxproj'),
      project,
    );
    await writeFile(
      path.join(root, 'assetloom.json'),
      JSON.stringify({
        schemaVersion: 1,
        project: { root: '.' },
        targets: {
          ios: {
            enabled: true,
            projectDirectory: './ios/Demo',
            projectFile: './ios/Demo.xcodeproj/project.pbxproj',
            assetCatalogDirectory: './ios/Demo/Images.xcassets',
          },
        },
        resources: {
          icon: {
            type: 'app-icon',
            ios: {
              mode: 'icon-composer',
              source: './source/Brand.icon',
              name: 'AppIcon',
            },
          },
        },
      }),
    );
    const loaded = await loadConfiguration(['assetloom.json'], { cwd: root });

    const first = await generate(loaded);
    expect(first.written).toHaveLength(2);
    expect(
      await readFile(path.join(root, 'ios', 'Demo', 'AppIcon.icon', 'icon.json'), 'utf8'),
    ).toBe('{"opaque":"fixture"}\n');
    const updatedProject = await readFile(
      path.join(root, 'ios', 'Demo.xcodeproj', 'project.pbxproj'),
      'utf8',
    );
    expect(updatedProject).toContain('lastKnownFileType = folder');
    expect(updatedProject).toContain(
      'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon',
    );

    await verify(loaded);
    const second = await generate(loaded);
    expect(second.written).toEqual([]);
  });
});
