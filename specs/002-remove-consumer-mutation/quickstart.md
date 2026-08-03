# Quickstart: Validate Consumer-Mutation Removal

## Focused checks

```sh
yarn workspace @sapkalabs/assetloom test --run tests/consumer-boundary.test.ts tests/usage-descriptors.test.ts tests/catalog-branding.test.ts tests/generation.test.ts
yarn workspace @sapkalabs/assetloom typecheck
yarn workspace @sapkalabs/assetloom lint
```

Expected:

- every consumer/repository sentinel remains byte-identical;
- web/native plans contain only complete generated operations;
- complete web manifest collisions follow ordinary ownership rules;
- typed descriptors reference returned artifacts and contain no consumer destination;
- legacy mutation configuration fails stably;
- runtime APIs compile without adapters, receipts, gateways, or Git ignore management.

## Forbidden capability search

Search current runtime/public files for mutation names and inspect every result:

```sh
rg -n "integrate-project|update-project|ProjectIntegration|IntegrationReceipt|ProjectFileGateway|GitIgnoreManager|html-head-adapter|web-manifest-adapter|static-web-app-config-adapter" packages/assetloom/src packages/assetloom/schema packages/assetloom/package.json
```

Expected: zero matches. Historical ADR/migration documents and sentinel test strings are excluded.

## Migration notes

- Remove native `manifestPath` and `projectFile` options. Consume each returned
  `native.resource` descriptor and make the documented manifest, theme, plist,
  or Xcode change in the application repository yourself.
- Remove web `output.document`. Consume `web.html-link` and
  `web.head-metadata` descriptors in caller-owned HTML or framework code.
- Replace the former static web application destination with
  `staticHost.includeCacheGuidance`; apply returned route/header data in the
  caller's host configuration.
- A legacy `.assetloom/integration-receipts.json` file is inert. AssetLoom does
  not load or use it. After confirming that the application no longer relies
  on an older AssetLoom release, the application owner may archive or delete it
  manually.

No compatibility flag, adapter, callback, or plugin restores the removed
behavior.

## Full regression

```sh
yarn build
yarn lint
yarn typecheck
yarn test
yarn pack:smoke
```
