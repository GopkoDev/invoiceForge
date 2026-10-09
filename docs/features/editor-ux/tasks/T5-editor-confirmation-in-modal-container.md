---
id: T5
title: "Mount the editor's confirmation dialog in the invoice-editor modal container"
layer: "ui"
deps: []
blocks: ["T11"]
acs: ["AC-16"]
files_hint: ["components/invoice-editor/invoice-editor.tsx", "components/modals/invoice-editor/invoice-editor-modal-container.tsx", "tests/component/invoice-editor-confirmation-modal-close.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T5 — Mount the editor's confirmation dialog in the invoice-editor modal container

## Place in the sequence

- **Blocked by:** nothing (can start at once) · **Blocks:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Wave:** DAG wave 1; delivery wave 1 of spec §1.
- **Lane:** shares files with T11 (`components/invoice-editor/invoice-editor.tsx`); T14 (`components/modals/invoice-editor/invoice-editor-modal-container.tsx`); T16 (`components/invoice-editor/invoice-editor.tsx`); T17 (`components/invoice-editor/invoice-editor.tsx`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Contributor
> **I want** a README whose steps work verbatim and a codebase without unused components or duplicate files
> **So that** I can run, test and change the app without chasing dead ends
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Places every editor dialog with the editor's other dialogs, as the repository convention requires.

## Inlined context

> The editor renders the shared `ConfirmationModal` inline instead of in its modal container | `components/invoice-editor/invoice-editor.tsx:142` renders it from `useModal('confirmationModal')`; every other area hosts it in its `*-modal-container.tsx` … | Move the confirmation dialog into `InvoiceEditorModalContainer` next to the unsaved-changes and validation dialogs; keep the F-47 `onClose` behaviour
>
> — `brief.md, finding U14, abridged` · full text: [brief.md](../brief.md)

> | Dialogs | Every editor dialog, the save confirmation included, goes through `store/use-modal-store.ts` and is mounted by `invoice-editor-modal-container.tsx` | repo convention (§2) |
>
> — `sad.md §8, row «Dialogs», verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-16 — happy path

> **Given** a Contributor reading the codebase after this change
> **When** they look for UI components, packages and the theme switcher
> **Then** every UI component in the shared component folder is used by the app, no package is installed only for a removed component, the deprecated identifier type package is removed, and the identifier helpers rely on the platform rather than a separate package. There is exactly one theme switcher; the landing page and the signed-in app both use it and it behaves the same in both. Every dialog in the invoice editor, the save confirmation included, is placed with the editor's other dialogs, as dialogs are in every other part of the app, and still behaves as before. The app builds, and lint and every automated test pass
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Move the `dynamic(... ConfirmationModal)` import and the `confirmationModal.isOpen && …` render block from `components/invoice-editor/invoice-editor.tsx` into `components/modals/invoice-editor/invoice-editor-modal-container.tsx`, keeping `onClose={props.onClose ?? close}`.
- [ ] Check the container is mounted for both `/invoices/new` and `/invoices/[id]/edit` (`app/(invoice-editor)/layout.tsx`).
- [ ] Update/extend `tests/component/invoice-editor-confirmation-modal-close.test.tsx` to render through the container.

## Edge cases

| Case | Behaviour |
|---|---|
| dialog closed via its own onClose (F-47) | the caller's cleanup still runs |
| totals confirmation and changed-elsewhere flows | open and behave exactly as before |

## Definition of Done

- [ ] existing confirmation-modal and changed-elsewhere component tests pass
- [ ] `grep ConfirmationModal components/invoice-editor` finds nothing
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
