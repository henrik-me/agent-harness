# Test Learnings

## Applied

### LRN-001 — descriptive trailing text breaks canonical form

```yaml
id: LRN-001
date: 2022-01-01
category: tooling
source_cs: CS01
status: applied
tags: [test]
```

**Disposition:** Applied — but the H3 header above this entry has trailing
descriptive text after the `LRN-NNN` token, which breaks the canonical
`LEARNINGS.md#lrn-NNN` anchor that other tooling resolves by exact heading
text. The linter must treat this as a missing-header case (Copilot R1 F2 /
F3 per CS69 close-out).
