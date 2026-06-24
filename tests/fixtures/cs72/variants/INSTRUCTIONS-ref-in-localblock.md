# INSTRUCTIONS (ref inside local block — must now FAIL)

Generic prose with no banned refs in the template region.

<!-- harness:local-start id=instructions.harness -->
This default local-block body references LRN-068 and CS54 — but the default
body ships verbatim to a fresh consumer on first init, so it is NOT exempt and
MUST be flagged.
<!-- harness:local-end id=instructions.harness -->

More generic prose.
