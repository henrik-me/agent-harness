import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeInitVersion } from '../bin/harness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const PLACEHOLDER_LINTER = path.join(REPO_ROOT, 'scripts', 'check-config-placeholders.mjs');
const NODE = process.execPath;

function makeTmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'harness-cs26-'));
}

function runHarness(args, opts = {}) {
  return spawnSync(NODE, [HARNESS, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

function runPlaceholderLinter(args, opts = {}) {
  return spawnSync(NODE, [PLACEHOLDER_LINTER, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Finding #2 — normalizeInitVersion (unit, seam-injected provenance)
// ───────────────────────────────────────────────────────────────────────────

describe('CS26 Finding #2 — normalizeInitVersion normalizes the init version pin', () => {
  it('1. a bare-SemVer harness_ref (npx-cache 0.16.0) is v-normalized', () => {
    assert.equal(normalizeInitVersion({ harness_ref: '0.16.0' }, '0.9.9'), 'v0.16.0');
  });

  it('2. a v-prefixed SemVer harness_ref (git release tag) is returned as-is', () => {
    assert.equal(normalizeInitVersion({ harness_ref: 'v0.16.0' }, '0.9.9'), 'v0.16.0');
  });

  it('3. a non-tag ref (branch) with a real 40-hex SHA returns the full SHA', () => {
    const sha = 'a'.repeat(40);
    assert.equal(normalizeInitVersion({ harness_ref: 'main', resolved_sha: sha }, '0.9.9'), sha);
  });

  it('4. a short-SHA ref with a real 40-hex SHA returns the full SHA (never the short ref, R1)', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    assert.equal(normalizeInitVersion({ harness_ref: 'abc1234', resolved_sha: sha }, '0.9.9'), sha);
  });

  it('5. unresolved provenance (unknown + all-zero SHA) falls back to v${pkgVersion}', () => {
    assert.equal(
      normalizeInitVersion({ harness_ref: 'unknown', resolved_sha: '0'.repeat(40) }, '0.16.0'),
      'v0.16.0',
    );
  });

  it('6. missing/undefined provenance fields fall back to v${pkgVersion} without throwing', () => {
    assert.equal(normalizeInitVersion(undefined, '0.16.0'), 'v0.16.0');
    assert.equal(normalizeInitVersion({}, 'v2.3.4'), 'v2.3.4');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Finding #3 — check-config-placeholders linter (integration)
// ───────────────────────────────────────────────────────────────────────────

describe('CS26 Finding #3 — check-config-placeholders flags un-replaced REPLACE_ME tokens', () => {
  it('1. a config with a real REPLACE_ME value exits 1', () => {
    const dir = makeTmpDir();
    try {
      const cfgPath = path.join(dir, 'harness.config.json');
      writeFileSync(
        cfgPath,
        JSON.stringify(
          {
            version: 'v0.1.0',
            project: { name: 'x', agent_suffix: 'x', repo: 'REPLACE_ME/REPLACE_ME' },
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      const r = runPlaceholderLinter(['--file', cfgPath]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2. a config whose only REPLACE_ME is in _comment (all real fields filled) exits 0', () => {
    const dir = makeTmpDir();
    try {
      const cfgPath = path.join(dir, 'harness.config.json');
      writeFileSync(
        cfgPath,
        JSON.stringify(
          {
            _comment: 'Replace REPLACE_ME placeholders with your project values before running harness sync',
            version: 'v0.1.0',
            project: { name: 'x', agent_suffix: 'x', repo: 'owner/repo' },
            templating: {
              repo_owner: 'owner',
              repo_slug: 'owner/repo',
              default_codeowner: 'owner',
              lib_codeowner: 'owner',
              repo_short: 'repo',
            },
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );
      const r = runPlaceholderLinter(['--file', cfgPath]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('3. harness lint registers "config-placeholders" and the self-host root config passes', () => {
    const r = runHarness(['lint', '--only', 'config-placeholders', '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /config-placeholders/, `Expected a config-placeholders summary row; got:\n${r.stdout}`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Findings #6 + #9 + #2 — end-to-end fresh init
// ───────────────────────────────────────────────────────────────────────────

describe('CS26 Findings #6/#9/#2 — fresh harness init seeds correctly', () => {
  it('1. no stray sentinels, seeds .gitattributes (eol=lf), real version, clickstops sentinels retained', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected init exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      // Finding #6: neither stray sentinel is seeded
      assert.ok(!existsSync(path.join(dir, '.gitkeep')), 'root .gitkeep must NOT be seeded');
      assert.ok(!existsSync(path.join(dir, '.github', '.gitkeep')), '.github/.gitkeep must NOT be seeded');

      // Finding #9: .gitattributes is seeded and forces LF
      const gaPath = path.join(dir, '.gitattributes');
      assert.ok(existsSync(gaPath), '.gitattributes must be seeded');
      const ga = readFileSync(gaPath, 'utf8');
      assert.match(ga, /eol=lf/, '.gitattributes must contain eol=lf');
      assert.ok(!ga.includes('\r'), '.gitattributes must be LF-encoded (no CR)');

      // Finding #2: version is a real pin, not the seeded placeholder
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.notEqual(cfg.version, 'v0.1.0', 'init must overwrite the seeded v0.1.0 placeholder');
      assert.ok(
        /^v\d+\.\d+\.\d+/.test(cfg.version) || /^[0-9a-f]{40}$/.test(cfg.version),
        `version must be a SemVer tag or a full 40-hex SHA; got ${cfg.version}`,
      );

      // Retained: the clickstops .gitkeep sentinels (C26-6)
      for (const sub of ['planned', 'active', 'done']) {
        assert.ok(
          existsSync(path.join(dir, 'project', 'clickstops', sub, '.gitkeep')),
          `project/clickstops/${sub}/.gitkeep must be retained`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2. re-running init on a PRE-EXISTING config leaves version untouched (fresh-only guard, LRN-057)', () => {
    const dir = makeTmpDir();
    try {
      const cfgPath = path.join(dir, 'harness.config.json');
      const pre =
        JSON.stringify({ version: 'v0.0.1', project: { name: 'pre', agent_suffix: 'pe' } }, null, 2) + '\n';
      writeFileSync(cfgPath, pre, 'utf8');

      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      assert.equal(
        readFileSync(cfgPath, 'utf8'),
        pre,
        'an existing config (incl. its version) must be unchanged on re-init',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
