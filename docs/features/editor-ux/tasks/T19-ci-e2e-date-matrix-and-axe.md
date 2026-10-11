---
id: T19
title: "Add the CI e2e job with the server/browser date matrix and the accessibility suite"
layer: "tests"
deps: ["T8", "T12", "T16"]
blocks: []
acs: ["AC-08", "AC-11"]
files_hint: [".github/workflows/test.yml", "playwright.config.ts", "package.json", "tests/e2e/date-matrix.spec.ts", "tests/e2e/accessibility.spec.ts", "tests/e2e/support/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T19 — Add the CI e2e job with the server/browser date matrix and the accessibility suite

## Place in the sequence

- **Blocked by:** T8 — Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint, T12 — Compute a new invoice's today and due date on the server and reserve the invoice-number field, T16 — Give every editor field, line field, icon button and row action an announced name and tie errors to fields · **Blocks:** nothing · **Wave:** DAG wave 6; delivery wave 4 of spec §1.
- **Lane:** shares files with T3 (`.github/workflows/test.yml`, `package.json` +1); T4 (`package.json`); T15 (`playwright.config.ts`); T20 (`tests/e2e/support/`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** every list, the editor, the preview and the PDF to show the same calendar day for an invoice's dates
> **So that** I don't send or chase an invoice based on a date that is off by one
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** every editor field, error and icon button to have a name my screen reader announces
> **So that** I can create and send invoices without seeing the screen
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Keeps the date agreement and the accessibility guarantee from regressing on every PR.

## Inlined context

> | Server/browser date agreement | 0 render-mismatch warnings and 0 differing dates on the invoices list, dashboard, related invoices and editor, with the Freelancer time zone set to UTC−10, UTC and UTC+14 and the browser in a different zone, 5 minutes either side of midnight | browser test matrix in CI |
> | Accessibility | 0 serious or critical violations reported by an automated accessibility checker on the editor (new and existing invoice), the invoices list and the dashboard | browser test in CI |
>
> — `spec.md §6, NFR rows, verbatim` · full text: [spec.md](../spec.md)

> A new `e2e` job in `.github/workflows/test.yml` builds the app for production against a throwaway PostgreSQL container and runs two suites on every PR: the accessibility suite (`@axe-core/playwright` on the editor — new and existing invoice — the invoices list and the dashboard, failing on any serious or critical violation) and the server/browser date matrix
>
> — `sad.md §7, Build and CI gates, abridged` · full text: [sad.md](../sad.md)

> a Playwright matrix in CI (`timezoneId` per browser context, a fixed clock via `page.clock`, the account's time zone seeded per run) that fails on any hydration console error and compares each page's dates with the stored days
>
> — `sad.md §10, QG-2 How verify, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-08 — cross-context

> **Given** a Freelancer whose saved Freelancer time zone is far from UTC, and an invoice with a given issue date and due date
> **When** they view the invoice in the invoices list, the dashboard's recent invoices, the related invoices of a Customer, the editor, the preview, the PDF and every other place that shows an invoice's issue or due date (such as the dashboard's expected payments), at any time of day, from a browser set to any time zone
> **Then** every place shows the issue and due dates as the calendar day stored on the invoice, whatever the Freelancer time zone or the browser's time zone, and it is the same on the first display and after the page becomes interactive. A custom price's creation date is shown as the day it was created in the Freelancer time zone. Until a Freelancer time zone is saved, every place uses UTC, as the glossary requires
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy path

> **Given** a Freelancer using a screen reader in the invoice editor
> **When** they move through every field (sender, Customer, invoice details, each line, summary and notes) and every icon-only button (zoom in, zoom out, close preview, duplicate line, delete line, reorder line, more actions)
> **Then** each field announces its visible label and each button announces its action. A line field without a visible label of its own announces its column name and the line's position, such as "Quantity, line 3", and the position stays correct after lines are reordered, added or deleted. Print and Download keep an announced name on narrow screens where their text is hidden. The row actions button in the invoices list and in a Customer's or sender profile's related invoices announces its action and the invoice number
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `pnpm add -D @axe-core/playwright`.
- [ ] `tests/e2e/date-matrix.spec.ts`: for zone ∈ {Pacific/Honolulu, UTC, Pacific/Kiritimati} seed the account zone, open the browser context with a different `timezoneId`, `page.clock` at 23:55 and 00:05; visit invoices list, dashboard, related invoices, editor; fail on hydration console errors; assert displayed issue/due dates equal the stored days.
- [ ] `tests/e2e/accessibility.spec.ts`: AxeBuilder on editor (new + existing), invoices list, dashboard; fail on `serious`/`critical`.
- [ ] `.github/workflows/test.yml`: new `e2e` job — Postgres service, migrate + seed, `pnpm build`, `pnpm start`, run both specs on chromium.

## Edge cases

| Case | Behaviour |
|---|---|
| custom price created at 23:30 UTC, Freelancer at UTC+14 | shown as the next day (AC-08) |
| no zone saved | UTC everywhere |
| axe moderate/minor issues | reported, not failing (NFR counts serious/critical) |

## Definition of Done

- [ ] the CI e2e job is green on the PR
- [ ] both specs fail when a hydration error or a serious violation is injected locally
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
