# Test Learnings

## Applied

### LRN-1

```yaml
id: LRN-001
date: 2022-01-01
category: tooling
source_cs: CS01
status: applied
tags: [test]
```

**Disposition:** Applied — but the H3 header `### LRN-1` drops the leading
zeros that the frontmatter `id: LRN-001` uses, producing a broken
`LEARNINGS.md#lrn-1` anchor instead of `#lrn-001`. The linter must flag
this as a digit-string mismatch (not as a missing-header case) — Copilot
R1 F1 per CS69 close-out.
