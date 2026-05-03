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

**Problem:** First instance of LRN-001.

**Finding:** Duplicate IDs should be an ERROR.

### LRN-001 (duplicate)

```yaml
id: LRN-001
date: 2024-01-02
category: process
source_cs: CS01
status: open
tags: [also-test]
```

**Problem:** Second instance of LRN-001 — this is a duplicate.

**Finding:** Should trigger a duplicate-ID error.
