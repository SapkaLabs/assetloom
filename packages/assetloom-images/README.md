# `@sapkalabs/assetloom-images`

Generic image recipes, formats, dimensions, inspection, renderer compatibility,
encoders, and Sharp-backed behavior. It depends only on
`@sapkalabs/assetloom-core`; core remains image-neutral.

```js
import {
  imageRendererCompatibilityVersion,
  inspectImage,
} from '@sapkalabs/assetloom-images';
```

Internal materialization identity is derived from input bytes, the complete
effective recipe and encoding options, and renderer/algorithm compatibility
versions. It excludes destinations, public URLs, unrelated configuration,
timestamps, and machine-specific paths, so moving an output does not force a
render.

This package exports image behavior only. Target layouts live in native/web,
publication lives in core/facade composition, and CLI commands live in the
facade.
