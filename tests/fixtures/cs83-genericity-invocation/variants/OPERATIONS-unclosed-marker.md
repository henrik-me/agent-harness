# OPERATIONS (composed process base) — unclosed-marker variant

This invocation-only composed base has a deliberately UNCLOSED local-block
marker, used to prove the invocation scan marker-validates OPERATIONS.md /
REVIEWS.md / CONVENTIONS.md (composed bases NOT in the anchor scope) via
scanComposed — surfacing the parse error while the whole-file fallback still
catches an invocation the broken marker would otherwise hide.

## Validation

Run the aggregate check with `{{harness_invoke}} lint`.

<!-- harness:local-start id=operations.harness -->
_(Project-local process notes. This marker is deliberately never closed.)_

Run `node bin/harness.mjs lint` inside the unclosed block.
