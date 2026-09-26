---
id: T18
title: "Show the invoice count and export offer in the delete-account dialog"
layer: "ui"
deps: ["T00", "T15", "T17"]
blocks: []
acs: ["AC-20"]
files_hint: ["components/settings/gdpr-settings.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T18 — Show the invoice count and export offer in the delete-account dialog

## Place in the sequence

- **Blocked by:** T15 — Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button, T17 — Add the deletion summary and delete the account in one explicit transaction · **Blocks:** — · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`components/settings/gdpr-settings.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task makes the Freelancer see how many invoices will be lost and offers the export at the moment of deletion.

## Inlined context

> | counting | Dialog opened, `getAccountDeletionSummary` in flight. A `Skeleton` fills the count line, and Confirm is disabled | `ConfirmationModal` (✎ extended), `Skeleton` | wireframe below |
> | default | `invoiceCount` ≥ 1: "{N} invoices will be permanently lost." plus a `Button` "Export my data first" (AC-20; flow 3) | `ConfirmationModal` ✎, `Button` | wireframe below |
> | zero-invoices | `invoiceCount` = 0: the general permanence warning, without a count line | `ConfirmationModal` ✎ | — |
> | count-failed | `getAccountDeletionSummary` → `FAILED`: `Alert` (destructive) "Couldn't count your invoices." with a Retry `Button`. **Confirm stays disabled** until a count loads | `Alert`, `Button` | wireframe below |
> | exporting | "Export my data first" pressed. That button shows a `Spinner`, and the dialog stays open. After the file downloads, the Freelancer is back in this dialog (AC-24) | `Button`, `Spinner` | — |
> | export-failed | Export 500: `toast.error` "Your data couldn't be exported. Try again." The dialog stays open | `Sonner` | — |
> | deleting | Confirmed: Confirm shows a `Spinner`, every button is disabled, and the dialog stays open until the result arrives | `ConfirmationModal` ✎, `Spinner` | — |
> | delete-failed | `FAILED` → the dialog closes, and SCR-07 shows `toast.error` (see SCR-07). Nothing was removed | `Sonner` | SCR-07 |
> | deleted | Success → sign out → SCR-01 (AC-20, AC-21) | — | SCR-01 |
>
> — `screens.md §SCR-08 Delete-account confirmation, states, verbatim` · full text: [screens.md](../screens.md)

> | exporting | Export requested: the export `Button` shows a `Spinner` and is disabled | `Button`, `Spinner` | — |
> | export-failed | 500 `FAILED`: `toast.error` "Your data couldn't be exported. Try again." | `Sonner` | — |
> | delete-failed | SCR-08 → `deleteUserAccount` `FAILED`. Back on SCR-07 with `toast.error` "Your account couldn't be deleted. Nothing was removed." (AC-20; flow 3) | `Sonner` | — |
>
> — `screens.md §SCR-07 Privacy & data settings, changed states, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** **Strings:** inline, because the app has no i18n layer. Where the contract fixes a message (`contracts/server-actions.md`, `contracts/openapi.yaml`), the UI shows it **verbatim** from the result's `error` / `fieldErrors`. It never rewrites it and never shows raw database or upstream text (spec §6.1).
>
> — `screens.md §Source, Strings, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** New UI (error-with-retry, confirmations, field messages, the logo warning) is composed from the existing shadcn/ui primitives (`Empty`, `AlertDialog`, `Field`, `Sonner`) and modals go through `store/use-modal-store.ts` (architecture-map §Frontend). No new state or routing library.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Calls `getAccountDeletionSummary()`, `deleteUserAccount()` (T17) and `GET /api/user/export` (existing; its rename/parallelization is T27).

— `contracts/server-actions.md §Account and profile`, `contracts/openapi.yaml exportUserData`, abridged

## Acceptance criteria

### AC-20 — happy

> **Given** a Freelancer who has invoices
> **When** the Freelancer chooses to delete their account
> **Then** the system warns how many invoices will be permanently lost and offers an export first, and after confirmation removes all of the Freelancer's data in full (either everything is removed or nothing is): the account, its sign-in links, every session on every device, its email history, sender profiles with their bank accounts, Customers, products, custom prices, and invoices with their lines
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Open the extended `ConfirmationModal` with a `body` that loads the summary (Skeleton → count / zero / count-failed + Retry); `confirmDisabled` until a count is loaded — `components/settings/gdpr-settings.tsx`
- [ ] "Export my data first" button reusing the page's export handler, with its own spinner; dialog stays open
- [ ] Async `onConfirm` → `deleteUserAccount()`; success → `signOut({ callbackUrl: '/login' })`; `FAILED` → close + `toast.error(error)`
- [ ] Page-level export button: spinner + disabled while exporting; failure toast text per SCR-07

## Edge cases

| Case | Behaviour |
|---|---|
| Summary fails | Confirm disabled; Retry reloads the count |
| Export fails inside the dialog | Toast; dialog stays open, delete still possible after a count loaded |
| Deletion fails | Dialog closes, SCR-07 toast "Your account couldn't be deleted. Nothing was removed." |

## Definition of Done

- [ ] manual walk of every SCR-08 state and the changed SCR-07 states in `pnpm dev` matches screens.md (count-failed and delete-failed forced by temporarily throwing in the action)
- [ ] deleting a throwaway account lands on sign-in (AC-20)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
