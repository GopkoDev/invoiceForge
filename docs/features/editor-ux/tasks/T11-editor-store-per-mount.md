---
id: T11
title: "Turn the editor store into a per-mount factory provided by context and built from server data"
layer: "app"
deps: ["T5", "T8", "T10"]
blocks: ["T12", "T13", "T15", "T16", "T17", "T18"]
acs: ["AC-06", "AC-07"]
files_hint: ["store/invoice-editor-store/", "components/invoice-editor/", "hooks/use-editor-header-buttons.tsx", "hooks/use-invoice-item-handlers.ts", "hooks/use-invoice-reload.ts", "hooks/use-unsaved-changes-guard.ts", "hooks/use-number-draft.ts", "app/(invoice-editor)/", "eslint.config.mjs", "tests/component/invoice-editor-store-provider.test.tsx"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Turn the editor store into a per-mount factory provided by context and built from server data

## Place in the sequence

- **Blocked by:** T5 — Mount the editor's confirmation dialog in the invoice-editor modal container, T8 — Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint, T10 — Lay out the HTML preview and the PDF from the document model and add the parity test · **Blocks:** T12 — Compute a new invoice's today and due date on the server and reserve the invoice-number field, T13 — Add the store save command with a form revision and resolve every save outcome in it, T15 — Send signed-in pages no-store, reload back/forward-cache restores, and prove AC-07 in Chromium and WebKit, T16 — Give every editor field, line field, icon button and row action an announced name and tie errors to fields, T17 — Render the editor's phone and desktop layouts from one DOM tree switched by CSS only, T18 — Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields · **Wave:** DAG wave 4; delivery wave 3 of spec §1.
- **Lane:** shares files with T1 (`components/invoice-editor/invoice-pdf-document.tsx`); T2 (`components/invoice-editor/invoice-editor-header.tsx`, `eslint.config.mjs`); T4 (`store/invoice-editor-store/helpers.ts`, `store/invoice-editor-store/use-invoice-editor-store.ts`); T5 (`components/invoice-editor/invoice-editor.tsx`); T8 (`components/invoice-editor/invoice-item-fields.tsx`, `components/invoice-editor/summary-section.tsx` +1); T9 (`store/invoice-editor-store/pdf-parties.ts`); T10 (`components/invoice-editor/pdf-preview-document.tsx`, `components/invoice-editor/pdf-preview-panel.tsx` +1); T12 (`app/(invoice-editor)/invoices/new/`, `components/invoice-editor/invoice-details-section.tsx`); T13 (`components/invoice-editor/invoice-editor-save-status.tsx`, `hooks/use-editor-header-buttons.tsx` +3); T14 (`hooks/use-editor-header-buttons.tsx`, `store/invoice-editor-store/create-invoice-editor-store.ts` +1); T15 (`app/(invoice-editor)/layout.tsx`); T16 (`components/invoice-editor/`); T17 (`components/invoice-editor/invoice-editor-form.tsx`, `components/invoice-editor/invoice-editor-resize-panels.tsx` +3); T18 (`components/invoice-editor/amount-input.tsx`, `components/invoice-editor/invoice-item-fields.tsx` +2) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the editor to show the invoice I opened from its first display
> **So that** I never see a blank or a different invoice flash before mine
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

Makes the first server and browser render show the opened invoice and stops any state carrying over to another invoice or account.

## Inlined context

> **One editor store per opened editor, built from the server's data** — the module-level zustand singleton becomes a store factory provided through React context, created synchronously from the RSC page's data and keyed by the invoice and the signed-in Freelancer. The first server and browser render already show the opened invoice (AC-06), and no state survives into another invoice or another Freelancer's visit (AC-07).
>
> — `sad.md §4, strategic choice 3, verbatim` · full text: [sad.md](../sad.md)

> The store holds the same state and actions as today, but each editor mount gets its own instance, already filled when the first render runs, on the server and in the browser alike. The provider's `key` (`${freelancerId}:${invoiceId ?? 'new'}`) makes React discard the store when the invoice or the account changes. The existing selector hooks (`useFormData`, `useSummary`, …) read the store from context; direct `useInvoiceEditorStore.getState()` calls from hooks and components become context reads. The `sessionToken` guard stays inside each store for saves that return after a reset. `initialize` in an effect and `reset` on unmount are removed.
>
> — `adr/0003-create-one-editor-store-per-mounted-editor-from-server-data.md §Decision outcome, ADR-0003, verbatim` · full text: [adr/0003-create-one-editor-store-per-mounted-editor-from-server-data.md](../adr/0003-create-one-editor-store-per-mounted-editor-from-server-data.md)

> store/invoice-editor-store/
> ├── create-invoice-editor-store.ts    the old module-level store, as a factory (ADR-0003)
> ├── invoice-editor-provider.tsx  NEW  creates the store once per mount, keyed by Freelancer + invoice
> └── selectors.ts                      useFormData, useSummary, … read the store from context
>
> — `sad.md §5, internal decomposition (store), abridged` · full text: [sad.md](../sad.md)

> Moving from the module-level store to a per-mount store (ADR-0003) touches about 20 editor components and the header hook; a missed consumer breaks a save path covered by `invoice-integrity` | Medium | Ship it alone in wave 3; run the full `invoice-integrity` acceptance suite and the new store tests; a lint rule forbids importing the old module-level store
>
> — `sad.md §11, risk «per-mount store», verbatim` · full text: [sad.md](../sad.md)

> S->>S: renders the HTML with an editor store built from this data
> S-->>UI: HTML and the same initial data
> UI-->>U: first display shows the opened invoice or the defaults
> UI->>UI: hydrates and creates the store at once from the same data, keyed by Freelancer and invoice
> UI-->>U: nothing on screen changes when the page becomes interactive
>
> — `sad.md §6, Flow 5, steps 8–12, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-06 — happy path

> **Given** a signed-in Freelancer opening an existing invoice in the editor, or starting a new one
> **When** the editor first appears, before they interact with it
> **Then** an existing invoice shows its own number, Customer, lines, dates and totals from the very first display, and they stay the same once the page becomes interactive. A new invoice shows its defaults from the first display, and they don't change once the page becomes interactive: the default sender profile, its default bank account, an issue date of today in the Freelancer time zone (UTC until one is saved) and the due date that follows from the payment terms. The proposed invoice number may appear after the first display; until it does, its field shows that it is loading, and the layout doesn't move when it arrives
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — authorization

> **Given** Freelancer A had an invoice open in the editor in a browser tab, then signed out, and Freelancer B signed in in the same tab
> **When** Freelancer B opens the editor, or moves back and forward through the tab's history
> **Then** Freelancer B never sees any part of Freelancer A's invoice, not even for a moment, including a page the browser restores from its own back/forward cache. Opening the address of Freelancer A's invoice shows Freelancer B the same "invoice not found" result as any invoice that isn't theirs. A Visitor who presses Back or Forward after Freelancer A signed out, before anyone signs in, sees none of A's data and is taken to sign in. Within one Freelancer's visit, moving back and forward between two invoices never shows one invoice's lines, Customer or totals in the other's editor
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Rename `use-invoice-editor-store.ts` → `create-invoice-editor-store.ts` exporting `createInvoiceEditorStore(initial)` (zustand `createStore`), same state and actions; keep `sessionToken`.
- [ ] `invoice-editor-provider.tsx`: `useState(() => createInvoiceEditorStore(initial))` + context; `selectors.ts`: `useInvoiceEditor(selector)` and the existing `useFormData`, `useSummary`, … over context; `useInvoiceEditorStoreApi()` for imperative reads.
- [ ] Mount the provider in the editor pages under `app/(invoice-editor)/invoices/new` and `[id]` with `key={`${freelancerId}:${invoiceId ?? 'new'}`}`; pass the RSC data as `initial`; remove `initialize` in `useEffect` and `reset` on unmount.
- [ ] Replace every `useInvoiceEditorStore.getState()` / module import in `components/invoice-editor/` and `hooks/` with context reads.
- [ ] `eslint.config.mjs`: `no-restricted-imports` for the old module-level store path.
- [ ] Component test: render the editor page component with server data and assert the first render (before effects) shows the invoice's number, Customer, lines and totals; a key change discards the old store.
- [ ] Run the full `invoice-integrity` component + e2e acceptance suites.

## Edge cases

| Case | Behaviour |
|---|---|
| a save resolves after the editor moved to another invoice | the old store's `sessionToken` guard drops it; the new store is untouched |
| Back/Forward between two invoices in one visit | different keys → different stores; no mixed lines, Customer or totals (AC-07) |
| new invoice before the number hint arrives | store has no number; field shows its loading state (T12) |

## Definition of Done

- [ ] new first-render component test passes
- [ ] all existing `tests/component/invoice-editor-*` and `invoice-integrity` e2e pass
- [ ] lint rule rejects an import of the old store
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
