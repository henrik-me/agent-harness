# CS11 reviewer checklist

> Attach this checklist to the CS11 content PR description (or link to it).
> Reviewers tick each item. The PR is NOT mergeable until every gate passes.

## Mandatory cs-plan gates (per harness-cs-plan.md § CS11)

- [ ] **Managed files match templates byte-for-byte (after templating)**.
      For each file in `harness.config.json` `managed.files`: read the
      template, apply `applyTemplating(content, config.templating)` lenient
      mode, byte-compare against root file. Any mismatch is a blocker.
- [ ] **Composed managed sections match templates; local-block markers
      preserved (or empty for first sync)**. For each file in `composed.files`:
      parse via `lib/composed.mjs parseComposed()` and verify the marker
      structure equals the template's marker structure. Local block contents
      may be the template's placeholder text (first sync) or empty.
- [ ] **Seeded files preserved**. `git diff main..HEAD -- CONTEXT.md
      ARCHITECTURE.md LEARNINGS.md WORKBOARD.md` shows zero content diff
      (only the close-out updates).
- [ ] **Project-owned files excluded**. `git diff main..HEAD -- README.md
      LICENSE package.json package-lock.json .gitignore .editorconfig
      HANDOFF.md` shows zero diff.

## CS11-specific gates

- [ ] **D7 manual-write strategy**: `harness sync --mode=apply` was NOT
      invoked at any point during Stage B (would block on composed planning).
      All 10 root files were written via the manual render-and-write
      one-shot script. Verify by inspecting the Stage B commits.
- [ ] **D8 self-application**: every CS11 sub-agent dispatch in Stage 0 / A
      pasted the canonical preamble verbatim. (Reviewers spot-check the
      orchestrator's session log.)
- [ ] **D9 lenient templating**: A.3 placeholder-audit.md classifies all
      remaining `{{...}}` tokens as resolved / intentional-literal /
      out-of-scope. No unclassified tokens.
- [ ] **A.3 artifacts present and reviewed**:
      `sync-probe-report.md` (expected-nonzero composed failure documented),
      `render-preview.md` (per-file diff between current root and rendered
      template), `placeholder-audit.md` (token classification table).

## Stage B verification

- [ ] `node bin/harness.mjs sync --check --cwd .` exits 0 (idempotency
      gate — proves the engine sees zero drift between templates and root
      after the manual write).
- [ ] `node bin/harness.mjs lint --quiet` exits 0.
- [ ] `node --test tests/*.test.mjs` exits 0 (≥432 + 4 new = 436+).
- [ ] `node scripts/validate-schemas.mjs` exits 0.
- [ ] `.harness-lock.json` exists at root and validates against
      `schemas/harness-lock.schema.json`.

## CI gate

- [ ] `harness-self-check.yml` activated in B.4 with full drift gate
      (`harness lint --quiet` + `sync --check`); the TODO block removed.
- [ ] CI runs green on the content PR.

## Plan-vs-implementation review (CS03b gate)

- [ ] GPT-5.5 rubber-duck review verdict captured in the active CS file's
      `## Plan-vs-implementation review` section with `Reviewer:`, `Date:`,
      `Outcome: GO`. NEEDS-FIX outcome blocks merge.

## Process discipline

- [ ] Sub-agent SHA discipline: `git log <claim-merge-sha>..cs11/content`
      shows only orchestrator commits (no rogue sub-agent commits).
- [ ] No `TODO(CS11)` markers remain in the diff.
