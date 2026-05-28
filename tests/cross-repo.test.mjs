// tests/cross-repo.test.mjs
//
// CS56 — `harness cross-repo` CLI guardrail tests (T5; 20 cases).
//
// Strategy: Drive `openIssue()` from `lib/cross-repo.mjs` and the
// `harness cross-repo open-issue` CLI through fake-`gh` shims. The shims are
// Node scripts written under `os.tmpdir()` per LRN-094 (never REPO_ROOT) and
// injected via the `HARNESS_CROSS_REPO_GH_BIN` env var (D56-10). The library's
// `runGh` detects .mjs paths and spawns them via `process.execPath` so tests
// don't have to manage POSIX +x bits or Windows .cmd wrappers.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { openIssue, CrossRepoError } from '../lib/cross-repo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS_BIN = path.join(REPO_ROOT, 'bin', 'harness.mjs');

// Per LRN-094: scratch dirs live under os.tmpdir(), never under REPO_ROOT.
let scratch;
let bodyFile;
let recordFile;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cross-repo-'));
  bodyFile = path.join(scratch, 'body.md');
  fs.writeFileSync(bodyFile, '# test body\n\nhello\n');
});

after(() => {
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

beforeEach(() => {
  recordFile = path.join(scratch, `record-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
});

/**
 * Write a fake-gh.mjs shim that:
 *  - Appends every invocation's argv to `recordFile` as a JSONL line.
 *  - For each invocation, picks a response from `responses` based on the
 *    matcher predicate. The first matching response is used.
 *  - If no response matches, prints "fake-gh: unexpected args ..." to stderr
 *    and exits 1.
 *
 * Each response has shape { match: (args) => bool, stdout?: string,
 * stderr?: string, exit?: number }.
 */
function writeFakeGh(responses) {
  const shimPath = path.join(scratch, `fake-gh-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  const src = [
    '#!/usr/bin/env node',
    'import fs from "node:fs";',
    `const recordFile = ${JSON.stringify(recordFile)};`,
    `const responses = ${JSON.stringify(responses.map((r) => ({
      matchSrc: r.match.toString(),
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      exit: typeof r.exit === 'number' ? r.exit : 0,
    })))};`,
    'const args = process.argv.slice(2);',
    'fs.appendFileSync(recordFile, JSON.stringify(args) + "\\n");',
    'for (const r of responses) {',
    '  // eslint-disable-next-line no-new-func',
    '  const matcher = new Function("return (" + r.matchSrc + ")")();',
    '  if (matcher(args)) {',
    '    if (r.stdout) process.stdout.write(r.stdout);',
    '    if (r.stderr) process.stderr.write(r.stderr);',
    '    process.exit(r.exit);',
    '  }',
    '}',
    'process.stderr.write("fake-gh: unexpected args " + args.join(" ") + "\\n");',
    'process.exit(1);',
  ].join('\n');
  fs.writeFileSync(shimPath, src);
  return shimPath;
}

function readRecord() {
  if (!fs.existsSync(recordFile)) return [];
  return fs
    .readFileSync(recordFile, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [HARNESS_BIN, 'cross-repo', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

// Match helpers for fake-gh responses. (Stored as function source via
// .toString() and rehydrated inside the shim, so they MUST be self-contained
// pure functions referencing only their own argv argument.)
const matchLabelCreate = (args) => args[0] === 'label' && args[1] === 'create';
const matchIssueList = (args) => args[0] === 'issue' && args[1] === 'list';
const matchIssueCreate = (args) => args[0] === 'issue' && args[1] === 'create';

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('cross-repo open-issue — CLI argument validation', () => {
  it('1. requires --repo, --title, and --body-file flags (each missing exits 2)', () => {
    const cases = [
      ['open-issue', '--title', 't', '--body-file', bodyFile],
      ['open-issue', '--repo', 'foo/bar', '--body-file', bodyFile],
      ['open-issue', '--repo', 'foo/bar', '--title', 't'],
    ];
    for (const args of cases) {
      const r = runCli(args);
      assert.strictEqual(r.status, 2, `expected exit 2 for ${args.join(' ')}; got ${r.status}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /cross-repo open-issue:.*required/);
    }
  });

  it('2. rejects henrik-me/agent-harness self-loop repo (case-insensitive)', () => {
    const variants = [
      'henrik-me/agent-harness',
      'Henrik-Me/agent-harness',
      'HENRIK-ME/AGENT-HARNESS',
      'henrik-me/Agent-Harness',
    ];
    for (const repo of variants) {
      const r = runCli(['open-issue', '--repo', repo, '--title', 't', '--body-file', bodyFile]);
      assert.strictEqual(r.status, 2, `expected exit 2 for ${repo}; got ${r.status}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /refuses henrik-me\/agent-harness/i);
    }
  });

  it('3. rejects malformed repo slugs', () => {
    const cases = ['foo', 'foo/bar/baz', 'foo/', '/bar', 'no slash here'];
    for (const repo of cases) {
      const r = runCli(['open-issue', '--repo', repo, '--title', 't', '--body-file', bodyFile]);
      assert.strictEqual(r.status, 2, `expected exit 2 for repo='${repo}'; got ${r.status}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /invalid --repo/);
    }
  });

  it('4. --body-file rejects missing path (exit 1, body-file-missing)', () => {
    const missing = path.join(scratch, 'definitely-does-not-exist.md');
    const r = runCli(['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', missing]);
    assert.strictEqual(r.status, 1, `expected exit 1; got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /body-file not found|--body-file not found/);
  });

  it('5. --body-file rejects non-file path (directory)', () => {
    // scratch itself is a directory.
    const r = runCli(['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', scratch]);
    assert.strictEqual(r.status, 1, `expected exit 1; got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /not a regular file/);
  });

  it('18. rejects blank/whitespace-only --title', () => {
    for (const title of ['', '   ', '\t\n']) {
      const r = runCli(['open-issue', '--repo', 'foo/bar', '--title', title, '--body-file', bodyFile]);
      assert.strictEqual(r.status, 2, `expected exit 2 for title='${JSON.stringify(title)}'; got ${r.status}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /title must be non-empty|non-empty/i);
    }
  });

  it('19. rejects blank/whitespace-only --label values', () => {
    const cases = [
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile, '--label', ''],
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile, '--label', '   '],
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile, '--label', 'good', '--label', ''],
    ];
    for (const args of cases) {
      const r = runCli(args);
      assert.strictEqual(r.status, 2, `expected exit 2; got ${r.status}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /label.*non-empty|non-empty.*label/i);
    }
  });
});

describe('cross-repo open-issue — happy path & idempotency (CLI)', () => {
  it('6. happy path: empty issue list + successful create → stdout=<url>\\n, exit 0', () => {
    const url = 'https://github.com/foo/bar/issues/123';
    const fakeGh = writeFakeGh([
      { match: matchLabelCreate, exit: 0 },
      { match: matchIssueList, stdout: '[]', exit: 0 },
      { match: matchIssueCreate, stdout: `${url}\n`, exit: 0 },
    ]);
    const r = runCli(
      ['open-issue', '--repo', 'foo/bar', '--title', 'My issue', '--body-file', bodyFile],
      { HARNESS_CROSS_REPO_GH_BIN: fakeGh }
    );
    assert.strictEqual(r.status, 0, `expected exit 0; stderr=${r.stderr}`);
    assert.strictEqual(r.stdout, `${url}\n`);
    assert.strictEqual(r.stderr, '');
  });

  it('7. existing exact-title open issue: print URL to stdout + note to stderr; no create', () => {
    const url = 'https://github.com/foo/bar/issues/42';
    const fakeGh = writeFakeGh([
      { match: matchIssueList, stdout: JSON.stringify([{ title: 'My issue', url, number: 42 }]), exit: 0 },
      // No issue create response on purpose: if invoked it would fall through to default-fail.
    ]);
    const r = runCli(
      ['open-issue', '--repo', 'foo/bar', '--title', 'My issue', '--body-file', bodyFile],
      { HARNESS_CROSS_REPO_GH_BIN: fakeGh }
    );
    assert.strictEqual(r.status, 0, `expected exit 0; stderr=${r.stderr}`);
    assert.strictEqual(r.stdout, `${url}\n`);
    assert.match(r.stderr, /existing open issue matched; no new issue created/);
    const record = readRecord();
    assert.ok(!record.some((argv) => argv[0] === 'issue' && argv[1] === 'create'),
      `expected no issue create call; got record=${JSON.stringify(record)}`);
  });
});

describe('openIssue — library-level behavior', () => {
  it('8. closed exact-title issues are filtered out (--state open) → new issue created', () => {
    // The library only calls `gh issue list --state open ...`. The fake-gh
    // returns [] in response, simulating GitHub's filtering of closed issues.
    const url = 'https://github.com/foo/bar/issues/777';
    const fakeGh = writeFakeGh([
      { match: matchLabelCreate, exit: 0 },
      { match: (args) => args[0] === 'issue' && args[1] === 'list' && args.includes('--state') && args[args.indexOf('--state') + 1] === 'open', stdout: '[]', exit: 0 },
      { match: matchIssueCreate, stdout: `${url}\n`, exit: 0 },
    ]);
    process.env.HARNESS_CROSS_REPO_GH_BIN = fakeGh;
    try {
      const result = openIssue({ repo: 'foo/bar', title: 'closed-then-new', bodyFile, labels: [] });
      assert.strictEqual(result.url, url);
      assert.strictEqual(result.created, true);
      const record = readRecord();
      const listCall = record.find((argv) => argv[0] === 'issue' && argv[1] === 'list');
      assert.ok(listCall, `expected issue list to be invoked; record=${JSON.stringify(record)}`);
      const stateIdx = listCall.indexOf('--state');
      assert.notStrictEqual(stateIdx, -1, '--state flag missing from issue list call');
      assert.strictEqual(listCall[stateIdx + 1], 'open', 'issue list must filter by --state open');
      const createCall = record.find((argv) => argv[0] === 'issue' && argv[1] === 'create');
      assert.ok(createCall, 'expected issue create to be invoked after empty list');
    } finally {
      delete process.env.HARNESS_CROSS_REPO_GH_BIN;
    }
  });

  it('9. default harness-orchestrator label applied when --label omitted (exactly once)', () => {
    const url = 'https://github.com/foo/bar/issues/9';
    const fakeGh = writeFakeGh([
      { match: matchLabelCreate, exit: 0 },
      { match: matchIssueList, stdout: '[]', exit: 0 },
      { match: matchIssueCreate, stdout: `${url}\n`, exit: 0 },
    ]);
    process.env.HARNESS_CROSS_REPO_GH_BIN = fakeGh;
    try {
      openIssue({ repo: 'foo/bar', title: 'label-default', bodyFile, labels: [] });
      const record = readRecord();
      const createCall = record.find((argv) => argv[0] === 'issue' && argv[1] === 'create');
      assert.ok(createCall, `issue create missing from record=${JSON.stringify(record)}`);
      // Count --label flags in argv.
      const labelFlags = createCall.reduce((acc, tok, i) => {
        if (tok === '--label' && createCall[i + 1] === 'harness-orchestrator') acc.harnessOrch++;
        if (tok === '--label') acc.total++;
        return acc;
      }, { total: 0, harnessOrch: 0 });
      assert.strictEqual(labelFlags.harnessOrch, 1, `expected exactly one --label harness-orchestrator; argv=${JSON.stringify(createCall)}`);
      assert.strictEqual(labelFlags.total, 1, `expected exactly one --label flag total; argv=${JSON.stringify(createCall)}`);
    } finally {
      delete process.env.HARNESS_CROSS_REPO_GH_BIN;
    }
  });

  it('10. repeated --label values append after default (default first)', () => {
    const url = 'https://github.com/foo/bar/issues/10';
    const fakeGh = writeFakeGh([
      { match: matchLabelCreate, exit: 0 },
      { match: matchIssueList, stdout: '[]', exit: 0 },
      { match: matchIssueCreate, stdout: `${url}\n`, exit: 0 },
    ]);
    process.env.HARNESS_CROSS_REPO_GH_BIN = fakeGh;
    try {
      openIssue({
        repo: 'foo/bar',
        title: 'label-multi',
        bodyFile,
        labels: ['harness-sync', 'release-blocker'],
      });
      const record = readRecord();
      const createCall = record.find((argv) => argv[0] === 'issue' && argv[1] === 'create');
      // Extract label values in order.
      const labelValues = [];
      for (let i = 0; i < createCall.length; i++) {
        if (createCall[i] === '--label') labelValues.push(createCall[i + 1]);
      }
      assert.deepStrictEqual(labelValues, ['harness-orchestrator', 'harness-sync', 'release-blocker'],
        `labels not in expected order; got=${JSON.stringify(labelValues)}`);
    } finally {
      delete process.env.HARNESS_CROSS_REPO_GH_BIN;
    }
  });

  it('11. fails closed when gh binary is missing (gh-failed, exit 1)', () => {
    const missingBin = path.join(scratch, 'does-not-exist-gh-bin');
    const r = runCli(
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile],
      { HARNESS_CROSS_REPO_GH_BIN: missingBin }
    );
    assert.strictEqual(r.status, 1, `expected exit 1; got ${r.status}\nstderr=${r.stderr}`);
    assert.match(r.stderr, /gh.*not found|spawn/i);
  });

  it('12. fails closed on gh auth/permission failure (gh-failed, exit 1)', () => {
    const fakeGh = writeFakeGh([
      { match: matchIssueList, stderr: 'HTTP 403: forbidden\n', exit: 1 },
    ]);
    const r = runCli(
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile],
      { HARNESS_CROSS_REPO_GH_BIN: fakeGh }
    );
    assert.strictEqual(r.status, 1, `expected exit 1; got ${r.status}\nstderr=${r.stderr}`);
    assert.match(r.stderr, /HTTP 403: forbidden|issue list failed/);
  });

  it('13. fails closed on malformed JSON from gh issue list (parse-failed, exit 1)', () => {
    const fakeGh = writeFakeGh([
      { match: matchIssueList, stdout: 'not-json', exit: 0 },
    ]);
    const r = runCli(
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile],
      { HARNESS_CROSS_REPO_GH_BIN: fakeGh }
    );
    assert.strictEqual(r.status, 1, `expected exit 1; got ${r.status}\nstderr=${r.stderr}`);
    assert.match(r.stderr, /malformed JSON|parse/i);
  });
});

describe('cross-repo — surface', () => {
  it('14. exposes no open-pr action (exit 2; --help omits open-pr)', () => {
    const r = runCli(['open-pr', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile]);
    assert.strictEqual(r.status, 2, `expected exit 2; got ${r.status}\nstderr=${r.stderr}`);
    assert.match(r.stderr, /unknown action 'open-pr'/);

    const help = runCli(['--help']);
    assert.strictEqual(help.status, 0);
    assert.ok(!/^[^\n]*\bopen-pr\b/m.test(help.stdout.replace(/No 'open-pr'.*$/m, '')),
      "help should not advertise open-pr as a valid action");
  });
});

describe('openIssue — label preflight (D56-3)', () => {
  it('15. runs label preflight BEFORE issue create; NO --force; multi-label sequence preserved', () => {
    const url = 'https://github.com/foo/bar/issues/15';
    const fakeGh = writeFakeGh([
      { match: matchLabelCreate, exit: 0 },
      { match: matchIssueList, stdout: '[]', exit: 0 },
      { match: matchIssueCreate, stdout: `${url}\n`, exit: 0 },
    ]);
    process.env.HARNESS_CROSS_REPO_GH_BIN = fakeGh;
    try {
      openIssue({
        repo: 'foo/bar',
        title: 'preflight-order',
        bodyFile,
        labels: ['extra-label'],
      });
      const record = readRecord();
      const idxLabel1 = record.findIndex((argv) => matchLabelCreate(argv) && argv.includes('harness-orchestrator'));
      const idxLabel2 = record.findIndex((argv) => matchLabelCreate(argv) && argv.includes('extra-label'));
      const idxCreate = record.findIndex((argv) => matchIssueCreate(argv));
      assert.notStrictEqual(idxLabel1, -1, 'harness-orchestrator label preflight missing');
      assert.notStrictEqual(idxLabel2, -1, 'extra-label preflight missing');
      assert.notStrictEqual(idxCreate, -1, 'issue create missing');
      assert.ok(idxLabel1 < idxCreate && idxLabel2 < idxCreate,
        `label preflights must run before issue create; record=${JSON.stringify(record)}`);
      assert.ok(idxLabel1 < idxLabel2,
        'harness-orchestrator must be preflighted before extra-label (default-first order)');
      // No --force anywhere.
      for (const argv of record.filter(matchLabelCreate)) {
        assert.ok(!argv.includes('--force'),
          `label preflight must NOT use --force; argv=${JSON.stringify(argv)}`);
      }
    } finally {
      delete process.env.HARNESS_CROSS_REPO_GH_BIN;
    }
  });

  it('16. fails closed when label preflight cannot provision label (non-already-exists)', () => {
    const fakeGh = writeFakeGh([
      // issue list runs first (before label preflight), so it must succeed.
      { match: matchIssueList, stdout: '[]', exit: 0 },
      { match: matchLabelCreate, stderr: 'HTTP 403: forbidden\n', exit: 1 },
      // matchIssueCreate intentionally omitted; if invoked, default-fail.
    ]);
    const r = runCli(
      ['open-issue', '--repo', 'foo/bar', '--title', 't', '--body-file', bodyFile],
      { HARNESS_CROSS_REPO_GH_BIN: fakeGh }
    );
    assert.strictEqual(r.status, 1, `expected exit 1; got ${r.status}\nstderr=${r.stderr}`);
    assert.match(r.stderr, /label.*failed|HTTP 403/);
    // Ensure no issue create was attempted.
    const record = readRecord();
    assert.ok(!record.some(matchIssueCreate),
      `expected no issue create; record=${JSON.stringify(record)}`);
  });

  it('17. treats "already exists" label-preflight stderr as success; proceeds to issue create', () => {
    const url = 'https://github.com/foo/bar/issues/17';
    const fakeGh = writeFakeGh([
      {
        match: matchLabelCreate,
        stderr: '! a label with this name already exists; not modifying it\n',
        exit: 1,
      },
      { match: matchIssueList, stdout: '[]', exit: 0 },
      { match: matchIssueCreate, stdout: `${url}\n`, exit: 0 },
    ]);
    process.env.HARNESS_CROSS_REPO_GH_BIN = fakeGh;
    try {
      const result = openIssue({ repo: 'foo/bar', title: 'preflight-already-exists', bodyFile, labels: [] });
      assert.strictEqual(result.url, url);
      assert.strictEqual(result.created, true);
      // No --force retry attempted.
      const record = readRecord();
      const labelCalls = record.filter(matchLabelCreate);
      assert.strictEqual(labelCalls.length, 1, `expected exactly one label preflight call (no --force retry); got ${labelCalls.length}`);
      assert.ok(!labelCalls[0].includes('--force'), '--force must NOT be used on retry');
    } finally {
      delete process.env.HARNESS_CROSS_REPO_GH_BIN;
    }
  });
});

describe('openIssue — issue create stdout parsing (D56-2 / Copilot R12)', () => {
  it('20. fails closed when gh issue create stdout is empty/whitespace/non-URL', () => {
    const cases = [
      { name: 'empty stdout', stdout: '' },
      { name: 'whitespace-only stdout', stdout: '   \n' },
      { name: 'non-URL text', stdout: 'created successfully\n' },
      { name: 'not-a-url single token', stdout: 'not-a-url' },
    ];
    for (const { name, stdout } of cases) {
      // Fresh recordFile per sub-case to keep state isolated.
      recordFile = path.join(scratch, `record-20-${name.replace(/\W+/g, '-')}.jsonl`);
      const fakeGh = writeFakeGh([
        { match: matchLabelCreate, exit: 0 },
        { match: matchIssueList, stdout: '[]', exit: 0 },
        { match: matchIssueCreate, stdout, exit: 0 },
      ]);
      process.env.HARNESS_CROSS_REPO_GH_BIN = fakeGh;
      try {
        let caught = null;
        try {
          openIssue({ repo: 'foo/bar', title: `parse-${name}`, bodyFile, labels: [] });
        } catch (err) {
          caught = err;
        }
        assert.ok(caught, `expected throw for ${name}; got none`);
        assert.ok(caught instanceof CrossRepoError, `expected CrossRepoError for ${name}; got ${caught.constructor.name}`);
        assert.strictEqual(caught.kind, 'parse-failed', `expected kind=parse-failed for ${name}; got ${caught.kind}`);
        // Message should reference the unexpected output.
        assert.match(caught.message, /empty|non-URL|non-http/i,
          `error message should reference the parsing problem; got: ${caught.message}`);
      } finally {
        delete process.env.HARNESS_CROSS_REPO_GH_BIN;
      }
    }
  });
});
