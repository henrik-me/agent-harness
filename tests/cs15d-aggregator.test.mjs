// CS15d β8: aggregator integration tests. These tests exercise the aggregator extension that β9 (orchestrator) will land. They WILL FAIL until β9's content commit lands; that is expected and documented.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'cs15d', 'aggregator');

function run(args = [], opts = {}) {
  const result = spawnSync(NODE, [CLI, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

function lint(cwd) {
  return run(['--cwd', cwd, 'lint', '--quiet']);
}

function summaryRows(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[✓✗–] /.test(line))
    .map((line) => {
      const match = line.match(/^[✓✗–] ([^:]+(?::[^:]+)?): (pass|fail|skipped)(?: \((.*)\))?$/);
      assert.ok(match, `could not parse lint summary row: ${line}`);
      return { name: match[1], status: match[2], reason: match[3] ?? '' };
    });
}

function rowNames(stdout) {
  return summaryRows(stdout).map((row) => row.name);
}

function findRows(stdout, pattern) {
  return summaryRows(stdout).filter((row) => pattern.test(row.name));
}

function beta9AggregatorLanded() {
  const help = run(['lint', '--help']);
  return help.status === 0 && /scaffold-readme|migration-policy|feature-flag/i.test(help.stdout);
}

function skipUntilBeta9(t) {
  if (!beta9AggregatorLanded()) {
    t.skip('β9 aggregator extension not yet landed; lint help has no scaffold aggregator entries');
    return true;
  }
  return false;
}

function scaffoldReadmeCount() {
  return readdirSync(path.join(REPO_ROOT, 'scaffolds'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(path.join(REPO_ROOT, 'scaffolds', entry.name, 'README.md')))
    .length;
}

describe('CS15d scaffold aggregator integration', () => {
  it('self-host lint walks scaffold READMEs', (t) => {
    if (skipUntilBeta9(t)) return;

    const result = lint(REPO_ROOT);
    assert.equal(result.status, 0, `expected lint exit 0; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);

    const rows = findRows(result.stdout, /scaffold-readme/);
    assert.ok(rows.length > 0, `expected scaffold-readme summary row; stdout:\n${result.stdout}`);
    assert.ok(rows.every((row) => row.status === 'pass'), `expected scaffold-readme pass rows; got ${JSON.stringify(rows)}`);

    const expected = scaffoldReadmeCount();
    const namedRows = rows.filter((row) => row.name.includes(':'));
    if (namedRows.length > 0) {
      assert.equal(namedRows.length, expected, `expected one scaffold-readme row per scaffold README; rows: ${JSON.stringify(rows)}`);
    } else {
      assert.match(result.stdout, new RegExp(`scaffold-readme[\\s\\S]*\\b${expected}\\b|\\b${expected}\\b[\\s\\S]*scaffold-readme`));
    }
  });

  it('consumer with migrations scaffold dispatches migration policy linter', (t) => {
    if (skipUntilBeta9(t)) return;

    const result = lint(path.join(FIXTURES, 'consumer-migrations'));
    assert.equal(result.status, 0, `expected lint exit 0; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const rows = findRows(result.stdout, /migration.*policy|check-migration-policy/);
    assert.ok(rows.length > 0, `expected migration policy summary row; rows: ${rowNames(result.stdout).join(', ')}`);
    assert.ok(rows.some((row) => row.status === 'pass'), `expected migration policy pass; got ${JSON.stringify(rows)}`);
  });

  it('consumer with feature-flags scaffold dispatches feature flag policy linter', (t) => {
    if (skipUntilBeta9(t)) return;

    const result = lint(path.join(FIXTURES, 'consumer-feature-flags'));
    assert.equal(result.status, 0, `expected lint exit 0; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const rows = findRows(result.stdout, /feature.*flag.*policy|feature-flags.*policy|check-feature-flag/);
    assert.ok(rows.length > 0, `expected feature flag policy summary row; rows: ${rowNames(result.stdout).join(', ')}`);
    assert.ok(rows.some((row) => row.status === 'pass'), `expected feature flag policy pass; got ${JSON.stringify(rows)}`);
  });

  it('missing optional scaffold linter skips gracefully', (t) => {
    if (skipUntilBeta9(t)) return;

    const result = lint(path.join(FIXTURES, 'consumer-missing-script'));
    assert.equal(result.status, 0, `expected lint exit 0 for missing optional linter; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const rows = findRows(result.stdout, /migration.*policy|check-migration-policy/);
    assert.ok(rows.length > 0, `expected skipped migration policy row; rows: ${rowNames(result.stdout).join(', ')}`);
    assert.ok(rows.some((row) => row.status === 'skipped'), `expected migration policy skipped; got ${JSON.stringify(rows)}`);
    assert.match(result.stdout, /not present in consumer|target not found|skipped/i);
  });

  it('consumer without scaffolds field does not dispatch optional scaffold policy linters', () => {
    const result = lint(path.join(FIXTURES, 'consumer-no-scaffolds'));
    assert.equal(result.status, 0, `expected lint exit 0; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    // `closeout-freshness` is a git-state-dependent dynamic linter: it registers
    // only when the CURRENT branch's diff carries a same-id active_→done_ rename
    // (bin/harness.mjs). Because these consumer fixtures live INSIDE the harness
    // repo, its detector reads the harness branch — so on a branch that carries a
    // close-out rename (a CS close-out, or CS75's done_cs65 repair) it leaks in and
    // perturbs this fixed count. Exclude it so the assertion stays about the
    // consumer's stable linter set, deterministic regardless of branch state.
    const rows = summaryRows(result.stdout).filter((row) => row.name !== 'closeout-freshness');
    assert.equal(rows.filter((row) => /migration.*policy|feature.*flag.*policy|feature-flags.*policy/.test(row.name)).length, 0);
    // CS71 D71-4: the self-host-gated `workboard-allowlist-consistency` linter
    // adds one row (skipped in a consumer), so the total grew by 1 (26->27, 18->19).
    // CS109: `ruleset-deadlock` (F3) + `posture-coherence` (F4) add two more rows
    // (posture-coherence runs against the config; ruleset-deadlock skips without an
    // infra ruleset), so the total grew by 2 more (27->29, 19->21).
    assert.equal(rows.length, beta9AggregatorLanded() ? 29 : 21, `unexpected linter row count; rows: ${rows.map((row) => row.name).join(', ')}`);
  });

  it('self-host scaffold-readme walk does not run for non-self-host consumers', (t) => {
    if (skipUntilBeta9(t)) return;

    const result = lint(path.join(FIXTURES, 'consumer-non-selfhost-with-readme'));
    assert.equal(result.status, 0, `expected lint exit 0; stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const rows = findRows(result.stdout, /scaffold-readme/);
    assert.ok(
      rows.length === 0 || rows.every((row) => row.status === 'skipped'),
      `expected no passing scaffold-readme rows for non-self-host; got ${JSON.stringify(rows)}`,
    );
  });
});