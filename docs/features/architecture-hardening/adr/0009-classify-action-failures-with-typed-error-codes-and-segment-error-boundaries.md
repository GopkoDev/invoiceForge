---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-09-30"
feature_size: "M"
ticket: "code-review 2026-09-26: A6, A7, A5, F3"
---

# 0009 — Classify action failures with typed error codes and route load failures to segment error boundaries

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Actions return `ActionResult<T> = { success, data?, error? }` (`types/actions.ts:5`), where `error` is free text. Pages guess what a failure means. The sender-profiles page renders the "create your first profile" empty state on any failure (A6). The customers, products and new-invoice pages turn any failure into `notFound()` (A7), which hides it from Sentry and offers no retry. The invoice list can show raw Prisma text on its error card (A5). There is no `error.tsx` in the `(protected)` or `(invoice-editor)` route groups; only `app/global-error.tsx` exists.

## Decision drivers

- AC-28: every data page shows an error state with retry on a load failure, never an empty state or "not found", and reports it to monitoring.
- AC-29: "not found" is shown for a missing record and a foreign record alike.
- §6.1 abuse case: error text must never leak internals; details go to monitoring.
- §2 convention: actions never throw to the client; forms rely on `ActionResult`.
- F3: account and profile actions return a non-standard `{ success, message }`.

## Considered options

1. **Typed error code in `ActionResult`, plus segment error boundaries.** Add `code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED'`, keeping `error` as the user-facing message and adding optional `fieldErrors`. Pages branch on the code: `NOT_FOUND` → `notFound()` (SCR-16), `UNAUTHORIZED` → sign-in (SCR-01), `FAILED` → throw a sanitized error caught by new `error.tsx` files in `(protected)` and `(invoice-editor)` (SCR-17: retry via `reset()` + `router.refresh()`, and Sentry capture).
2. **Leave the type alone; each of the eight data pages renders an inline error component** on `success: false`, telling "not found" apart by matching the error message. Smaller type change, but string matching breaks silently when a message changes (and there are no tests), the logic is copied eight times, and Sentry reporting has to be remembered on each page.

## Decision outcome

**Chosen:** Option 1. A discriminated code makes the three destinations (not found, sign-in, retry) a compile-time decision instead of a string guess. It keeps the "actions don't throw to the client" convention, because only pages throw, and only into their own error boundary. Forms keep handling `VALIDATION` and `CONFLICT` inline, with `fieldErrors` placed next to the offending field. F3's account and profile actions move onto the same type.

## Consequences

**Positive**
- A6 and A7 are fixed by construction, and every future page gets the same three-way outcome.
- Raw database or upstream text never reaches the client. Actions log the detail and return a plain message.

**Negative**
- Every existing action has to be touched to set codes. The change is mechanical but broad: about ten action files.
- Throwing from a server component into `error.tsx` replaces the whole segment's content, not an inline card. This is acceptable for a load failure (ux-flows left this to design).

**Neutral**
- `global-error.tsx` remains the last-resort boundary for the root layout.

## Links

- Spec: [[../spec.md]] AC-23, AC-28, AC-29, §6.1
- SAD: [[../sad.md]] §8
- Related ADR: [[0001-deny-by-default-in-proxy-with-public-allowlist]]

## Amendment 2026-09-30

The reporting path changed after this decision was accepted. The server reports the cause of a `FAILED` result once, through `captureException` in the action helper. The segment error boundary no longer reports a load failure a second time; it reports only errors that originate in the browser (client-side render errors). Option 1's "and Sentry capture" therefore means server-side capture for load failures, not capture by the boundary.
