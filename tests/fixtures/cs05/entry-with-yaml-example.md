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

**Problem:** Entry body contains a non-entry YAML example block.

**Finding:** The parser must not mistake the inner yaml fence for the next entry boundary.

```yaml
example_key: example_value
nested:
  foo: bar
```

**Disposition:** Applied — non-entry YAML blocks inside body must not truncate bodyAfter.

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

**Problem:** Second entry after the one with embedded YAML.

**Finding:** Should parse normally.
