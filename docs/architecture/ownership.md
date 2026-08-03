# Architecture ownership

Repository work follows the focused workspace boundaries:

- Core owns resource-neutral contracts, configuration composition,
  orchestration, output-root validation, hashing, cache/state, ownership,
  bounded publication, recovery, diagnostics, and versioned results.
- Images owns generic image inspection/transformation, Sharp, encoders,
  recipes, dimensions, formats, and renderer compatibility.
- Native owns Android/iOS/React Native presets, validators, semantic roles,
  complete resource layouts, and typed manual-setup descriptors.
- Web owns web presets, favicon/social/PWA variants, public-path resolution,
  final-byte cache policies, and typed web descriptors.
- The facade owns default composition, compatibility APIs that remain valid,
  every Commander command, human output, JSON output, and the executable.
- Demo and fixture owners prove caller-managed setup and platform compilation
  without granting AssetLoom mutation authority.
- Quality owns architecture tests, write-boundary sentinels, package packing,
  clean-consumer tests, determinism, and platform verification.

Public contract or boundary changes require an architecture decision record.
Packages may import only another package's declared public exports. No
workstream may add a consumer-project writer or a generic escape hatch around
the bounded publisher.
