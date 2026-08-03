# Research: Publish-and-Describe Foundation

## Decision: Register explicit output roots before resolving artifacts

Each selected target contributes one or more stable root IDs and absolute internal root paths.
Artifact plans carry a root ID plus normalized relative path; resolution to an absolute path happens
inside bounded publication. Existing absolute destinations may be adapted at the planner boundary by
proving containment and deriving the relative form.

**Rationale**: A project-root-only check is too broad and cannot express multiple allowed publication
areas. Stable root IDs give results a portable path identity.

**Alternatives considered**: Treat the project root as the only boundary (too permissive); retain only
absolute destinations (machine-specific and hard to audit).

## Decision: Separate preparation from publication

Materialization, final-byte hashing, path resolution, ownership inspection, duplicate/case collision
checks, and the intended manifest/recovery fingerprint complete before the pending intent begins and
before any artifact publication. Publication then uses the immutable prepared set.

**Rationale**: Predictable failures must occur before writes, while durable intent is necessary for
unexpected failures after writes start.

**Alternatives considered**: Validate each file immediately before writing (can leave avoidable
partial state); stage a clean-room transactional filesystem (unnecessary complexity and not portable).

## Decision: Capture disposition at the whole-file publisher

The publisher compares planned final bytes with a manifest-owned destination and returns `created`,
`updated`, or `unchanged`; stale removal returns a separate record. The result builder combines those
records with every prepared current artifact, so unchanged files are never omitted.

**Rationale**: Only the publisher has authoritative ownership and byte-comparison evidence.

**Alternatives considered**: Infer disposition from the old `written` list (cannot distinguish create
from update and can omit current outputs); re-stat after publishing (racy and duplicates work).

## Decision: Hash final bytes once and carry the digest through publication

Prepared output records contain the full SHA-256 and byte size computed from materialized content.
The exact configured token is derived from this digest. The manifest and public artifact record share
that digest.

**Rationale**: Final bytes are the only complete content identity. Reusing one computation prevents
contract/storage disagreement.

**Alternatives considered**: Destination hash (not content); source hash (ignores transforms and
encoder changes); manifest re-read after write (unnecessary I/O).

## Decision: Sort all deterministic collections by Unicode code-point comparison

Targets, artifacts, removed records, descriptors, and diagnostics use explicit stable keys and the
repository's code-point comparator. Portable relative paths always use `/` separators.

**Rationale**: Locale and filesystem enumeration differ across machines.

**Alternatives considered**: Native `localeCompare` (locale-dependent); preserve discovery order
(filesystem-dependent).

## Decision: Use a JSON-safe usage envelope with typed extension payloads

Core defines `kind`, `version`, `targetId`, sorted artifact IDs, and a recursive JSON value payload.
Resource packages later narrow the payload with exported discriminated interfaces.

**Rationale**: Core stays resource-neutral while callers retain compile-time descriptor types.

**Alternatives considered**: `unknown` payload (not safely serializable); a union of web/native kinds
in core (violates resource neutrality).

## Decision: Preserve legacy results through explicit mapping only

The new versioned operation is authoritative. Existing non-conflicting facades may map current
artifact dispositions to legacy written/unchanged path arrays until feature 5 completes compatibility
decisions; the portable result itself never includes absolute paths.

**Rationale**: Incremental extraction protects supported workflows without contaminating the new
contract.

**Alternatives considered**: Immediate deletion of every legacy shape (unnecessary break before the
CLI migration); embedding legacy arrays in V1 (permanent duplicate semantics).
