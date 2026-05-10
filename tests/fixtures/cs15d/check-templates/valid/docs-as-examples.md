# OPERATIONS

The placeholder `{{project.agent_suffix}}` shown above is an intentional
example of what NOT to do. Use the flat key `{{agent_suffix}}` instead.

```
{{project.dotted.example}}
{{also.dotted}}
```

<!-- This HTML comment also references {{project.dotted}} and ../foo.md;
     neither should trigger the linter because comments are doc, not template. -->
