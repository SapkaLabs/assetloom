# ADR 0002: Ordered configuration merge with provenance

Status: accepted.

Configuration files are applied in command-line order. Objects merge
recursively, arrays replace, scalars replace, and `null` deletes the inherited
property. Provenance maps each surviving JSON pointer to its last writer.

Validation happens after merge so a small runtime or brand file can override a
base document without being independently complete. Diagnostics use provenance
to identify the contributing file.
