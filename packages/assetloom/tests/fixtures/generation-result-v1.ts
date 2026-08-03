import type {
  GenerationResultV1,
  PublishedArtifactV1,
} from '../../src/domain/generation-result.js';

export const publishedArtifactFixture: PublishedArtifactV1 = {
  artifactId: 'branding:web:favicon-32',
  resourceId: 'branding',
  targetId: 'website',
  role: 'web.favicon',
  outputRootId: 'website',
  relativePath: 'assets/favicon.87bc5d74e6f1.png',
  publicPath: '/assets/favicon.87bc5d74e6f1.png',
  disposition: 'created',
  mediaType: 'image/png',
  width: 32,
  height: 32,
  sizeBytes: 4,
  contentHash: {
    algorithm: 'sha256',
    value: '87bc5d74e6f1a42ee84d3bb5040d4f36b7e0f6f7aa037441836d2eeec5a83a8e',
    token: '87bc5d74e6f1',
  },
};

export const generationResultFixture: GenerationResultV1 = {
  resultVersion: 1,
  targets: ['website'],
  artifacts: [publishedArtifactFixture],
  removed: [],
  usage: [
    {
      kind: 'web.html-link',
      version: 1,
      targetId: 'website',
      artifactIds: ['branding:web:favicon-32'],
      payload: {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/assets/favicon.87bc5d74e6f1.png',
      },
    },
  ],
  diagnostics: [],
};
