---
id: T13
title: "Add the store save command with a form revision and resolve every save outcome in it"
layer: "app"
deps: ["T11"]
blocks: ["T14"]
acs: ["AC-03", "AC-04", "AC-05", "AC-05b"]
files_hint: ["store/invoice-editor-store/save-command.ts", "store/invoice-editor-store/create-invoice-editor-store.ts", "store/invoice-editor-store/types.ts", "hooks/use-editor-header-buttons.tsx", "components/invoice-editor/invoice-editor-save-status.tsx", "tests/component/invoice-editor-store-save-states.test.tsx", "tests/unit/store/save-command-race.test.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T13 — Add the store save command with a form revision and resolve every save outcome in it

## Place in the sequence

- **Blocked by:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Blocks:** T14 — Route Retry, the created-address change and the save dialogs through the save command · **Wave:** DAG wave 5; delivery wave 3 of spec §1.
- **Lane:** shares files with T11 (`components/invoice-editor/invoice-editor-save-status.tsx`, `hooks/use-editor-header-buttons.tsx` +3); T14 (`hooks/use-editor-header-buttons.tsx`, `store/invoice-editor-store/create-invoice-editor-store.ts` +1); T16 (`components/invoice-editor/invoice-editor-save-status.tsx`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** to keep typing while an invoice is saving
> **So that** my change is never lost or marked saved by mistake, the totals always match the lines I see, and retrying a failed save behaves exactly like saving
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Guarantees that a change typed during a save is never lost or marked saved and that totals always add up the lines on screen.

## Inlined context

> **One save command owns every outcome** — Save, Save and issue, Retry and confirming changed totals all call one store command that reads the form when it is called, tags the save with the form's revision and resolves every outcome itself … Totals shown after a save are either the stored figures (no edit since the save began) or recomputed from the lines on screen by the shared decimal module (architecture-hardening ADR-0006).
> …
> **Edits during a save are detected by a form revision counter**, not by comparing values: every edit increments it, and a save remembers the revision it started from.
>
> — `sad.md §4, strategic choice 4 + tactical choice, abridged` · full text: [sad.md](../sad.md)

> - **Saved, revision unchanged** → apply the stored figures and version, mark saved.
> - **Saved, revision changed** → apply only the new version, id and number; keep the form as it is; recompute subtotal, tax and total from the lines on screen with `computeInvoiceAmounts`; stay unsaved.
> - **Issued, revision changed** → load the issued invoice (lines locked as issued); keep later edits only in the fields an issued invoice allows (due date, notes, payment terms, PO number) and stay unsaved if any; discard the rest and set a dismissable "not saved because the invoice is now issued" notice.
> - **Changed elsewhere / totals changed** → set store state that the editor's dialog host turns into SCR-10 / SCR-09; confirming totals calls the same command with the confirmed figures.
> - **Field errors** → set them on the fields (and their announcements, §8)
>
> — `adr/0005-route-every-save-and-retry-through-one-store-save-command.md §Decision outcome, ADR-0005, abridged` · full text: [adr/0005-route-every-save-and-retry-through-one-store-save-command.md](../adr/0005-route-every-save-and-retry-through-one-store-save-command.md)

> | Lost edits during save | 0 changes lost or marked saved by mistake across 50 runs of an edit raced against a save | automated editor test |
> | Totals consistency | 100 % of sampled moments show subtotal, tax and total equal to the lines on screen, across the 50 race runs above | same automated editor test |
>
> — `spec.md §6, NFR rows, verbatim` · full text: [spec.md](../spec.md)

> vitest tests on the store's save command with a controllable fake server action (resolve after an injected edit; sample totals after every state change against `computeInvoiceAmounts` of the visible lines)
>
> — `sad.md §10, QG-1 How verify, abridged` · full text: [sad.md](../sad.md)

> Business rules, data and server-side checks stay exactly as `invoice-integrity` left them; this feature changes only how the existing behaviour is loaded, shown and announced.
>
> — `spec.md §1, Committed approach, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-03 — happy path

> **Given** a Freelancer editing a draft invoice who clicks Save (not Save and issue)
> **When** they change a line's quantity before the save completes
> **Then** the save is confirmed and the invoice stays marked as having unsaved changes. The totals on screen add up the lines as they are now, including the new quantity. Leaving the page warns about unsaved changes, and the next Save stores the new quantity
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** a Freelancer editing any invoice the editor lets them change
> **When** a save completes, whether or not they changed something while it was running
> **Then** the subtotal, tax and total on screen always equal what the lines on screen add up to, under the invoice's tax and discount. The totals on screen are calculated by the same rule as the stored totals (rounding, and the order of discount and tax), so for the same lines they agree to the cent. If nothing changed during the save, the figures the system calculated and stored are shown, and the invoice is marked saved. Any edit made after the save started counts as a change, even one that puts a value back as it was, so the invoice stays marked unsaved. The editor never shows totals that belong to an older version of the form
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — error

> **Given** a Freelancer who changes a line while a save is running
> **When** the system refuses that save, because a field is invalid or the invoice was changed elsewhere (the `invoice-integrity` refusals)
> **Then** the system explains the refusal in plain language as it does today. Every change the Freelancer typed, including the one made during the save, is still on screen and marked unsaved. Nothing from the refused save is stored
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-05b — cross-context

> **Given** a Freelancer who clicks Save and issue on a draft and changes a line's quantity before that save completes
> **When** the save completes and the invoice is now issued
> **Then** the editor shows the invoice as issued, with the lines locked as they were issued, as for any issued invoice. A plain-language warning says that the quantity change was not saved because the invoice is now issued, and lets the Freelancer dismiss it, so the change is never silently dropped. The issued invoice keeps the lines it was issued with. Changes to the fields an issued invoice still allows (due date, notes, payment terms, PO number) save as usual
>
> — `spec.md §5, AC-05b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `revision: number` to the store; every form-mutating action increments it (including one that restores a previous value).
- [ ] `store/invoice-editor-store/save-command.ts`: `save(intent: 'save' | 'save-and-issue', opts?)` — snapshot form + revision, call the existing server action with the version, resolve per ADR-0005; keep the `sessionToken` guard; record `lastFailedIntent` for T14.
- [ ] Issued-with-edits: keep only due date, notes, payment terms, PO number edits (`lib/helpers/invoice-locked-fields.ts`), set `issuedEditsDroppedNotice`; render it dismissable in `invoice-editor-save-status.tsx`.
- [ ] Changed-elsewhere / totals-changed: set `pendingDialog` state; keep the header hook's dialog opening for now (T14 moves it) but have it read from the command's result.
- [ ] `hooks/use-editor-header-buttons.tsx`: Save / Save and issue call `save(intent)`.
- [ ] `tests/unit/store/save-command-race.test.ts`: 50 runs with a fake action resolving after an injected edit at a random point; assert unsaved flag, the edit present, and totals == `computeInvoiceAmounts(visible lines)` after every state change; plus one test per outcome.

## Edge cases

| Case | Behaviour |
|---|---|
| edit that puts a value back as it was | still counts as a change, invoice stays unsaved (AC-04) |
| Save and issue with an edit to a locked field | issued lines kept, dismissable warning shown (AC-05b) |
| Save and issue with an edit to due date / notes / payment terms / PO number | edit kept, stays unsaved, saves as usual |
| field-invalid refusal with an edit during the save | every change on screen, unsaved, nothing stored (AC-05) |
| save resolves after the store was replaced | dropped by the sessionToken guard |

## Definition of Done

- [ ] the 50-run race test passes with 0 lost edits and 100 % totals consistency
- [ ] one test per outcome passes; `invoice-editor-store-save-states` and `invoice-integrity` tests pass
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
