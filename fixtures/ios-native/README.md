# iOS native fixture

Generate resources from this directory, then compile on macOS:

```sh
node ../../packages/assetloom/lib/cli.js generate -c assetloom.json
xcodebuild \
  -project AssetloomFixture.xcodeproj \
  -scheme AssetloomFixture \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```
