/**
 * lib/hooks.mjs — git hook body + installer for the opt-in
 * `prepare-commit-msg` hook (CS100, issue #421).
 *
 * **Zero third-party dependencies (Node builtins only).** Exports:
 *   - {@link PREPARE_COMMIT_MSG_HOOK} — the POSIX-`sh` hook body (a string),
 *     carrying the {@link HOOK_SENTINEL} marker on its second line.
 *   - {@link installPrepareCommitMsgHook} — writes that hook into a repo's
 *     active git hooks directory, applying the CS100 Decision-5 safety rules
 *     (no-op over our own sentinel hook; refuse a foreign hook unless
 *     `force`), and returns a structured result.
 *
 * The hook appends the canonical `Co-authored-by: Copilot` trailer to a commit
 * message when the exact line is absent, placing it ABOVE git's comment /
 * scissors template so it survives git's message cleanup on every source —
 * including the motivating MERGE-commit case (CS100 / LRN-018). This makes the
 * commit-trailers (B1) gate (`scripts/check-pr-commits.mjs`) pass by
 * construction. The skip condition and the appended line are byte-for-byte
 * identical to what B1 matches (case-sensitive, whole line).
 *
 * @module lib/hooks.mjs
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';

/**
 * Sentinel comment on line 2 of the hook body. `install-hooks` uses this line
 * to recognize a harness-installed hook (no-op on re-install) and to
 * distinguish it from a foreign hook (refused without `--force`).
 */
export const HOOK_SENTINEL = '# harness:prepare-commit-msg';

/**
 * The canonical Co-authored-by trailer line, byte-for-byte identical to the
 * line the commit-trailers (B1) gate matches case-sensitively
 * (`scripts/check-pr-commits.mjs`).
 */
export const COPILOT_TRAILER =
  'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';

/**
 * POSIX-`sh` body of the `prepare-commit-msg` hook. Portable across the sh
 * that git-for-windows bundles and any POSIX shell (no bashisms). The first
 * line is the shebang and the second line is {@link HOOK_SENTINEL}; do not
 * indent — the shebang must start at byte 0.
 *
 * @type {string}
 */
export const PREPARE_COMMIT_MSG_HOOK = `#!/bin/sh
# harness:prepare-commit-msg
#
# Opt-in hook installed by \`harness install-hooks\` (agent-harness). Appends the
# canonical Co-authored-by: Copilot trailer to the commit message when that
# exact line is absent, placing it ABOVE git's comment / scissors template so it
# survives git's message cleanup on every source — normal, template, squash,
# amend, and (the motivating case) MERGE commits. Idempotent and case-sensitive,
# so re-runs / amends never duplicate the trailer and the line always matches
# the commit-trailers (B1) gate byte-for-byte.

msg_file="$1"
[ -n "$msg_file" ] || exit 0
[ -f "$msg_file" ] || exit 0

trailer='Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'

# Idempotent: skip when the exact canonical line is already present (whole-line,
# fixed-string, case-sensitive). A different-casing variant does NOT count.
if grep -qxF "$trailer" "$msg_file"; then
  exit 0
fi

# Resolve the comment marker: core.commentString, then core.commentChar, else
# '#'. An empty or 'auto' value falls back to '#'. Multi-character markers
# (e.g. '//') are supported.
marker=$(git config --get core.commentString 2>/dev/null) || marker=''
if [ -z "$marker" ]; then
  marker=$(git config --get core.commentChar 2>/dev/null) || marker=''
fi
if [ -z "$marker" ] || [ "$marker" = auto ]; then
  marker='#'
fi

tmp="$msg_file.harness.$$"

# Insert the trailer above the first comment / scissors line (the first line
# beginning with the marker), separated from the preceding content line by a
# blank line when that line is not already blank; when there is no comment line,
# append at end-of-file with a blank-line separator. awk ALSO skips the insert
# when the exact trailer line is already present, so idempotency holds even if
# the 'grep' fast-path above was unavailable. The message is buffered in awk for
# a single POSIX-portable pass; the marker is a literal prefix (substr), not a regex.
if awk -v trailer="$trailer" -v marker="$marker" '
  { line[NR] = $0; if ($0 == trailer) found = 1 }
  END {
    if (found) {
      for (i = 1; i <= NR; i++) print line[i]
    } else {
      mlen = length(marker)
      idx = 0
      for (i = 1; i <= NR; i++) {
        if (substr(line[i], 1, mlen) == marker) { idx = i; break }
      }
      if (idx > 0) {
        for (i = 1; i < idx; i++) print line[i]
        if (idx > 1 && line[idx - 1] != "") print ""
        print trailer
        for (i = idx; i <= NR; i++) print line[i]
      } else {
        for (i = 1; i <= NR; i++) print line[i]
        if (NR > 0 && line[NR] != "") print ""
        print trailer
      }
    }
  }
' "$msg_file" > "$tmp"; then
  if [ -s "$tmp" ]; then
    mv "$tmp" "$msg_file"
  else
    rm -f "$tmp"
  fi
else
  # awk unavailable or failed. Stay non-blocking — a convenience hook must never
  # abort the user's commit (especially a merge) — but warn loudly so the missing
  # trailer is visible rather than a silent, deferred B1 failure.
  rm -f "$tmp"
  echo "harness prepare-commit-msg hook: 'awk' failed or is unavailable; the Co-authored-by: Copilot trailer was NOT added (the commit-trailers/B1 gate may fail). Ensure a POSIX sh with awk/grep on PATH, or add the trailer manually." >&2
fi

exit 0
`;

/**
 * Resolve a repository's active git hooks directory via
 * `git -C <repoRoot> rev-parse --git-path hooks`. This handles linked
 * worktrees and custom `$GIT_DIR` layouts (git returns the correct hooks path
 * rather than a hard-coded `.git/hooks`). Fails closed: throws a descriptive
 * Error when the path is not a git repository or git is unavailable.
 *
 * @param {string} repoRoot Absolute path to the repository working tree root.
 * @returns {string} Absolute path to the hooks directory.
 */
function resolveHooksDir(repoRoot) {
  const r = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--git-path', 'hooks'], {
    shell: false,
    encoding: 'utf8',
  });
  if (r.error) {
    throw new Error(
      `install-hooks: failed to run git in ${repoRoot}: ${r.error.message}`
    );
  }
  if (r.status !== 0) {
    const detail = (r.stderr || '').trim();
    throw new Error(
      `install-hooks: not a git repository (or git failed) at ${repoRoot}` +
        (detail ? `: ${detail}` : '')
    );
  }
  const rel = (r.stdout || '').trim();
  if (!rel) {
    throw new Error(
      `install-hooks: 'git rev-parse --git-path hooks' returned no path for ${repoRoot}`
    );
  }
  // git returns a path relative to repoRoot for a normal repo, or an absolute
  // path for a linked worktree / explicit GIT_DIR.
  return path.isAbsolute(rel) ? rel : path.resolve(repoRoot, rel);
}

/**
 * Write the hook body to `target` with LF line endings and mode 0o755.
 * The chmod is a no-op on Windows (git-for-windows runs hooks via bundled sh
 * regardless); it is best-effort and never fatal.
 *
 * @param {string} target Absolute path to the hook file.
 */
function writeHook(target) {
  const body = PREPARE_COMMIT_MSG_HOOK.replace(/\r\n/g, '\n');
  writeFileSync(target, body, { encoding: 'utf8' });
  try {
    chmodSync(target, 0o755);
  } catch {
    // chmod may be a no-op or unsupported on some platforms (e.g. Windows);
    // the hook still runs via git-for-windows' bundled sh. Non-fatal.
  }
}

/**
 * @typedef {Object} InstallHookResult
 * @property {'created'|'replaced'|'skipped'|'refused'} action What happened.
 * @property {string} path Absolute path to the `prepare-commit-msg` hook file.
 * @property {string} [reason] Present only when `action === 'refused'`.
 */

/**
 * Install the opt-in `prepare-commit-msg` hook into `repoRoot`'s active git
 * hooks directory. Safety / idempotency rules (CS100 Decision 5):
 *
 *   - target absent                          → write it → `created`
 *   - target present AND carries our sentinel → no-op   → `skipped`
 *       (unless `force`, which rewrites it   → `replaced`)
 *   - target present WITHOUT our sentinel     → do NOT write → `refused`
 *       (unless `force`, which overwrites it → `replaced`)
 *
 * Always writes with LF endings and sets mode 0o755 (POSIX; no-op on Windows).
 * Fails closed by throwing when `repoRoot` is not a git repository.
 *
 * @param {string} repoRoot Absolute path to the repository working tree root.
 * @param {{ force?: boolean }} [options]
 * @returns {InstallHookResult}
 */
export function installPrepareCommitMsgHook(repoRoot, { force = false } = {}) {
  const hooksDir = resolveHooksDir(repoRoot);
  // mkdirSync(recursive) is idempotent — no existsSync gate needed, and
  // existsSync would mask a permission error as "absent" (see the read below).
  mkdirSync(hooksDir, { recursive: true });
  const target = path.join(hooksDir, 'prepare-commit-msg');

  // Read the target directly and discriminate ENOENT rather than gating on
  // existsSync(): existsSync() also returns false on EACCES / permission
  // errors, which would let a foreign hook be silently overwritten (violating
  // the "refuse without --force" safety rule). A successful read means a hook
  // is present; ENOENT means truly absent; any other error (EACCES, EISDIR, …)
  // fails closed by throwing. (Repo convention: lib/doctor.mjs, lib/review.mjs
  // avoid existsSync-gating for exactly this reason.)
  let existing = null;
  try {
    existing = readFileSync(target, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(
        `install-hooks: cannot read the existing hook at ${target}: ${err.message}`
      );
    }
    // ENOENT → no hook present → create it below.
  }

  if (existing !== null) {
    // Match the sentinel as an EXACT line (it is line 2 of our hook), not a
    // substring: a foreign hook that merely mentions the sentinel text in a
    // comment must still be treated as foreign (refused/overwritten per --force),
    // not silently skipped as "ours".
    const ours = existing.split(/\r?\n/).includes(HOOK_SENTINEL);

    if (!force) {
      if (ours) {
        return { action: 'skipped', path: target };
      }
      return {
        action: 'refused',
        path: target,
        reason:
          `a prepare-commit-msg hook already exists at ${target} but was not ` +
          `installed by harness (no "${HOOK_SENTINEL}" sentinel). Re-run with ` +
          `--force to overwrite it.`,
      };
    }

    // force: overwrite whether ours or foreign.
    writeHook(target);
    return { action: 'replaced', path: target };
  }

  writeHook(target);
  return { action: 'created', path: target };
}
