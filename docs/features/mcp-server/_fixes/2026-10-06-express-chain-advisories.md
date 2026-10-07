---
slug: mcp-server
date: 2026-10-06
triage: regression
acs: [security-patch AC-01]
commit: 06beb82
recurrence_of: none
---

# Fix: the production audit reports a critical and a high advisory through the MCP SDK

## Symptom

Running `pnpm audit --prod --audit-level=high` on `mcp-server` (the CI unit job), expected zero high or critical advisories, got two:

- critical GHSA-jqcg-44mw-7w3h: `proxy-addr` 2.0.7, IP spoofing through an IPv4-mapped IPv6 trust subnet, patched in 2.0.8;
- high GHSA-j3q9-mxjg-w52f: `path-to-regexp` 8.3.0, denial of service through sequential optional groups, patched in 8.4.0.

Both reach production through `@modelcontextprotocol/sdk > express` (`> router` for `path-to-regexp`). Scope: PR #6 only, because `security-patch` does not depend on the SDK.

## Root cause

No code changed. The lockfile pinned `proxy-addr` 2.0.7 and `path-to-regexp` 8.3.0 when the SDK was added. The patched releases came later, and nothing re-resolved them. The declared ranges already accept the fixes (express `^2.0.7`, router `^8.0.0`). Updating the SDK would not help: 1.32.1, the latest, still depends on express `^5.2.1`, and 5.2.1 is the latest express. mcp-server's spec has no advisory AC, so the governing criterion is security-patch AC-01, which this branch builds on.

## The pinning test

`tests/unit/release-gate-t20.test.ts` → `AC-01: proxy-addr and path-to-regexp 8 are overridden to the patched releases` (unit, offline). RED before the fix:

> AssertionError: expected 'packages:\n  - .\nignoredBuiltDepende…' to match /^\s+'?proxy-addr@<2\.0\.8'?: \^2\.0\…/m

GREEN after it. `pnpm audit --prod --audit-level=high` now exits 0 (2 low, 3 moderate remain). The `/api/mcp` integration tests pass (11 files, 114 tests).

## Spec patch

None. security-patch AC-01 was right and is re-verified. The overrides are `proxy-addr@<2.0.8: ^2.0.8` and `path-to-regexp@>=8.0.0 <8.4.0: ^8.4.0`. The second override is bounded below so the unaffected `path-to-regexp` 6.3.0 is not forced across a major version.

## Follow-ups

- `@modelcontextprotocol/sdk` 1.32.0 → 1.32.1 is available. It is a patch release that this fix does not need.
- The remaining low and moderate production advisories are not listed in the ship notes. AC-01 asks only for the development-only ones, but a short note in `_ship/security-review-2026-10-05.md` would keep the picture complete.
