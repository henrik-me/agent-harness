/**
 * tests/cs12-workflows.test.mjs — CS12: reusable workflow + drift template.
 *
 * Scope (per CS12 § Tests):
 *   - .github/workflows/harness-checks.yml (reusable)
 *   - .github/workflows/harness-self-check-via-reusable.yml (self-host integration)
 *   - template/managed/.github/workflows/harness-drift.yml (drift template)
 *
 * Asserts on workflow_call shape, action SHA pinning, drift exit-code handling,
 * permissions block, peter-evans/create-pull-request invocation, placeholder-
 * quoting, and self-host github.sha cli-ref.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const REUSABLE = path.join(REPO_ROOT, '.github', 'workflows', 'harness-checks.yml');
const SELF_HOST = path.join(REPO_ROOT, '.github', 'workflows', 'harness-self-check-via-reusable.yml');
const DRIFT = path.join(REPO_ROOT, 'template', 'managed', '.github', 'workflows', 'harness-drift.yml');

function loadYaml(p) {
  // Note: 'on' is a YAML truthy keyword without quotes, so `load()` may
  // produce an `on:` key as the boolean `true`. To stay neutral, use the raw
  // doc shape via `load(text)` — js-yaml in the project's version handles this
  // by string-keying when YAML 1.1 disambiguation flags are off.
  return yaml.load(readFileSync(p, 'utf8'));
}

function loadText(p) {
  return readFileSync(p, 'utf8');
}

// SHA-pinning regex: third-party `uses:` entries should be pinned to a 40-char
// lowercase hex SHA. Format: `<owner>/<repo>[/path]@<40-hex>`.
const THIRD_PARTY_PINNED_RE = /^[a-z0-9._-]+\/[a-z0-9._-]+(\/[^@]+)?@[0-9a-f]{40}$/i;

// "Internal" refs to skip third-party pinning (this repo's own reusable workflow,
// invoked by relative path `./.github/workflows/...`).
function isInternalRef(usesValue) {
  return typeof usesValue === 'string' && usesValue.startsWith('./');
}

function extractUsesRefs(workflow) {
  const refs = [];
  function walk(node) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'uses' && typeof v === 'string') refs.push(v);
        else walk(v);
      }
    }
  }
  walk(workflow);
  return refs;
}

describe('CS12 — reusable workflow harness-checks.yml', () => {
  it('parses as valid YAML', () => {
    const doc = loadYaml(REUSABLE);
    assert.ok(doc && typeof doc === 'object', 'workflow document must be a non-empty object');
  });

  it('declares workflow_call with optional cli-ref input', () => {
    const text = loadText(REUSABLE);
    assert.match(text, /workflow_call/, 'must declare on.workflow_call');
    assert.match(text, /cli-ref/, 'must declare cli-ref input');
  });

  it('invokes harness via authenticated git clone + node bin/harness.mjs (npm 10.8/10.9 GitFetcher workaround)', () => {
    const text = loadText(REUSABLE);
    // NOTE: the original CS12 design used `npx -y "github:owner/repo#<ref>"` per
    // the cs-plan Option B install pattern. After CS14 a regression in npm 10.8.x
    // (and 10.9.x) broke that path with `npm error GitFetcher requires an Arborist
    // constructor to pack a tarball`. The reusable workflow now clones + runs
    // directly to bypass the broken npm git fetcher; functional intent is identical.
    assert.match(
      text,
      /git\s+clone[^\n]*github\.com\/henrik-me\/agent-harness/,
      'reusable workflow must clone the harness repo from github.com/henrik-me/agent-harness'
    );
    assert.match(
      text,
      /git\s+checkout\s+(--quiet\s+)?["']?\$\{?CLI_REF\}?["']?/,
      'reusable workflow must checkout the validated CLI_REF env value'
    );
    assert.match(
      text,
      /node\s+bin\/harness\.mjs\s+lint/,
      'reusable workflow must invoke the harness CLI via node bin/harness.mjs lint after cloning'
    );
    assert.doesNotMatch(
      text,
      /npx\s+harness\b/,
      'reusable workflow must NOT use bare `npx harness` (the package is not on npm)'
    );
  });

  it('all third-party `uses:` refs are pinned to 40-char lowercase hex SHAs', () => {
    const doc = loadYaml(REUSABLE);
    const refs = extractUsesRefs(doc).filter((r) => !isInternalRef(r));
    assert.ok(refs.length > 0, 'expected at least one third-party action use');
    for (const ref of refs) {
      assert.match(
        ref,
        THIRD_PARTY_PINNED_RE,
        `third-party uses ref must be SHA-pinned: ${ref}`
      );
    }
  });
});

describe('CS12 — self-host integration harness-self-check-via-reusable.yml', () => {
  it('parses as valid YAML', () => {
    const doc = loadYaml(SELF_HOST);
    assert.ok(doc && typeof doc === 'object');
  });

  it('calls the reusable workflow via relative path', () => {
    const text = loadText(SELF_HOST);
    assert.match(
      text,
      /uses:\s*\.\/\.github\/workflows\/harness-checks\.yml/,
      'self-host integration must reference reusable workflow by relative path'
    );
  });

  it('passes cli-ref: ${{ github.event.pull_request.head.sha }} (PR head SHA, NOT merge SHA)', () => {
    const text = loadText(SELF_HOST);
    // Per the post-CS12 fix: github.sha on pull_request events resolves to
    // the synthetic merge-commit SHA on refs/pull/<N>/merge, which is NOT
    // npx-fetchable (exits 128). github.event.pull_request.head.sha is the
    // PR's actual head commit on the contributor's branch, which IS
    // fetchable AND is the right value to smoke-test (it's what would land
    // on main if the PR squash-merged this instant).
    assert.match(
      text,
      /cli-ref:\s*["']?\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}["']?/,
      'self-host MUST use github.event.pull_request.head.sha as cli-ref (PR head SHA is npx-fetchable; merge-commit SHA is not)'
    );
    // Belt-and-suspenders: the bare `github.sha` form should NOT appear in
    // the cli-ref position (only inside comments / rationale text is fine).
    assert.doesNotMatch(
      text,
      /cli-ref:\s*["']?\$\{\{\s*github\.sha\s*\}\}["']?/,
      'self-host MUST NOT use bare github.sha as cli-ref (resolves to unfetchable merge-commit SHA on pull_request events)'
    );
  });
});

describe('CS12 — drift template harness-drift.yml', () => {
  it('parses as valid YAML even with {{...}} placeholders intact', () => {
    const doc = loadYaml(DRIFT);
    assert.ok(doc && typeof doc === 'object', 'unrendered template must parse cleanly');
  });

  it('schedules weekly via cron 0 6 * * 1 (Monday 06:00 UTC)', () => {
    const text = loadText(DRIFT);
    assert.match(text, /cron:\s*["']?0 6 \* \* 1["']?/, 'must declare weekly Monday 06:00 UTC cron');
  });

  it('declares permissions: contents: write + pull-requests: write', () => {
    const text = loadText(DRIFT);
    assert.match(text, /permissions:/, 'must declare permissions block');
    assert.match(text, /contents:\s*write/, 'must declare contents: write (for create-pull-request to push branch)');
    assert.match(text, /pull-requests:\s*write/, 'must declare pull-requests: write');
  });

  it('uses peter-evans/create-pull-request pinned to a 40-char SHA', () => {
    const text = loadText(DRIFT);
    assert.match(
      text,
      /peter-evans\/create-pull-request@[0-9a-f]{40}/,
      'drift workflow must pin peter-evans/create-pull-request to a SHA'
    );
  });

  it('invokes harness sync via npx -y github: install pattern', () => {
    const text = loadText(DRIFT);
    // Pattern: `npx -y "github:henrik-me/agent-harness#<anything>" sync --mode=check ...`
    // The <anything> between # and the closing quote may include `${{ ... }}` which
    // contains whitespace, dots, and braces — so we use a non-greedy `.+?` and
    // require the trailing closing quote + sync invocation as the anchor.
    assert.match(
      text,
      /npx\s+-y\s+"github:henrik-me\/agent-harness#.+?"\s+sync\s+--mode=check/,
      'drift workflow must use github: install pattern with sync --mode=check'
    );
    assert.doesNotMatch(
      text,
      /npx\s+harness\s+sync/,
      'drift workflow must NOT use bare `npx harness` (the package is not on npm)'
    );
  });

  it('captures sync exit code explicitly and gates apply/PR on drift_detected', () => {
    const text = loadText(DRIFT);
    // Look for explicit rc capture pattern + drift_detected output.
    assert.match(text, /rc=\$\?/, 'must capture exit code with rc=$?');
    assert.match(text, /drift_detected/, 'must emit drift_detected step output');
    assert.match(
      text,
      /if:\s*steps\.[a-z-]+\.outputs\.drift_detected\s*==\s*['"]true['"]/,
      'apply/PR steps must be gated on drift_detected == true'
    );
  });

  it('drift template ref-derivation falls back to github.sha ONLY for self-host (CS12 R1+R2 gate fix)', () => {
    const text = loadText(DRIFT);
    // The fallback must be guarded by repo check (now via env GH_REPO).
    assert.match(text, /0\.0\.0-pre/, 'must reference 0.0.0-pre version sentinel');
    assert.match(text, /\$\{\{\s*github\.sha\s*\}\}/, 'must have github.sha fallback (passed via env GH_SHA)');
    assert.match(
      text,
      /\$GH_REPO["']?\s*=\s*["']henrik-me\/agent-harness/,
      'fallback must be guarded by $GH_REPO == henrik-me/agent-harness check'
    );
    // Fail-loud branch for unguarded consumer cases.
    assert.match(
      text,
      /Pin a real semver tag/i,
      'must fail loudly with a clear error message for non-self-host consumers with unresolvable version'
    );
  });

});

describe('CS12 — drift template harness-drift.yml extra (R1 gate fix)', () => {
  it('reusable workflow declares least-privilege permissions: contents: read (R1 PR fix)', () => {
    const text = loadText(REUSABLE);
    assert.match(text, /permissions:/, 'must declare permissions block');
    assert.match(text, /contents:\s*read/, 'must declare contents: read');
  });

  it('reusable workflow validates cli-ref against allowlist regex before shell interpolation (R1 PR fix)', () => {
    const text = loadText(REUSABLE);
    // Allowlist regex must be present.
    assert.match(text, /\[a-zA-Z0-9\._\/-\]\+/, 'must validate ref via allowlist regex');
    // Ref must be passed via env, not direct ${{ ... }} interpolation in run.
    assert.match(text, /CLI_REF:\s*\$\{\{\s*steps\.derive-ref\.outputs\.ref\s*\}\}/, 'must pass CLI_REF via env');
    assert.match(text, /\$\{CLI_REF\}|"\$CLI_REF"/, 'must reference CLI_REF env var, not the GitHub expression directly');
  });

  it('drift template validates derived ref against allowlist regex before shell interpolation (R1 PR fix)', () => {
    const text = loadText(DRIFT);
    assert.match(text, /\[a-zA-Z0-9\._\/-\]\+/, 'must validate ref via allowlist regex');
    assert.match(text, /CLI_REF:\s*\$\{\{\s*steps\.derive-ref\.outputs\.ref\s*\}\}/, 'must pass CLI_REF via env in subsequent steps');
    assert.match(text, /\$\{CLI_REF\}/, 'must reference CLI_REF env var in npx invocation, not the GitHub expression directly');
    // GH_REPO + GH_SHA must also be passed via env (not direct ${{ ... }}).
    assert.match(text, /GH_REPO:\s*\$\{\{\s*github\.repository\s*\}\}/);
    assert.match(text, /GH_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/);
  });

});
