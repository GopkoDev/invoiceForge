---
id: T08
title: "Introduce typed ActionResult error codes and move every action onto them"
layer: "app"
deps: ["T00"]
blocks: ["T09", "T11", "T13", "T17", "T19", "T20", "T21", "T26", "T28"]
acs: ["AC-29"]
files_hint: ["types/actions.ts", "lib/helpers/auth-helpers.ts", "lib/actions/", "components/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T08 — Introduce typed ActionResult error codes and move every action onto them

## Place in the sequence

- **Blocked by:** — · **Blocks:** T09 — Treat sessions without a live account as Visitors in layouts and guards, T11 — Tighten the invoice schema and add applyStatusChange for the paid date, T13 — Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts, T17 — Add the deletion summary and delete the account in one explicit transaction, T19 — Refuse deleting a Customer or sender profile that has invoices, with the count, T20 — Require an https logo link when saving a sender profile, T21 — Validate custom prices on create and update and link them to an explicit owned Customer, T26 — Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found, T28 — Check the session before parsing input in profile and account settings actions · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T06 (`components/invoice-editor/pdf-preview-panel.tsx`), T09 (`lib/helpers/auth-helpers.ts`), T10 (`lib/actions/invoice-actions/helpers.ts`), T11 (`lib/actions/invoice-actions/invoice-actions.ts`), T12 (`lib/actions/invoice-actions/numbering.ts`), T13 (`lib/actions/invoice-actions/invoice-actions.ts`), T14 (`lib/actions/invoice-actions/invoice-actions.ts`), T15 (`components/modals/global-modals/confirmation-modal/confirmation-modal.tsx`), T16 (`components/invoice-editor/invoice-details-section.tsx`), T17 (`lib/actions/account-actions.ts`), T18 (`components/settings/gdpr-settings.tsx`), T19 (`lib/actions/customer-actions.ts`), T20 (`lib/actions/sender-profile-actions.ts`), T21 (`lib/actions/custom-price-actions.ts`), T22 (`components/time-zone-cookie.tsx`), T23 (`lib/actions/invoice-actions/invoice-actions.ts`), T24 (`lib/actions/dashboard-actions.ts`), T25 (`components/layout/content-area/load-error.tsx`), T26 (`components/layout/content-area/`), T28 (`lib/actions/profile-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** a clear error with a retry when my data can't be loaded
> **So that** I don't mistake a failure for "no data" or "page missing" and create duplicates
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task gives every action one closed set of outcomes, so pages can tell "not found" from "load failed" from "not signed in", and a foreign record reads exactly like a missing one.

## Inlined context

> A discriminated code makes the three destinations (not found, sign-in, retry) a compile-time decision instead of a string guess. It keeps the "actions don't throw to the client" convention, because only pages throw, and only into their own error boundary. Forms keep handling `VALIDATION` and `CONFLICT` inline, with `fieldErrors` placed next to the offending field. F3's account and profile actions move onto the same type.
>
> — `adr/0009, Decision outcome, verbatim` · full text: [ADR-0009](../adr/0009-classify-action-failures-with-typed-error-codes-and-segment-error-boundaries.md)

> ```ts
> type ActionErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED';
>
> type ActionResult<T = void> =
>   | { success: true; data: T }
>   | {
>       success: false;
>       code: ActionErrorCode;
>       error: string;                              // plain language, never raw DB/upstream text
>       fieldErrors?: Record<string, string[]>;     // VALIDATION / CONFLICT on forms, keyed by form path
>       details?: ActionErrorDetails;               // ★ amendment (this contract): structured context
>     };
>
> type ActionErrorDetails =
>   | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }   // AC-17
>   | { kind: 'HAS_INVOICES'; invoiceCount: number };                                 // AC-22
> ```
>
> — `contracts/server-actions.md §ActionResult, type block, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> | Code | When | Page caller | Form caller |
> |---|---|---|---|
> | `UNAUTHORIZED` | no session, or a token without a live account (ADR-0002). Checked **before any argument is parsed** (AC-23) | redirect to sign-in (SCR-01) | redirect to sign-in |
> | `NOT_FOUND` | the record doesn't exist or isn't the caller's, with an identical message (AC-29) | `notFound()` (SCR-16) | toast / inline |
> | `VALIDATION` | the shared zod schema failed, or a domain rule broke (AC-14/15/16/19) | — | `fieldErrors` next to the fields |
> | `CONFLICT` | a uniqueness or state invariant (AC-08, AC-17, AC-22) | — | inline (`fieldErrors`) or a dialog (`details`) |
> | `FAILED` | anything else. The detail goes to `console.error` + Sentry | throw → segment `error.tsx` (SCR-17) | toast with retry |
>
> — `contracts/server-actions.md §ActionResult, Code → destination, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> Only actions this feature adds or whose contract changes are listed. Every other action keeps its signature and only moves onto the shared `ActionResult` codes (ADR-0009, about ten files).
>
> — `contracts/server-actions.md, intro, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** Data access lives in `lib/actions/<domain>-actions.ts`. `getAuthenticatedUser()` runs first, then queries are scoped by `userId` (`lib/helpers/auth-helpers.ts:10`). Actions return `ActionResult<T>` (`types/actions.ts:5`) and never throw to the client.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Error handling | Actions return `ActionResult<T>` and never throw to the client. **Typed `code`** (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `FAILED`) plus a plain-language `error` and optional `fieldErrors`. Pages map `FAILED` to the segment `error.tsx` (retry + Sentry). Raw database or upstream text is logged, never returned |
>
> — `sad.md §8, row Error handling, verbatim` · full text: [sad.md](../sad.md)

Compile-coupled contract: changing `ActionResult` to a discriminated union breaks every action and caller in the same commit, so this task carries the type **and** all ~137 `success: false` return sites (`grep -rn "success: false" lib/actions`). Wave note: ADR-0009 is listed under wave 3 in sad §7, but wave-2 actions need `CONFLICT` + `details`, so the type lands first; the page-side mapping to `error.tsx` stays in wave 3 (T25/T26).

Current state (code): `types/actions.ts` is `{ success: boolean; data?: T; error?: string }`; `getAuthenticatedUser()` returns `{ success: false, error: 'Unauthorized' }`.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> ```ts
> type ActionErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED';
> type ActionErrorDetails =
>   | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }
>   | { kind: 'HAS_INVOICES'; invoiceCount: number };
> ```
>
> — `contracts/server-actions.md §ActionResult, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-29 — authorization

> **Given** a Freelancer opening a link to an invoice, customer or sender profile that belongs to another Freelancer
> **When** the page loads
> **Then** the system shows "not found", exactly as for a record that doesn't exist, so it doesn't reveal that the record exists
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Replace the type with the discriminated union + `ActionErrorCode` + `ActionErrorDetails` + `DecimalString`; add small constructors `ok(data)`, `fail(code, error, extra?)` — `types/actions.ts`
- [ ] `getAuthenticatedUser()` → `fail('UNAUTHORIZED', 'Not signed in.')`; its internal catch → `FAILED` — `lib/helpers/auth-helpers.ts`
- [ ] Walk every action in `lib/actions/**`: missing/foreign record → `NOT_FOUND` with one identical message per entity ("Invoice not found." etc.); zod failure → `VALIDATION` + `fieldErrors`; catch-all → `FAILED` with plain text (raw error only to `console.error`)
- [ ] Fix callers that read `.error`/`.data` without narrowing on `success` — `components/**`, `app/**` (keep behaviour; page-level routing changes are T26)
- [ ] Leave `account-actions.ts` / `profile-actions.ts` return shapes as they are if their redesign is owned by T17 / T28 — only make them compile

## Edge cases

| Case | Behaviour |
|---|---|
| Foreign id passed to any `get*`/`update*`/`delete*` action | `NOT_FOUND` with the same text as a missing id (AC-29) |
| Prisma throws inside an action | `FAILED`, plain-language `error`; the raw message only in `console.error` |
| Caller checks `result.error` on success | Type error — fix the caller to narrow on `success` |

## Definition of Done

- [ ] `pnpm exec tsc --noEmit` passes with the discriminated union (no `as` casts added to silence it)
- [ ] every `success: false` in `lib/actions/**` carries a `code` (`grep` shows none without)
- [ ] spot check in `pnpm dev`: opening another account's invoice/customer/profile id returns the same `NOT_FOUND` message as a random id (AC-29)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
