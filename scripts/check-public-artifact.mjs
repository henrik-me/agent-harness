#!/usr/bin/env node
/**
 * scripts/check-public-artifact.mjs — Public artifact redaction linter.
 *
 * Scans archived shadow/pilot/migration artifact files (text files: .md, .txt,
 * .log, .json) for forbidden content before they are committed to a public
 * branch. Forbidden patterns are config-driven via `public_artifact_redaction`
 * in harness.config.json; hardcoded defaults apply when no config is present.
 *
 * Usage:
 *   node scripts/check-public-artifact.mjs --dir <path> [--config <path>] [--quiet]
 *
 * Exit codes:
 *   0 — no forbidden findings
 *   1 — at least one forbidden finding
 *   2 — usage error (missing required argument)
 *
 * @module scripts/check-public-artifact.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let targetDir = null;
let configPath = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir' && argv[i + 1]) {
    targetDir = argv[++i];
  } else if (a === '--config' && argv[i + 1]) {
    configPath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-public-artifact.mjs --dir <path> [--config <path>] [--quiet]\n\n' +
      'Scan artifact files for forbidden content (secrets, internal URLs, etc.).\n\n' +
      'Options:\n' +
      '  --dir <path>      Directory to scan recursively (REQUIRED)\n' +
      '  --config <path>   Path to harness.config.json (optional)\n' +
      '  --quiet           Suppress per-finding output; print only the summary\n' +
      '  --help            Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-public-artifact: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!targetDir) {
  process.stderr.write('check-public-artifact: --dir <path> is required\n');
  process.exit(2);
}

if (!fs.existsSync(targetDir)) {
  process.stderr.write(`check-public-artifact: directory not found: ${targetDir}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load config (optional)
// ---------------------------------------------------------------------------

/** @type {Record<string, unknown>} */
let configRedaction = {};

if (configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    configRedaction = cfg.public_artifact_redaction ?? {};
  } catch (err) {
    process.stderr.write(`check-public-artifact: cannot read config "${configPath}": ${err.message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Build effective rules (merge config over defaults)
// ---------------------------------------------------------------------------

/**
 * Default forbidden regex patterns.
 * Each entry: { label, regex }
 */
const DEFAULT_FORBIDDEN_PATTERNS = [
  { label: 'GitHub token',      regex: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/ },
  { label: 'Azure UUID',        regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  { label: 'AWS access key',    regex: /AKIA[0-9A-Z]{16}/ },
  { label: 'Bearer token',      regex: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
  { label: 'Internal email',    regex: /@internal\.|@private\./ },
];

const DEFAULT_FORBIDDEN_URL_PATTERNS = [
  { label: 'Internal URL (.internal.)', regex: /\.internal\./ },
  { label: 'Corp URL (.corp.)',          regex: /\.corp\./ },
  { label: 'Localhost with port',        regex: /localhost:\d+/ },
];

const DEFAULT_FORBIDDEN_KEYS = ['password', 'secret', 'token', 'api_key', 'private_key'];

const DEFAULT_IGNORE_PATTERNS = ['.gitkeep', 'node_modules', '.git'];

// Merge all rules from all artifact-type entries in config.
// We collapse all per-artifact-type rules into a single set for simplicity
// since this CLI operates on a directory (not per-artifact-type).
/** @type {{ label: string, regex: RegExp }[]} */
const forbiddenPatterns = [...DEFAULT_FORBIDDEN_PATTERNS];
/** @type {{ label: string, regex: RegExp }[]} */
const forbiddenUrlPatterns = [...DEFAULT_FORBIDDEN_URL_PATTERNS];
/** @type {string[]} */
const forbiddenKeys = [...DEFAULT_FORBIDDEN_KEYS];
/** @type {string[]} */
const allowedPlaceholders = [];

for (const [, rule] of Object.entries(configRedaction)) {
  if (rule && typeof rule === 'object') {
    for (const pat of (rule.forbidden_field_patterns ?? [])) {
      try {
        forbiddenPatterns.push({ label: `config:${pat}`, regex: new RegExp(pat) });
      } catch {
        // skip invalid regex
      }
    }
    for (const ph of (rule.allowed_placeholders ?? [])) {
      allowedPlaceholders.push(ph);
    }
  }
}

// ---------------------------------------------------------------------------
// File discovery — walk directory recursively, skip ignored paths
// ---------------------------------------------------------------------------

/**
 * Returns true if a path segment matches any ignore pattern.
 * @param {string} relPath
 * @returns {boolean}
 */
function isIgnored(relPath) {
  const segments = relPath.split(/[\\/]/);
  for (const seg of segments) {
    if (DEFAULT_IGNORE_PATTERNS.some((p) => seg === p || relPath.startsWith(p))) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively collect all file paths under a directory.
 * @param {string} dir
 * @param {string} base  — root used to compute relative paths for ignore matching
 * @returns {string[]}
 */
function collectFiles(dir, base) {
  /** @type {string[]} */
  const result = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);
    if (isIgnored(rel)) continue;
    if (entry.isDirectory()) {
      result.push(...collectFiles(abs, base));
    } else if (entry.isFile()) {
      result.push(abs);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Binary file detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the first 8KB of the file contains a NUL byte.
 * @param {string} filePath
 * @returns {boolean}
 */
function isBinary(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    return buf.slice(0, bytesRead).includes(0x00);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Scan a single text file for forbidden content
// ---------------------------------------------------------------------------

/**
 * Check if a value is in the allowed placeholders list.
 * @param {string} value
 * @returns {boolean}
 */
function isAllowed(value) {
  return allowedPlaceholders.some((ph) => value.includes(ph) || ph.includes(value));
}

/**
 * Scan one text file for violations.
 * @param {string} filePath
 * @returns {{ finding: string }[]}
 */
function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const findings = [];
  const lines = content.split('\n');

  // --- Pattern matching (line by line) ---
  const allPatterns = [...forbiddenPatterns, ...forbiddenUrlPatterns];
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNo = lineIdx + 1;
    for (const { label, regex } of allPatterns) {
      const m = regex.exec(line);
      if (m && !isAllowed(m[0])) {
        findings.push({
          finding: `${filePath}:${lineNo}: [${label}] matched: ${m[0].slice(0, 60)}`,
        });
      }
    }
  }

  // --- JSON key scanning ---
  if (filePath.endsWith('.json')) {
    try {
      const obj = JSON.parse(content);
      scanJsonKeys(obj, filePath, findings);
    } catch {
      // Not valid JSON — already checked with line patterns above.
    }
  }

  return findings;
}

/**
 * Recursively scan JSON object for forbidden keys.
 * @param {unknown} obj
 * @param {string} filePath
 * @param {{ finding: string }[]} findings
 * @param {string} [keyPath]
 */
function scanJsonKeys(obj, filePath, findings, keyPath = '') {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      scanJsonKeys(obj[i], filePath, findings, `${keyPath}[${i}]`);
    }
    return;
  }
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = keyPath ? `${keyPath}.${key}` : key;
    const keyLower = key.toLowerCase();
    if (forbiddenKeys.some((fk) => keyLower === fk || keyLower.includes(fk))) {
      const preview = typeof val === 'string' ? val.slice(0, 40) : JSON.stringify(val).slice(0, 40);
      if (!isAllowed(String(val))) {
        findings.push({
          finding: `${filePath}: [forbidden JSON key] "${fullKey}" = ${preview}`,
        });
      }
    }
    if (typeof val === 'object' && val !== null) {
      scanJsonKeys(val, filePath, findings, fullKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

const allFiles = collectFiles(targetDir, targetDir);

let filesScanned = 0;
let totalFindings = 0;
const errors = [];

/**
 * Print a finding unless --quiet.
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

for (const filePath of allFiles) {
  if (isBinary(filePath)) continue;
  filesScanned++;
  const findings = scanFile(filePath);
  for (const { finding } of findings) {
    totalFindings++;
    logError(finding);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\npublic-artifact: ${filesScanned} files scanned, ${totalFindings} forbidden findings\n`);

if (errors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
