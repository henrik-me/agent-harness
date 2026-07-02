/**
 * tests/cs65-learnings-archive.test.mjs — CS65 T4 archive/stub-aware linting.
 *
 * Exercises the archive-awareness added to:
 *   - scripts/check-learnings.mjs (validates a sibling LEARNINGS-archive.md;
 *     tolerates heading-only stubs; unions stub slots into the gap universe)
 *   - scripts/check-doc-xref-resolvability.mjs (check (d): archive/stub
 *     integrity — dead redirect, orphan anchor, dup full entry, open/deferred
 *     in archive — plus archive headings as an LRN-token source)
 *
 * ALL fixtures are generated under os.tmpdir() via mkdtempSync and removed in
 * teardown — never under the repo root, so the recursive text-encoding walk and
 * parallel `node --test` runs cannot race the fixtures (repo memory, LRN-094).
 *
 * Run: node --test tests/cs65-learnings-archive.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LEARNINGS_LINTER = path.join(REPO_ROOT, 'scripts', 'check-learnings.mjs');
const XREF_LINTER = path.join(REPO_ROOT, 'scripts', 'check-doc-xref-resolvability.mjs');
const NODE = process.execPath;

const SELF_HOST_PKG = JSON.stringify({ name: '@henrik-me/agent-harness', version: '0.0.0-test' });

// ---------------------------------------------------------------------------
// Fixture-content builders (LF, no BOM — plain \n strings)
// ---------------------------------------------------------------------------

/** A ```yaml frontmatter fence for one learning entry. */
function entryYaml({
  id,
  date = '2026-05-01',
  category = 'process',
  source_cs = 'CS65',
  status = 'applied',
  deferred_until = null,
}) {
  let y =
    '```yaml\n' +
    `id: ${id}\n` +
    `date: ${date}\n` +
    `category: ${category}\n` +
    `source_cs: ${source_cs}\n` +
    `status: ${status}\n` +
    'tags: [t]\n';
  if (deferred_until) y += `deferred_until: ${deferred_until}\n`;
  y += '```';
  return y;
}

/** A full entry: `### <headingId>` + frontmatter + body (Disposition when needed). */
function fullEntry(opts) {
  const headingId = opts.headingId ?? opts.id;
  const status = opts.status ?? 'applied';
  let body = '\n**Problem:** p.\n';
  if (status === 'applied' || status === 'obsolete') body += '\n**Disposition:** d.\n';
  return `### ${headingId}\n\n${entryYaml(opts)}\n${body}`;
}

/** A heading-only stub redirect (the archived-entry shape in LEARNINGS.md). */
function stub(id) {
  const a = id.toLowerCase();
  return (
    `### ${id}\n\n` +
    `> **Archived.** Full entry → [LEARNINGS-archive.md#${a}](LEARNINGS-archive.md#${a}).\n\n` +
    '---\n'
  );
}

/** Assemble a LEARNINGS.md from a list of entry/stub sections. */
function learningsDoc(sections) {
  return `# Test Learnings\n\n## Applied\n\n${sections.join('\n')}\n`;
}

/** Assemble a LEARNINGS-archive.md from a list of full entries. */
function archiveDoc(entries) {
  return `# Test Learnings Archive\n\nMoved entries live here.\n\n## Applied\n\n${entries.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

/**
 * Create a throwaway repo dir under os.tmpdir(), write the given files, and
 * register cleanup on the test context.
 *
 * @param {import('node:test').TestContext} t
 * @param {{ learnings?: string, archive?: string, operations?: string, pkg?: boolean }} files
 * @returns {string} absolute path to the temp dir
 */
function makeRepo(t, files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cs65-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (files.pkg) writeFileSync(path.join(dir, 'package.json'), SELF_HOST_PKG);
  if (files.learnings !== undefined) writeFileSync(path.join(dir, 'LEARNINGS.md'), files.learnings);
  if (files.archive !== undefined) writeFileSync(path.join(dir, 'LEARNINGS-archive.md'), files.archive);
  if (files.operations !== undefined) writeFileSync(path.join(dir, 'OPERATIONS.md'), files.operations);
  return dir;
}

function runLearnings(dir) {
  const r = spawnSync(NODE, [LEARNINGS_LINTER, '--file', path.join(dir, 'LEARNINGS.md')], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function runXref(dir) {
  const r = spawnSync(NODE, [XREF_LINTER, '--cwd', dir], { cwd: dir, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

// ---------------------------------------------------------------------------
// check-doc-xref-resolvability — check (d) archive/stub integrity
// ---------------------------------------------------------------------------

describe('CS65 check-doc-xref-resolvability (archive/stub integrity)', () => {
  it('1. valid stub+archive pair passes (exit 0)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' }), stub('LRN-005')]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005' })]),
    });
    const r = runXref(dir);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstderr: ${r.stderr}`);
  });

  it('2. dead redirect (stub with no archive entry) fails (exit 1)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([stub('LRN-005')]),
      archive: archiveDoc([]),
    });
    const r = runXref(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(/dead redirect/i.test(r.stderr), `Expected "dead redirect"; got:\n${r.stderr}`);
    assert.ok(r.stderr.includes('LRN-005'), `Expected LRN-005 named; got:\n${r.stderr}`);
  });

  it('3. orphan (archive entry with no stub in LEARNINGS.md) fails (exit 1)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' })]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005' })]),
    });
    const r = runXref(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(/orphan/i.test(r.stderr), `Expected "orphan"; got:\n${r.stderr}`);
    assert.ok(r.stderr.includes('LRN-005'), `Expected LRN-005 named; got:\n${r.stderr}`);
  });

  it('4. open status in archive fails (exit 1)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([stub('LRN-005')]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005', status: 'open' })]),
    });
    const r = runXref(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(
      /only applied\/obsolete/i.test(r.stderr),
      `Expected status-gate error; got:\n${r.stderr}`
    );
  });

  it('5. deferred status in archive fails (exit 1)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([stub('LRN-006')]),
      archive: archiveDoc([
        fullEntry({ id: 'LRN-006', status: 'deferred', deferred_until: '2026-08-01' }),
      ]),
    });
    const r = runXref(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(
      /only applied\/obsolete/i.test(r.stderr) && r.stderr.includes('deferred'),
      `Expected deferred status-gate error; got:\n${r.stderr}`
    );
  });

  it('6. duplicate full entry in BOTH files fails (exit 1)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([fullEntry({ id: 'LRN-005' })]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005' })]),
    });
    const r = runXref(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(/BOTH/.test(r.stderr), `Expected "BOTH" dup error; got:\n${r.stderr}`);
    assert.ok(r.stderr.includes('LRN-005'), `Expected LRN-005 named; got:\n${r.stderr}`);
  });

  it('7. archive absent → check (d) no-ops (exit 0)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' })]),
      // no archive file
    });
    const r = runXref(dir);
    assert.equal(r.status, 0, `Expected exit 0 (no-op); got ${r.status}\nstderr: ${r.stderr}`);
  });

  it('8. LRN token in OPERATIONS.md resolves with archive present (exit 0)', (t) => {
    const dir = makeRepo(t, {
      pkg: true,
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' }), stub('LRN-005')]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005' })]),
      operations: '# Ops\n\nSee LRN-005 and LRN-100 for details.\n',
    });
    const r = runXref(dir);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstderr: ${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// check-learnings — sibling archive validation + stub tolerance
// ---------------------------------------------------------------------------

describe('CS65 check-learnings (archive-aware)', () => {
  it('9. valid main + archive pair passes (exit 0) and reports an archive summary', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' }), stub('LRN-005')]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005' })]),
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(r.stdout.includes('✅'), `Expected success indicator; got:\n${r.stdout}`);
    assert.ok(
      r.stdout.includes('summary (LEARNINGS-archive.md)'),
      `Expected archive summary block; got:\n${r.stdout}`
    );
  });

  it('10. schema-invalid entry in the archive fails (exit 1) with a labeled error', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' })]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005', category: 'bogus' })]),
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(
      r.stdout.includes('LEARNINGS-archive.md') && r.stdout.includes('LRN-005'),
      `Expected archive-labeled LRN-005 error; got:\n${r.stdout}`
    );
  });

  it('11. header↔id mismatch in the archive fails (exit 1)', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' })]),
      archive: archiveDoc([fullEntry({ headingId: 'LRN-006', id: 'LRN-005' })]),
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(/does not match/i.test(r.stdout), `Expected "does not match"; got:\n${r.stdout}`);
    assert.ok(
      r.stdout.includes('LRN-005') && r.stdout.includes('LRN-006'),
      `Expected both ids named; got:\n${r.stdout}`
    );
  });

  it('12. heading-only stub does NOT false-fail check-learnings (exit 0, no ERROR)', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' }), stub('LRN-005')]),
      archive: archiveDoc([fullEntry({ id: 'LRN-005' })]),
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(!/^ERROR:/m.test(r.stdout), `Expected no ERROR lines; got:\n${r.stdout}`);
    // The stub carries no frontmatter, so only the one full entry is counted.
    assert.ok(
      r.stdout.includes('Entries checked: 1'),
      `Expected the stub to be uncounted; got:\n${r.stdout}`
    );
  });

  it('13. archive absent → check-learnings no-ops (exit 0, no archive summary)', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' })]),
      // no archive
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(
      !r.stdout.includes('summary (LEARNINGS-archive.md)'),
      `Expected no archive summary when absent; got:\n${r.stdout}`
    );
  });

  it('14. a stub slot fills the sequence — no false gap warning (exit 0)', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([
        fullEntry({ id: 'LRN-100' }),
        stub('LRN-101'),
        fullEntry({ id: 'LRN-102' }),
      ]),
      // no archive — this isolates check-learnings' own gap universe
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(
      !r.stdout.includes('ID gap: LRN-101'),
      `Expected no gap warning for the stub slot; got:\n${r.stdout}`
    );
  });

  it('15. a genuine missing id still warns as a gap (exit 0 with warning)', (t) => {
    const dir = makeRepo(t, {
      learnings: learningsDoc([fullEntry({ id: 'LRN-100' }), fullEntry({ id: 'LRN-102' })]),
    });
    const r = runLearnings(dir);
    assert.equal(r.status, 0, `Expected exit 0 (warning only); got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(
      r.stdout.includes('ID gap: LRN-101'),
      `Expected a gap warning for the truly-missing id; got:\n${r.stdout}`
    );
  });
});
