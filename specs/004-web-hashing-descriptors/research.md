# Research: Web Content Hashing and Usage Descriptors

## Final public content identity

**Decision**: Compute the full SHA-256 digest from materialized final bytes before resolving the filename or public path. Use the leading configured hexadecimal characters as the exact browser token.

**Rationale**: Final bytes incorporate source content, transformations, format settings, and encoder behavior. The same bytes are interchangeable browser content regardless of source or destination.

**Alternatives considered**:

- Destination-path hashing was rejected because moving identical content would change identity while byte changes at the same path would not.
- Source-only hashing was rejected because transformations and encoders can change output without changing the source.
- A separate short hash algorithm was rejected because the token should be a transparent prefix of the returned full digest.

## Policy representation

**Decision**: Make the web naming policy optional with `none`, `filename`, and `query`; use `none` when absent. Retain the existing `naming` configuration location for minimal structural migration and rename only its values.

**Rationale**: The three values communicate externally visible cache behavior directly. An optional policy supplies a real compatibility default rather than requiring callers to spell it out.

**Alternatives considered**:

- Keeping `stable`/`content-hash` aliases was rejected because it leaves two public vocabularies and does not express query behavior cleanly.
- Adding a second independent cache configuration was rejected because two overlapping selectors could contradict each other.

## Query publication

**Decision**: Represent query cache busting as a stable destination with publication metadata containing the token length. The resource-neutral resolver appends `v=<digest-prefix>` only to the resolved public path.

**Rationale**: Query policy changes browser identity but not file ownership identity. Keeping the filesystem destination stable preserves collision and cleanup semantics.

**Alternatives considered**:

- Baking the query into artifact destinations was rejected because URLs are not filesystem paths.
- Post-processing descriptors was rejected because manifests and all output references must see one authoritative resolved public path.

## Render fingerprint contents

**Decision**: Hash a canonical record containing renderer compatibility and fingerprint revision, output format/quality, preset version, a path-free effective recipe, and ordered hashes of resolved input bytes. Replace every source/artifact/inline input reference in the recipe with its deterministic input position.

**Rationale**: Sharp receives bytes plus transformation/encoding choices. Input provenance, absolute path, destination, public URL, and unrelated normalized configuration cannot affect the renderer result and therefore must not fragment its cache.

**Alternatives considered**:

- Hashing the normalized project configuration was rejected because unrelated resources, targets, and destinations invalidate reusable renders.
- Hashing source paths was rejected because equivalent bytes at different paths produce the same render.
- Hashing only input bytes was rejected because recipes, formats, quality, compatibility, and algorithms also affect output.

## Ownership-aware hash rotation

**Decision**: Continue treating the ownership manifest as the only authority for stale removal. A changed filename-token output enters the complete new catalog; the publisher preflights it and removes the absent predecessor only if it was manifest-owned.

**Rationale**: Existing generation lifecycle already compares current planned ownership against prior owned state and reports removals. This safely handles every changing hash path without filename-pattern deletion.

**Alternatives considered**:

- Glob-deleting matching hash filenames was rejected because it can delete caller-owned files.
- Retaining every predecessor was rejected because immutable naming would accumulate stale owned output indefinitely.

## Descriptor resolution

**Decision**: Keep planned web descriptors as typed artifact-output references and resolve them after final publication paths are known.

**Rationale**: The same descriptor plan automatically reflects `none`, `filename`, and `query` without HTML inspection or duplicated URL logic.

**Alternatives considered**:

- Generating HTML snippets was rejected because structured data is safer and framework-neutral.
- Mutating HTML or framework files was rejected by the product boundary and ownership model.
