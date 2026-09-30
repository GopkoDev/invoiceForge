---
id: T15
title: "Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button"
layer: "ui"
deps: ["T00"]
blocks: ["T16", "T18", "T19"]
acs: ["AC-20", "AC-22", "AC-17"]
files_hint: ["components/modals/global-modals/confirmation-modal/confirmation-modal.tsx", "components/modals/global-modals/confirmation-modal/types.ts", "store/use-modal-store.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T15 — Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button

## Place in the sequence

- **Blocked by:** — · **Blocks:** T16 — Build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog, T18 — Show the invoice count and export offer in the delete-account dialog, T19 — Refuse deleting a Customer or sender profile that has invoices, with the count · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`components/modals/global-modals/confirmation-modal/confirmation-modal.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task gives the three new confirmations (account deletion count, blocked record delete, legacy totals) one modal that can show content and stay open while the action runs.

## Inlined context

> | Component | Change | Why | Used by | Registered in design-system |
> |---|---|---|---|---|
> | `ConfirmationModal` | Adds a `body` (ReactNode) slot for counts, totals and alerts. `onConfirm` may be async: the confirm button shows a `Spinner`, the dialog stays open until the promise settles, and the caller decides whether to close. Adds `confirmDisabled` and a hideable confirm button | Today it calls `onClose()` right after `onConfirm()` (`confirmation-modal.tsx`), so it can't show a pending state, the SCR-14 `blocked` block, or SCR-15's figures | SCR-08, SCR-14, SCR-15 | pending (no `docs/design-system.md` yet) |
>
> — `screens.md §New components, ConfirmationModal row, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** None. Every screen composes the existing inventory.
>
> — `screens.md §New components, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** New UI (error-with-retry, confirmations, field messages, the logo warning) is composed from the existing shadcn/ui primitives (`Empty`, `AlertDialog`, `Field`, `Sonner`) and modals go through `store/use-modal-store.ts` (architecture-map §Frontend). No new state or routing library.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

> | deleting | Confirmed: Delete shows a `Spinner`, and the dialog **stays open** until the result arrives | `ConfirmationModal` ✎, `Spinner` | — |
>
> — `screens.md §SCR-14, deleting row, verbatim` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-20 — happy

> **Given** a Freelancer who has invoices
> **When** the Freelancer chooses to delete their account
> **Then** the system warns how many invoices will be permanently lost and offers an export first, and after confirmation removes all of the Freelancer's data in full (either everything is removed or nothing is): the account, its sign-in links, every session on every device, its email history, sender profiles with their bank accounts, Customers, products, custom prices, and invoices with their lines
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — cross-context

> **Given** a Freelancer deleting one Customer or one sender profile that has invoices
> **When** the Freelancer confirms the deletion
> **Then** the system blocks it, says how many invoices depend on it, and no invoice is removed
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — cross-context

> **Given** an invoice saved before this change whose stored total differs from the recomputed total, whose amounts break the rules above, or whose invoice number is also used by another invoice in the same sender profile
> **When** the Freelancer edits and saves it in the editor
> **Then** the system shows the old and new totals and asks for confirmation before saving; an invoice whose amounts break the rules can't be saved until they are corrected; and an invoice with a shared number can be opened and viewed but can't be saved until its number is changed to a free one. A status change from the invoice list does not touch amounts or number and is never blocked by these checks
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add props: `body?: ReactNode`, `confirmDisabled?: boolean`, `hideConfirm?: boolean`, `cancelLabel?`; `onConfirm: () => void | Promise<void>` — `components/modals/global-modals/confirmation-modal/types.ts`
- [ ] When `onConfirm` returns a promise: show `Spinner` in the confirm button, disable all buttons, keep the dialog open until it settles; do **not** auto-close — the caller closes — `confirmation-modal.tsx`
- [ ] Keep the old sync behaviour (close after `onConfirm`) for existing callers so none of them change — same file
- [ ] Pass-through for the new props in the modal store if data is typed there — `store/use-modal-store.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Existing sync callers | Unchanged: close right after confirm |
| Async confirm rejects | Buttons re-enabled, dialog stays open; caller shows the error |
| `hideConfirm` | Only Cancel/Close shown (SCR-14 blocked) |

## Definition of Done

- [ ] every existing confirmation (e.g. delete invoice) still works unchanged in `pnpm dev`
- [ ] a temporary async caller shows the spinner and keeps the dialog open until resolve
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
