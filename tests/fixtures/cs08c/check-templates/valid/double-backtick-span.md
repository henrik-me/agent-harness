# Double-backtick span fixture (CS08c)

Inline code that itself contains a single backtick must use a double-backtick
span per CommonMark §6.1. The linter must strip the entire span (not just the
inner single-backtick run) so dot-notation inside the span does not trigger.

Example double-backtick span: ``{{ project.name }}`` — quoted as code.

Example with backtick inside the span: ``alias `x` = {{ project.agent_suffix }}`` — also inert.

Example triple-backtick span on a single line: ```{{ obj.field }}``` — inert.

A regular single-backtick span continues to work: `{{ flat.is_fine_in_span }}`.

After all the spans, real flat placeholders render: {{name}}.
