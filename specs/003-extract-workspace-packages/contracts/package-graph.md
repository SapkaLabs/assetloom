# Package Graph Contract

```text
@sapkalabs/assetloom-core
          ↑
@sapkalabs/assetloom-images
       ↗       ↖
native           web
       ↖       ↗
 @sapkalabs/assetloom (facade + CLI)
```

Native and web also declare direct core dependencies. Every cross-workspace import resolves through a manifest export. Core contains no image/native/web/CLI import or dependency.
