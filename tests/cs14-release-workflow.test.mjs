/**
 * tests/cs14-release-workflow.test.mjs — CS14
 *
 * Asserts the shape of .github/workflows/release.yml:
 *   - Tag-triggered (v*.*.*)
 *   - Tag name validated via allowlist regex (LRN-075)
 *   - Tag name passed through env: (NEVER directly interpolated into run:)
 *   - Uses gh release create
 *   - Least-privilege permissions: contents: write
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');

const yaml = readFileSync(WORKFLOW, 'utf8');

describe('release.yml workflow shape', () => {
  it('triggers on v*.*.* tag pushes', () => {
    assert.match(yaml, /on:\s*\n\s*push:\s*\n\s*tags:\s*\n\s*-\s*'v\*\.\*\.\*'/);
  });

  it('declares contents:write permission (least privilege)', () => {
    assert.match(yaml, /^permissions:\s*\n\s*contents:\s*write\s*$/m);
  });

  it('passes ${{ github.ref_name }} through env: TAG_NAME (LRN-075)', () => {
    assert.match(yaml, /env:\s*\n\s*TAG_NAME:\s*\$\{\{\s*github\.ref_name\s*\}\}/);
  });

  it('validates TAG_NAME against allowlist regex before shell consumption', () => {
    // Looks for the validation block.
    assert.match(yaml, /grep -Eq '\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+/);
  });

  it('does NOT directly interpolate ${{ github.ref_name }} into a run: shell body (LRN-075)', () => {
    // Find run: blocks; ensure no ${{ github.ref_name }} inside any run: literal.
    // A simple structural check: every ${{ github.ref_name }} must appear under env:, not run:.
    const runBlocks = yaml.match(/run:\s*\|\s*\n([\s\S]*?)(?=\n\s{0,8}\w+:|\n\s*$)/g) ?? [];
    for (const block of runBlocks) {
      assert.ok(
        !block.includes('${{ github.ref_name }}'),
        `run: block must not directly interpolate github.ref_name; found in:\n${block}`,
      );
      assert.ok(
        !block.includes('${{ github.event'),
        `run: block must not directly interpolate event payloads; found in:\n${block}`,
      );
    }
  });

  it('uses gh release create with --draft', () => {
    assert.match(yaml, /gh release create\s+"\$TAG_NAME"/);
    assert.match(yaml, /--draft/);
  });

  it('uses GH_TOKEN from secrets.GITHUB_TOKEN env (no plaintext token)', () => {
    assert.match(yaml, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
    // No real-looking GitHub PAT format anywhere in the file.
    assert.ok(!/ghp_[A-Za-z0-9]{36,}/.test(yaml), 'workflow must not contain a real-looking PAT');
  });
});
