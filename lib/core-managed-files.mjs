/**
 * Core (required) managed-doc set — CS64b (decision C64b-7).
 *
 * The governance / onboarding files every consumer MUST receive. These are the
 * pure-doc managed files; managed *workflows* and `.github/CODEOWNERS` keep
 * their existing per-feature install path (plus the C64b-3 optional adoption
 * flow). Recorded here ONCE as the single source of truth consumed by:
 *   - `init` (fresh-install delivery — copy each into the consumer tree and
 *     add it to `managed.files`),
 *   - the C64b-8 required-managed-file sync WARN gate, and
 *   - their tests,
 * so the list cannot drift across those surfaces (the LRN-039 field-guessing
 * failure class).
 *
 * Each entry is a consumer-root-relative target path that also exists as a
 * template under `template/managed/<path>`. The list excludes managed
 * workflows, `.github/CODEOWNERS`, and sentinels such as `.gitkeep`.
 *
 * Root cause this closes: before CS64b the seeded `harness.config.json`
 * declared no `managed` block and `init` appended only workflow YAMLs to
 * `managed.files`, so these governance docs reached no consumer (e.g.
 * `sub-invaders` had none) — and `.github/copilot-instructions.md` is the file
 * GitHub auto-loads as repo custom instructions.
 *
 * @type {ReadonlyArray<string>}
 */
export const CORE_MANAGED_FILES = Object.freeze([
  'INSTRUCTIONS.md',
  '.github/copilot-instructions.md',
  'TRACKING.md',
  'RETROSPECTIVES.md',
  'READMEGUIDE.md',
]);
