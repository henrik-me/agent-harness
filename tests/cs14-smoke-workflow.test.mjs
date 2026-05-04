/**
 * tests/cs14-smoke-workflow.test.mjs — CS14
 *
 * Asserts the shape of .github/workflows/private-smoke.yml:
 *   - Triggered by workflow_dispatch (with `ref` input), schedule, and pull_request on main
 *   - Ref input passed through env: (NEVER directly interpolated)
 *   - Allowlist regex validation (LRN-075)
 *   - Least-privilege permissions: contents: read
 *   - No real-looking PAT or token (only the FAKE_DO_NOT_USE placeholder)
 *   - Uses npx -y "github:henrik-me/agent-harness#${REF}"
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'private-smoke.yml');

const yaml = readFileSync(WORKFLOW, 'utf8');

describe('private-smoke.yml workflow shape', () => {
  it('declares workflow_dispatch with a ref input', () => {
    assert.match(yaml, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*ref:/);
  });

  it('declares scheduled trigger', () => {
    assert.match(yaml, /schedule:/);
  });

  it('declares pull_request trigger on main', () => {
    assert.match(yaml, /pull_request:\s*\n\s*branches:\s*\[main\]/);
  });

  it('declares contents:read permission (least privilege)', () => {
    assert.match(yaml, /^permissions:\s*\n\s*contents:\s*read\s*$/m);
  });

  it('passes inputs.ref through env: INPUT_REF (LRN-075)', () => {
    assert.match(yaml, /INPUT_REF:\s*\$\{\{\s*inputs\.ref\s*\}\}/);
  });

  it('validates ref against allowlist regex before shell consumption', () => {
    assert.match(yaml, /grep -Eq '\^\[a-zA-Z0-9\._\/-\]\+\$'/);
  });

  it('does NOT directly interpolate ${{ inputs.* }} or ${{ github.* }} into run: bodies (LRN-075)', () => {
    const runBlocks = yaml.match(/run:\s*\|\s*\n([\s\S]*?)(?=\n\s{0,8}\w+:|\n\s*$)/g) ?? [];
    for (const block of runBlocks) {
      assert.ok(
        !block.includes('${{ inputs.'),
        `run: block must not directly interpolate inputs.*; found in:\n${block}`,
      );
      assert.ok(
        !block.includes('${{ github.event'),
        `run: block must not directly interpolate github.event*; found in:\n${block}`,
      );
    }
  });

  it('uses npx -y "github:henrik-me/agent-harness#${REF}" (env-substituted)', () => {
    assert.match(yaml, /npx -y "github:henrik-me\/agent-harness#\$\{REF\}"/);
  });

  it('uses GH_TOKEN from secrets.GITHUB_TOKEN env (no plaintext token)', () => {
    assert.match(yaml, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
    assert.ok(!/ghp_[A-Za-z0-9]{36,}/.test(yaml), 'workflow must not contain a real-looking PAT');
  });

  it('any ghp_* placeholder is the obvious FAKE one', () => {
    const matches = yaml.match(/ghp_[A-Za-z0-9_]+/g) ?? [];
    for (const m of matches) {
      assert.equal(m, 'ghp_FAKE_DO_NOT_USE', `unexpected token-like string: ${m}`);
    }
  });

  it('configures git url-rewrite for github: protocol via x-access-token', () => {
    assert.match(yaml, /x-access-token:\$\{GH_TOKEN\}/);
    assert.match(yaml, /insteadOf "https:\/\/github\.com\/"/);
  });
});
