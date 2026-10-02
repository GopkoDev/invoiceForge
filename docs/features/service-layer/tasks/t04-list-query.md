---
id: T4
title: "Add the shared ListQuery schema, the Page envelope and the paginate helper"
layer: "domain"
deps: ["T2"]            # task ids that must finish first
blocks: ["T6", "T7", "T8", "T9", "T10", "T13"]   # the inverse of `deps` (markdown only)
acs: ["AC-11", "AC-12", "AC-13", "AC-14"]   # spec §5 acceptance criteria this task satisfies
files_hint: ["lib/services/_shared/list-query.ts", "tests/unit/services/list-query.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"           # S/M/L or hours — how long the work takes
context_budget: "M"     # what the task costs the executing agent to hold (markdown only).
                        # Measured, not guessed: the non-empty lines from `## Why (user story)`
                        # through `## Acceptance criteria`.
                        # S = ≤40 inlined lines, ≤1 extra file to open
                        # M = ≤120 inlined lines, 2–4 files in play
                        # L = beyond that — split the task, or keep it and say why right here:
                        #     context_budget: "L"   # justified: <one line>
status: "todo"
---

<!-- The governing rule of this file: **inline the slice the task actually needs, name where it came
from, and keep the link as the fallback for when the slice turns out not to be enough.** A task is
self-contained: it carries its own context instead of sending the executing agent off to reconstruct it.

Every inlined chunk ends with a one-line **provenance signature**:
`<file> §<section>, <identifier>, verbatim|abridged` — e.g. `spec.md §5, AC-02, verbatim`,
`data-model.md §Entities, table order, abridged`. Never «see the spec».

**Inline budget.** Exactly what THIS task needs: only its own acceptance criteria, only the
data-model fields and endpoints it touches. Cut a long chunk to the essential, mark it `abridged`,
and link the full text. `context_budget` in the frontmatter carries the measured number, and an `L`
either gets split or gets its `# justified:` reason on that line — the `tasks` skill checks both.

**Divergence risk.** An inline is a snapshot taken at breakdown time; upstream can move after it.
The source always wins — which is exactly why every chunk carries a signature pointing at where the
truth lives.

**To the executing agent:** work from what is inlined here. If a slice is insufficient, ambiguous,
or contradicts the code in front of you, open the named file for the full text and follow that.
Do not invent the missing part. -->

# T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper

## Place in the sequence

- **Blocked by:** T2 — Move the result contract into the kernel (`VALIDATION` via `zodValidationFailure`) · **Blocks:** T6, T7, T8, T9, T10 (every entity list) and T13 (`listInvoices`) · **Wave:** 3, in parallel with T3.
- **Lane:** own lane.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** every list to accept an optional search text, page and page size and to tell me the total and whether more results exist
> **So that** I never mistake a partial list for the whole one
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task builds the one list contract and helper that all seven lists reuse. The per-list search fields and orders belong to the domain tasks.

## Inlined context

> 5. **Page-number paging with one shared page envelope** (ADR-0005). Every list accepts an optional `{ search, page, pageSize }` and returns `Page<T> = { items, total, page, pageSize, totalPages, hasMore }`. With no page requested, the full list comes back as page 1. A page given without a page size uses 10. A page out of range falls back to page 1, every sort order ends with the record id, and search is a case-insensitive substring match (`ILIKE`) on the fields spec §1 names.
>
> — `sad.md §4, choice 5, abridged` · full text: [sad.md](../sad.md)

> 1. **Page-number paging with one `Page<T>` envelope.** A shared `ListQuery = { search?, page?, pageSize? }` (zod-validated: whole numbers ≥ 1, search ≤ 100 characters, and a page without a page size uses 10, per AC-12). It returns `Page<T> = { items, total, page, pageSize, totalPages, hasMore }` and is implemented once as a helper over `count` + `findMany({ skip, take, orderBy: [...order, { id }] })`.
>
> — `adr/0005 §Considered options, option 1, verbatim` · full text: [ADR-0005](../adr/0005-page-lists-by-page-number-with-a-shared-page-envelope.md)

> **Hard rule (Lists):** […] There is no page-size cap in the layer
>
> — `sad.md §8, Lists row, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> ```ts
> type ListQuery = {
>   search?: string;    // trimmed; '' = no search; ≤ 100 characters; case-insensitive substring (ILIKE)
>   page?: number;      // integer ≥ 1
>   pageSize?: number;  // integer ≥ 1; no upper cap in the layer (spec §3)
> };
> type Page<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
> ```
>
> | Input | Result (AC-11, AC-12, AC-14) |
> |---|---|
> | no `page` and no `pageSize` | the full matching list in today's order: `page: 1`, `pageSize: total`, `totalPages: total > 0 ? 1 : 0`, `hasMore: false` |
> | `page` without `pageSize` | `pageSize: 10` |
> | `pageSize` without `page` | `page: 1` |
> | `page > totalPages` | page 1 is returned, and `page: 1` is reported. An empty list answers `page: 1`, `totalPages: 0` |
> | every order | today's order, then `id` ascending as the final tiebreak (spec §1 change 4) |
>
> | `fieldErrors` key | Refused when | Message ★ |
> |---|---|---|
> | `page` | not an integer, or < 1 | "Page must be a whole number of at least 1." |
> | `pageSize` | not an integer, or < 1 | "Page size must be a whole number of at least 1." |
> | `search` | longer than 100 characters | "Search text can be at most 100 characters." |
>
> The `error` of a `VALIDATION` result from a list is "Invalid list request."
>
> — `contracts/public-api.md §1.3, Lists, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-11 (US-04) — happy

> **Given** Freelancer A has 23 customers, of which 5 have "acme" in their name or email in any letter case
> **When** an Assistant acting for A asks for customers matching "ACME", page 1, 2 per page
> **Then** it receives 2 of those 5 customers in the usual order, together with total 5, page 1, 3 pages in all and "more results exist"
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 (US-04) — happy

> **Given** Freelancer A has records in a list
> **When** a picker or an Assistant asks for that list, including the invoices list, without a search text, page or page size
> **Then** it receives the full list in the same order as today, reported as page 1 with the total equal to the number of records, one page in all (none for an empty list) and "no more results". A page given without a page size uses a page size of 10
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-13 (US-04) — error

> **Given** an Assistant acting for Freelancer A
> **When** it asks for a list with a page or page size that is not a whole number of at least 1 (for example 0, −5 or 2.5), with a search text longer than 100 characters, or with a date range that is reversed or has only one end
> **Then** the system returns no records and tells it which value is invalid and what is allowed
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 (US-04) — happy

> **Given** Freelancer A's list has 3 pages at the requested page size
> **When** an Assistant or A's page asks for page 99
> **Then** it receives page 1, as the invoices list does today, and the page number in the response is 1. An empty list likewise answers with page 1 and no pages
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

Scope note: the date-range part of AC-13 is `listInvoices` (T13). The customer data of AC-11 is proved end to end in T6. Here, the helper is proved with a fake `count`/`findMany`.

## Checklist

- [ ] RED: `tests/unit/services/list-query.test.ts`. Table-driven over `parseListQuery(input)` and `paginate({ count, findMany, orderBy, query })`, using in-memory fakes for `count`/`findMany`. Cover each Input row of the contract table, the three `fieldErrors` cases (0, −5, 2.5 for both `page` and `pageSize`; a 101-character search), and a 100-character search being accepted.
- [ ] `lib/services/_shared/list-query.ts` (`import 'server-only'`): add the `listQuerySchema` zod object (`search` trimmed with `max(100)`, `page`/`pageSize` as `z.number().int().min(1)`, all optional) and the `ListQuery`/`Page<T>` types. Add `parseListQuery()`, which returns `ActionResult<ListQuery>` with the contract messages and the `error` "Invalid list request.".
- [ ] `paginate()`: count first. Resolve `page`/`pageSize` per the table. Clamp `page > totalPages` to 1. Call `findMany({ skip, take, orderBy: [...orderBy, { id: 'asc' }] })`. Compute `totalPages` and `hasMore`. The full-list case uses no `skip`/`take`.
- [ ] Export a small `ilikeAny(fields, search)` helper that builds Prisma `OR: [{ field: { contains, mode: 'insensitive' } }]`. `search === ''` means no filter.

## Edge cases

| Case | Behaviour |
|---|---|
| `{}` on an empty list | `{ items: [], total: 0, page: 1, pageSize: 0, totalPages: 0, hasMore: false }` |
| `{ page: 2 }` with 23 records | `pageSize: 10`, items 11–20, `totalPages: 3`, `hasMore: true` |
| `{ pageSize: 5 }` | `page: 1` |
| `{ page: 99, pageSize: 2 }` with 5 matches | page 1 returned, `page: 1` |
| `search: '   '` | trimmed to `''`, so no search |
| `page: 2.5` or `pageSize: 0` | `VALIDATION`, no records, `fieldErrors.page` / `.pageSize` |
| `pageSize: 10000` | accepted, because there is no cap (spec §3) |
| a concurrent insert between `count` and `findMany` | accepted drift by one (contract §1.3 Consistency) |

## Definition of Done

- [ ] Every contract Input row and every `fieldErrors` row has a passing unit test.
- [ ] Every `paginate()` call ends its order with `{ id: 'asc' }` (asserted on the fake's received `orderBy`).
- [ ] No page-size cap exists in the layer.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
