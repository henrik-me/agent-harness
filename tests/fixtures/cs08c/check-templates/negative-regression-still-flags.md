# Negative regression fixture (CS08c)

This file shows the same forbidden patterns OUTSIDE any code block. The
linter must STILL flag them — this is the negative-regression check that
proves the new context-stripping logic does not over-extend.

Forbidden dot-notation outside a code block: {{project.name}} — must flag.

Forbidden relative-up path outside a code block: ../tools/foo — must flag.
