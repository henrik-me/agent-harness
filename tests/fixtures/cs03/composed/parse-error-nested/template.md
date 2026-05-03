# Parse Error: Nested Blocks

This template has nested local blocks.

<!-- harness:local-start id=outer -->
Outer block content.

<!-- harness:local-start id=inner -->
Inner block content.
<!-- harness:local-end id=inner -->

Back in outer.
<!-- harness:local-end id=outer -->