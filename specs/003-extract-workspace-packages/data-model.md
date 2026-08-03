# Data Model: Workspace Graph

## PackageNode

Fields: npm name, version, directory, exports, dependencies, dev dependencies, binary. Validation enforces the five expected names, lockstep versions, public root export, and facade-only binary.

## DependencyEdge

Directed `consumer -> provider` edge. Allowed internal edges: images->core, native->core/images, web->core/images, facade->core/images/native/web. A depth-first traversal rejects cycles.

## PublicEntryPoint

An export key with declaration and JavaScript targets contained beneath the package root. Imports by another workspace must use the package name or a declared subpath and never `/src/`.

## Focused public contracts

Core owns portable generation results, diagnostics, JSON safety, artifact planning primitives, and SHA-256. Images owns image recipes/metadata inspection. Native owns platform roles/manual setup descriptors. Web owns public paths/cache policies/web descriptors.
