# 0002 — Root README is project-owned, not synced

**Status:** Accepted

## Context

The harness repo serves two distinct README audiences:

1. **Harness documentation** — The root `README.md` in `agent-harness` explains the harness *as a reusable package and repository*: what it does, how to use it, repo layout, license, etc. This is project documentation.

2. **Consumer onboarding** — The `template/seeded/README.md` is a skeleton README that `harness init` delivers to *consumer projects* (Sub Invaders, guesswhatisnext, or any future adopter). It's a starting template for consumer projects to fill in.

**The problem:** Both files have the same target filename (`README.md`). Without explicit ownership rules, a future self-hosting scenario (CS11+, when the harness repo runs `harness sync` against itself) would face two unacceptable outcomes:

- **Outcome A** (sync overwrites): `harness sync` would treat the harness's own README as a managed file and overwrite it with the consumer skeleton — corrupting the harness repo's own documentation.
- **Outcome B** (sync skips seeded files): `harness sync` would skip `template/seeded/README.md` because it's in the seeded class (per [ADR 0001](0001-file-classes.md)), giving false confidence that the consumer skeleton is in sync when it's actually untouched.

Neither option is acceptable. The seeded README must be exercised and verified to work for consumers, while the harness repo's own README must be protected.

## Decision

**Root `README.md` in the `agent-harness` repo is project-owned.** It is explicitly excluded from `harness sync` via the `excluded` list in `harness.config.json`, conforming to the lock-file schema (`harness-lock.schema.json`).

**All project-owned files** in the harness repo:

- `README.md` (project documentation)
- `LICENSE` (MIT license)
- `package.json` (npm metadata)
- `.gitignore` (repo-specific version control rules)
- `.editorconfig` (repo-specific editor settings)

These five files are **never touched by `harness sync`**. They remain the harness project's responsibility to maintain and are excluded at the point of initial sync into the harness repo itself (CS11+) and explicitly listed in the harness's own `harness.config.json` so they are skipped on every subsequent sync run.

**Consumer README delivery:** The skeleton for consumers is `template/seeded/README.md`. On `harness init` in a consumer repo, the sync engine checks for a `README.md` in the consumer. If missing, it copies `template/seeded/README.md` into the consumer as `README.md`. This is never overwritten on subsequent `harness sync` runs in the consumer (per the seeded class semantics in [ADR 0001](0001-file-classes.md)).

## Consequences

**Benefits:**
- **Clear ownership** — No ambiguity. The harness repo's README documents the harness; consumers get a skeleton to customize.
- **Self-hosting safety** — CS11+ can run `harness sync` on the harness repo itself without risk of self-inflicted README corruption.
- **Consumer autonomy** — Consumers can edit their README without fear of `harness sync` overwriting it (seeded file semantics).
- **Verification path** — CS09 proves the seeded README delivery works even though the harness's own README is excluded.

**Costs:**
- `harness.config.json` in the harness repo (and any consumer that adopts the harness) must maintain an `excluded` list with at least these five files. If that list drifts, the exclusions will be lost on next sync.
- Consumers who adopt the harness must understand that their `README.md` will be seeded once (created if missing) but never synced thereafter. Changes to the harness's `template/seeded/README.md` do not propagate to existing consumers.

## Alternatives Considered

**A. Different filename for consumer skeleton** (e.g., `README.consumer.md`)
- *Rejected:* Consumers expect a `README.md` at the root of their repo. Requiring a rename step on every `harness init` adds friction and is error-prone. Standard practice across GitHub is to use `README.md`.

**B. Templating placeholder — single README with substitutions**
- *Rejected:* The two READMEs serve genuinely different purposes. The harness README is technical documentation for package consumers. The consumer skeleton is a project-specific starting point. Merging them via templating (substituting project name, description, etc.) adds complexity, requires a templating pass on every sync, and couples harness-level docs to consumer-level docs in a fragile way. Keeping them separate is clearer.

**C. Move consumer skeleton out of the harness repo**
- *Rejected:* Defeats one-stop distribution. Consumers should be able to run `npx github:henrik-me/agent-harness init` and get everything they need in one fetch. Pointing to an external skeleton URL would add a network dependency and make the harness less self-contained.

## Verification Mechanism

**CS09 (harness init implementation)** includes a fixture test:

1. Create an empty fixture directory.
2. Run `harness init` (with the harness repo pinned as the source template).
3. Assert that `README.md` exists in the fixture directory.
4. Assert that its contents match `template/seeded/README.md`.

This test proves the seeded README path is exercised and correctly delivered to consumers, even though the harness's own root README is excluded from sync. The test acts as a regression gate for this decision.

## Related ADRs

- **[ADR 0001](0001-file-classes.md)** — Defines the three file classes (managed, composed, seeded) that underpin this decision.
