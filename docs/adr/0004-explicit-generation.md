# ADR 0004: Explicit generation before native compilation

Status: accepted.

Generation runs as a package script and an explicit CI step before Gradle or
Xcode. Version 1 does not add native build phases or Gradle tasks that invoke
Assetloom.

This makes cache ownership, failures, local development, and CI ordering
visible. Optional native build-system adapters can be considered in a later
version without changing the generation plan.
