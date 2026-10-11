---
id: T1
title: "Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader"
layer: "app"
deps: []
blocks: ["T2", "T10"]
acs: ["AC-01", "AC-02", "AC-02b"]
files_hint: ["lib/pdf/", "lib/helpers/invoice-pdf-helpers.tsx", "components/invoice-editor/invoice-pdf-document.tsx", "tests/unit/lib/pdf/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T1 — Move the PDF toolkit into one lazy lib/pdf module with a cached, classifying loader

## Place in the sequence

- **Blocked by:** nothing (can start at once) · **Blocks:** T2 — Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle, T10 — Lay out the HTML preview and the PDF from the document model and add the parity test · **Wave:** DAG wave 1; delivery wave 1 of spec §1.
- **Lane:** shares files with T10 (`lib/pdf/invoice-pdf-kit.tsx`); T11 (`components/invoice-editor/invoice-pdf-document.tsx`); T16 (`components/invoice-editor/invoice-pdf-document.tsx`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard and list pages to load without the PDF toolkit
> **So that** the pages I open most appear quickly, and printing still works when I ask for it
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Creates the single on-demand module and its loader, so later tasks can make every PDF trigger fetch the toolkit only when asked.

## Inlined context

> **The PDF toolkit is a lazy module behind one hook** — `@react-pdf/renderer`, the react-pdf invoice document and the generate/download/print helpers move into one entry module that is only reached through a dynamic `import()`.
>
> — `sad.md §4, strategic choice 1, abridged` · full text: [sad.md](../sad.md)

> lib/
> └── pdf/                         NEW  the only importer of @react-pdf/renderer (ADR-0001)
>     ├── invoice-pdf-kit.tsx           lazy entry: react-pdf document + generate / download / print
>     └── load-pdf-kit.ts               cached import() + failure classification (offline / new version)
> lib/helpers/invoice-pdf-helpers.tsx   REMOVED — moved into lib/pdf/
>
> — `sad.md §5, internal decomposition (lib/pdf), abridged` · full text: [sad.md](../sad.md)

> The entry module is the only file allowed to import `@react-pdf/renderer` … A failed `import()` is classified by probing the app's own origin: unreachable means the connection dropped (AC-02, try again); reachable while the chunk is missing means the app was updated (AC-02b, reload). A failure while generating is reported to Sentry and shown as AC-02.
>
> — `adr/0001-load-the-pdf-toolkit-on-demand-through-one-lazy-module.md §Decision outcome, ADR-0001, abridged` · full text: [adr/0001-load-the-pdf-toolkit-on-demand-through-one-lazy-module.md](../adr/0001-load-the-pdf-toolkit-on-demand-through-one-lazy-module.md)

> | Error handling (PDF) | A failed fetch is classified as offline (try again) or new version (reload) by probing the app origin; a generation failure is reported to Sentry with `pdf.stage` and shown as "could not prepare, try again"; the page stays usable | ADR-0001 |
>
> — `sad.md §8, row «Error handling (PDF)», verbatim` · full text: [sad.md](../sad.md)

> **On-demand code from an untrusted place:** the PDF toolkit is fetched only from the app's own origin, under the existing content-security rules; the check added by `security-patch` keeps passing.
>
> — `spec.md §6.1, abuse case «On-demand code», verbatim` · full text: [spec.md](../spec.md)

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

- [ ] Create `lib/pdf/invoice-pdf-kit.tsx` by moving the react-pdf document (`components/invoice-editor/invoice-pdf-document.tsx`) and the generate/download/print helpers (`lib/helpers/invoice-pdf-helpers.tsx`) into it; export one object (`{ generatePdfBlob, downloadPdf, printPdf, InvoicePdfDocument }`).
- [ ] Create `lib/pdf/load-pdf-kit.ts`: `loadPdfKit()` returns a module-level cached promise of `import('./invoice-pdf-kit')`; a rejected import clears the cache (so try-again re-fetches) and throws a typed `PdfKitLoadError` with `kind: 'offline' | 'new-version'`, decided by a same-origin probe (e.g. `fetch('/', { method: 'HEAD', cache: 'no-store' })`).
- [ ] Delete `lib/helpers/invoice-pdf-helpers.tsx` and the old document file; point the current importers at `lib/pdf/invoice-pdf-kit` for now (T2 replaces the static imports with `loadPdfKit`).
- [ ] Unit tests in `tests/unit/lib/pdf/`: second call reuses the first promise; failed import + unreachable probe → `offline`; failed import + reachable probe → `new-version`; a failed load is retried on the next call.

## Edge cases

| Case | Behaviour |
|---|---|
| `import()` rejects and the origin probe also fails | `kind: 'offline'` — caller shows «could not prepare, try again» (AC-02) |
| `import()` rejects but the origin answers (chunk 404 after a deploy) | `kind: 'new-version'` — caller offers reload (AC-02b) |
| a failed load, then the connection returns | the cache was cleared, the next call fetches again and succeeds |
| captive portal / partial outage | may be misclassified; both outcomes keep the page usable (sad §11, Low risk) |

## Definition of Done

- [ ] unit tests for cache reuse, both failure classifications and retry-after-failure pass
- [ ] `@react-pdf/renderer` is imported only under `lib/pdf/` (grep)
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
