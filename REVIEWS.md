# REVIEWS (proto, CS01)

The review loop. Hand-maintained until CS11. Canonical version authored in CS08 as `template/composed/REVIEWS.md`.

## Local review (mandatory pre-PR)

**Primary:** GPT-5.5 rubber-duck (via the rubber-duck agent).

**Fallback (per [Decision #22](project/clickstops/active/active_cs01_bootstrap-repo/harness-cs-plan.md)):** if GPT-5.5 is unavailable >30 minutes or after 2 failed attempts, fall back to Claude Sonnet 4.6 rubber-duck — **but only if** Sonnet 4.6 was not used to materially implement the CS being reviewed (independence invariant). If Sonnet 4.6 contributed non-trivial implementation work, escalate to: GPT-5.5 (retry) or explicit user waiver.

**High-risk CSs** (CS03 sync engine, CS11 self-host, CS15a/b public-flip, CS18b PILOT-A, CS19 migration): GPT-5.5 OR explicit user waiver only — no Sonnet fallback regardless of independence.

The PR body records: model used, timestamp, fallback reason if any, and the model list of CS implementers (so future review-of-review can audit independence).

## PR review

**Private phase (CS01–CS15a):** GPT-5.5 + user review. Copilot review optional.

**Public phase (CS15b+):** GPT-5.5 + Copilot review + user review on CODEOWNERS-protected paths.

## Thread resolution

All review threads must be resolved before merge. Squash-merge only; never merge with unresolved suggestions.

## What to review

For implementation CSs: correctness, edge cases, sync invariants (especially composed-class fail-closed), schema compatibility, test coverage.

For template CSs (CS08–CS10): linter pass, cross-link integrity, schema conformance, no project-specific leakage into managed templates.

For migration CSs (CS19): parity manifest, freshness calendar, migration-base SHA, soft-freeze status, rollback path.
