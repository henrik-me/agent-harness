# Parse Error: Marker Inside Indented Code Block

This template has a marker inside an indented code block.

    <!-- harness:local-start id=indented-example -->
    This looks like a marker but is indented
    <!-- harness:local-end id=indented-example -->

Should cause a parse error.