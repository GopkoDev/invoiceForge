---
id: T3
title: "Add the build-output PDF chunk check to CI and e2e tests for first PDF, offline and new-version"
layer: "tests"
deps: ["T2"]
blocks: []
acs: ["AC-01", "AC-02", "AC-02b"]
files_hint: ["scripts/check-pdf-chunks.ts", ".github/workflows/test.yml", "package.json", "tests/e2e/pdf-on-demand.spec.ts", "playwright.config.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T3 — Add the build-output PDF chunk check to CI and e2e tests for first PDF, offline and new-version

## Place in the sequence

- **Blocked by:** T2 — Route every PDF trigger through usePdfAction and warm the toolkit in the editor when idle · **Blocks:** nothing · **Wave:** DAG wave 3; delivery wave 1 of spec §1.
- **Lane:** shares files with T4 (`package.json`); T15 (`playwright.config.ts`); T19 (`.github/workflows/test.yml`, `package.json` +1) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the dashboard and list pages to load without the PDF toolkit
> **So that** the pages I open most appear quickly, and printing still works when I ask for it
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

Proves the 0-byte and ≤ 3 s targets that US-01 promises, and keeps them from regressing.

## Inlined context

> | PDF toolkit on non-printing pages | 0 bytes of the PDF toolkit in the code every signed-in page except the invoice editor loads before any interaction | build-output check run in CI against the per-page asset list |
> | First PDF after page load | ≤ 3 s p95 from choosing Download or Print to the file or print dialog, on a 10 Mbit/s connection | browser test with network throttling, 20 runs |
>
> — `spec.md §6, NFR rows «PDF toolkit on non-printing pages», «First PDF after page load», verbatim` · full text: [spec.md](../spec.md)

> `scripts/check-pdf-chunks.ts` after `next build`: fails when any route other than the invoice editor lists a chunk containing `@react-pdf/renderer` among its initial chunks (spec §6 "PDF toolkit on non-printing pages").
> … The other e2e suites (AC-07 isolation, first-PDF timing, Retry outcomes) run before each wave ships and nightly, as `tests/README.md` places e2e today.
>
> — `sad.md §7, Build and CI gates, abridged` · full text: [sad.md](../sad.md)

> Vercel Skew Protection stays off — a page opened before a deploy that then misses the toolkit chunk shows "a newer version is available, reload" (AC-02b), which the e2e suite exercises against a missing chunk.
>
> — `sad.md §7, Deployment view, abridged` · full text: [sad.md](../sad.md)

> a Playwright test with network throttling to 10 Mbit/s, 20 runs, timing from the click to the download or print event
>
> — `sad.md §10, QG-3 How verify, abridged` · full text: [sad.md](../sad.md)

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

- [ ] `scripts/check-pdf-chunks.ts`: read the Next build manifests (`.next/app-build-manifest.json` / per-route client reference manifests), list each signed-in route's initial chunks, fail if any non-`/invoices/new` / `/invoices/[id]/edit` route has a chunk containing `@react-pdf/renderer` code (match a stable marker string from the toolkit).
- [ ] Wire it into `.github/workflows/test.yml` after a `next build` step; add a `check:pdf-chunks` script in `package.json`.
- [ ] `tests/e2e/pdf-on-demand.spec.ts`: open dashboard + invoices list and assert no request for the toolkit chunk; Download → preparing → file; second Download → no new chunk request; `page.route` abort the chunk → «try again», unblock → success; `page.route` 404 the chunk with origin reachable → «newer version» + reload.
- [ ] Timing test: CDP network throttling to 10 Mbit/s, 20 runs, p95 of click→download/print event ≤ 3 s (tagged to run before each wave and nightly, not on every PR).

## Edge cases

| Case | Behaviour |
|---|---|
| the editor route loads the toolkit chunk | allowed — excluded from the check (AC-01, editor may fetch on open) |
| Next changes its manifest layout | the script fails loudly with «manifest not found», never passes silently |
| p95 exceeds 3 s | test fails; sad §11 fallback is ADR-0001 option 2 (server rendering) |

## Definition of Done

- [ ] the chunk check fails on a deliberately static import (verified once locally) and passes on the branch
- [ ] `pnpm test:e2e tests/e2e/pdf-on-demand.spec.ts` passes; the timing p95 is recorded in the PR
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
