# si-pr28 fixture

Captured 2026-05-13 from `henrik-me/sub-invaders#28`. This fixture is the canonical reference for the v0.4.0 #145 enforcement-gap retroactive proof: the same PR that originally surfaced the gaps that motivated CS35→CS38a.

## Contents

| File | What |
|---|---|
| `repo.bundle` | `git bundle` containing the commits `e5e5b73a..ec26adf1` (base..head) plus all reachable parents. Use `git clone repo.bundle <tmpdir>` then check out `head-ref`. ~316 KB. |
| `pr.json` | `gh pr view 28 --json number,baseRefOid,headRefOid,body,labels,author,headRepository,baseRefName` payload. |
| `body.md` | Verbatim PR body markdown (8.9 KB). |
| `expected-evidence.json` | Canonical expected output of `harness pr-evidence --json` against `body.md` + the bundle clone. Used as the assertion target by `tests/retro-si-pr28.test.mjs`. |

## Provenance commands (verbatim)

```bash
gh repo clone henrik-me/sub-invaders /tmp/si-retro
cd /tmp/si-retro
gh pr view 28 --repo henrik-me/sub-invaders \
  --json number,baseRefOid,headRefOid,body,labels,author,headRepository,baseRefName \
  > pr.json
gh pr view 28 --repo henrik-me/sub-invaders --json body -q .body > body.md
git fetch origin pull/28/head:pr-28
git fetch origin e5e5b73a28cde2864602276e23cc87c7e432db14
git branch base-ref e5e5b73a28cde2864602276e23cc87c7e432db14
git branch head-ref ec26adf1386370037ec8b49607a5e47a92f8366a
git bundle create repo.bundle base-ref head-ref
node /path/to/agent-harness/bin/harness.mjs pr-evidence \
  --base e5e5b73a28cde2864602276e23cc87c7e432db14 \
  --head ec26adf1386370037ec8b49607a5e47a92f8366a \
  --pr-body body.md --repo henrik-me/sub-invaders --pr 28 --json \
  > expected-evidence.json
```

## Regression-test invariants (per LRN-094 + LRN-111)

1. The test (`tests/retro-si-pr28.test.mjs`) MUST clone `repo.bundle` into `os.tmpdir()` — never inside REPO_ROOT (LRN-094). `check-text-encoding`'s recursive walk under parallel `node --test` will race-ENOENT otherwise.
2. The test MUST set its working directory to the temp clone before invoking `bin/harness.mjs pr-evidence`, so the B1 commit-trailers gate reads real commit objects.
3. Per **C38b-5 (PASS branch)** + **LRN-111**: the test asserts ≥4 distinct gate failures. The shipped expected-evidence.json shows 3 gates fail (B1, A3+A4 aggregate, A5+A16 aggregate) — but the A3+A4 gate aggregates two distinct doctrine failures (A3 review-log column shape + A4 stale-head) and the A5+A16 gate aggregates two more (A5 ordering + A16 stale Copilot review). The fine-grained assertion verifies the human-readable transcript contains:
   - B1 commit-trailers: ≥1 commit missing `Co-authored-by: Copilot` trailer
   - A3 review-evidence: `## Review log` table missing required column(s)
   - A3 model-audit: `## Model audit` not key-value `| Field | Value |` shape
   - A4/A16 stale: latest copilot review on stale commit vs PR HEAD
   That maps to ≥4 distinct gate failures per #145 Phase 1 acceptance criterion.
4. Per **LRN-111**: each failing gate's assertion in the test MUST cite the C38b Decision ID + REVIEWS.md section that defines the requirement, so the test would fail loudly if a future change silently relaxed any one Decision.
