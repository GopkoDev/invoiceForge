---
id: T20
title: "Close the move: zero data-store calls in lib/actions, inventory checks for request-free and foreign-record tests"
layer: "tests"
deps: ["T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T15", "T16", "T19"]   # task ids that must finish first
blocks: []              # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: ["AC-01", "AC-07", "AC-08", "AC-10"]
files_hint: ["lib/actions/", "app/api/user/export/route.ts", "app/api/convert-image/route.ts", "tests/unit/service-layer-inventory.test.ts", "tests/integration/services/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
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

# T20 — Close the move: zero data-store calls in lib/actions, inventory checks for request-free and foreign-record tests

## Place in the sequence

- **Blocked by:** T6 customers, T7 products, T8 custom prices, T9 sender profiles, T10 bank accounts, T11 profile/account, T12 invoice reads + numbering, T13 invoice list, T15 update invoice + status, T16 duplicate + delete invoice, T19 dashboard cut-over (T14 is covered through T15/T16) · **Blocks:** none. This is the last task. · **Wave:** 7 (DAG level), because it can only assert "0 left" once every domain has moved.
- **Lane:** `lib/actions/` overlaps with every app task, but they are all finished by now. It shares `tests/integration/services/` read-only.

## Why (user story)

> **As a** Freelancer
> **I want** every read and change made on my behalf, from a page or an Assistant, limited to my own records
> **So that** nobody else's data mixes into mine and nobody can reach mine
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** every page, form, picker and the dashboard to behave exactly as before
> **So that** the internal change costs me nothing and I don't have to relearn anything
>
> — `spec.md §4, US-01, verbatim`

This task proves the move is complete and stays complete: no data access is left in the web layer, and every business function has its request-free and foreign-record tests, checked by an automated inventory rather than by eye.

## Inlined context

> - **Direct data-store calls inside web server-side functions** — baseline: 114 (counted 2026-09-30 in `lib/actions`). Target: 0 within the feature's release; all of them live in the business layer.
> - **Business functions with a request-free integration test** — baseline: 0. Target: 100% at release.
> - **Business functions with a foreign-record test** — baseline: foreign-record tests exist for a subset of actions only (`tests/integration/actions/foreign-record-not-found-parity.test.ts`). Target: 100% of functions that take a record identifier, at release.
>
> — `spec.md §7, KPIs 1–3, verbatim` · full text: [spec.md](../spec.md)

> **How verify:** `tests/integration/services/**` has, for every id-taking business function, a test that seeds two Freelancers, calls the function as A with B's id, asserts `NOT_FOUND` and asserts B's row is byte-identical afterwards. `review` checks the inventory against the function list.
>
> — `sad.md §10, QG-1, verbatim` · full text: [sad.md](../sad.md)

> **How verify:** an integration test per business function calls it with only `actingFreelancerForTest(...)`. There are no request mocks, and the `@/auth` mocks disappear for business-function tests.
>
> — `sad.md §10, QG-3, abridged`

> 5. At release, the old in-memory dashboard code, the unused list-all-invoices function (with its test) and every other function the move leaves unused are deleted.
>
> — `spec.md §1, Deliberate behaviour change 5, verbatim`

> lib/actions/**                                 ✎ thin wrappers: actingFreelancerFromSession() → business function → revalidatePath on success
> lib/actions/login-actions.ts                   — unchanged (sign-in stays in the browser flow, spec §3)
> app/api/user/export/route.ts                   ✎ reads through lib/services/account instead of Prisma
> app/api/convert-image/route.ts                 ✎ owned-profile lookup through lib/services/sender-profiles
>
> — `sad.md §5, Internal decomposition, abridged`

> **Hard rule:** 0 changed or removed expected values in existing automated tests (sole exception: the test of the removed list-all-invoices function)
>
> — `spec.md §6, Behaviour parity row, abridged`

**Repo fact (2026-10-01):** `prisma` is referenced today in 14 `lib/actions` files (including `action-result-helpers.ts`, `invoice-actions/{helpers,numbering,select-queries}.ts`) and in both route handlers. `login-actions.ts` imports none.

**Fallback:** if a slice is insufficient or the code contradicts it, read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> - Every business function in §2 has a request-free integration test. Every function that takes an id (or a parent id) has a foreign-record test with two Freelancers, asserting `NOT_FOUND` and an unchanged row for B (QG-1).
>
> — `contracts/public-api.md §4, bullet 4, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> 1. `actingFreelancerFromSession()` first. On `UNAUTHORIZED`, return it (actions) or redirect to sign-in (pages), and never call a business function.
>
> — `contracts/public-api.md §3, obligation 1, verbatim`

## Acceptance criteria

### AC-01 — happy

> **Given** a signed-in Freelancer with existing sender profiles, customers, products, custom prices, bank accounts and invoices
> **When** the Freelancer opens any list, detail page, the invoice editor, a picker or the dashboard, or saves any form
> **Then** they see the same records, values, order, messages and confirmations as before the change (except the deliberate dashboard naming and tie order in AC-06), and every existing automated check passes with its expected values unchanged (the only removed check is the one for the unused list-all-invoices function)
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy

> **Given** an Assistant acting for Freelancer A, with no browser session
> **When** it asks for A's customers, products, custom prices, sender profiles, bank accounts, invoices or dashboard figures
> **Then** it receives exactly the records and figures A sees on the matching page
>
> — `spec.md §5, AC-07, verbatim`

### AC-08 — authorization

> **Given** an Assistant acting for Freelancer A, and a record (invoice, customer, product, custom price, sender profile or bank account) that belongs to Freelancer B
> **When** it asks to read, change or delete that record by its identifier, or asks for a list that belongs to it (for example the custom prices of B's customer)
> **Then** the system answers exactly as it does for an identifier that never existed, and B's record stays unchanged, so A's side cannot even learn that the record exists
>
> — `spec.md §5, AC-08, verbatim`

### AC-10 — authorization

> **Given** a Visitor with no session, or with a session whose account no longer exists
> **When** they reach any private page or trigger any private action
> **Then** they are sent to sign in as today, and no private data is read or changed
>
> — `spec.md §5, AC-10, verbatim`

## Checklist

- [ ] RED: `tests/unit/service-layer-inventory.test.ts`, part 1. Scan `lib/actions/**` and `app/**/route.ts`: fail on any `@/prisma`, `@prisma/client` runtime value or `prisma.` usage. Allowed: type-only imports, and `login-actions.ts`, which has none today.
- [ ] RED: same file, part 2. Enumerate the exported functions of `lib/services/**` (excluding `_shared`), and fail if any lacks an integration test under `tests/integration/services/**` that calls it with `actingFreelancerForTest`. For each function with an `id`/`*Id` parameter, fail if it lacks a foreign-record test (tagged, e.g. `describe('foreign record: <fn>')`).
- [ ] RED: same file, part 3. Every `'use server'` export in `lib/actions/**` except `login-actions.ts` calls `actingFreelancerFromSession()` before anything else (AC-10). A static check is enough.
- [ ] Move the leftovers out of `lib/actions`: `action-result-helpers.ts` (re-export only, or delete if unused), and `invoice-actions/{helpers,numbering,select-queries}.ts`. Delete them where only the layer uses them.
- [ ] Delete every function the move left unused (e.g. `computeInvoiceLegacyInfo`, `verifyInvoiceRelations` if now only in the layer). Delete no test other than the list-all-invoices one.
- [ ] Fill any gaps the inventory finds in `tests/integration/services/**`. Keep `tests/integration/actions/foreign-record-not-found-parity.test.ts` green and unchanged.
- [ ] Run the full suite: unit, integration, lint, `tsc --noEmit`, `pnpm build`.

## Edge cases

| Case | Behaviour |
|---|---|
| a `lib/actions` file imports Prisma only for types (`import type { … }`) | allowed, since it is not a data-store call |
| a business function takes a parent id (e.g. `listBankAccounts(actor, senderProfileId)`) | counts as id-taking, so it needs a foreign-record test (AC-08 "a list that belongs to it") |
| a new business function added later without tests | the inventory test fails in CI |
| an existing test must be changed to pass | stop: that is a parity break, except for the removed list-all-invoices test |
| `login-actions.ts` | untouched and exempt from part 3 |

## Definition of Done

- [ ] The inventory test passes: 0 data-store calls in `lib/actions` and route handlers, 100% request-free coverage, and 100% foreign-record coverage for id-taking functions.
- [ ] Every `'use server'` action (except sign-in) builds the `ActingFreelancer` first.
- [ ] Unused functions are deleted, and no test was removed except the list-all-invoices one.
- [ ] The full suite and `pnpm build` are green.
- [ ] Every Hard Rule inlined above still holds.
- [ ] lint + `tsc --noEmit` clean.
