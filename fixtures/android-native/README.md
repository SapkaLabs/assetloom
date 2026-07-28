# Android native fixture

Generate resources from this directory, then compile them with Gradle:

```sh
node ../../packages/assetloom/lib/cli.js generate -c assetloom.json
./gradlew :app:processDebugResources
```
