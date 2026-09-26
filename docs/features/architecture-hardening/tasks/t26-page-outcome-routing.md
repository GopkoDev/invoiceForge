---
id: T26
title: "Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found"
layer: "ui"
deps: ["T00", "T08", "T25", "T14"]
blocks: []
acs: ["AC-28", "AC-29"]
files_hint: ["app/(protected)/invoices/page.tsx", "app/(protected)/dashboard/page.tsx", "app/(protected)/customers/", "app/(protected)/products/", "app/(protected)/sender-profiles/", "app/(invoice-editor)/invoices/", "components/layout/content-area/", "components/customers/customers-list.tsx", "components/products/products-list.tsx", "components/sender-profiles/sender-profiles-list.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T26 — Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them, T25 — Add the segment load-error boundaries with retry and Sentry reporting, T14 — Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals · **Blocks:** — · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`components/layout/content-area/`), T23 (`app/(protected)/invoices/page.tsx`), T24 (`app/(protected)/dashboard/page.tsx`), T25 (`components/layout/content-area/load-error.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** a clear error with a retry when my data can't be loaded
> **So that** I don't mistake a failure for "no data" or "page missing" and create duplicates
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task wires every data page listed in AC-28 so a load failure is shown as an error with retry and a foreign record looks exactly like a missing one.

## Inlined context

> | Code | When | Page caller | Form caller |
> |---|---|---|---|
> | `UNAUTHORIZED` | no session, or a token without a live account (ADR-0002). Checked **before any argument is parsed** (AC-23) | redirect to sign-in (SCR-01) | redirect to sign-in |
> | `NOT_FOUND` | the record doesn't exist or isn't the caller's, with an identical message (AC-29) | `notFound()` (SCR-16) | toast / inline |
> | `VALIDATION` | the shared zod schema failed, or a domain rule broke (AC-14/15/16/19) | — | `fieldErrors` next to the fields |
> | `CONFLICT` | a uniqueness or state invariant (AC-08, AC-17, AC-22) | — | inline (`fieldErrors`) or a dialog (`details`) |
> | `FAILED` | anything else. The detail goes to `console.error` + Sentry | throw → segment `error.tsx` (SCR-17) | toast with retry |
>
> — `contracts/server-actions.md §ActionResult, Code → destination, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

>     alt read fails
>         D-->>S: error
>         S->>X: reports the failure, details stay out of the response
>         S-->>UI: load failure, plain-language text only
>         UI-->>U: error state with retry (SCR-17), neither an empty state nor not found
>     else record doesn't exist or belongs to another Freelancer
>         D-->>S: no row for this Freelancer
>         S-->>UI: not found
>         UI-->>U: not found (SCR-16), identical in both cases
>
> — `sad.md §6, flow 12 steps 4–13, abridged` · full text: [sad.md](../sad.md)

> | default | The page action returns `NOT_FOUND` → `notFound()`. There is one text per record type (invoice, Customer, sender profile, product), **identical** for a missing and a foreign record. It has Back and Dashboard links (AC-29; flow 12). The editor group reuses the same component | `ContentAreaNotFound` (existing) | wireframe below |
>
> — `screens.md §SCR-16 Not found, default row, verbatim` · full text: [screens.md](../screens.md)

> `(protected)/{customers,products,sender-profiles}/…  ✎ typed failure → error boundary, not 404/empty (A6, A7)`
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Error handling | Actions return `ActionResult<T>` and never throw to the client. **Typed `code`** (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `FAILED`) plus a plain-language `error` and optional `fieldErrors`. Pages map `FAILED` to the segment `error.tsx` (retry + Sentry). Raw database or upstream text is logged, never returned |
>
> — `sad.md §8, row Error handling, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Consumes the ADR-0009 codes from every page-level read action (`getInvoiceEditorData`, `getInvoice`, `getPaginatedInvoices`, dashboard reads, customer / product / sender-profile list and detail reads).

— `contracts/server-actions.md §ActionResult, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-28 — error

> **Given** a Freelancer opening any page that shows their data (the invoice list, the dashboard, the sender profiles, customers and products pages, any invoice, customer or sender profile detail page, and the invoice editor) while that data can't be loaded
> **When** the page renders
> **Then** the Freelancer sees an error state with a way to retry, not an empty state and not "page not found", and the failure is reported to error monitoring. "Not found" is shown only for a record that doesn't exist or isn't theirs (AC-29), never for a load failure
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — authorization

> **Given** a Freelancer opening a link to an invoice, customer or sender profile that belongs to another Freelancer
> **When** the page loads
> **Then** the system shows "not found", exactly as for a record that doesn't exist, so it doesn't reveal that the record exists
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add a tiny page helper `unwrapPageResult(result)`: success → data; `NOT_FOUND` → `notFound()`; `UNAUTHORIZED` → `redirect('/login')`; else `throw new Error('load_failed')` after `Sentry.captureException` — `components/layout/content-area/` (or `lib/helpers/`)
- [ ] Apply it to: invoice list, dashboard (every section loader), sender profiles / customers / products lists, invoice / customer / sender-profile / product detail and edit pages, product custom prices, the editor pages — `app/(protected)/**`, `app/(invoice-editor)/**`
- [ ] Remove list-component fallbacks that render `EmptyState` on `!success` — `components/customers/customers-list.tsx`, `components/products/products-list.tsx`, `components/sender-profiles/sender-profiles-list.tsx`
- [ ] Make each `not-found.tsx` text identical for missing and foreign ("It doesn't exist or you can't open it.") and add one for invoices in the editor group
- [ ] Verify with the DB unreachable (wrong `DATABASE_URL` in a local run) and with another account's ids

## Edge cases

| Case | Behaviour |
|---|---|
| DB unreachable on `/customers` | SCR-17, not the empty state |
| DB unreachable on `/invoices/<id>/edit` | SCR-17 via `(invoice-editor)/error.tsx`, not not-found |
| Another Freelancer's customer id | SCR-16 with the same text as a random id |
| Truly empty customers list | Existing empty state (unchanged) |

## Definition of Done

- [ ] with the DB unreachable, every AC-28 page shows SCR-17 and reports the failure (checklist of pages in the PR) (AC-28)
- [ ] another account's invoice, customer and sender-profile ids show the same SCR-16 text as random ids (AC-29)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
