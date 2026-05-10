# Security Policy

## Reporting a vulnerability

**Please report security issues privately via GitHub Security Advisories
(GHSA), not via public issues, discussions, or pull requests.**

To report:

1. Go to <https://github.com/henrik-me/agent-harness/security/advisories/new>.
2. Fill in a clear description, the affected version(s), reproduction steps,
   and (if known) suggested mitigation.
3. Submit. Only repository maintainers can see the report.

We will acknowledge receipt within 5 business days and aim to provide a
remediation plan within 14 business days. Coordinated disclosure is
preferred; we will agree a public disclosure date with you before any
advisory is published.

There is **no email contact** and **no PGP key** for security reports.
GHSA is the only supported channel — it provides authenticated reporter
identity, private discussion, and a clear audit trail.

## Supported versions

Only the latest released minor version receives security fixes. Earlier
versions are not patched; consumers are expected to upgrade.

| Version           | Supported          |
|-------------------|--------------------|
| `v0.2.0` (Unreleased) | ✅ (rolling main) |
| `v0.1.0`          | ✅                 |
| `< 0.1.0`         | ❌                 |

The harness self-updates via `harness sync` against a pinned ref in
`harness.config.json`; consumers should bump that pin to the latest
released version when a security fix lands.

## Scope

In scope:

- The `harness` CLI (`bin/harness.mjs`) and library code under `lib/`.
- Templates under `template/managed/`, `template/composed/`, `template/seeded/`.
- Lint scripts under `scripts/` that consumers invoke.
- GitHub Actions workflows under `.github/workflows/` that ship as part of
  the public artifact (the reusable `harness-checks.yml`, the release
  workflow, the secret scan, and the workboard auto-approve bot).

Out of scope:

- Vulnerabilities in transitive npm dependencies — please report those to
  the upstream project. We will, however, accept reports about pinning,
  lockfile hygiene, or supply-chain configuration in this repo.
- Vulnerabilities in third-party GitHub Actions referenced from our
  workflows — please report those upstream. We will accept reports about
  pinning hygiene (e.g. unpinned third-party actions) here.
- Issues in consumer repositories that adopt the harness — those should
  be reported to the consumer's own security contact.

## Acknowledgements

We will credit reporters in the published GHSA unless you request
anonymity.
