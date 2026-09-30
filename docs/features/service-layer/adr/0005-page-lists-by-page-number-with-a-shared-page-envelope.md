---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-01"
feature_size: "M"
ticket: "service-layer"
---

# 0005 — Page lists by page number with a shared page envelope

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dmytro Hopko (Architect), with Claude (decided under the easy-depth assumptions ledger, accepted by the owner)

## Context

Only the invoices list pages today (`getPaginatedInvoices`: offset paging, page size 10, an out-of-range page clamped to 1). The customers, products, custom prices, sender profiles and bank accounts lists return everything. The spec requires every list to accept optional search, page and page size, and to always report the total and whether more exist, so a caller never mistakes a partial list for the whole one. Stripe's MCP server, which caps at 100 with no next page, is the counter-example. This contract is seen by six lists, the web pickers and every future Assistant tool.

## Decision drivers

- AC-11 to AC-14: total, page, page count and "more results exist" are always present. No page requested means the full list as page 1. Page 99 answers page 1. Invalid page or size is refused.
- AC-12: the order is unchanged. Spec §1 change 4: the sort order ends with the record id, so paging never repeats or skips a record.
- Spec §3: no page-size cap in the business layer. The web pickers need full lists.

## Considered options

1. **Page-number paging with one `Page<T>` envelope.** A shared `ListQuery = { search?, page?, pageSize? }` (zod-validated: whole numbers ≥ 1, search ≤ 100 characters). It returns `Page<T> = { items, total, page, pageSize, totalPages, hasMore }` and is implemented once as a helper over `count` + `findMany({ skip, take, orderBy: [...order, { id }] })`.

No second option was offered. Cursor paging (resume after the last id seen) cannot express AC-14's "page 99 answers page 1" or the invoices page's numbered pages, so the spec already excludes it.

## Decision outcome

**Chosen:** Option 1. It matches the invoices page's behaviour, which becomes the template for all six lists.

## Consequences

**Positive**
- One helper and one shape for every list, and one set of tests for the edge cases (empty list, page out of range, invalid values).
- The id tiebreak makes page contents deterministic.

**Negative**
- Offset paging does a `count` + `OFFSET` per request. It is fine at current scale (tens to hundreds of records per Freelancer), and slows only for very deep pages.
- Unpaged full lists are unbounded. The Assistant feature must set its own caps (spec §8 OQ-3).

**Neutral**
- `getPaginatedInvoices` keeps its extra fields (`filterOptions`, `totalInvoices`, `applied`) next to the envelope.

## Links

- Spec: [[../spec.md]] — US-04; AC-11, AC-12, AC-13, AC-14, AC-26; §1 deliberate change 4
- SAD: [[../sad.md]] §4 (choice 5), §8 (Lists)
