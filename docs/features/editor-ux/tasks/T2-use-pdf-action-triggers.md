---
id: T2
title: "Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle"
layer: "ui"
deps: ["T1"]
blocks: ["T3"]
acs: ["AC-01", "AC-02", "AC-02b"]
files_hint: ["hooks/use-pdf-action.ts", "hooks/use-invoice-pdf.tsx", "components/invoices/invoice-row-actions.tsx", "components/invoices/related-invoices-list.tsx", "components/dashboard/recent-invoices/", "components/modals/invoice/invoice-pdf-preview-modal.tsx", "components/invoice-editor/invoice-editor-header.tsx", "eslint.config.mjs", "tests/component/use-pdf-action.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T2 — Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle

## Place in the sequence

- **Blocked by:** T1 — Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader · **Blocks:** T3 — Add the build-output PDF chunk check to CI and e2e tests for first PDF, offline and new-version · **Wave:** DAG wave 2; delivery wave 1 of spec §1.
- **Lane:** shares files with T8 (`components/dashboard/recent-invoices/`, `components/invoices/invoice-row-actions.tsx` +2); T10 (`eslint.config.mjs`, `hooks/use-pdf-action.ts`); T11 (`components/invoice-editor/invoice-editor-header.tsx`, `eslint.config.mjs`); T16 (`components/dashboard/recent-invoices/`, `components/invoice-editor/invoice-editor-header.tsx` +2) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard and list pages to load without the PDF toolkit
> **So that** the pages I open most appear quickly, and printing still works when I ask for it
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Makes the dashboard and list pages stop loading the toolkit and gives Download, Print and the PDF preview one shared set of preparing / error states.

## Inlined context

> Every PDF trigger (the invoices list's and related invoices' row actions, the dashboard's recent invoices, the PDF preview dialog, the editor header) calls one `usePdfAction` hook that fetches the module once per visit and owns the "preparing", "couldn't prepare — try again" and "newer version — reload" states. The editor's live preview is HTML (ADR-0002), so it needs no toolkit for its first display; it warms the module in the background once the page is idle (allowed by AC-01), so its Download and Print rarely wait.
>
> — `sad.md §4, strategic choice 1, abridged` · full text: [sad.md](../sad.md)

> Freelancer->>Web: chooses Download on an invoice row
> Web-->>Freelancer: the PDF is being prepared
> alt toolkit already loaded in this visit → reuses the loaded toolkit
> else first PDF of the visit → imports the toolkit from the app origin
>   connection dropped → could not prepare the PDF, try again
>   app updated since the page opened → a newer version is available, reload
> Web->>Web: builds the document model and generates the PDF
>   generation failed → Web->>Sentry: reports the failure; could not prepare the PDF, try again
>
> — `sad.md §6, Critical flow 2, abridged` · full text: [sad.md](../sad.md)

> **PDF failures** — Sentry events from `use-pdf-action` tagged `pdf.stage` = `fetch` / `version` / `generate`, so a rise in "newer version" failures after a deploy is visible separately from generation errors.
>
> — `sad.md §7, Monitoring «PDF failures», verbatim` · full text: [sad.md](../sad.md)

> | On-demand code | `@react-pdf/renderer` is imported only by `lib/pdf/invoice-pdf-kit.tsx` (lint `no-restricted-imports`); every PDF trigger goes through `use-pdf-action`; fetched from the app's own origin under the existing CSP | ADR-0001 |
>
> — `sad.md §8, row «On-demand code», verbatim` · full text: [sad.md](../sad.md)

> | SCR-01 | Dashboard | Recent invoices with their row actions (Download, Print, PDF preview) …
> | SCR-02 | Invoices list | … row actions (Download, Print, PDF preview, Edit) …
> | SCR-03 | Customer or sender profile page | … related invoices with dates and the same row actions
> | SCR-07 | PDF preview dialog | The invoice's PDF as the Customer will receive it, opened from a list row
>
> — `ux-flows.md §Screen inventory, SCR-01/02/03/07, abridged` · full text: [ux-flows.md](../ux-flows.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-01 — happy path

> **Given** a signed-in Freelancer with issued invoices
> **When** they open any signed-in page other than the invoice editor (the dashboard, the invoices list, the customers, products and sender profiles pages, and a Customer's or sender profile's page with its related invoices), and then choose Download, Print or the PDF preview on one invoice
> **Then** none of those pages fetches the PDF toolkit when it opens. Choosing Download, Print or the PDF preview fetches it, shows that the PDF is being prepared, and then downloads, prints or shows that invoice's PDF, with the content and format AC-09 and AC-10 define. Later Download, Print or preview actions in the same visit don't fetch it again. The invoice editor shows its live preview from the first display, so it may fetch the toolkit when it opens
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — error

> **Given** a signed-in Freelancer whose connection drops before the PDF toolkit has been fetched
> **When** they choose Download or Print on an invoice
> **Then** the system tells them in plain language that the PDF could not be prepared and offers to try again. The page stays usable, nothing else on it changes, and trying again once the connection is back produces the PDF
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-02b — error

> **Given** a signed-in Freelancer whose page was opened before a newer version of the app was released, or whose PDF fails while it is being generated
> **When** they choose Download, Print or the PDF preview on an invoice
> **Then** if the PDF toolkit can no longer be fetched because the app was updated, the system says in plain language that a newer version is available and offers to reload the page, instead of a try-again that keeps failing. If generating the PDF fails, the system shows the same plain-language message as AC-02 with an offer to try again, and the failure is recorded for the team. In both cases the page stays usable and nothing else on it changes
>
> — `spec.md §5, AC-02b, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `hooks/use-pdf-action.ts`: `run(action, invoice)` sets `preparing`, awaits `loadPdfKit()`, then generates/downloads/prints; maps `PdfKitLoadError.kind` to a «try again» or «newer version — reload» toast; catches generation errors, `Sentry.captureException` with tag `pdf.stage` (`fetch` / `version` / `generate`) and shows the AC-02 message.
- [ ] Rewrite `hooks/use-invoice-pdf.tsx` over `use-pdf-action`.
- [ ] Switch the triggers — `components/invoices/invoice-row-actions.tsx`, `components/invoices/related-invoices-list.tsx`, `components/dashboard/recent-invoices/`, `components/modals/invoice/invoice-pdf-preview-modal.tsx`, `components/invoice-editor/invoice-editor-header.tsx` — to the hook; no static import of `lib/pdf/invoice-pdf-kit` remains outside `lib/pdf/`.
- [ ] Editor: call `loadPdfKit()` once in `requestIdleCallback` (fallback `setTimeout`) after mount; swallow its failure (Download/Print fetch again).
- [ ] `eslint.config.mjs`: `no-restricted-imports` for `@react-pdf/renderer` and `@/lib/pdf/invoice-pdf-kit` everywhere except `lib/pdf/**`.
- [ ] Component tests: preparing state; offline → try again (and a successful second try); new version → reload offer; generation failure → Sentry called + try again; second action in the same visit does not import again.

## Edge cases

| Case | Behaviour |
|---|---|
| Download while a previous Download is still preparing | the same in-flight load promise is reused; no second fetch |
| offline, then «try again» after reconnect | the PDF is produced (AC-02) |
| chunk missing after a deploy | «a newer version is available» + reload, never an endless try-again (AC-02b) |
| the editor's idle warm-up fails | nothing shown; Download/Print fetch again as in critical flow 2 (sad §6 Flow 8) |
| any failure | the page stays usable and nothing else on it changes |

## Definition of Done

- [ ] component tests for preparing, offline, new-version, generation-failure and reuse pass
- [ ] `pnpm lint` fails on a test import of `@react-pdf/renderer` outside `lib/pdf/` and is clean otherwise
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
