# ADR 0001: Native targets only

Status: accepted.

Version 1 exposes exactly `android` and `ios`. Platform resource presets and
project integrations live directly under target modules. Future native targets
may add another module and target value through a versioned contract change,
but no unused integration abstraction is introduced now.

This keeps task destinations, verification, diagnostics, and compatibility
claims grounded in platform specifications and native builds.
