import path from 'node:path';
import type {
  ArtifactPublication,
  ArtifactOutputReference,
  CatalogPlannedArtifact,
  CompositeImageRecipe,
  HtmlHeadElement,
  ImageCompositeLayer,
  IntegrateProjectArtifact,
  IntegrationValue,
  RenderImageArtifact,
} from '../../domain/catalog/planning.js';
import type {
  ForegroundScalePolicy,
  WebAppBrandingResource,
} from '../../domain/catalog/resources.js';
import type { ResolvedSource } from '../../domain/catalog/sources.js';
import { LoomError } from '../../domain/errors.js';
import { compareCodePoints } from '../../domain/ordering.js';
import type {
  PlanningContext,
  ResourceHandler,
} from '../../application/planning/contracts.js';
import { resolveWebBrandingPreset } from './presets.js';

function inside(root: string, configuredPath: string): string {
  const result = path.resolve(root, configuredPath);
  const relative = path.relative(root, result);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new LoomError({
      code: 'LOOM_CFG_PATH_INVALID',
      message: 'Web branding path resolves outside its target root.',
      context: { targetRoot: root, path: configuredPath },
    });
  }
  return result;
}

function oneSource(
  sources: readonly ResolvedSource[],
  resourceId: string,
  name: string,
): ResolvedSource {
  if (sources.length !== 1 || sources[0] === undefined) {
    throw new LoomError({
      code: 'LOOM_SRC_INVALID',
      message: `Web branding ${name} requires exactly one source.`,
      context: { resourceId, sourceCount: sources.length, source: name },
    });
  }
  return sources[0];
}

function scale(policy: ForegroundScalePolicy | undefined, size: number, fallback: number): number {
  return policy?.overrides?.[String(size)] ?? policy?.default ?? fallback;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function outputReference(
  artifactId: string,
  value: ArtifactOutputReference['value'] = 'public-path',
): ArtifactOutputReference {
  return { kind: 'artifact-output', artifactId, value };
}

function absoluteUrl(
  siteUrl: string | undefined,
  reference: ArtifactOutputReference,
): IntegrationValue {
  const base = siteUrl?.trim().replace(/\/+$/, '');
  return base === undefined || base === ''
    ? reference
    : { kind: 'interpolated', parts: [base, reference] };
}

function configuredUrl(siteUrl: string | undefined, configuredPath: string): string {
  const base = siteUrl?.trim().replace(/\/+$/, '');
  return base === undefined || base === ''
    ? configuredPath
    : `${base}/${configuredPath.replace(/^\/+/, '')}`;
}

function validateSizes(name: string, sizes: readonly number[]): void {
  if (
    sizes.length === 0 ||
    sizes.some((size) => !Number.isInteger(size) || size <= 0 || size > 256)
  ) {
    throw new LoomError({
      code: 'LOOM_PLAN_INVALID',
      message: `${name} must contain image dimensions from 1 through 256.`,
      context: { sizes },
    });
  }
}

export class WebAppBrandingResourceHandler
  implements ResourceHandler<WebAppBrandingResource>
{
  readonly type = 'web-app-branding' as const;

  validate(resource: WebAppBrandingResource): void {
    const preset = resolveWebBrandingPreset(resource.preset);
    if (
      resource.naming.strategy === 'content-hash' &&
      resource.naming.hashLength === undefined
    ) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Content-hashed web branding requires a hash length.',
      });
    }
    if (
      resource.seo?.includeManifest === true &&
      resource.output.manifest === undefined
    ) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'SEO manifest integration requires an authored manifest path.',
      });
    }
    validateSizes(
      'faviconIcoSizes',
      resource.faviconIcoSizes ?? resource.faviconSizes,
    );
    const needsSocialImage =
      resource.seo?.openGraph?.includeImage === true ||
      resource.seo?.twitter?.includeImage === true;
    if (
      needsSocialImage &&
      (resource.sources.socialPreview === undefined ||
        resource.socialPreview === undefined)
    ) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'SEO image metadata requires a social preview source and recipe.',
      });
    }
    if (
      (resource.sources.socialPreview === undefined) !==
      (resource.socialPreview === undefined)
    ) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Social preview source and recipe must be configured together.',
      });
    }
    if (resource.socialPreview !== undefined) {
      preset.createSocialOverlay({
        ...(resource.socialPreview.overlayPreset === undefined
          ? {}
          : { overlayPreset: resource.socialPreview.overlayPreset }),
        displayName: resource.displayName,
        brandColor: resource.brandColor,
        width: resource.socialPreview.width,
        height: resource.socialPreview.height,
      });
    }
  }

  async plan(
    resourceId: string,
    resource: WebAppBrandingResource,
    context: PlanningContext,
  ): Promise<readonly CatalogPlannedArtifact[]> {
    this.validate(resource);
    const preset = resolveWebBrandingPreset(resource.preset);
    const target = context.resolveTarget(resource.output.target);
    const webTarget = target.configuration;
    if (webTarget.kind !== 'web-app') {
      throw new LoomError({
        code: 'LOOM_PLAN_TARGET_UNSUPPORTED',
        message: 'Web app branding requires a web-app target.',
        context: {
          resourceId,
          target: target.id,
          targetKind: target.kind,
        },
      });
    }
    const publicDirectory = inside(
      target.root,
      webTarget.publicDirectory,
    );
    const outputDirectory = inside(target.root, resource.output.directory);
    if (!isInside(publicDirectory, outputDirectory)) {
      throw new LoomError({
        code: 'LOOM_PLAN_INVALID',
        message: 'Web branding output directory must be inside the target public directory.',
        context: { outputDirectory, publicDirectory, resourceId },
      });
    }
    const [foregroundSources, backgroundSources, socialSources] =
      await Promise.all([
        context.sourceResolver.resolve(
          resource.sources.foreground,
          `/resources/${resourceId}/sources/foreground`,
        ),
        resource.sources.background === undefined
          ? Promise.resolve([])
          : context.sourceResolver.resolve(
              resource.sources.background,
              `/resources/${resourceId}/sources/background`,
            ),
        resource.sources.socialPreview === undefined
          ? Promise.resolve([])
          : context.sourceResolver.resolve(
              resource.sources.socialPreview,
              `/resources/${resourceId}/sources/socialPreview`,
            ),
      ]);
    const foreground = oneSource(
      foregroundSources,
      resourceId,
      'foreground',
    );
    const background =
      resource.sources.background === undefined
        ? undefined
        : oneSource(backgroundSources, resourceId, 'background');
    const social =
      resource.sources.socialPreview === undefined
        ? undefined
        : oneSource(socialSources, resourceId, 'social preview');
    const hashLength = resource.naming.hashLength ?? 12;
    const artifacts: CatalogPlannedArtifact[] = [];
    const imageByLogicalName = new Map<string, RenderImageArtifact>();
    const publication = (
      directory: string,
      logicalName: string,
      extension: string,
      fallbackDestination?: string,
    ): ArtifactPublication =>
      resource.naming.strategy === 'content-hash'
        ? {
            mode: 'content-hash',
            directory,
            logicalName,
            extension,
            hashLength,
            ...(fallbackDestination === undefined
              ? {}
              : { fallbackDestination }),
            publicPath: {
              publicDirectory,
              publicBasePath: webTarget.publicBasePath,
            },
          }
        : {
            mode: 'stable',
            publicPath: {
              publicDirectory,
              publicBasePath: webTarget.publicBasePath,
            },
          };

    const iconRecipe = (
      size: number,
      foregroundScale: number,
      backgroundColor: string,
    ): {
      readonly recipe: CompositeImageRecipe;
      readonly sourceDependencies: readonly string[];
    } => {
      const foregroundSize = Math.max(1, Math.round(size * foregroundScale));
      const offset = Math.round((size - foregroundSize) / 2);
      const layers: ImageCompositeLayer[] = [];
      const sourceDependencies = [foreground.absolutePath];
      if (background !== undefined) {
        sourceDependencies.push(background.absolutePath);
        layers.push({
          input: { kind: 'source', path: background.absolutePath },
          left: 0,
          top: 0,
          width: size,
          height: size,
          fit: 'cover',
        });
      }
      layers.push({
        input: { kind: 'source', path: foreground.absolutePath },
        left: offset,
        top: offset,
        width: foregroundSize,
        height: foregroundSize,
        fit: 'inside',
      });
      return {
        sourceDependencies,
        recipe: {
          kind: 'composite',
          canvas: { width: size, height: size, background: backgroundColor },
          layers,
        },
      };
    };

    const image = (
      logicalName: string,
      size: number,
      foregroundScale: number,
      backgroundColor: string,
    ): RenderImageArtifact => {
      const prepared = iconRecipe(size, foregroundScale, backgroundColor);
      const id = `${resourceId}:${target.id}:${logicalName}`;
      return {
        id,
        resourceId,
        resourceType: 'web-app-branding',
        target: target.id,
        operation: 'render-image',
        ownership: 'generated',
        publication:
          resource.naming.strategy === 'content-hash'
            ? {
                mode: 'content-hash',
                directory: outputDirectory,
                logicalName,
                extension: 'png',
                hashLength,
                publicPath: {
                  publicDirectory,
                  publicBasePath: webTarget.publicBasePath,
                },
              }
            : {
                mode: 'stable',
                publicPath: {
                  publicDirectory,
                  publicBasePath: webTarget.publicBasePath,
                },
        },
        dependsOn: [],
        sourceDependencies: prepared.sourceDependencies,
        destination: path.join(outputDirectory, `${logicalName}.png`),
        presetVersion: `${preset.id}:${preset.version}`,
        width: size,
        height: size,
        format: 'png',
        recipe: prepared.recipe,
      };
    };

    const faviconSizes = [...new Set(resource.faviconSizes)].sort(
      (left, right) => left - right,
    );
    for (const size of faviconSizes) {
      const artifact = image(
        `favicon-${size}x${size}`,
        size,
        scale(resource.foregroundScales?.favicon, size, 0.78),
        resource.iconBackgroundColor,
      );
      imageByLogicalName.set(`favicon:${size}`, artifact);
      artifacts.push(artifact);
    }
    let appleTouchIcon: RenderImageArtifact | undefined;
    if (resource.appleTouchIconSize !== undefined) {
      appleTouchIcon = image(
          'apple-touch-icon',
          resource.appleTouchIconSize,
          resource.foregroundScales?.appleTouch ?? 0.62,
          resource.iconBackgroundColor,
      );
      artifacts.push(appleTouchIcon);
    }
    for (const size of resource.applicationIconSizes) {
      const artifact = image(
        `logo${size}`,
        size,
        resource.foregroundScales?.application ?? 0.68,
        resource.iconBackgroundColor,
      );
      imageByLogicalName.set(`application:${size}`, artifact);
      artifacts.push(artifact);
    }
    for (const size of resource.maskableIconSizes ?? []) {
      const artifact = image(
        `maskable-icon-${size}`,
        size,
        resource.foregroundScales?.maskable ?? 0.52,
        resource.brandColor,
      );
      imageByLogicalName.set(`maskable:${size}`, artifact);
      artifacts.push(artifact);
    }

    const icoSizes = resource.faviconIcoSizes ?? resource.faviconSizes;
    validateSizes('faviconIcoSizes', icoSizes);
    const icoImages = icoSizes.map((size) => ({
      recipe: iconRecipe(
        size,
        scale(resource.foregroundScales?.favicon, size, 0.78),
        resource.iconBackgroundColor,
      ).recipe,
    }));
    const icoId = `${resourceId}:${target.id}:favicon-ico`;
    artifacts.push({
      id: icoId,
      resourceId,
      resourceType: 'web-app-branding',
      target: target.id,
      operation: 'render-image',
      ownership: 'generated',
      publication:
        resource.naming.strategy === 'content-hash'
          ? {
              mode: 'content-hash',
              directory: outputDirectory,
              logicalName: 'favicon',
              extension: 'ico',
              hashLength,
              ...(resource.naming.fallbackFavicon === undefined
                ? {}
                : {
                    fallbackDestination: inside(
                      target.root,
                      resource.naming.fallbackFavicon,
                    ),
                  }),
              publicPath: {
                publicDirectory,
                publicBasePath: webTarget.publicBasePath,
              },
            }
          : {
              mode: 'stable',
              publicPath: {
                publicDirectory,
                publicBasePath: webTarget.publicBasePath,
              },
            },
      dependsOn: [],
      sourceDependencies: [
        foreground.absolutePath,
        ...(background === undefined ? [] : [background.absolutePath]),
      ],
      destination: path.join(outputDirectory, 'favicon.ico'),
      presetVersion: `${preset.id}:${preset.version}`,
      width: Math.max(...icoSizes),
      height: Math.max(...icoSizes),
      format: 'ico',
      recipe: { kind: 'ico', images: icoImages },
    });

    let socialId: string | undefined;
    if (social !== undefined && resource.socialPreview !== undefined) {
      const preview = resource.socialPreview;
      const logoSize = preview.logoSize ?? 44;
      const overlay = preset.createSocialOverlay({
        ...(preview.overlayPreset === undefined
          ? {}
          : { overlayPreset: preview.overlayPreset }),
        displayName: resource.displayName,
        brandColor: resource.brandColor,
        width: preview.width,
        height: preview.height,
      });
      socialId = `${resourceId}:${target.id}:social-preview`;
      artifacts.push({
        id: socialId,
        resourceId,
        resourceType: 'web-app-branding',
        target: target.id,
        operation: 'render-image',
        ownership: 'generated',
        publication: publication(outputDirectory, 'og_image', 'png'),
        dependsOn: [],
        sourceDependencies: [social.absolutePath, foreground.absolutePath],
        destination: path.join(outputDirectory, 'og_image.png'),
        presetVersion: `${preset.id}:${preset.version}`,
        width: preview.width,
        height: preview.height,
        format: 'png',
        recipe: {
          kind: 'composite',
          canvas: {
            width: preview.width,
            height: preview.height,
            background: '#00000000',
          },
          layers: [
            {
              input: { kind: 'source', path: social.absolutePath },
              left: 0,
              top: 0,
              width: preview.width,
              height: preview.height,
              fit: preview.fit ?? 'cover',
            },
            {
              input: { kind: 'inline-svg', content: overlay },
              left: 0,
              top: 0,
              width: preview.width,
              height: preview.height,
              fit: 'fill',
            },
            {
              input: { kind: 'source', path: foreground.absolutePath },
              left: 72,
              top: 48,
              width: logoSize,
              height: logoSize,
              fit: 'inside',
            },
          ],
        },
      } satisfies RenderImageArtifact);
    }

    const applicationIconEntries = resource.applicationIconSizes.map((size) => {
      const artifact = imageByLogicalName.get(`application:${size}`);
      if (artifact === undefined) {
        throw new LoomError({
          code: 'LOOM_INTERNAL',
          message: 'Application icon artifact is missing.',
        });
      }
      return {
        artifactId: artifact.id,
        manifest: {
          src: outputReference(artifact.id),
          type: 'image/png',
          sizes: `${size}x${size}`,
          purpose: 'any',
        },
      };
    });
    const maskableIconEntries = (resource.maskableIconSizes ?? []).map((size) => {
      const artifact = imageByLogicalName.get(`maskable:${size}`);
      if (artifact === undefined) {
        throw new LoomError({
          code: 'LOOM_INTERNAL',
          message: 'Maskable icon artifact is missing.',
        });
      }
      return {
        artifactId: artifact.id,
        manifest: {
          src: outputReference(artifact.id),
          type: 'image/png',
          sizes: `${size}x${size}`,
          purpose: 'maskable',
        },
      };
    });
    const applicationIcons = applicationIconEntries.map(
      (entry) => entry.manifest,
    );
    const maskableIcons = maskableIconEntries.map((entry) => entry.manifest);

    let manifestArtifactId: string | undefined;
    let manifestResultId: string | undefined;
    if (resource.output.manifest !== undefined) {
      const manifestDestination = inside(target.root, resource.output.manifest);
      const manifestId = `${resourceId}:${target.id}:manifest-integration`;
      manifestArtifactId = manifestId;
      manifestResultId = `${manifestId}:published`;
      artifacts.push({
        id: manifestId,
        resourceId,
        resourceType: 'web-app-branding',
        target: target.id,
        operation: 'integrate-project',
        ownership: 'project-integration',
        dependsOn: [...applicationIconEntries, ...maskableIconEntries].map(
          (entry) => entry.artifactId,
        ),
        sourceDependencies: [],
        destination: manifestDestination,
        presetVersion: `${preset.id}:${preset.version}`,
        integration: {
          adapter: 'web-app-manifest',
          stateKey: `${resourceId}-web-manifest`,
          manifest: {
            name: resource.displayName,
            short_name: resource.shortName,
            icons: [...applicationIcons, ...maskableIcons],
            theme_color: resource.manifest.themeColor ?? resource.brandColor,
            background_color: resource.manifest.backgroundColor,
            display: resource.manifest.display,
          },
          publishedCopy: {
            resultId: manifestResultId,
            destination: manifestDestination,
            publication: publication(
              publicDirectory,
              'manifest',
              'json',
              resource.naming.fallbackManifest === undefined
                ? undefined
                : inside(target.root, resource.naming.fallbackManifest),
            ),
          },
        },
      } satisfies IntegrateProjectArtifact);
    }

    if (resource.output.document !== undefined) {
      const seo = resource.seo;
      const elements: HtmlHeadElement[] = [];
      if (seo?.title !== undefined) {
        elements.push({ element: 'title', text: seo.title });
      }
      if (seo?.description !== undefined) {
        elements.push({
          element: 'meta',
          attributes: { name: 'description', content: seo.description },
        });
      }
      if (seo?.canonicalPath !== undefined) {
        elements.push({
          element: 'link',
          attributes: {
            rel: 'canonical',
            href:
              seo.siteUrl === undefined
                ? seo.canonicalPath
                : `${seo.siteUrl.replace(/\/+$/, '')}/${seo.canonicalPath.replace(/^\/+/, '')}`,
          },
        });
      }
      if (seo?.robots !== undefined) {
        elements.push({
          element: 'meta',
          attributes: { name: 'robots', content: seo.robots },
        });
      }
      if (seo?.openGraph !== undefined) {
        const openGraphDescription =
          seo.openGraph.description ?? seo.description;
        const openGraphUrl = seo.openGraph.url ?? seo.canonicalPath;
        elements.push(
          {
            element: 'meta',
            attributes: {
              property: 'og:title',
              content: seo.openGraph.title ?? seo.title ?? resource.displayName,
            },
          },
          {
            element: 'meta',
            attributes: { property: 'og:type', content: seo.openGraph.type },
          },
        );
        if (openGraphDescription !== undefined) {
          elements.push({
            element: 'meta',
            attributes: {
              property: 'og:description',
              content: openGraphDescription,
            },
          });
        }
        if (openGraphUrl !== undefined) {
          elements.push({
            element: 'meta',
            attributes: {
              property: 'og:url',
              content: configuredUrl(seo.siteUrl, openGraphUrl),
            },
          });
        }
        if (socialId !== undefined && seo.openGraph.includeImage === true) {
          const preview = resource.socialPreview;
          if (preview !== undefined) {
            elements.push(
              {
                element: 'meta',
                attributes: {
                  property: 'og:image',
                  content: absoluteUrl(seo.siteUrl, outputReference(socialId)),
                },
              },
              {
                element: 'meta',
                attributes: {
                  property: 'og:image:width',
                  content: String(preview.width),
                },
              },
              {
                element: 'meta',
                attributes: {
                  property: 'og:image:height',
                  content: String(preview.height),
                },
              },
              {
                element: 'meta',
                attributes: {
                  property: 'og:image:alt',
                  content: `${resource.displayName} product overview`,
                },
              },
            );
          }
        }
      }
      if (seo?.twitter !== undefined) {
        elements.push(
          {
            element: 'meta',
            attributes: { name: 'twitter:card', content: seo.twitter.card },
          },
          {
            element: 'meta',
            attributes: {
              name: 'twitter:title',
              content: seo.twitter.title ?? resource.displayName,
            },
          },
        );
        const twitterDescription =
          seo.twitter.description ??
          seo.openGraph?.description ??
          seo.description;
        if (twitterDescription !== undefined) {
          elements.push({
            element: 'meta',
            attributes: {
              name: 'twitter:description',
              content: twitterDescription,
            },
          });
        }
        if (socialId !== undefined && seo.twitter.includeImage === true) {
          elements.push({
            element: 'meta',
            attributes: {
              name: 'twitter:image',
              content: absoluteUrl(seo.siteUrl, outputReference(socialId)),
            },
          });
        }
      }
      elements.push({
        element: 'meta',
        attributes: {
          name: 'theme-color',
          content: resource.manifest.themeColor ?? resource.brandColor,
        },
      });
      if (seo?.colorScheme !== undefined) {
        elements.push({
          element: 'meta',
          attributes: { name: 'color-scheme', content: seo.colorScheme },
        });
      }
      if (seo?.includeIcons === true) {
        elements.push({
          element: 'link',
          attributes: {
            rel: 'icon',
            sizes: 'any',
            href: absoluteUrl(seo.siteUrl, outputReference(icoId)),
          },
        });
        for (const size of resource.faviconSizes) {
          const icon = imageByLogicalName.get(`favicon:${size}`);
          if (icon !== undefined) {
            elements.push({
              element: 'link',
              attributes: {
                rel: 'icon',
                type: 'image/png',
                sizes: `${size}x${size}`,
                href: absoluteUrl(seo.siteUrl, outputReference(icon.id)),
              },
            });
          }
        }
        if (appleTouchIcon !== undefined) {
          elements.push({
            element: 'link',
            attributes: {
              rel: 'apple-touch-icon',
              sizes: `${appleTouchIcon.width}x${appleTouchIcon.height}`,
              href: absoluteUrl(
                seo.siteUrl,
                outputReference(appleTouchIcon.id),
              ),
            },
          });
        }
      }
      if (seo?.includeManifest === true && manifestResultId !== undefined) {
        elements.push({
          element: 'link',
          attributes: {
            rel: 'manifest',
            href: absoluteUrl(
              seo.siteUrl,
              outputReference(manifestResultId),
            ),
          },
        });
      }
      const referenceIds = new Set<string>();
      const collectReference = (artifactId: string): void => {
        referenceIds.add(
          artifactId === manifestResultId && manifestArtifactId !== undefined
            ? manifestArtifactId
            : artifactId,
        );
      };
      const collect = (value: IntegrationValue): void => {
        if (typeof value === 'string') {
          return;
        }
        if (value.kind === 'artifact-output') {
          collectReference(value.artifactId);
        } else {
          for (const part of value.parts) {
            if (typeof part !== 'string') {
              collectReference(part.artifactId);
            }
          }
        }
      };
      for (const element of elements) {
        if (element.text !== undefined) {
          collect(element.text);
        }
        Object.values(element.attributes ?? {}).forEach(collect);
      }
      artifacts.push({
        id: `${resourceId}:${target.id}:html-head-integration`,
        resourceId,
        resourceType: 'web-app-branding',
        target: target.id,
        operation: 'integrate-project',
        ownership: 'project-integration',
        dependsOn: [...referenceIds].sort(compareCodePoints),
        sourceDependencies: [],
        destination: inside(target.root, resource.output.document),
        presetVersion: `${preset.id}:${preset.version}`,
        integration: {
          adapter: 'html-head',
          stateKey: `${resourceId}-html-head`,
          elements,
        },
      });
    }

    if (resource.staticWebApp !== undefined) {
      const routes = resource.staticWebApp.integrateCacheHeaders
        ? [
            {
              route: `/${path
                .relative(publicDirectory, outputDirectory)
                .split(path.sep)
                .join('/')}/*`,
              headers: {
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            },
            {
              route: '/manifest.json',
              headers: { 'Cache-Control': 'no-cache' },
            },
            {
              route: '/manifest*',
              headers: {
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            },
            {
              route: '/favicon.ico',
              headers: { 'Cache-Control': 'no-cache' },
            },
          ]
        : [];
      artifacts.push({
        id: `${resourceId}:${target.id}:static-web-app-integration`,
        resourceId,
        resourceType: 'web-app-branding',
        target: target.id,
        operation: 'integrate-project',
        ownership: 'project-integration',
        dependsOn: [],
        sourceDependencies: [],
        destination: inside(target.root, resource.staticWebApp.path),
        presetVersion: `${preset.id}:${preset.version}`,
        integration: {
          adapter: 'static-web-app-config',
          stateKey: `${resourceId}-static-web-app`,
          routes,
        },
      });
    }

    return artifacts;
  }
}
