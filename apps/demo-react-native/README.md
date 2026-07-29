# Assetloom bare React Native demo

This is a bare React Native application: `android/` and `ios/` are committed
native projects. Resource generation is an explicit command before native
compilation.

```sh
yarn assets:plan
yarn assets:generate
yarn assets:report
yarn assets:verify
yarn android
yarn ios
```

`base.assetloom.json` defines both native targets and all resource kinds.
`demo-brand.assetloom.json` is merged second, provides the human-readable report
identity, and overrides brand colors. `assets:generate` also creates the
self-contained report at
`.assetloom/reports/assetloom-demo-brand.html`. Open or copy that single file;
all source and generated artwork is embedded.

For a dynamic white-label build, produce another JSON file at runtime and pass
it last:

```sh
assetloom generate \
  -c config/base.assetloom.json \
  -c config/demo-brand.assetloom.json \
  -c path/to/generated-runtime.assetloom.json
```

`runtime.assetloom.example.json` demonstrates both an adaptive background image
and optional Apple Icon Composer package passthrough. Replace the sample
`.icon` directory with a package exported by Icon Composer before using that
override.

Generated resource paths and `.assetloom/` are ignored explicitly. Assetloom
also maintains the same paths in the repository-local `.git/info/exclude`
block, leaving existing ignore content untouched. A second unchanged
`assets:generate` run reports zero changed files.

CI runs `assets:generate` before Gradle or Xcode; generation is not hidden in a
native build phase.
