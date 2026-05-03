# CS04c — `harness pack` whitelist verification

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS04 close-out (GPT-5.5 R1 non-blocking #3: "`harness pack` runs `npm pack --dry-run` but does not assert the file list against an expected whitelist — drift goes undetected").
**Depends on:** CS04

## Goal

Extend `harness pack` to parse the JSON output of `npm pack --dry-run --json` and assert the file list matches a declared expected whitelist. Any file present in the tarball that is NOT on the whitelist (or vice versa) causes a non-zero exit, preventing accidental over- or under-publishing.

## Background

CS04's `harness pack` runs `npm pack --dry-run` for a basic sanity check, but does not programmatically verify the file list. Silent drift (e.g. a new `*.log` file or test fixture accidentally included, or a production file accidentally excluded) would pass unnoticed. The whitelist gives a concrete, reviewable declaration of what the package should contain.

## Deliverables

- [ ] Parse `npm pack --dry-run --json` output (array of tarball descriptors; use `files[]` from the first entry).
- [ ] Compare the actual file list against an expected whitelist derived from:
  - `package.json#files` array (the explicit inclusion list)
  - Standard auto-included files: `package.json`, `README.md`, `LICENSE` (npm always includes these regardless of `files`)
- [ ] On drift (extra or missing files vs. whitelist), print a clear diff-style report and exit non-zero.
- [ ] On match, print the file count + total bytes and exit 0.
- [ ] Add `--strict` flag: when passed, also reject any file matching `*.test.mjs`, `*.test.js`, `fixtures/**`, `tests/**` even if listed in `package.json#files` (belt-and-suspenders for accidental test inclusion).

## Exit criteria

- `harness pack` against the current repo passes with a clean whitelist match.
- Temporarily adding a `.log` file to `package.json#files` causes `harness pack` to report it as unexpected and exit non-zero.
- Temporarily removing a production file from `package.json#files` causes `harness pack` to report it as missing and exit non-zero.
- All existing 224+ tests still pass.
- At least 5 new CLI tests for pack whitelist scenarios.

## Sub-agent fan-out

Single sub-agent (owns `bin/harness.mjs` pack subcommand + `tests/cli.test.mjs` pack tests). Briefing MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- [LRN-029](../../../LEARNINGS.md#lrn-029) inline: Windows `spawnSync` requires `shell: true` for npm invocations

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
