# Test Learnings

## Applied

### LRN-001

```yaml
id: LRN-001
date: 2024-01-01
category: tooling
source_cs: CS01
status: applied
tags: [test]
```

**Problem:** Entry body contains a non-entry YAML example block whose YAML happens to include an `id:` key (not an LRN id).

**Finding:** The parser must classify entry fences by `id: LRN-<N>` specifically, not any `id:` key, so that bodyAfter spans the full entry body up to the next real entry.

```yaml
id: example
value: 1
nested:
  foo: bar
```

**Disposition:** Applied — entry classification must require the `LRN-` prefix.

## Open

### LRN-002

```yaml
id: LRN-002
date: 2024-01-01
category: tooling
source_cs: CS01
status: open
tags: [test]
```

**Problem:** Second entry after the one with embedded YAML containing `id:`.

**Finding:** Should parse normally.
