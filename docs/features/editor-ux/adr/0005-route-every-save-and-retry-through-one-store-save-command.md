---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-10"
feature_size: "M"
ticket: "editor-ux"
---

# 0005 — Route every save and Retry through one store save command

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

A save's outcome is handled in two places. The store's `saveInvoice` (`store/invoice-editor-store/use-invoice-editor-store.ts`) calls `createInvoice`/`updateInvoice`, applies the result and raises the failure toast whose Retry re-calls `saveInvoice` with the same options. The header hook (`hooks/use-editor-header-buttons.tsx`) wraps the same call and, after it, moves the address to the new invoice's editing address and opens the totals-changed and changed-elsewhere dialogs. Retry goes through the store only, so a new invoice saved by Retry stays on the create page and a conflict or totals change on a retried save shows no dialog (brief U13, spec AC-05c, AC-05d). After a save, `applySavedInvoice` uses the server's figures for the form as it was when the save began, so totals can disagree with lines changed meanwhile (AC-03, AC-04).

## Decision drivers

- Spec §6 NFR "Retry parity": 100 % of Save and Save-and-issue outcomes produce the same address, dialog and saved state when reached through Retry.
- Spec §6 NFR "Lost edits during save": 0 changes lost or marked saved by mistake across 50 runs; "Totals consistency": 100 % of sampled moments show totals equal to the lines on screen.
- AC-05b: an edit to a locked field during Save and issue is not saved, and the Freelancer is told.
- AC-04: totals on screen use the same rule as the stored totals (architecture-hardening ADR-0006).

## Considered options

1. **One save command in the store** — `save(intent)` (`'save' | 'issue'`, plus confirmed totals) is the only entry; it reads the form when called, tags the save with the form revision and resolves every outcome; buttons, the Retry toast and the totals dialog are thin callers.
2. **Keep outcome handling in the header hook and point Retry at it** — less code moves, but the toast is raised inside the store and needs a callback from a component, the logic stays split, and the next caller (a keyboard shortcut, an exit-with-save) can bypass it again.

## Decision outcome

**Chosen:** Option 1. The command resolves outcomes as follows:

- **Saved, revision unchanged** → apply the stored figures and version, mark saved.
- **Saved, revision changed** → apply only the new version, id and number; keep the form as it is; recompute subtotal, tax and total from the lines on screen with `computeInvoiceAmounts`; stay unsaved.
- **Issued, revision changed** → load the issued invoice (lines locked as issued); keep later edits only in the fields an issued invoice allows (due date, notes, payment terms, PO number) and stay unsaved if any; discard the rest and set a dismissable "not saved because the invoice is now issued" notice.
- **Created** → as above, then replace the address with the invoice's editing address (`history.replaceState`), so a reload opens it and the next save updates it. The provider then moves Next's router to the edit page (only if the address is still `/invoices/new` or already that edit page, so Back is not overridden) and the edit page's editor adopts this same store (Amendment 2026-10-10).
- **Changed elsewhere / totals changed** → set store state that the editor's dialog host turns into SCR-10 / SCR-09; confirming totals calls the same command with the confirmed figures.
- **Field errors** → set them on the fields (and their announcements, §8); **failed** → toast with Retry, which calls the same command with the current form and the intent that failed.
- Retry is ignored while a save is running or after the store was replaced (ADR-0003), as today.

## Consequences

**Positive**
- Save and Retry cannot diverge: there is one path.
- Every outcome is testable on the store alone, including the 50-run race.

**Negative**
- The store touches the browser address (through the history API, as the header already does).
- The header hook loses most of its logic; callers must not add post-save behaviour outside the command.

**Neutral**
- Server actions and their results are unchanged.

## Amendment 2026-10-10

A create does more than `history.replaceState`. The command only rewrites the address, and only while the editor is still on `/invoices/new` and the save is not stale. The provider that started as new sees the store get an id and calls `router.replace` to the edit page (guarded: only from `/invoices/new` or that invoice's edit address when the call runs), which mounts a second editor. That editor adopts the live store, so the in-flight edits, the save state and the Retry toast carry over without a remount of the data. The key, claim, disposal and AC-07 reasoning are in [[0003-create-one-editor-store-per-mounted-editor-from-server-data]]. The "store was replaced" rule for Retry now also holds after a hand-over: the adopted store is the same one, so Retry keeps working there.

## Links

- Spec: [[../spec.md]] US-02, AC-03, AC-04, AC-05, AC-05b, AC-05c, AC-05d
- SAD: [[../sad.md]] §4
- Related ADR: [[0003-create-one-editor-store-per-mounted-editor-from-server-data]]
