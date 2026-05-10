#!/usr/bin/env node
/**
 * CS15a helper for creating the workboard GitHub App and validating the
 * repository settings that cannot be fully applied by automation alone.
 *
 * Usage:
 *   node scripts/cs15a-workboard-app-helper.mjs --manifest
 *   node scripts/cs15a-workboard-app-helper.mjs --set-secrets --app-id 123 --private-key C:\path\key.pem
 *   node scripts/cs15a-workboard-app-helper.mjs --open-pages
 *   node scripts/cs15a-workboard-app-helper.mjs --validate
 */

import { execFileSync, spawn } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';

const DEFAULT_REPO = 'henrik-me/agent-harness';
const DEFAULT_PORT = 8765;

function usage() {
  process.stdout.write(`Usage:
  node scripts/cs15a-workboard-app-helper.mjs --manifest [--repo owner/repo] [--port 8765]
  node scripts/cs15a-workboard-app-helper.mjs --set-secrets --app-id <id> --private-key <path> [--repo owner/repo]
  node scripts/cs15a-workboard-app-helper.mjs --open-pages [--repo owner/repo]
  node scripts/cs15a-workboard-app-helper.mjs --validate [--repo owner/repo]

Options:
  --manifest          Start a local manifest flow that creates the GitHub App,
                      stores WORKBOARD_BOT_* secrets, and opens the install page.
  --set-secrets       Store secrets from a manually created App ID + PEM file.
  --open-pages        Open the GitHub UI pages that still require user action.
  --validate          Print current workboard secrets and repository settings.
  --repo <owner/repo> Repository to configure. Default: ${DEFAULT_REPO}
  --port <port>       Local manifest callback port. Default: ${DEFAULT_PORT}
  --help              Print this help.
`);
}

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    port: DEFAULT_PORT,
    manifest: false,
    setSecrets: false,
    openPages: false,
    validate: false,
    appId: null,
    privateKey: null
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') args.manifest = true;
    else if (a === '--set-secrets') args.setSecrets = true;
    else if (a === '--open-pages') args.openPages = true;
    else if (a === '--validate') args.validate = true;
    else if (a === '--repo') args.repo = requireValue(argv, ++i, '--repo');
    else if (a === '--port') args.port = parsePort(requireValue(argv, ++i, '--port'));
    else if (a === '--app-id') args.appId = requireValue(argv, ++i, '--app-id');
    else if (a === '--private-key') args.privateKey = requireValue(argv, ++i, '--private-key');
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('--port must be an integer between 1024 and 65535');
  }
  return port;
}

function gh(args, options = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    input: options.input
  });
}

function ensureGhAuth() {
  gh(['auth', 'status'], { stdio: 'ignore' });
}

function openUrl(url) {
  process.stdout.write(`Opening: ${url}\n`);
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function setSecrets(repo, appId, pem) {
  if (!/^\d+$/.test(appId)) {
    throw new Error('App ID must be numeric.');
  }
  if (!pem.includes('-----BEGIN') || !pem.includes('PRIVATE KEY-----')) {
    throw new Error('Private key does not look like a PEM private key.');
  }

  gh(['secret', 'set', 'WORKBOARD_BOT_APP_ID', '--repo', repo, '--body', appId], { stdio: 'inherit' });
  gh(['secret', 'set', 'WORKBOARD_BOT_PRIVATE_KEY', '--repo', repo], { input: pem, stdio: ['pipe', 'inherit', 'inherit'] });
  process.stdout.write(`Stored WORKBOARD_BOT_APP_ID and WORKBOARD_BOT_PRIVATE_KEY for ${repo}.\n`);
}

function validate(repo) {
  ensureGhAuth();
  process.stdout.write('Workboard bot secrets present:\n');
  process.stdout.write(
    gh([
      'secret',
      'list',
      '--repo',
      repo,
      '--json',
      'name,updatedAt',
      '--jq',
      '[.[] | select(.name == "WORKBOARD_BOT_APP_ID" or .name == "WORKBOARD_BOT_PRIVATE_KEY")]'
    ])
  );
  process.stdout.write('\nRepository settings:\n');
  process.stdout.write(
    gh([
      'api',
      `repos/${repo}`,
      '--jq',
      '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,allow_update_branch,allow_auto_merge,delete_branch_on_merge,has_wiki,has_discussions,security_and_analysis}'
    ])
  );
}

function openPages(repo) {
  openUrl(`https://github.com/${repo}/settings`);
  openUrl(`https://github.com/${repo}/settings/security_analysis`);
  openUrl(`https://github.com/${repo}/settings/secrets/actions`);
  openUrl('https://github.com/settings/apps/new');
}

function manifestFor(repo, port, state) {
  return {
    name: 'agent-harness-workboard-bot',
    url: `https://github.com/${repo}`,
    description: 'Approves and auto-merges validated workboard-only PRs for agent-harness.',
    public: false,
    redirect_url: `http://localhost:${port}/callback`,
    hook_attributes: {
      url: `https://github.com/${repo}`,
      active: false
    },
    default_permissions: {
      contents: 'write',
      pull_requests: 'write'
    },
    default_events: [],
    request_oauth_on_install: false,
    setup_on_update: false
  };
}

function htmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function runManifestFlow(repo, port) {
  ensureGhAuth();

  const state = cryptoRandomState();
  const manifest = JSON.stringify(manifestFor(repo, port, state));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        if (returnedState !== state) {
          throw new Error('State mismatch in GitHub callback.');
        }
        if (!code) {
          throw new Error('GitHub callback did not include a manifest code.');
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>CS15a helper received the GitHub App code.</h1><p>You can return to the terminal.</p>');

        process.stdout.write('Converting manifest code into a GitHub App and private key...\n');
        const app = JSON.parse(gh(['api', '-X', 'POST', `app-manifests/${code}/conversions`]));
        setSecrets(repo, String(app.id), String(app.pem));

        process.stdout.write(`Created GitHub App: ${app.html_url}\n`);
        process.stdout.write(`Install it on only ${repo}.\n`);
        openUrl(`https://github.com/apps/${app.slug}/installations/new`);

        setTimeout(() => server.close(), 250);
        return;
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Register CS15a Workboard Bot</title></head>
  <body>
    <h1>Register CS15a Workboard Bot</h1>
    <p>This posts a preconfigured GitHub App manifest to GitHub.</p>
    <form action="https://github.com/settings/apps/new?state=${state}" method="post">
      <textarea name="manifest" rows="18" cols="100">${htmlEscape(manifest)}</textarea><br>
      <button type="submit">Register GitHub App Manifest</button>
    </form>
  </body>
</html>`);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error.message);
      process.stderr.write(`${error.message}\n`);
      setTimeout(() => server.close(), 250);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  process.stdout.write(`Local callback listener started at http://localhost:${port}/\n`);
  process.stdout.write('A browser page will open. Submit the manifest, then click "Create GitHub App" on GitHub.\n');
  openUrl(`http://localhost:${port}/`);

  await new Promise((resolve) => {
    server.once('close', resolve);
  });
}

function cryptoRandomState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const args = parseArgs(process.argv.slice(2));
const actions = [args.manifest, args.setSecrets, args.openPages, args.validate].filter(Boolean).length;

if (actions === 0) {
  usage();
  process.exit(0);
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repo)) {
  throw new Error('--repo must be in owner/repo form.');
}

if (args.openPages) {
  openPages(args.repo);
}

if (args.setSecrets) {
  ensureGhAuth();
  if (!args.appId) {
    throw new Error('--app-id is required with --set-secrets.');
  }
  if (!args.privateKey || !fs.existsSync(args.privateKey)) {
    throw new Error('--private-key must point to the downloaded .pem file.');
  }
  setSecrets(args.repo, args.appId, fs.readFileSync(args.privateKey, 'utf8'));
}

if (args.manifest) {
  await runManifestFlow(args.repo, args.port);
}

if (args.validate) {
  validate(args.repo);
}
