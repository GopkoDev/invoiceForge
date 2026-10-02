---
id: T1
title: "Enforce the lib/services boundary: server-only, lint rules, boundary test, build in CI"
layer: "wiring"
deps: []                # task ids that must finish first
blocks: ["T2"]          # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: []                 # no spec §5 AC; serves the spec §6 NFR "Business layer not reachable from the browser"
files_hint: ["package.json", "pnpm-lock.yaml", "eslint.config.mjs", "tests/unit/service-layer-boundary.test.ts", ".github/workflows/test.yml", "lib/services/"]
owner: "Dmytro Hopko"
estimate: "S"           # S/M/L or hours — how long the work takes
context_budget: "M"     # what the task costs the executing agent to hold (markdown only).
                        # Measured, not guessed: the non-empty lines from `## Why (user story)`
                        # through `## Acceptance criteria`.
                        # S = ≤40 inlined lines, ≤1 extra file to open
                        # M = ≤120 inlined lines, 2–4 files in play
                        # L = beyond that — split the task, or keep it and say why right here:
                        #     context_budget: "L"   # justified: <one line>
status: "todo"
---

<!-- The governing rule of this file: **inline the slice the task actually needs, name where it came
from, and keep the link as the fallback for when the slice turns out not to be enough.** A task is
self-contained: it carries its own context instead of sending the executing agent off to reconstruct it.

Every inlined chunk ends with a one-line **provenance signature**:
`<file> §<section>, <identifier>, verbatim|abridged` — e.g. `spec.md §5, AC-02, verbatim`,
`data-model.md §Entities, table order, abridged`. Never «see the spec».

**Inline budget.** Exactly what THIS task needs: only its own acceptance criteria, only the
data-model fields and endpoints it touches. Cut a long chunk to the essential, mark it `abridged`,
and link the full text. `context_budget` in the frontmatter carries the measured number, and an `L`
either gets split or gets its `# justified:` reason on that line — the `tasks` skill checks both.

**Divergence risk.** An inline is a snapshot taken at breakdown time; upstream can move after it.
The source always wins — which is exactly why every chunk carries a signature pointing at where the
truth lives.

**To the executing agent:** work from what is inlined here. If a slice is insufficient, ambiguous,
or contradicts the code in front of you, open the named file for the full text and follow that.
Do not invent the missing part. -->

# T1 — Enforce the lib/services boundary: server-only, lint rules, boundary test, build in CI

## Place in the sequence

- **Blocked by:** — · **Blocks:** T2 — Move the result contract and result helpers into the shared business-layer kernel · **Wave:** 1 (DAG root; every `lib/services` file written later must already be checked by these rules). Ships in release wave 1 (sad.md §7).
- **Lane:** own lane.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** to read that Freelancer's invoices, customers, products, custom prices, sender profiles, bank accounts and dashboard figures by naming the Freelancer and, where dates matter, their time zone
> **So that** I can answer the Freelancer's questions without a browser session
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task builds the fence that keeps the new request-free layer out of the browser before any business function exists.

## Inlined context

> **Chosen:** Option 1. It gives the same two guarantees through checks on every PR: lint, unit, and `next build`, which this feature adds to `.github/workflows/test.yml` because it isn't there today.
>
> — `adr/0006-isolate-business-functions-in-lib-services-behind-server-only-and-lint-rules.md §Decision outcome, abridged` · full text: [ADR-0006](../adr/0006-isolate-business-functions-in-lib-services-behind-server-only-and-lint-rules.md)

> 1. **`lib/services/` in the same package.** Every file imports `server-only`, so `next build` fails if client code imports it. No `'use server'` anywhere in the folder. ESLint `no-restricted-imports` bans `next/headers`, `next/cache`, `next/navigation`, `@/auth` and `next-auth` inside it. A unit test scans for `'use server'` under `lib/services` and for `lib/services` imports from `'use client'` files.
>
> — `adr/0006 §Considered options, option 1, verbatim` · full text: [ADR-0006](../adr/0006-isolate-business-functions-in-lib-services-behind-server-only-and-lint-rules.md)

> eslint.config.mjs ✎ no-restricted-imports for lib/services/** (next/headers, next/cache, next/navigation, @/auth, next-auth) + a ban on `as ActingFreelancer` outside _shared/acting-freelancer.ts
>
> — `sad.md §5, internal decomposition, eslint.config.mjs row, abridged` · full text: [sad.md](../sad.md)

> `pnpm build` is added to `.github/workflows/test.yml` in wave 1 (it isn't there today), with placeholder env values for the build.
>
> — `sad.md §10, QG-3 How verify, abridged` · full text: [sad.md](../sad.md)

**Repo today:** `eslint.config.mjs` is `defineConfig([...nextVitals, ...nextTs, globalIgnores([...])])` with no custom rules. CI (`.github/workflows/test.yml`) job `unit` runs `pnpm lint`, `tsc --noEmit`, `pnpm test:unit`, with no build step. `server-only` is not installed.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> - Every `lib/services/**` file imports `'server-only'` and contains no `'use server'`.
> - ESLint `no-restricted-imports` in `lib/services/**`: `next/headers`, `next/cache`, `next/navigation`, `@/auth`, `next-auth`.
> - `tests/unit/service-layer-boundary.test.ts`, plus `pnpm build` in CI.
>
> — `contracts/public-api.md §4, Boundary checks, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

No spec §5 AC. The task serves these spec §6 NFR rows:

### NFR — Business layer not reachable from the browser

> | Business layer not reachable from the browser | 0 business-layer functions marked as browser-callable; 0 imports of the business layer from browser-side code | automated check in CI |
>
> — `spec.md §6, row "Business layer not reachable from the browser", verbatim` · full text: [spec.md](../spec.md)

### NFR — Request-independence of business functions

> | Request-independence of business functions | 100% of business functions callable with only the acting Freelancer (+ time zone) and no browser request; 0 uses of session, cookie, header or page-refresh facilities inside the business layer | an integration test per function + an automated import check in CI |
>
> — `spec.md §6, row "Request-independence of business functions", verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: write `tests/unit/service-layer-boundary.test.ts`. It globs `lib/services/**/*.ts` and asserts that no file starts with `'use server'` and that every file imports `'server-only'`. It also globs `app/**`, `components/**` and `hooks/**` files that start with `'use client'` and asserts none imports `@/lib/services` or a relative `lib/services` path. Plant a temporary fixture to see it fail, then remove the fixture.
- [ ] `pnpm add server-only` → `package.json`, `pnpm-lock.yaml`.
- [ ] Create `lib/services/_shared/.gitkeep`, or a placeholder `index.ts` that imports `'server-only'`, so the glob has a real target.
- [ ] `eslint.config.mjs`: add a block `{ files: ['lib/services/**/*.ts'], rules: { 'no-restricted-imports': ['error', { paths: ['next/headers','next/cache','next/navigation','@/auth','next-auth'], patterns: ['next-auth/*'] }] } }`.
- [ ] `eslint.config.mjs`: ban the cast. Add `no-restricted-syntax` on `TSAsExpression[typeAnnotation.typeName.name='ActingFreelancer']` for every file except `lib/services/_shared/acting-freelancer.ts`.
- [ ] `.github/workflows/test.yml`: add a `pnpm build` step to the `unit` job after `tsc --noEmit`, with placeholder env values (`AUTH_SECRET`, `DATABASE_URL`, …) that are just enough for `next build`.
- [ ] Verify locally: `pnpm lint`, `pnpm test:unit`, `pnpm build`.

## Edge cases

| Case | Behaviour |
|---|---|
| A `'use client'` component imports `@/lib/services/...` | `pnpm build` fails (`server-only`), and the boundary unit test fails |
| A `lib/services` file imports `cookies` from `next/headers` | `pnpm lint` fails with `no-restricted-imports` |
| `x as ActingFreelancer` in a wrapper or test | `pnpm lint` fails. Only `lib/services/_shared/acting-freelancer.ts` may cast |
| `next build` needs env vars in CI | placeholder values in the workflow step only, never real secrets |
| `lib/services` is empty in this task | the boundary test still passes (0 files checked) and must not error on an empty glob |

## Definition of Done

- [ ] `server-only` is in `dependencies`.
- [ ] `tests/unit/service-layer-boundary.test.ts` passes, and it fails on a planted `'use server'` file or a planted client import (checked once, then the fixture is removed).
- [ ] ESLint rejects the five banned imports under `lib/services/**` and `as ActingFreelancer` outside the factory module.
- [ ] CI runs `pnpm build` on every PR.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
