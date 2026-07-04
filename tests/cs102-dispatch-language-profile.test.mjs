/**
 * tests/cs102-dispatch-language-profile.test.mjs — CS102 (issue #423).
 *
 * The `harness dispatch` briefing preamble is split into a language-AGNOSTIC
 * managed core plus selectable language profiles (node default / dotnet). These
 * tests assert:
 *   - completeness of the node profile (no regression vs the pre-CS102 monolith:
 *     every ESM/npm/requireValue/schema/node-test/node-c convention survives);
 *   - the dotnet profile carries `dotnet build`/`dotnet test`/`.csproj` and NONE
 *     of the Node-specific tokens (`.mjs` / `npm install` / `requireValue`);
 *   - fail-closed parsing (unknown profile, missing split marker, malformed
 *     harness.config.json) surfaces a clear error + non-zero exit;
 *   - no dangling injection/split markers survive in any emitted briefing;
 *   - CLI flag/config resolution: `--language-profile` overrides
 *     `dispatch.language_profile`, which overrides the `node` default.
 *
 * Managed content is read-only from the on-repo OPERATIONS.md (rendered)
 * and template/composed/OPERATIONS.md (placeholder `{{harness_invoke}}`, so the
 * only place a Node token could appear in a dotnet briefing is a leak). CLI
 * tests that need a consumer checkout write into an OS temp dir (never a repo
 * path), mirroring the existing check-cs-plan / check-fixtures tests.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractLanguageProfile,
  emitBriefing,
  emitBriefingFromFile,
  LANGUAGE_PROFILES,
  DEFAULT_LANGUAGE_PROFILE,
} from '../lib/dispatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OPERATIONS_MD = path.join(REPO_ROOT, 'OPERATIONS.md');
const COMPOSED_OPS_MD = path.join(REPO_ROOT, 'template', 'composed', 'OPERATIONS.md');
const BIN = path.join(REPO_ROOT, 'bin', 'harness.mjs');

const ROOT_MD = readFileSync(OPERATIONS_MD, 'utf8');

/** Any dispatch injection or profile split marker (must never survive emit). */
const DANGLING_MARKER_RE =
  /<!--\s*harness:(dispatch-language-(conventions|self-checks)|profile-self-checks)\s*-->/;

/** Node-specific tokens that must NOT leak into a dotnet profile. */
const NODE_TOKENS = ['.mjs', 'npm install', 'requireValue', 'node --test', 'node -c'];

// ---------------------------------------------------------------------------
// Golden briefings — freeze the EXACT spliced node/dotnet output (CS102 C102-2a:
// the node profile is reordered vs the pre-CS102 monolith, so a stable golden
// guards against any silent drift beyond the token-completeness checks below).
//
// Regenerate after an intentional OPERATIONS.md § Mandatory briefing preamble
// edit, from the repo root:
//   node --input-type=module -e "const fs=await import('node:fs');const m=await import('./lib/dispatch.mjs');for(const p of ['node','dotnet'])fs.writeFileSync('tests/fixtures/cs102/'+p+'-briefing.golden.txt',m.emitBriefingFromFile({operationsPath:'OPERATIONS.md',includeFence:false,languageProfile:p}).replace(/\r\n/g,'\n'))"
// ---------------------------------------------------------------------------

const GOLDEN_DIR = path.join(__dirname, 'fixtures', 'cs102');

for (const profile of ['node', 'dotnet']) {
  test(`golden: ${profile} profile briefing is byte-stable (C102-2a)`, () => {
    const expected = readFileSync(
      path.join(GOLDEN_DIR, `${profile}-briefing.golden.txt`),
      'utf8'
    ).replace(/\r\n/g, '\n');
    const actual = emitBriefingFromFile({
      operationsPath: OPERATIONS_MD,
      includeFence: false,
      languageProfile: profile,
    }).replace(/\r\n/g, '\n');
    assert.equal(
      actual,
      expected,
      `${profile} briefing drifted from the golden. If the OPERATIONS.md preamble ` +
        `changed intentionally, regenerate tests/fixtures/cs102/${profile}-briefing.golden.txt ` +
        `(see the header comment).`
    );
  });
}

// ---------------------------------------------------------------------------
// exports / constants
// ---------------------------------------------------------------------------

test('LANGUAGE_PROFILES lists node (default, first) then dotnet', () => {
  assert.deepEqual(LANGUAGE_PROFILES, ['node', 'dotnet']);
  assert.equal(DEFAULT_LANGUAGE_PROFILE, 'node');
  assert.equal(LANGUAGE_PROFILES[0], DEFAULT_LANGUAGE_PROFILE);
});

// ---------------------------------------------------------------------------
// extractLanguageProfile — parsing + fail-closed
// ---------------------------------------------------------------------------

test('extractLanguageProfile(node) returns conventions + self-checks with sub-headings stripped', () => {
  const { conventions, selfChecks } = extractLanguageProfile(ROOT_MD, 'node');
  assert.ok(conventions.length > 0, 'conventions non-empty');
  assert.ok(selfChecks.length > 0, 'selfChecks non-empty');
  // The `### conventions` / `### self-checks` sub-headings and the split marker
  // are lifted out so the parts splice directly under the core headings.
  assert.ok(!conventions.includes('### conventions'));
  assert.ok(!selfChecks.includes('### self-checks'));
  assert.ok(!conventions.includes('harness:profile-self-checks'));
  assert.ok(!selfChecks.includes('harness:profile-self-checks'));
});

test('extractLanguageProfile(dotnet) region carries dotnet tooling and NO Node tokens', () => {
  const { conventions, selfChecks } = extractLanguageProfile(ROOT_MD, 'dotnet');
  const region = `${conventions}\n${selfChecks}`;
  for (const tok of NODE_TOKENS) {
    assert.ok(!region.includes(tok), `dotnet profile region must not contain "${tok}"`);
  }
  assert.match(region, /dotnet build/);
  assert.match(region, /dotnet test/);
  assert.match(region, /dotnet format/);
  assert.match(region, /\.csproj/);
  assert.match(region, /Directory\.Packages\.props/);
});

test('extractLanguageProfile throws on an unknown profile', () => {
  assert.throws(
    () => extractLanguageProfile(ROOT_MD, 'bogus'),
    /language profile "bogus" not found/
  );
});

test('extractLanguageProfile throws when the split marker is missing', () => {
  const md = [
    '```text',
    '## LANGUAGE PROFILE: node',
    '### conventions',
    '- a convention',
    '### self-checks',
    '2. a self-check',
    '```',
  ].join('\n');
  assert.throws(() => extractLanguageProfile(md, 'node'), /missing the .*split marker/);
});

test('extractLanguageProfile throws on an unterminated profile fence', () => {
  const md = ['```text', '## LANGUAGE PROFILE: node', '### conventions', '- a convention'].join('\n');
  assert.throws(() => extractLanguageProfile(md, 'node'), /no matching closing ``` fence/);
});

test('extractLanguageProfile validates its inputs (fail-closed)', () => {
  assert.throws(() => extractLanguageProfile(42, 'node'), /must be a string/);
  assert.throws(() => extractLanguageProfile(ROOT_MD, ''), /non-empty string/);
});

// ---------------------------------------------------------------------------
// node profile completeness (no regression vs the pre-CS102 monolith)
// ---------------------------------------------------------------------------

test('node profile briefing retains every pre-CS102 convention + self-check', () => {
  const out = emitBriefing({ operationsMd: ROOT_MD, includeFence: false, languageProfile: 'node' });
  // Node conventions.
  assert.match(out, /ESM `\.mjs`/);
  assert.match(out, /npm install/);
  assert.match(out, /requireValue/);
  assert.match(out, /schemas\/\*\.schema\.json/); // schema-first
  assert.match(out, /Stdout for success/); // stdout/stderr discipline
  assert.match(out, /Consumer-root-relative paths/);
  // Node self-checks.
  assert.match(out, /node --test/);
  assert.match(out, /node -c/);
  // Agnostic core retained for the node profile too.
  assert.match(out, /LF line endings/);
  assert.match(out, /Fail-closed parsers/);
});

test('the default profile output is identical to the explicit node profile', () => {
  const dflt = emitBriefing({ operationsMd: ROOT_MD, includeFence: false });
  const node = emitBriefing({ operationsMd: ROOT_MD, includeFence: false, languageProfile: 'node' });
  assert.equal(dflt, node);
});

// ---------------------------------------------------------------------------
// dotnet profile content + strict Node-token exclusion
// ---------------------------------------------------------------------------

test('dotnet briefing (composed template) contains NONE of .mjs / npm install / requireValue', () => {
  // The composed template keeps `{{harness_invoke}}` unrendered, so the core's
  // agnostic lint self-check has no literal `.mjs`. Any Node token in this
  // output would therefore be a leak from the node conventions — assert none.
  const out = emitBriefingFromFile({
    operationsPath: COMPOSED_OPS_MD,
    includeFence: false,
    languageProfile: 'dotnet',
  });
  for (const tok of ['.mjs', 'npm install', 'requireValue']) {
    assert.ok(!out.includes(tok), `dotnet briefing must not contain "${tok}"`);
  }
  assert.match(out, /dotnet build/);
  assert.match(out, /dotnet test/);
  assert.match(out, /\.csproj/);
});

test('dotnet briefing (rendered root) drops the node file-extension convention', () => {
  // The rendered root's core lint self-check is `node bin/harness.mjs lint`
  // (agnostic harness invocation), so a bare `.mjs` legitimately appears there.
  // The backtick-quoted `.mjs` node convention must NOT — assert on that form.
  const out = emitBriefing({ operationsMd: ROOT_MD, includeFence: false, languageProfile: 'dotnet' });
  assert.ok(!out.includes('`.mjs`'), 'no backtick-quoted `.mjs` node convention in dotnet output');
  assert.ok(!out.includes('npm install'));
  assert.ok(!out.includes('requireValue'));
  assert.match(out, /dotnet build/);
});

// ---------------------------------------------------------------------------
// no dangling markers + core sections, for BOTH profiles
// ---------------------------------------------------------------------------

for (const profile of LANGUAGE_PROFILES) {
  test(`emitBriefing(${profile}) leaves no dangling injection/split markers`, () => {
    const fenced = emitBriefing({ operationsMd: ROOT_MD, includeFence: true, languageProfile: profile });
    const bare = emitBriefing({ operationsMd: ROOT_MD, includeFence: false, languageProfile: profile });
    for (const out of [fenced, bare]) {
      assert.ok(!DANGLING_MARKER_RE.test(out), `dangling marker in ${profile} output`);
      assert.ok(!out.includes('<!-- harness:dispatch-language-conventions -->'));
      assert.ok(!out.includes('<!-- harness:dispatch-language-self-checks -->'));
      assert.ok(!out.includes('<!-- harness:profile-self-checks -->'));
    }
  });

  test(`emitBriefing(${profile}) preserves the agnostic core sections`, () => {
    const out = emitBriefing({ operationsMd: ROOT_MD, includeFence: false, languageProfile: profile });
    assert.match(out, /## CRITICAL PREFLIGHT \(LRN-021\)/);
    assert.match(out, /## File ownership \(LRN-016\)/);
    assert.match(out, /## Required reading/);
    assert.match(out, /## Reporting independence/);
    assert.match(out, /## Mandatory report shape/);
    assert.match(out, /## Conventions to follow/);
    assert.match(out, /## Self-checks before reporting/);
  });
}

// ---------------------------------------------------------------------------
// CLI (bin/harness.mjs dispatch): flags, config resolution, fail-closed
// ---------------------------------------------------------------------------

function runDispatch(args, cwd = REPO_ROOT) {
  const r = spawnSync(process.execPath, [BIN, 'dispatch', ...args], { cwd, encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Create a throwaway consumer checkout (OPERATIONS.md + optional config). */
function makeConsumer(configText) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cs102-dispatch-'));
  writeFileSync(path.join(dir, 'OPERATIONS.md'), ROOT_MD);
  if (configText !== undefined) {
    writeFileSync(path.join(dir, 'harness.config.json'), configText);
  }
  return dir;
}

test('CLI: default dispatch (no flag, no config) emits a node briefing, exit 0', () => {
  const dir = makeConsumer();
  try {
    const r = runDispatch(['--no-fence'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /## CRITICAL PREFLIGHT/);
    assert.match(r.stdout, /ESM `\.mjs`/);
    assert.ok(!DANGLING_MARKER_RE.test(r.stdout));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --language-profile dotnet emits the dotnet briefing, exit 0', () => {
  const dir = makeConsumer();
  try {
    const r = runDispatch(['--no-fence', '--language-profile', 'dotnet'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /dotnet build/);
    assert.ok(!r.stdout.includes('`.mjs`'));
    assert.ok(!DANGLING_MARKER_RE.test(r.stdout));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: unknown --language-profile exits 2 with a clear stderr error and no stdout', () => {
  const r = runDispatch(['--language-profile', 'bogus']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown --language-profile/i);
  assert.equal(r.stdout, '');
});

test('CLI: --language-profile with no value fails closed (flagValue guard, non-zero)', () => {
  const r = runDispatch(['--language-profile']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /missing value for --language-profile/);
});

test('CLI: malformed harness.config.json fails closed (non-zero, names the file, no stdout)', () => {
  const dir = makeConsumer('{ not valid json ');
  try {
    const r = runDispatch(['--no-fence'], dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /harness\.config\.json/);
    assert.equal(r.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: dispatch.language_profile in config selects the dotnet profile', () => {
  const dir = makeConsumer(JSON.stringify({ dispatch: { language_profile: 'dotnet' } }));
  try {
    const r = runDispatch(['--no-fence'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /dotnet build/);
    assert.ok(!r.stdout.includes('`.mjs`'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: --language-profile flag overrides dispatch.language_profile in config', () => {
  const dir = makeConsumer(JSON.stringify({ dispatch: { language_profile: 'dotnet' } }));
  try {
    const r = runDispatch(['--no-fence', '--language-profile', 'node'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ESM `\.mjs`/);
    assert.ok(!r.stdout.includes('dotnet build'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: an unknown dispatch.language_profile in config exits 2 (fail-closed)', () => {
  const dir = makeConsumer(JSON.stringify({ dispatch: { language_profile: 'ruby' } }));
  try {
    const r = runDispatch(['--no-fence'], dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown --language-profile/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
