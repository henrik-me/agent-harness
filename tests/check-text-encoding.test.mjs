/**
 * tests/check-text-encoding.test.mjs — Tests for scripts/check-text-encoding.mjs
 *
 * Uses node:test (consistent with other test files in this suite).
 * Spawns the linter via spawnSync.
 * Fixtures are built dynamically in OS temp directories (mkdtempSync) so that
 * BOM/CRLF fixture content does not pollute the harness repo and cause the
 * linter's own `--dir .` self-check to report violations.
 *
 * Run: node --test tests/check-text-encoding.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-text-encoding.mjs');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with given args. Returns { stdout, stderr, status }.
 *
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

/**
 * Create a temporary directory with a unique prefix, write the provided files
 * into it, and return the directory path.
 *
 * @param {string} prefix
 * @param {Record<string, Buffer | string>} files  filename → content (Buffer for binary, string for text)
 * @returns {string} tmpdir path
 */
function makeTmpFixture(prefix, files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `cs03c-${prefix}-`));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(tmpDir, name);
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
  return tmpDir;
}

/** UTF-8 BOM prefix as a Buffer. */
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

/**
 * Build a Buffer containing a BOM followed by the given text.
 *
 * @param {string} text
 * @returns {Buffer}
 */
function bomBuffer(text) {
  return Buffer.concat([BOM, Buffer.from(text, 'utf8')]);
}

/**
 * Convert LF line endings to CRLF.
 *
 * @param {string} text
 * @returns {Buffer}
 */
function crlfBuffer(text) {
  return Buffer.from(text.replace(/\n/g, '\r\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-text-encoding linter', () => {

  // 1. Clean fixture passes: LF files, no BOM → exit 0, "0 violations"
  it('1. clean LF fixture exits 0 with 0 violations', () => {
    const tmpDir = makeTmpFixture('clean', {
      'README.md': '# Hello\n\nThis is clean.\n',
      'config.json': '{"key":"value"}\n',
    });
    const r = runLinter(['--dir', tmpDir]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('0 violations'),
      `Expected "0 violations" in stdout; got:\n${r.stdout}`,
    );
  });

  // 2. BOM violation detected → exit 1, output mentions BOM and file path
  it('2. BOM-bearing file exits 1 with BOM violation', () => {
    const tmpDir = makeTmpFixture('bom', {
      'bom-file.md': bomBuffer('# Title\n\nContent.\n'),
    });
    const r = runLinter(['--dir', tmpDir]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('BOM'),
      `Expected "BOM" in output; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('bom-file.md'),
      `Expected "bom-file.md" in output; got:\n${r.stdout}`,
    );
  });

  // 3. CRLF violation detected → exit 1, output mentions CRLF and file path
  it('3. CRLF file exits 1 with CRLF violation', () => {
    const tmpDir = makeTmpFixture('crlf', {
      'crlf-file.md': crlfBuffer('# Title\r\n\r\nContent.\r\n'),
    });
    const r = runLinter(['--dir', tmpDir]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('CRLF'),
      `Expected "CRLF" in output; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('crlf-file.md'),
      `Expected "crlf-file.md" in output; got:\n${r.stdout}`,
    );
  });

  // 4. Both BOM + CRLF in one file → exit 1, output mentions both
  it('4. file with both BOM and CRLF exits 1 mentioning both violations', () => {
    const tmpDir = makeTmpFixture('both', {
      'both.md': Buffer.concat([BOM, crlfBuffer('# Title\r\n\r\nContent.\r\n')]),
    });
    const r = runLinter(['--dir', tmpDir]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('BOM'),
      `Expected "BOM" in output; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('CRLF'),
      `Expected "CRLF" in output; got:\n${r.stdout}`,
    );
  });

  // 5. --include narrowing: .txt has BOM but --include .md only → exit 0
  it('5. --include narrowing skips un-included extensions', () => {
    const tmpDir = makeTmpFixture('include', {
      'clean.md': '# Clean\n',
      'tainted.txt': bomBuffer('tainted content\n'),
    });
    const r = runLinter(['--dir', tmpDir, '--include', '.md']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (tainted.txt skipped); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('0 violations'),
      `Expected "0 violations"; got:\n${r.stdout}`,
    );
  });

  // 6. --exclude narrowing: node_modules/dep.md has BOM, default exclude skips it → exit 0
  it('6. default --exclude skips node_modules subtree', () => {
    const tmpDir = makeTmpFixture('exclude', {
      'clean.md': '# Clean\n',
      'node_modules/dep.md': bomBuffer('# Dep\n'),
    });
    const r = runLinter(['--dir', tmpDir]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (node_modules excluded); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('0 violations'),
      `Expected "0 violations"; got:\n${r.stdout}`,
    );
  });

  // 7. --no-check-bom skips BOM check → exit 0 for BOM-only file
  it('7. --no-check-bom skips BOM check', () => {
    const tmpDir = makeTmpFixture('no-bom-check', {
      'bom-only.md': bomBuffer('# BOM only, no CRLF\n'),
    });
    const r = runLinter(['--dir', tmpDir, '--no-check-bom']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 with --no-check-bom; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('0 violations'),
      `Expected "0 violations"; got:\n${r.stdout}`,
    );
  });

  // 8. --no-check-line-endings skips CRLF check → exit 0 for CRLF-only file
  it('8. --no-check-line-endings skips CRLF check', () => {
    const tmpDir = makeTmpFixture('no-crlf-check', {
      'crlf-only.md': crlfBuffer('# CRLF only, no BOM\r\n'),
    });
    const r = runLinter(['--dir', tmpDir, '--no-check-line-endings']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 with --no-check-line-endings; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('0 violations'),
      `Expected "0 violations"; got:\n${r.stdout}`,
    );
  });

  // 9. Missing --dir → exit 2 with usage message on stderr
  it('9. missing --dir exits 2 with usage on stderr', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for missing --dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('--dir'),
      `Expected "--dir" in stderr; got:\n${r.stderr}`,
    );
  });

  // 10. --quiet suppresses per-violation output but still prints summary
  it('10. --quiet suppresses VIOLATION lines but prints summary', () => {
    const tmpDir = makeTmpFixture('quiet', {
      'bom.md': bomBuffer('# Title\n'),
    });
    const r = runLinter(['--dir', tmpDir, '--quiet']);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`,
    );
    assert.ok(
      !r.stdout.includes('VIOLATION:'),
      `Expected no VIOLATION lines with --quiet; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('text-encoding:'),
      `Expected summary line with --quiet; got:\n${r.stdout}`,
    );
  });

  // 11. Unknown flag exits 2
  it('11. unknown flag exits 2', () => {
    const r = runLinter(['--dir', os.tmpdir(), '--unknown-flag']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for unknown flag; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
  });

  // 12. Self-host: linter exits 0 against the harness repo itself
  it('12. linter exits 0 against the harness repo (LF-clean, BOM-free)', () => {
    const r = runLinter(['--dir', REPO_ROOT]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 against harness repo; got ${r.status}\nviolations:\n${r.stdout}`,
    );
  });

  // 13. Default exclude `.git` does NOT also skip `.github/...` (CS03c R1 gate fix).
  // Substring matching of excludes would skip .github/ too, allowing managed
  // workflow files to harbor BOM/CRLF undetected. Verify directory-segment match.
  it('13. default exclude `.git` does not skip `.github/` directory (R1 gate fix)', () => {
    const dir = makeTmpFixture('exclude-segment-13', {
      '.github/workflows/tainted.yml': Buffer.concat([
        BOM,
        Buffer.from('name: x\r\non: push\r\n', 'utf8'),
      ]),
    });
    try {
      const r = runLinter(['--dir', dir]);
      assert.equal(
        r.status, 1,
        `Expected exit 1 (.github/ should be scanned even though .git is in default exclude); got ${r.status}\nstdout: ${r.stdout}`,
      );
      assert.ok(
        r.stdout.includes('.github/workflows/tainted.yml') || r.stdout.includes('.github\\workflows\\tainted.yml'),
        `Expected violation report to mention .github/workflows/tainted.yml; got:\n${r.stdout}`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // 14. Companion test: actual `.git` directory IS skipped (positive control for #13).
  it('14. default exclude `.git` skips a real .git/ directory', () => {
    const dir = makeTmpFixture('exclude-segment-14', {
      '.git/objects/pack.txt': Buffer.from([0xEF, 0xBB, 0xBF, 0x68, 0x69]),
    });
    try {
      const r = runLinter(['--dir', dir]);
      assert.equal(r.status, 0, `Expected exit 0 (.git/ should be skipped); got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

});
