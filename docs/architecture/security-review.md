# Security review

Status: reviewed for version 1 implementation.

## Trust boundaries

Configuration and artwork are untrusted project inputs. Planned and generated
bytes are trusted only after validation. Declared output roots and AssetLoom's
dedicated cache, manifest, lock, and recovery state are local mutable state.
Consumer application files and repository metadata are outside the runtime
write boundary.

## Controls

- All configured paths reject empty and NUL-bearing values.
- Sources must resolve within `project.root`; destinations must resolve beneath
  their declared output root or the guarded `.assetloom` state root.
- Existing source paths are canonicalized before the containment check, which
  blocks symlink escapes.
- Directory passthrough rejects symbolic links recursively.
- SVG input rejects scripts, entities, absolute filesystem references, network
  references, and absolute CSS URLs before decoding.
- Sharp's input-pixel limit is 100 million pixels and each render has a
  30-second processing timeout.
- Output dimensions must be positive safe integers and are bounded by schema
  presets.
- The planner checks destinations case-insensitively before rendering.
- A project lock prevents concurrent publication.
- Output uses a same-directory temporary file followed by rename.
- Existing unowned content, and owned content modified after generation, causes
  a write conflict instead of being overwritten.
- Cleanup checks every candidate hash before deleting the first file and never
  follows directory links.
- Cache content is SHA-256 addressed and verified on read.
- The ownership manifest validates versions, hashes, targets, and relative
  paths before use.
- CLI JSON omits stacks unless verbose diagnostics are explicitly requested.
- Generation JSON stdout contains only the versioned result; logs and stable
  JSON failures use stderr.
- Dependency exceptions are retained in `cause` behind a stable public error.
- Consumer HTML, package manifests, native manifests/projects, build files,
  and `.git/info/exclude` are byte-preservation sentinels in boundary tests.

## Residual risks and operating guidance

- Native resource formats evolve with platform tooling. CI must compile
  caller-configured native fixtures on every change to target serializers.
- XML structural checking in the portable verifier is intentionally shallow;
  Gradle/AAPT2 and Xcode/Interface Builder are the authoritative compilers.
- A terminated process can leave a recovery claim. Operators must use the
  guarded inspection/clear API after confirming the recorded process is dead;
  they must not delete state files by hand.
- Source artwork can still be computationally expensive within the pixel and
  timeout bounds. Benchmark regressions should be evaluated on every renderer
  or preset change.
- Project source and configuration should be reviewed like code before a build.
