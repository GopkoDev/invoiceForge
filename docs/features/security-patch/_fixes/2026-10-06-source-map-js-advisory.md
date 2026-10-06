---
slug: security-patch
date: 2026-10-06
triage: regression
acs: [AC-01]
commit: pending
recurrence_of: none
---

# Fix: the production audit reports a high advisory in source-map-js

## Symptom

Running `pnpm audit --prod --audit-level=high` (the CI unit job), expected zero high or critical advisories, got one high: GHSA-68fv-2mgg-jv7q, `source-map-js` 1.2.1 (event-loop denial of service through indexed source-map section offsets), path `next > postcss > source-map-js`, patched in 1.2.2.

Scope: every CI run on PR #5 and PR #6 from 2026-10-06. The same commits passed the audit on 2026-10-04; the advisory was published in between.

## Root cause

No code changed. The advisory database gained a new high advisory against a transitive production dependency that the lockfile pinned at 1.2.1. AC-01 holds only for the advisory database at the time of the check, and the existing tests pinned the overrides already in place, not this package.

## The pinning test

`tests/unit/release-gate-t20.test.ts` → `AC-01: source-map-js is overridden to the patched release and the lockfile has no older copy` (unit). It runs offline, unlike the audit. RED before the fix:

> AssertionError: expected 'packages:\n  - .\nignoredBuiltDepende…' to match /^\s+'?source-map-js@<1\.2\.2'?: \^1\…/m

GREEN after it, and `pnpm audit --prod --audit-level=high` reports "No known vulnerabilities found".

## Spec patch

None. The spec was right: AC-01 was re-verified with the production audit, which is clean again. `ship-notes.md` gained a row for this advisory in the production-graph table.

## Follow-ups

- The lockfile re-resolution also moved `@babel/code-frame` 7.27.1 → 7.29.7 (inside its range, to match the patched `@babel/core`). This needs no action.
- AC-01 can go red again whenever a new advisory is published, with no code change. A scheduled CI audit (for example weekly) would catch that before a PR does.
