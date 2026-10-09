---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-09"
feature_size: "M"
ticket: "editor-ux"
---

# 0006 — Format money and dates in one module with a fixed en-US locale

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Money is formatted three ways: `formatCurrency` (`lib/helpers/format-helpers.ts`, `Intl.NumberFormat('en-US', currency)`) in the lists and dashboard, `toFixed(2)` plus the code in the editor's summary and lines, the preview and the PDF, and nothing else. Dates are formatted with `formatStoredDay` (UTC, `en-US`) in the lists, `date-fns` `format` of a local `Date` in the editor and the documents, and `toLocaleDateString()` with the device's locale and zone for a custom price's creation date (`components/products/product-custom-prices.tsx`). Output that depends on the device's language or zone differs between the server's HTML and the browser's first render (render-mismatch warnings) and between the screen and the PDF.

## Decision drivers

- AC-08 and spec §6 NFR "Server/browser date agreement": the stored calendar day everywhere, 0 render-mismatch warnings for Freelancer zones UTC−10, UTC and UTC+14 with the browser in another zone.
- AC-09: "$1,234.50" and "UAH 1,234.50", with the same separators and two decimals, independent of the device language.
- Spec §6.1: no new personal data or account field.

## Considered options

1. **One format module with a fixed `en-US` locale** — `formatMoney(amount, currency)`, `formatDay(storedDay, style)` (read in UTC) and `formatMoment(instant, freelancerTimeZone, style)`, used by every surface on the server and in the browser.
2. **A locale saved on the Freelancer's account** — formats follow the Freelancer's choice; needs a new account field, a setting and a migration (against spec §6.1 and §3), and makes the Customer's PDF depend on who printed it, contradicting AC-09's fixed examples.

## Decision outcome

**Chosen:** Option 1. The module lives under `lib/format/`, is pure and framework-free, and is the only place that calls `Intl.NumberFormat`/`toLocaleDateString` for display. Money keeps the format `formatCurrency` already produces, so the lists do not change. Calendar days (issue and due dates) are read by their UTC day (mcp-server ADR-0009) and never shifted; moments (a custom price's creation) are shown in the Freelancer time zone, passed from the server (UTC until one is saved). `formatCurrency` and `formatStoredDay` become re-exports or are replaced; a lint rule forbids `toFixed(` and `toLocale*String(` in `components/` and `app/`.

## Consequences

**Positive**
- Server HTML and browser render produce the same text, so dates and amounts cannot flip on hydration.
- The document model (ADR-0002), the editor and the lists share one source of format truth.

**Negative**
- A Freelancer whose device uses another language still sees the US format (as the spec requires).
- Every display site must be migrated, including ones outside the editor (custom prices, dashboard).

**Neutral**
- Localisation later means passing a locale into this one module.

## Links

- Spec: [[../spec.md]] US-04, US-05, AC-08, AC-09
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-render-preview-and-pdf-from-one-invoice-document-model]]
