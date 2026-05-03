# Parse Error: Marker Inside Fenced Code Block

This template has a marker inside a code fence.

```markdown
<!-- harness:local-start id=code-example -->
This looks like a marker but is inside a fence
<!-- harness:local-end id=code-example -->
```

Should cause a parse error.
