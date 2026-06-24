# INSTRUCTIONS (malformed marker, fail-closed)

A banned ref sits in the template region: LRN-068 must still be caught.

<!-- harness:local-start id=instructions.harness -->
This local block is never closed, so the parser cannot trust the exclusion.
It also hides CS54 here, which the fail-closed whole-file scan still catches.
