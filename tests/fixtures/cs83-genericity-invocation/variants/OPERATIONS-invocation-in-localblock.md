# OPERATIONS (invocation hidden in a local-block body — must FAIL)

Generic process prose; no invocation in the template region.

<!-- harness:local-start id=operations.harness -->
This default body says to run node bin/harness.mjs sync to regenerate mirrors —
a consumer-invalid invocation that must be caught even inside a local block.
<!-- harness:local-end id=operations.harness -->
