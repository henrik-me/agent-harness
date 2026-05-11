# CS99 — Self-Host Clean Fixture

**Status:** active
**Owner:** orchestrator
**Branch:** cs99/fixture
**Started:** 2026-01-09
**Closed:** —
**Depends on:** None

## Goal

This fixture simulates a harness-repo CS plan that plainly mentions
template/composed/CONVENTIONS.md and lib/composed.mjs. Because the linter
is invoked with --cwd pointing at the self-host directory (which has a
package.json with name @henrik-me/agent-harness), the linter should exit 0
and print "skipped (self-host)".

## Tasks

Sub-agent should edit template/composed/CONVENTIONS.md between the harness
markers, and consult lib/composed.mjs for the template engine API.
