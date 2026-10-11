---
id: T12
title: "Compute a new invoice's today and due date on the server and reserve the invoice-number field"
layer: "app"
deps: ["T11"]
blocks: ["T19"]
acs: ["AC-06", "AC-08"]
files_hint: ["app/(invoice-editor)/invoices/new/", "lib/helpers/time-zone.ts", "lib/helpers/calendar-day.ts", "components/invoice-editor/invoice-details-section.tsx", "tests/component/invoice-details-section-number-states.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T12 — Compute a new invoice's today and due date on the server and reserve the invoice-number field

## Place in the sequence

- **Blocked by:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Blocks:** T19 — Add the CI e2e job with the server/browser date matrix and the accessibility suite · **Wave:** DAG wave 5; delivery wave 3 of spec §1.
- **Lane:** shares files with T7 (`lib/helpers/calendar-day.ts`); T11 (`app/(invoice-editor)/invoices/new/`, `components/invoice-editor/invoice-details-section.tsx`); T16 (`components/invoice-editor/invoice-details-section.tsx`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the editor to show the invoice I opened from its first display
> **So that** I never see a blank or a different invoice flash before mine
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** every list, the editor, the preview and the PDF to show the same calendar day for an invoice's dates
> **So that** I don't send or chase an invoice based on a date that is off by one
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

Makes a new invoice's defaults identical on the first display and after hydration, and keeps the layout still when the number arrives.

## Inlined context

> **"Today" comes from the server.** The new-invoice page computes today's calendar day in the Freelancer time zone (UTC until one is saved, mcp-server ADR-0006) and passes it, with the due date that follows from the payment terms, in the editor's initial data. The browser clock and the time-zone cookie of architecture-hardening ADR-0010 do not decide it — the glossary does (spec §1).
> …
> **The proposed invoice number stays asynchronous.** Its field reserves its final size and shows a loading state until the hint arrives, so the layout does not move (AC-06).
>
> — `sad.md §4, tactical choices, abridged` · full text: [sad.md](../sad.md)

> else new invoice
>     S->>D: reads the defaults and the Freelancer time zone
>     D-->>S: default sender profile, bank account, payment terms, time zone or none
>     S->>S: computes today in the Freelancer time zone, UTC if none, and the due date
> …
> opt new invoice → UI->>S: asks for the proposed invoice number … the number fills its reserved, loading field and the layout does not move
>
> — `sad.md §6, Flow 5, abridged` · full text: [sad.md](../sad.md)

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

### AC-08 — cross-context

> **Given** a Freelancer whose saved Freelancer time zone is far from UTC, and an invoice with a given issue date and due date
> **When** they view the invoice in the invoices list, the dashboard's recent invoices, the related invoices of a Customer, the editor, the preview, the PDF and every other place that shows an invoice's issue or due date (such as the dashboard's expected payments), at any time of day, from a browser set to any time zone
> **Then** every place shows the issue and due dates as the calendar day stored on the invoice, whatever the Freelancer time zone or the browser's time zone, and it is the same on the first display and after the page becomes interactive. A custom price's creation date is shown as the day it was created in the Freelancer time zone. Until a Freelancer time zone is saved, every place uses UTC, as the glossary requires
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] In `app/(invoice-editor)/invoices/new/page.tsx` compute `today` with the existing time-zone helpers (`lib/helpers/time-zone.ts`, `calendar-day.ts`) from the Freelancer's saved zone (UTC if none) and `dueDate` from the default payment terms; pass both in the store's initial data.
- [ ] Remove any `new Date()`-based default issue/due date in the store/factory.
- [ ] `invoice-details-section.tsx`: number field keeps its final width/height and shows a loading indicator until the hint arrives (no layout shift).
- [ ] Component tests: with a server-provided `today` and the system clock faked to a different day, the first render shows the server's day; number field box size equal before/after the hint.

## Edge cases

| Case | Behaviour |
|---|---|
| Freelancer zone UTC+14 at 23:55 UTC | today is the next calendar day in that zone, the same on server and browser |
| no zone saved | UTC |
| number hint request fails | field leaves its loading state as today does (existing behaviour), layout unchanged |

## Definition of Done

- [ ] component tests for server-today and the reserved number field pass
- [ ] `invoice-details-section-number-states` tests still pass
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
