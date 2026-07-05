# cs86-dispatch fixture marker (legacy-consumer / pre-CS86 OPERATIONS.md WITH preamble)

The legacy OPERATIONS.md fallback is content-validated: resolvePreambleSource
returns it ONLY when it still carries the inline briefing-preamble fence (a
pre-CS86 consumer). This fixture therefore supplies a minimal real preamble; a
thinned/fence-less OPERATIONS.md is NOT a valid fallback (covered by a tmpdir
test), so this file must keep the anchored fence below.

### Mandatory briefing preamble (copy verbatim into every dispatch)

```text
## CRITICAL PREFLIGHT (LRN-021)

Minimal legacy-preamble fixture body — extractPreamble only needs the heading
above plus this anchored text fence to treat OPERATIONS.md as a valid fallback.
```
