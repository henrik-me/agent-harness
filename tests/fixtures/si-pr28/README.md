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
  --pr-body body.md --json \
  > expected-evidence.json
```

> **Network discipline:** the offline regression test deliberately runs `harness pr-evidence` *without* `--repo`/`--pr` so the A5+A16 copilot-review gate (which requires `gh api graphql` + auth) is not invoked. The A5/A16 doctrine is proven separately by `tests/check-copilot-review.test.mjs` and CS37's spike. To reproduce the *full* per-gate transcript (including A5+A16), see `docs/cs38b-retro-pr28-transcript.md` — that capture used `--repo`/`--pr` and required interactive gh auth.

## Regression-test invariants (per LRN-094 + LRN-111)

1. The test (`tests/retro-si-pr28.test.mjs`) MUST clone `repo.bundle` into `os.tmpdir()` — never inside REPO_ROOT (LRN-094). `check-text-encoding`'s recursive walk under parallel `node --test` will race-ENOENT otherwise.
2. The test MUST set its working directory to the temp clone before invoking `bin/harness.mjs pr-evidence`, so the B1 commit-trailers gate reads real commit objects.
3. Per **C38b-5 (degradation-aware)** + **LRN-111**: the test reads `harness.config.json.review_gates.gate_set` to derive the required-findings threshold (≥4 if A5+A16 are in the set; ≥3 otherwise). The shipped `expected-evidence.json` reflects the offline run shape (2 gates: B1 + A3+A4) — but each aggregate gate emits multiple distinct doctrine findings. PR #28 produces:
   - B1: 4 commits missing `Co-authored-by: Copilot` trailer (4 distinct findings)
   - A3+A4: `## Review log` column shape + `## Model audit` key-value shape (2 distinct findings)
   Total = 6 distinct findings, ≥4 PASS-branch threshold satisfied. (The A5/A16 stale-Copilot-review doctrine failure is captured in `docs/cs38b-retro-pr28-transcript.md` for completeness but not asserted in the offline test.)
4. Per **LRN-111**: each failing gate's assertion in the test MUST cite the C38b Decision ID + REVIEWS.md section that defines the requirement, so the test would fail loudly if a future change silently relaxed any one Decision.
