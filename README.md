# Assetloom

Assetloom is a deterministic native application-resource generator for Android
and iOS. It turns source artwork and layered JSON configuration into launcher
icons, notification resources, splash-screen resources, and Apple asset
catalogs.

Assetloom supports bare native projects, including bare React Native projects.
Its generation command is run explicitly before native compilation.

## Workspace

- `packages/assetloom` — the ESM package and `assetloom` CLI.
- `apps/demo-react-native` — a bare React Native example with committed Android
  and iOS projects.
- `fixtures` — small native projects used for platform verification.
- `docs` — research, architecture decisions, and implementation status.

## Development

```sh
corepack yarn install
corepack yarn build
corepack yarn lint
corepack yarn typecheck
corepack yarn test
```

Generate and verify the demo:

```sh
corepack yarn workspace assetloom-demo assets:generate
corepack yarn workspace assetloom-demo assets:verify
```

See [`packages/assetloom/README.md`](packages/assetloom/README.md) for the
configuration and CLI reference.
