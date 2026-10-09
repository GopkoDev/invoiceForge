---
id: T8
title: "Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint"
layer: "ui"
deps: ["T7"]
blocks: ["T10", "T11", "T18", "T19"]
acs: ["AC-08", "AC-09"]
files_hint: ["components/invoices/", "components/dashboard/", "components/customers/customer-info-sidebar.tsx", "components/products/product-custom-prices.tsx", "components/invoice-editor/invoice-item-fields.tsx", "components/invoice-editor/summary-section.tsx", "app/(protected)/", "eslint.config.mjs"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T8 — Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint

## Place in the sequence

- **Blocked by:** T7 — Create the lib/format module for money, calendar days and moments with a fixed en-US locale · **Blocks:** T10 — Lay out the HTML preview and the PDF from the document model and add the parity test, T11 — Turn the editor store into a per-mount factory provided by context and built from server data, T18 — Add the shared AmountInput with a decimal keypad and use it for line, discount, tax and shipping fields, T19 — Add the CI e2e job with the server/browser date matrix and the accessibility suite · **Wave:** DAG wave 2; delivery wave 2 of spec §1.
- **Lane:** shares files with T2 (`components/dashboard/recent-invoices/`, `components/invoices/invoice-row-actions.tsx` +2); T10 (`eslint.config.mjs`); T11 (`components/invoice-editor/invoice-item-fields.tsx`, `components/invoice-editor/summary-section.tsx` +1); T15 (`app/(protected)/layout.tsx`); T16 (`components/dashboard/recent-invoices/`, `components/invoice-editor/invoice-item-fields.tsx` +3); T18 (`components/invoice-editor/invoice-item-fields.tsx`, `components/invoice-editor/summary-section.tsx`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** every list, the editor, the preview and the PDF to show the same calendar day for an invoice's dates
> **So that** I don't send or chase an invoice based on a date that is off by one
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the PDF my Customer receives to show the same wording, dates and money format as the preview in the app
> **So that** what I checked on screen is exactly what my Customer reads
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

Makes every list, the dashboard and the editor show the same calendar day and money format, on the first display and after hydration.

## Inlined context

> | Display formatting | Money, calendar days and moments only through `lib/format` with the fixed `en-US` locale; calendar days read in UTC, moments in the Freelancer time zone passed from the server; lint forbids `toFixed(` and `toLocale*String(` in `components/` and `app/` | ADR-0006 |
>
> — `sad.md §8, row «Display formatting», verbatim` · full text: [sad.md](../sad.md)

> S->>S: formats days read in UTC, moments in the Freelancer time zone or UTC, money in fixed en-US
> S-->>UI: HTML with the formatted dates and amounts, plus the time zone
> UI->>UI: hydrates and formats again with the same module, locale and time zone
> alt the texts match → nothing changes, whatever the browser zone or device language
> else a text differs → UI->>X: reports a render mismatch
>
> — `sad.md §6, Flow 7, steps 4–8, abridged` · full text: [sad.md](../sad.md)

> <!-- brownfield: … the HTML preview and the PDF document duplicate their wording and format money with toFixed(2) + code; … -->
>
> — `sad.md §3, brownfield note, abridged` · full text: [sad.md](../sad.md)

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

### AC-09 — happy path

> **Given** a Freelancer with two invoices without unsaved changes, one in a currency that has a symbol and one that doesn't (a US dollar invoice and a hryvnia invoice)
> **When** they open the preview and download the PDF of each, from a device set to any language
> **Then** the preview and the PDF show identical wording, dates and amounts, in the money format the rest of the app uses ("$1,234.50", "UAH 1,234.50"), with the same separators and two decimal places. The editor's line amounts and totals, and the dashboard's Debtors amounts, use the same format, independent of device language. For a draft with unsaved changes the PDF follows `invoice-integrity` AC-02 and prints its last save
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Replace display formatting in `components/invoices/` (list, related invoices), `components/dashboard/` (recent invoices, expected payments, Debtors, sender accounts), `components/customers/customer-info-sidebar.tsx`, `components/products/product-custom-prices.tsx` (creation date → `formatMoment` with the server-passed time zone), `components/invoice-editor/invoice-item-fields.tsx` and `summary-section.tsx` (line amounts, totals) with `lib/format` calls.
- [ ] Leave the preview/PDF documents (`pdf-preview-document.tsx`, `invoice-pdf-document.tsx`) to T10 — add them to the lint rule's temporary ignore list with a `T10` comment.
- [ ] `eslint.config.mjs`: `no-restricted-syntax` for `CallExpression[callee.property.name=/^(toFixed|toLocale\w*String)$/]` in `components/**` and `app/**`, excluding `components/ui/**` (third-party primitives: chart, calendar).
- [ ] Pass the Freelancer time zone from the RSC page where a moment is shown (custom prices) if it isn't already.
- [ ] Component tests (TZ stubbed far from UTC, locale `de-DE`): list row, dashboard expected payments and Debtors, editor summary show the stored day and `$1,234.50` / `UAH 1,234.50`.

## Edge cases

| Case | Behaviour |
|---|---|
| `toFixed` used to build an input's raw value, not a display | use the existing number-draft helpers or an explicit, commented lint disable — never display formatting |
| browser TZ differs from the Freelancer time zone | issue/due dates unchanged; moments follow the Freelancer zone |
| Freelancer zone not saved | UTC |

## Definition of Done

- [ ] component tests for list, dashboard and editor summary pass under a foreign TZ and locale
- [ ] `pnpm lint` clean, and fails on a reintroduced `toFixed(` in `components/`
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
