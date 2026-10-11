---
id: T14
title: "Route Retry, the created-address change and the save dialogs through the save command"
layer: "app"
deps: ["T13"]
blocks: ["T20"]
acs: ["AC-05c", "AC-05d"]
files_hint: ["store/invoice-editor-store/save-command.ts", "store/invoice-editor-store/create-invoice-editor-store.ts", "hooks/use-editor-header-buttons.tsx", "components/modals/invoice-editor/invoice-editor-modal-container.tsx", "tests/component/invoice-editor-retry-parity.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Route Retry, the created-address change and the save dialogs through the save command

## Place in the sequence

- **Blocked by:** T13 — Add the store save command with a form revision and resolve every save outcome in it · **Blocks:** T20 — Add e2e tests that reach every save outcome by Save and by Retry and compare the results · **Wave:** DAG wave 6; delivery wave 3 of spec §1.
- **Lane:** shares files with T5 (`components/modals/invoice-editor/invoice-editor-modal-container.tsx`); T11 (`hooks/use-editor-header-buttons.tsx`, `store/invoice-editor-store/create-invoice-editor-store.ts` +1); T13 (`hooks/use-editor-header-buttons.tsx`, `store/invoice-editor-store/create-invoice-editor-store.ts` +1) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** to keep typing while an invoice is saving
> **So that** my change is never lost or marked saved by mistake, the totals always match the lines I see, and retrying a failed save behaves exactly like saving
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Makes Retry behave exactly like Save for every outcome.

## Inlined context

> Retry lives in the store's toast and skips the header's address change and dialogs
>
> — `sad.md §3, brownfield note, abridged` · full text: [sad.md](../sad.md)

> - **Created** → as above, then replace the address with the invoice's editing address (`history.replaceState`), so a reload opens it and the next save updates it.
> - **Changed elsewhere / totals changed** → set store state that the editor's dialog host turns into SCR-10 / SCR-09; confirming totals calls the same command with the confirmed figures.
> - **failed** → toast with Retry, which calls the same command with the current form and the intent that failed.
> - Retry is ignored while a save is running or after the store was replaced (ADR-0003), as today.
> …
> The header hook loses most of its logic; callers must not add post-save behaviour outside the command.
>
> — `adr/0005-route-every-save-and-retry-through-one-store-save-command.md §Decision outcome, ADR-0005, abridged` · full text: [adr/0005-route-every-save-and-retry-through-one-store-save-command.md](../adr/0005-route-every-save-and-retry-through-one-store-save-command.md)

> alt a save is already running or the editor moved to another invoice → nothing happens
> else Retry accepted → save command repeats the failed intent with the form as it is now
>   created → replaces the address with the invoice's own editing address; a reload opens it and the next Save updates it
>   changed elsewhere → the same changed-elsewhere dialog as Save, with Reload
>   totals changed → the same totals confirmation as Save
>   failed again → failure message with Retry, every change on screen
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> | Retry parity | 100 % of Save and Save-and-issue outcomes (created, updated, issued, changed elsewhere, totals changed, field error) produce the same address, dialog and saved state when reached through Retry | automated editor test per outcome |
>
> — `spec.md §6, NFR «Retry parity», verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-05c — happy path

> **Given** a Freelancer creating a new invoice whose save failed, with the failure message offering Retry
> **When** they choose Retry and the save succeeds
> **Then** Retry repeats the action that failed (Save, or Save and issue) with the form as it is when Retry is chosen, including any change made after the failure. The editor treats it exactly like a successful Save: the invoice is confirmed as created, and the browser's address becomes the saved invoice's own editing address. Reloading the page opens that invoice, not a blank new one, and the next Save updates it instead of creating a second invoice
>
> — `spec.md §5, AC-05c, verbatim` · full text: [spec.md](../spec.md)

### AC-05d — error

> **Given** a Freelancer whose save failed, with the failure message offering Retry
> **When** they choose Retry and the system refuses the retried save because the invoice was changed elsewhere, or asks them to confirm changed totals
> **Then** they see the same changed-elsewhere explanation or totals confirmation that Save shows, and can reload or confirm from there. A retried save never fails silently, and Retry while a save is running or after the editor moved to another invoice does nothing, as today
>
> — `spec.md §5, AC-05d, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] In `save-command.ts`: on `FAILED` show the toast whose Retry calls `save(lastFailedIntent)`; ignore it if `isSaving` or the store's `sessionToken` changed.
- [ ] On created: `history.replaceState` to `/invoices/{id}/edit` (and `router.replace` without remount if needed so the next save updates).
- [ ] Move the totals-confirmation and changed-elsewhere opening from `use-editor-header-buttons.tsx` into the modal container (`invoice-editor-modal-container.tsx`), driven by the store's `pendingDialog`; confirming totals calls `save(intent, { confirmedTotals })`.
- [ ] Thin `use-editor-header-buttons.tsx` to button state + `save(intent)` calls.
- [ ] Component tests: each outcome (created, updated, issued, changed elsewhere, totals changed, field error) reached by Save and by Retry yields the same URL, dialog and unsaved flag; Retry during a save is a no-op.

## Edge cases

| Case | Behaviour |
|---|---|
| Retry after editing a field following the failure | the edited form is saved (AC-05c) |
| Retry of a new invoice twice after success | second Save updates, never creates a second invoice |
| Retry after navigating to another invoice | nothing happens (AC-05d) |
| Retry fails again | failure message with Retry, every change on screen |

## Definition of Done

- [ ] Save-vs-Retry parity component tests pass for all six outcomes
- [ ] `invoice-editor-changed-elsewhere` and confirmation-modal tests pass
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
