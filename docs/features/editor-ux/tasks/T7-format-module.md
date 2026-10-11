---
id: T7
title: "Create the lib/format module for money, calendar days and moments with a fixed en-US locale"
layer: "domain"
deps: []
blocks: ["T8", "T9"]
acs: ["AC-08", "AC-09"]
files_hint: ["lib/format/", "lib/helpers/format-helpers.ts", "lib/helpers/calendar-day.ts", "tests/unit/lib/format/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T7 — Create the lib/format module for money, calendar days and moments with a fixed en-US locale

## Place in the sequence

- **Blocked by:** nothing (can start at once) · **Blocks:** T8 — Route every displayed date and amount through lib/format and forbid ad-hoc formatting by lint, T9 — Build the pure invoice document model with its wording in lib/invoice-document · **Wave:** DAG wave 1; delivery wave 2 of spec §1.
- **Lane:** shares files with T12 (`lib/helpers/calendar-day.ts`) — serialized by `implement` on the overlap.

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

Provides the one formatter every list, the editor, the preview and the PDF will use.

## Inlined context

> **One format module with a fixed locale** — money, calendar days and moments are formatted by one module with the `en-US` locale on both the server and the browser: money as `Intl` currency (`$1,234.50`, `UAH 1,234.50`), calendar days read in UTC (mcp-server ADR-0009), moments in the Freelancer time zone the server supplies.
>
> — `sad.md §4, strategic choice 5, abridged` · full text: [sad.md](../sad.md)

> The module lives under `lib/format/`, is pure and framework-free, and is the only place that calls `Intl.NumberFormat`/`toLocaleDateString` for display. Money keeps the format `formatCurrency` already produces, so the lists do not change. Calendar days (issue and due dates) are read by their UTC day (mcp-server ADR-0009) and never shifted; moments (a custom price's creation) are shown in the Freelancer time zone, passed from the server (UTC until one is saved). `formatCurrency` and `formatStoredDay` become re-exports or are replaced
>
> — `adr/0006-format-money-and-dates-in-one-module-with-a-fixed-en-us-locale.md §Decision outcome, ADR-0006, abridged` · full text: [adr/0006-format-money-and-dates-in-one-module-with-a-fixed-en-us-locale.md](../adr/0006-format-money-and-dates-in-one-module-with-a-fixed-en-us-locale.md)

> Issue and due dates are calendar days stored at `T00:00:00Z` (mcp-server ADR-0009), handled by `lib/helpers/calendar-day.ts`; the Freelancer time zone is saved on the account, UTC until saved (mcp-server ADR-0006).
>
> — `sad.md §2, Technical constraints, verbatim` · full text: [sad.md](../sad.md)

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

- [ ] `lib/format/index.ts`: `formatMoney(amount, currency)`, `formatDay(stored, style?)` (UTC day), `formatMoment(instant, timeZone | null, style?)` (null → UTC), all with `'en-US'` passed explicitly.
- [ ] Make `formatCurrency` (`lib/helpers/format-helpers.ts`) and `formatStoredDay` (`lib/helpers/calendar-day.ts`) re-export / delegate to `lib/format` so existing call sites keep their output.
- [ ] Unit tests in `tests/unit/lib/format/` run with `process.env.TZ` and a stubbed default locale (e.g. `de-DE`) to prove independence: USD → `$1,234.50`, UAH → `UAH 1,234.50`, 2026-03-01T00:00Z → Mar 1 in any TZ, a moment at 23:30Z → next day in UTC+14, same day in UTC−10.

## Edge cases

| Case | Behaviour |
|---|---|
| device language uses `,` decimals | output still `$1,234.50` (AC-09) |
| Freelancer time zone not saved (null) | moments formatted in UTC (AC-08) |
| negative or zero amount | same `Intl` currency format as `formatCurrency` today |

## Definition of Done

- [ ] `tests/unit/lib/format/` passes under TZ=Pacific/Honolulu and TZ=Pacific/Kiritimati
- [ ] existing format-helpers / calendar-day tests unchanged and green
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
