import { LoomError } from '../../domain/errors.js';
import type {
  CatalogPlannedArtifact,
} from '../../domain/catalog/planning.js';
import type {
  FilesResource,
  FontFamilyResource,
  ImageVariantsResource,
  NativeImageAssetsResource,
  SvgComponentsResource,
  WebAppBrandingResource,
  CatalogResourceDefinition,
} from '../../domain/catalog/resources.js';
import type { PlanningContext, ResourceHandler } from './contracts.js';

export interface ResourceHandlers {
  readonly files?: ResourceHandler<FilesResource>;
  readonly 'svg-components'?: ResourceHandler<SvgComponentsResource>;
  readonly 'image-variants'?: ResourceHandler<ImageVariantsResource>;
  readonly 'native-image-assets'?: ResourceHandler<NativeImageAssetsResource>;
  readonly 'web-app-branding'?: ResourceHandler<WebAppBrandingResource>;
  readonly 'font-family'?: ResourceHandler<FontFamilyResource>;
}

export class ResourceHandlerRegistry {
  readonly #handlers: ResourceHandlers;

  constructor(handlers: ResourceHandlers = {}) {
    this.#handlers = Object.freeze({ ...handlers });
  }

  async plan(
    resourceId: string,
    resource: CatalogResourceDefinition,
    context: PlanningContext,
  ): Promise<readonly CatalogPlannedArtifact[]> {
    switch (resource.type) {
      case 'files':
        return this.#planWith(
          resourceId,
          resource,
          this.#handlers.files,
          context,
        );
      case 'svg-components':
        return this.#planWith(
          resourceId,
          resource,
          this.#handlers['svg-components'],
          context,
        );
      case 'image-variants':
        return this.#planWith(
          resourceId,
          resource,
          this.#handlers['image-variants'],
          context,
        );
      case 'native-image-assets':
        return this.#planWith(
          resourceId,
          resource,
          this.#handlers['native-image-assets'],
          context,
        );
      case 'web-app-branding':
        return this.#planWith(
          resourceId,
          resource,
          this.#handlers['web-app-branding'],
          context,
        );
      case 'font-family':
        return this.#planWith(
          resourceId,
          resource,
          this.#handlers['font-family'],
          context,
        );
    }
  }

  async #planWith<TResource extends CatalogResourceDefinition>(
    resourceId: string,
    resource: TResource,
    handler: ResourceHandler<TResource> | undefined,
    context: PlanningContext,
  ): Promise<readonly CatalogPlannedArtifact[]> {
    if (handler === undefined) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: `No resource handler is registered for "${resource.type}".`,
        context: { resourceId, resourceType: resource.type },
      });
    }
    handler.validate(resource, context);
    return handler.plan(resourceId, resource, context);
  }
}
