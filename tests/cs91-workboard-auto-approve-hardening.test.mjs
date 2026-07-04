/**
 * tests/cs91-workboard-auto-approve-hardening.test.mjs — CS91 (#394 / #395).
 *
 * Locks the three CS91 hardenings to the privileged `pull_request_target`
 * `workboard-auto-approve.yml` gate and keeps the root + template copies in
 * byte-lockstep (consumers sync the template copy):
 *
 *   C91-1  is_allowed() trims leading/trailing whitespace from each allowlist
 *          line BEFORE the empty-line skip, so the path check no longer relies
 *          on YAML block-scalar dedent for correctness (a whitespace-only line
 *          also collapses to empty and is skipped).
 *   C91-2  the immutable `git diff` disables config- AND gitattributes-driven
 *          external/textconv diff drivers
 *          (`-c diff.external= --no-ext-diff --no-textconv`) on this
 *          write-token/secrets workflow.
 *   C91-4  a bounded, anchored, slash-free `workboard/maint-*` branch pattern is
 *          added to the validate-and-approve branch regex for ad-hoc
 *          workboard-allowlist maintenance PRs (G91-1 Option A).
 *
 * Workflows can't run in CI, so the primary guards are content/structure
 * assertions plus a JS mirror of the branch regex extracted from the file
 * itself (so it can't silently drift from a hand-copy). An optional
 * bash-execution check exercises the real C91-1 trim expansion and is skipped
 * when bash is unavailable, keeping the suite Windows-robust.
 *
 * Run: node --test tests/cs91-workboard-auto-approve-hardening.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROOT_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'workboard-auto-approve.yml');
const TEMPLATE_WORKFLOW = path.join(
  REPO_ROOT,
  'template',
  'managed',
  '.github',
  'workflows',
  'workboard-auto-approve.yml',
);
const WORKFLOWS = [ROOT_WORKFLOW, TEMPLATE_WORKFLOW];

function readText(abs) {
  return readFileSync(abs, 'utf8');
}

const rootSrc = readText(ROOT_WORKFLOW);
const templateSrc = readText(TEMPLATE_WORKFLOW);

// The exact C91-1 trim expansion and the empty-line skip it must precede.
const TRIM_EXPANSION = 'p="${p#"${p%%[![:space:]]*}"}"; p="${p%"${p##*[![:space:]]}"}"';
const EMPTY_SKIP = '[ -z "$p" ] && continue';

// The exact C91-4 maintenance-branch alternation (mirrored by the docs sub-agent).
const MAINT_ALTERNATION = 'workboard/maint-[A-Za-z0-9][A-Za-z0-9._-]*';

// Extract the ERE branch pattern straight from the workflow so the behavioural
// test runs the ACTUAL regex, not a hand-copied mirror that could drift. The
// branch pattern contains no single quotes, so [^']* captures it exactly.
function extractBranchRegex(src) {
  const m = src.match(/"\$PR_BRANCH" \| grep -Eq '([^']*)'/);
  assert.ok(m, 'could not locate the $PR_BRANCH grep -Eq pattern in the workflow');
  return new RegExp(m[1]);
}

function hasBash() {
  try {
    const r = spawnSync('bash', ['-c', 'printf ok'], { encoding: 'utf8' });
    return r.status === 0 && (r.stdout || '').includes('ok');
  } catch {
    return false;
  }
}
const BASH_AVAILABLE = hasBash();

describe('CS91 — workboard-auto-approve.yml hardening (#394 / #395)', () => {
  it('(a) root and template copies are byte-identical', () => {
    assert.equal(
      rootSrc,
      templateSrc,
      'consumers sync the template copy; it must match the harness root copy',
    );
    assert.ok(
      readFileSync(ROOT_WORKFLOW).equals(readFileSync(TEMPLATE_WORKFLOW)),
      'root and template workflow bytes must be identical',
    );
  });

  it('(b) both copies parse as valid YAML mappings', () => {
    for (const wf of WORKFLOWS) {
      const doc = yaml.load(readText(wf));
      assert.ok(doc && typeof doc === 'object', `${wf} must parse as a YAML mapping`);
      assert.ok(doc.jobs?.['validate-and-approve'], `${wf} must keep the validate-and-approve job`);
    }
  });

  it('(c) C91-1 whitespace trim sits inside is_allowed BEFORE the empty-line skip', () => {
    for (const src of [rootSrc, templateSrc]) {
      const trimIdx = src.indexOf(TRIM_EXPANSION);
      const skipIdx = src.indexOf(EMPTY_SKIP);
      assert.notEqual(trimIdx, -1, 'the whitespace-trim parameter expansion must be present');
      assert.notEqual(skipIdx, -1, 'the empty-line skip must be present');
      assert.ok(trimIdx < skipIdx, 'the trim must run BEFORE the [ -z "$p" ] && continue skip');
      // R3: the heredoc must NOT be re-indented — only is_allowed() changed.
      assert.match(src, /cat > allowed-paths\.txt <<'EOF'/, 'heredoc opener unchanged (R3)');
      assert.match(src, /done < allowed-paths\.txt/, 'is_allowed still reads the heredoc allowlist');
    }
  });

  it('(d) C91-2 git diff disables config- and gitattributes-driven external/textconv drivers', () => {
    for (const src of [rootSrc, templateSrc]) {
      assert.match(
        src,
        /git -c diff\.external= diff --no-ext-diff --no-textconv --name-status -M "\$base_sha" "\$head_sha" > pr-files\.tsv/,
        'the immutable diff must clear config + gitattributes external drivers and textconv',
      );
      for (const flag of ['-c diff.external=', '--no-ext-diff', '--no-textconv']) {
        assert.ok(src.includes(flag), `git diff must include ${flag}`);
      }
      // R2: the name/status TSV contract the downstream parser depends on is unchanged.
      assert.match(
        src,
        /--name-status -M "\$base_sha" "\$head_sha" > pr-files\.tsv/,
        'name/status TSV output contract preserved (R2)',
      );
      // Guard against a stale unhardened invocation lingering anywhere.
      assert.doesNotMatch(
        src,
        /(?<!external= )git diff --name-status -M/,
        'no un-hardened `git diff --name-status -M` should remain',
      );
    }
  });

  it('(e) C91-4 branch regex contains the bounded maintenance-branch alternation', () => {
    for (const src of [rootSrc, templateSrc]) {
      assert.ok(src.includes(MAINT_ALTERNATION), 'maint alternation literal must be present');
      assert.ok(
        src.includes(`|${MAINT_ALTERNATION})$`),
        'maint alternation must be the final top-level branch inside the anchored group',
      );
      // Bounded + slash-free: it must NOT broaden to a wildcard or nested path.
      assert.ok(!src.includes('workboard/maint/'), 'maint pattern must not allow a nested slash path');
      assert.ok(!src.includes('workboard/maint-.*'), 'maint pattern must not use a .* wildcard');
      assert.ok(!src.includes('workboard/*'), 'maint pattern must never broaden to workboard/*');
    }
  });

  describe('(f) branch regex behaviour (extracted from the workflow itself)', () => {
    const ACCEPT = [
      'workboard/maint-context-fix',
      'workboard/maint-a',
      'workboard/maint-LRN.1_2-3',
      'workboard/cs91-claim',
      'cs91/close-out',
      'docs/file-planned-cs91-foo',
    ];
    const REJECT = [
      'workboard/maint-', // empty suffix
      'workboard/maint-foo/bar', // embedded slash
      'workboard/maintenance', // no hyphen after maint
      'workboard/random',
      'feature/x',
    ];
    for (const [label, src] of [
      ['root', rootSrc],
      ['template', templateSrc],
    ]) {
      const re = extractBranchRegex(src);
      for (const branch of ACCEPT) {
        it(`${label}: accepts ${branch}`, () => {
          assert.ok(re.test(branch), `branch '${branch}' should match the workboard-only pattern`);
        });
      }
      for (const branch of REJECT) {
        it(`${label}: rejects ${branch}`, () => {
          assert.ok(!re.test(branch), `branch '${branch}' should NOT match the workboard-only pattern`);
        });
      }
    }
  });

  describe('(g) optional: real C91-1 trim expansion behaviour under bash', () => {
    // Pull the actual trim line out of the workflow so the behaviour test
    // exercises the shipped expansion, not a re-typed copy.
    const trimLine = rootSrc
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('[![:space:]]'));

    it(
      'trims surrounding whitespace from an allowlist entry',
      { skip: BASH_AVAILABLE ? false : 'bash unavailable' },
      () => {
        assert.ok(trimLine, 'trim expansion line must be extractable from the workflow');
        const script = `p="   WORKBOARD.md   "\n${trimLine}\nprintf '[%s]' "$p"`;
        const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout, '[WORKBOARD.md]');
      },
    );

    it(
      'reduces a whitespace-only line to empty (so it is skipped too)',
      { skip: BASH_AVAILABLE ? false : 'bash unavailable' },
      () => {
        assert.ok(trimLine, 'trim expansion line must be extractable from the workflow');
        const script = `p="     "\n${trimLine}\nprintf '[%s]' "$p"`;
        const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout, '[]');
      },
    );
  });
});

// C91-2 / R2: the hardened `git diff` flags must not alter the `--name-status -M`
// TSV columns that the workflow's is_allowed() loop parses (status | path[ | path2]).
// Exercise a real git repo with BOTH a plain edit (M) and a rename (R) and assert
// the hardened invocation yields byte-identical output to the plain one.
describe('CS91 C91-2 — hardened git diff preserves the --name-status -M TSV contract (T6/R2)', () => {
  const git = (dir, args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };

  it('hardened and plain `git diff --name-status -M` produce identical output for a plain edit + a rename', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cs91-tsv-'));
    try {
      git(dir, ['init', '-q']);
      git(dir, ['config', 'user.email', 'cs91@test.local']);
      git(dir, ['config', 'user.name', 'cs91-test']);
      git(dir, ['config', 'commit.gpgsign', 'false']);

      writeFileSync(path.join(dir, 'keep.txt'), 'a\nb\nc\n');
      writeFileSync(path.join(dir, 'old.txt'), 'line1\nline2\nline3\nline4\nline5\n');
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '-m', 'base']);
      const base = git(dir, ['rev-parse', 'HEAD']).trim();

      // Plain edit (surfaces as an `M` row) ...
      writeFileSync(path.join(dir, 'keep.txt'), 'a\nb\nc\nd\n');
      // ... and a content-preserving rename (so `-M` detects it as an `R` row).
      renameSync(path.join(dir, 'old.txt'), path.join(dir, 'new.txt'));
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-q', '-m', 'edit-and-rename']);
      const head = git(dir, ['rev-parse', 'HEAD']).trim();

      const norm = (s) => s.replace(/\r/g, '');
      const plain = norm(git(dir, ['diff', '--name-status', '-M', base, head]));
      const hardened = norm(
        git(dir, ['-c', 'diff.external=', 'diff', '--no-ext-diff', '--no-textconv', '--name-status', '-M', base, head]),
      );

      assert.equal(hardened, plain, 'hardened git diff must yield byte-identical --name-status -M output');
      // Sanity: the fixture actually exercises BOTH statuses the loop parses.
      assert.match(plain, /^M\tkeep\.txt$/m, 'plain edit must appear as an M row');
      assert.match(plain, /^R\d*\told\.txt\tnew\.txt$/m, 'rename must appear as an R row carrying old + new paths');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
