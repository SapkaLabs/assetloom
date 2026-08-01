import path from 'node:path';
import sharp from 'sharp';
import { CatalogMaterializerRegistry } from '../../application/execution/catalog-materializer-registry.js';
import type {
  CatalogArtifactVerifier,
  ResolvedCatalogArtifactOutput,
} from '../../application/execution/contracts.js';
import { DefaultProjectIntegrationAdapterRegistry } from '../../application/execution/project-integration-adapter-registry.js';
import type { PlanningContext } from '../../application/planning/contracts.js';
import { ResourceHandlerRegistry } from '../../application/planning/resource-handler-registry.js';
import { normalizeConfiguration } from '../../config/normalize.js';
import { selectCatalogTarget } from '../../config/selection.js';
import type {
  CatalogPlannedArtifact,
  CopyFileArtifact,
  RenderImageArtifact,
} from '../../domain/catalog/planning.js';
import { LoomError } from '../../domain/errors.js';
import type { LoadedVersionedConfiguration } from '../../domain/types.js';
import { ImageArtifactMaterializer } from '../images/image-materializer.js';
import { NodeSourceResolver } from '../sources/node-source-resolver.js';
import { HtmlHeadIntegrationAdapter } from '../web-integration/html-head-adapter.js';
import { StaticWebAppConfigIntegrationAdapter } from '../web-integration/static-web-app-config-adapter.js';
import { WebManifestIntegrationAdapter } from '../web-integration/web-manifest-adapter.js';
import { CopyFileMaterializer } from '../../resources/files/materialize.js';
import { FilesResourceHandler } from '../../resources/files/handler.js';
import { FontFamilyResourceHandler } from '../../resources/font-family/handler.js';
import { FontFileSignatureValidator } from '../../resources/font-family/signature.js';
import { WriteTextMaterializer } from '../../resources/font-family/materialize.js';
import { ImageVariantsResourceHandler } from '../../resources/image-variants/handler.js';
import { NativeImageAssetsResourceHandler } from '../../resources/native-image-assets/handler.js';
import { SvgComponentsResourceHandler } from '../../resources/svg-components/handler.js';
import { SvgComponentMaterializer } from '../../resources/svg-components/materialize.js';
import { WebAppBrandingResourceHandler } from '../../resources/web-app-branding/handler.js';

export interface DefaultCatalogRuntime {
  readonly integrationAdapters: DefaultProjectIntegrationAdapterRegistry;
  readonly materializers: CatalogMaterializerRegistry;
  readonly planningContext: PlanningContext;
  readonly resourceHandlers: ResourceHandlerRegistry;
  readonly structuralVerifiers: readonly CatalogArtifactVerifier[];
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function assertImageDimensions(
  artifact: RenderImageArtifact,
  actualWidth: number | undefined,
  actualHeight: number | undefined,
): void {
  if (
    (artifact.width !== undefined && actualWidth !== artifact.width) ||
    (artifact.height !== undefined && actualHeight !== artifact.height)
  ) {
    throw new LoomError({
      code: 'LOOM_VERIFY_IMAGE_INVALID',
      message: 'Generated image dimensions differ from the generation plan.',
      context: {
        taskId: artifact.id,
        expectedWidth: artifact.width,
        expectedHeight: artifact.height,
        actualWidth,
        actualHeight,
      },
    });
  }
}

class ImageArtifactStructuralVerifier implements CatalogArtifactVerifier {
  async verify(
    artifact: CatalogPlannedArtifact,
    output: ResolvedCatalogArtifactOutput,
  ): Promise<void> {
    if (artifact.operation !== 'render-image') {
      return;
    }
    if (artifact.format === 'ico') {
      const content = Buffer.from(output.content);
      if (
        content.length < 22 ||
        content.readUInt16LE(0) !== 0 ||
        content.readUInt16LE(2) !== 1 ||
        content.readUInt16LE(4) < 1
      ) {
        throw new LoomError({
          code: 'LOOM_VERIFY_IMAGE_INVALID',
          message: 'Generated ICO content has an invalid directory header.',
          context: { taskId: artifact.id, destination: output.destination },
        });
      }
      const count = content.readUInt16LE(4);
      const widths: number[] = [];
      const heights: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const entry = 6 + index * 16;
        if (entry + 16 > content.length) {
          throw new LoomError({
            code: 'LOOM_VERIFY_IMAGE_INVALID',
            message: 'Generated ICO content has a truncated directory.',
            context: { taskId: artifact.id, destination: output.destination },
          });
        }
        widths.push(content[entry] === 0 ? 256 : (content[entry] ?? 0));
        heights.push(content[entry + 1] === 0 ? 256 : (content[entry + 1] ?? 0));
      }
      assertImageDimensions(
        artifact,
        Math.max(...widths),
        Math.max(...heights),
      );
      return;
    }
    const metadata = await sharp(output.content).metadata();
    assertImageDimensions(artifact, metadata.width, metadata.height);
    if (metadata.format !== artifact.format) {
      throw new LoomError({
        code: 'LOOM_VERIFY_IMAGE_INVALID',
        message: 'Generated image format differs from the generation plan.',
        context: {
          taskId: artifact.id,
          expectedFormat: artifact.format,
          actualFormat: metadata.format,
        },
      });
    }
  }
}

class FontArtifactStructuralVerifier implements CatalogArtifactVerifier {
  readonly #validator = new FontFileSignatureValidator();

  verify(
    artifact: CatalogPlannedArtifact,
    output: ResolvedCatalogArtifactOutput,
  ): Promise<void> {
    if (artifact.operation === 'copy-file' && this.#isFont(artifact)) {
      this.#validator.validate(artifact, output.content);
    }
    return Promise.resolve();
  }

  #isFont(artifact: CopyFileArtifact): boolean {
    return this.#validator.supports(artifact);
  }
}

export function createDefaultCatalogRuntime(
  loaded: LoadedVersionedConfiguration,
): DefaultCatalogRuntime {
  const sourceResolver = new NodeSourceResolver({
    projectRoot: loaded.projectRoot,
  });
  const planningContext: PlanningContext = {
    projectRoot: loaded.projectRoot,
    normalizedConfiguration: normalizeConfiguration(loaded.config),
    sourceResolver,
    resolveTarget: (requestedId) => {
      if (loaded.config.schemaVersion !== 2) {
        throw new LoomError({
          code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
          message: 'Catalog targets require schema version 2.',
          context: { target: requestedId },
        });
      }
      const selected = selectCatalogTarget(loaded.config, requestedId);
      const targetRoot = path.resolve(
        loaded.projectRoot,
        selected.configuration.root,
      );
      if (!isInside(loaded.projectRoot, targetRoot)) {
        throw new LoomError({
          code: 'LOOM_CFG_PATH_INVALID',
          message: 'Catalog target root must stay inside the project root.',
          context: {
            target: requestedId,
            projectRoot: loaded.projectRoot,
            targetRoot,
          },
        });
      }
      return {
        id: selected.id,
        kind: selected.configuration.kind,
        root: targetRoot,
        configuration: selected.configuration,
      };
    },
  };
  return {
    planningContext,
    resourceHandlers: new ResourceHandlerRegistry({
      files: new FilesResourceHandler(),
      'svg-components': new SvgComponentsResourceHandler(),
      'image-variants': new ImageVariantsResourceHandler(),
      'native-image-assets': new NativeImageAssetsResourceHandler(),
      'web-app-branding': new WebAppBrandingResourceHandler(),
      'font-family': new FontFamilyResourceHandler(),
    }),
    materializers: new CatalogMaterializerRegistry({
      'copy-file': new CopyFileMaterializer(),
      'transform-svg': new SvgComponentMaterializer(),
      'render-image': new ImageArtifactMaterializer(),
      'write-text': new WriteTextMaterializer(),
    }),
    integrationAdapters: new DefaultProjectIntegrationAdapterRegistry({
      'web-app-manifest': new WebManifestIntegrationAdapter(),
      'html-head': new HtmlHeadIntegrationAdapter(),
      'static-web-app-config': new StaticWebAppConfigIntegrationAdapter(),
    }),
    structuralVerifiers: [
      new ImageArtifactStructuralVerifier(),
      new FontArtifactStructuralVerifier(),
    ],
  };
}
