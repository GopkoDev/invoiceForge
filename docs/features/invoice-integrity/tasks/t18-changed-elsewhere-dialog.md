---
id: T18
title: "Round-trip the loaded version and open the changed-elsewhere dialog and stale state on CHANGED_ELSEWHERE"
layer: "ui"
deps: ["T08", "T17"]
blocks: []
acs: ["AC-10"]
files_hint: ["components/invoice-editor/", "tests/component/invoice-editor-changed-elsewhere.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T18 — Round-trip the loaded version and open the changed-elsewhere dialog and stale state on CHANGED_ELSEWHERE

## Place in the sequence

- **Blocked by:** T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices, T17 — Show every new invoice rule refusal under its field in the editor · **Blocks:** — · **Wave:** 7 — last in the editor lane; needs the server's `CHANGED_ELSEWHERE` and the error routing T17 settled.
- **Lane:** `components/invoice-editor/` lane (T16 → T17 → T18, serialized).

## Why (user story)

> **As a** Freelancer
> **I want** a save from an outdated editor to be refused with an explanation
> **So that** marking an invoice paid in one tab is never undone by saving it in another
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task carries the loaded version through every editor save and turns the server's refusal into the SCR-05 dialog and the stale state.

## Inlined context

> SCR-05 — Invoice changed elsewhere
> - default: an editor save → `CONFLICT` + `CHANGED_ELSEWHERE`. Title "This invoice changed elsewhere". Body shows the result's `error` verbatim ("This invoice was changed elsewhere after you opened it. Reload it to see the latest version.") and adds "Reloading discards your unsaved changes." Buttons: **Close** and **Reload invoice**
> - reloading: Reload invoice → re-fetch the editor data. Confirm shows a `Spinner`, both buttons disabled. The unsaved-changes guard does not fire
> - reloaded: the caller closes the dialog; the editor re-initialises from the current invoice and its `version`, in the mode of its current status (e.g. reopens as paid with its paid date, in issued mode)
> - closed: Close or Esc → SCR-02 enters `stale`, edits still on screen
> - reload-not-found: invoice gone → SCR-13; reload-error → architecture-hardening SCR-17 (`LoadError`)
>
> — `screens.md §SCR-05, all states, abridged` · full text: [screens.md](../screens.md)

> SCR-02 — saved: `SavedInvoice` replaces the form values, and the new `version` becomes the next `loadedVersion`. changed-elsewhere: Save or Save and issue → `CONFLICT` + `CHANGED_ELSEWHERE` → opens SCR-05; nothing stored. stale: SCR-05 closed without reloading. A warning `Alert` above the form reads "This invoice was changed elsewhere. Reload it to continue." with a **Reload** `Button` (same as SCR-05's Reload). Save stays enabled, and any save re-opens SCR-05.
>
> — `screens.md §SCR-02, states saved, changed-elsewhere, stale, abridged` · full text: [screens.md](../screens.md)

> `CONFLICT` is routed by `details.kind`. `CHANGED_ELSEWHERE` opens SCR-05. `TOTALS_CHANGED` opens architecture-hardening SCR-15 (unchanged). A default race or a taken number shows the result's `error`. Reused: `ConfirmationModal` (`body` slot), `Spinner`, `Alert`, `Button`, `LoadError`, `ContentAreaNotFound` — **no new component**.
>
> — `screens.md §Source, Error routing + §New components, abridged` · full text: [screens.md](../screens.md)

> `updateInvoice` refuses with `CONFLICT` and the AC-10 message when the submitted `loadedVersion` differs from the locked row's, before any other rule runs. A successful save returns the new version so the editor's next save compares against it.
>
> — `adr/0004-detect-outdated-views-with-an-invoice-version-counter.md, Decision outcome, abridged` · full text: [ADR-0004](../adr/0004-detect-outdated-views-with-an-invoice-version-counter.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `InvoiceFormInput.loadedVersion` — `integer ≥ 0`, **required by `updateInvoice`** (missing → `VALIDATION`, `fieldErrors.loadedVersion = ["Reload the invoice and try again."]`); ignored by `createInvoice`.
- `getInvoiceEditorData` — `initialData.version` ★, which the editor sends back as `loadedVersion`.
- `SavedInvoice.version` ★ — the editor's next `loadedVersion`.
- Refusal: `{ success: false, code: "CONFLICT", error: "This invoice was changed elsewhere after you opened it. Reload it to see the latest version.", details: { kind: "CHANGED_ELSEWHERE", currentVersion: 4 } }`.

— `contracts/server-actions.md §InvoiceFormInput, §SavedInvoice, §updateInvoice step 3, §getInvoiceEditorData, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-10 — domain invariant (concurrent edge)

> **Given** a Freelancer has a pending invoice open in the editor, and marks it paid from the invoice list in another tab
> **When** they save from the editor that was opened before the payment
> **Then** the system refuses the save and tells them the invoice was changed elsewhere and must be reloaded. The invoice stays paid with its payment date, and nothing from the refused save is stored. The same refusal applies to drafts and to any change made elsewhere after the editor was opened, including a notes-only edit. A status change from the invoice list is not checked for freshness; it is accepted or refused by AC-04 against the invoice's current status, so marking paid an invoice that was cancelled elsewhere is refused as a change out of cancelled
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

(Editor half; the server check is T08, the list half T15.)

## Checklist

- [ ] `components/invoice-editor/invoice-editor-form.tsx` (and the save hook) — keep `loadedVersion` from `initialData.version`, send it on Save and Save and issue, adopt `SavedInvoice.version` after each success.
- [ ] `components/invoice-editor/` — on `CONFLICT` + `CHANGED_ELSEWHERE` open `ConfirmationModal` with the SCR-05 title/body/buttons; Reload re-fetches editor data, bypasses the unsaved-changes guard, re-initialises in the current status's mode; not-found → SCR-13; error → `LoadError`.
- [ ] Same — Close/Esc sets `stale`: warning `Alert` + **Reload** `Button`; any further save re-opens SCR-05.
- [ ] Keep other `CONFLICT` kinds (`TOTALS_CHANGED`, taken number) on their existing routes.
- [ ] `tests/component/invoice-editor-changed-elsewhere.test.tsx` — version round-trip, dialog, reload (pending → reopens paid in issued mode), close → stale → save re-opens.

## Edge cases

| Case | Behaviour |
|---|---|
| Two successful saves in a row | Second save sends the version returned by the first; accepted |
| Draft changed elsewhere (notes-only) | Same SCR-05 refusal |
| Reload after the invoice was deleted elsewhere | SCR-13 |
| Reload request fails | `LoadError` (SCR-17) |
| Dialog closed, user saves again | SCR-05 re-opens; nothing stored |
| `CONFLICT` + `TOTALS_CHANGED` | Unchanged: SCR-15 dialog, not SCR-05 |

## Definition of Done

- [ ] Component tests show the editor sends loadedVersion and adopts the saved version, a CHANGED_ELSEWHERE result opens SCR-05 with the error verbatim, Reload re-initialises the editor in the current status's mode, and Close leaves the stale Alert with Reload while any save re-opens SCR-05.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
