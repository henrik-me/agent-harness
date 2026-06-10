# Test Learnings

## Applied

### LRN-001

```yaml
id: LRN-001
date: 2022-01-01
category: tooling
source_cs: CS01
status: applied
tags: [test]
```

**Disposition:** Applied — fine. But note that this body text mentions another
header-shaped line in prose below — the strict adjacency rule must NOT let it
masquerade as the next entry's header.

### LRN-002

This sub-heading-shaped line lives inside LRN-001's body as illustrative prose
about LRN-002 cross-references. Several paragraphs of unrelated prose follow.

The next entry's frontmatter block (id: LRN-002) is intentionally NOT preceded
by its own `### LRN-002` H3 — only by paragraphs of prose. The linter must
treat the entry as headerless (the immediately-preceding nonblank line is
prose, not an H3) and emit a missing-header error.

```yaml
id: LRN-002
date: 2022-01-02
category: tooling
source_cs: CS01
status: applied
tags: [test]
```

**Disposition:** Applied — LRN-002 lacks its own header above the fence; the
strict adjacency rule must catch this even though an `### LRN-002` heading
appears earlier inside LRN-001's body.
