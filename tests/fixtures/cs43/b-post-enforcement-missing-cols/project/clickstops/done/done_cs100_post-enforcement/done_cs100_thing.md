# CS100 — Post-enforcement nested CS missing agent columns (CS43 fixture b)

**Status:** done
**Closed:** 2026-05-15

The **Closed:** date is AFTER the enforcement date, so the date-gate does not
grandfather this file. The `## Model audit` block intentionally omits the
`Implementer agent` and `Reviewer agent` rows — the linter must WARN under
default flags and ERROR under `--strict-agent-columns`.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7 |
| Reviewer model | gpt-5.5 |
