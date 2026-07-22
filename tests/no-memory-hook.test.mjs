// Behavior: the .github/hooks/no-memory.json PreToolUse hook denies the store_memory tool. Introduced by CS114 (agent-memory enforcement).
/**
 * tests/no-memory-hook.test.mjs
 *
 * Exercises the PreToolUse deny hook (.github/hooks/no-memory.mjs) through the
 * CONFIGURED command (`node .github/hooks/no-memory.mjs`) from the repo root,
 * piping the tool payload to stdin — the same contract the Copilot CLI uses.
 *
 * Covers: deny on the PascalCase (`tool_name`) and camelCase (`toolName`)
 * payload shapes, allow (empty stdout) for a non-memory tool, and fail-open
 * (empty stdout) for malformed / empty stdin. Also validates the hook config
 * JSON shape (matcher / command / cwd / timeoutSec).
 *
 * Any scratch lives under os.tmpdir() — never REPO_ROOT (LRN-094: REPO_ROOT
 * writes race check-text-encoding's recursive walk under parallel node --test).
 * These tests write no scratch at all; they only read committed files.
 *
 * Run: node --test tests/no-memory-hook.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const HOOK_CONFIG = path.join(REPO_ROOT, '.github', 'hooks', 'no-memory.json');

// Derive the execution from the CONFIGURED command + cwd (not a hard-coded
// copy), so a wrong command / cwd in no-memory.json is caught by these tests.
const HOOK_ENTRY = JSON.parse(readFileSync(HOOK_CONFIG, 'utf8')).hooks.PreToolUse[0];
const CMD_TOKENS = HOOK_ENTRY.command.split(/\s+/).filter(Boolean);
// The command is `node <script>`; run it with THIS node (process.execPath) so
// the test does not depend on `node` being on PATH.
const HOOK_ARGS = CMD_TOKENS.slice(1);
const HOOK_CWD = path.resolve(REPO_ROOT, HOOK_ENTRY.cwd);

/**
 * Run the hook via the CONFIGURED command from the configured cwd, feeding
 * `input` to stdin (spawnSync closes stdin after writing, giving EOF).
 *
 * @param {string} input
 * @returns {{ stdout: string, stderr: string, status: number, error: Error | undefined }}
 */
function runHook(input) {
  const r = spawnSync(NODE, HOOK_ARGS, {
    cwd: HOOK_CWD,
    input,
    encoding: 'utf8',
    shell: false,
  });
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    status: r.status ?? -1,
    error: r.error,
  };
}

// (a) PascalCase PreToolUse shape → deny + non-empty reason, exit 0.
test('(a) {tool_name:"store_memory"} → deny with a non-empty reason, exit 0', () => {
  const r = runHook(JSON.stringify({ tool_name: 'store_memory' }));
  assert.equal(r.error, undefined, `spawn error: ${r.error?.message}`);
  assert.equal(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  const trimmed = r.stdout.trim();
  assert.ok(trimmed.length > 0, 'stdout must not be empty for the target tool');
  // JSON.parse over the whole payload proves it is exactly ONE JSON value.
  const obj = JSON.parse(trimmed);
  assert.equal(obj.permissionDecision, 'deny');
  assert.ok(
    typeof obj.permissionDecisionReason === 'string' && obj.permissionDecisionReason.length > 0,
    'a deny decision requires a non-empty permissionDecisionReason',
  );
});

// (b) camelCase shape → same deny, exit 0 (the script handles both fields).
test('(b) {toolName:"store_memory"} → deny with a non-empty reason, exit 0', () => {
  const r = runHook(JSON.stringify({ toolName: 'store_memory' }));
  assert.equal(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  const obj = JSON.parse(r.stdout.trim());
  assert.equal(obj.permissionDecision, 'deny');
  assert.ok(obj.permissionDecisionReason.length > 0, 'non-empty reason required');
});

// (c) A non-memory tool → EMPTY stdout (allow), exit 0.
test('(c) {tool_name:"bash"} → empty stdout (allow), exit 0', () => {
  const r = runHook(JSON.stringify({ tool_name: 'bash' }));
  assert.equal(r.status, 0, `expected exit 0; stderr: ${r.stderr}`);
  assert.equal(r.stdout, '', 'a non-memory tool must produce no decision (allow)');
});

// (d) Malformed and empty stdin → EMPTY stdout (fail-open allow), exit 0.
test('(d) malformed / empty stdin → empty stdout (fail-open), exit 0', () => {
  const malformed = runHook('this is not json {');
  assert.equal(malformed.status, 0, `expected exit 0; stderr: ${malformed.stderr}`);
  assert.equal(malformed.stdout, '', 'malformed stdin must fail open (allow)');

  const empty = runHook('');
  assert.equal(empty.status, 0, `expected exit 0; stderr: ${empty.stderr}`);
  assert.equal(empty.stdout, '', 'empty stdin must fail open (allow)');
});

// Extra: the deny decision is a single-line JSON object (no truncation, no
// extra objects) — guards C114-3's synchronous-write / no-process.exit() rule.
test('deny output is a single-line JSON object', () => {
  const r = runHook(JSON.stringify({ tool_name: 'store_memory' }));
  const trimmed = r.stdout.trim();
  assert.ok(!trimmed.includes('\n'), 'the JSON decision must be on a single line');
  assert.doesNotThrow(() => JSON.parse(trimmed), 'stdout must be exactly one JSON object');
});

// Config: the hook is registered on PreToolUse with the store_memory matcher.
test('hook config: .github/hooks/no-memory.json registers the PreToolUse matcher', () => {
  const cfg = JSON.parse(readFileSync(HOOK_CONFIG, 'utf8'));
  assert.ok(cfg.hooks && Array.isArray(cfg.hooks.PreToolUse), 'hooks.PreToolUse must be an array');
  const entry = cfg.hooks.PreToolUse[0];
  assert.ok(entry, 'at least one PreToolUse entry');
  assert.equal(entry.matcher, 'store_memory', 'matcher must scope the hook to store_memory');
  assert.equal(entry.type, 'command', 'entry type must be "command"');
  assert.match(entry.command, /^node\s+\S*no-memory\.mjs$/, 'command must be `node <path>/no-memory.mjs`');
  assert.ok(typeof entry.cwd === 'string' && entry.cwd.length > 0, 'cwd must be present');
  assert.ok(Number.isFinite(entry.timeoutSec), 'timeoutSec must be present');
});
