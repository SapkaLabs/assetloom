# ADR 0003: Content ownership and atomic publication

Status: accepted.

Assetloom records every generated file, SHA-256 hash, task ID, and target in
`.assetloom/manifest.json`. It never claims a project file changed by an
integration task.

Writes use a temporary file in the destination directory followed by rename.
Equal bytes cause no write. New output refuses to overwrite different unowned
content. Cleanup performs a complete hash preflight before removing anything
and refuses changed files.

The repository-local Git exclude file is managed inside marker lines. Content
outside those markers remains byte-for-byte intact.
