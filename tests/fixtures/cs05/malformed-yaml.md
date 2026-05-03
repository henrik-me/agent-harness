# Test Learnings

## Open

### LRN-001

```yaml
id: LRN-001
date: 2024-01-01
category: tooling
source_cs: CS01
status: open
tags: [test]
```

**Problem:** Valid entry.

**Finding:** This entry parses fine.

## Applied

### LRN-002

```yaml
id: LRN-002
date: 2024-01-01
category: tooling
source_cs: CS01
status: applied
tags: [test, "unclosed
```

**Problem:** Malformed YAML — unclosed string in tags array.

**Disposition:** Should trigger parse error, not silently skip.
