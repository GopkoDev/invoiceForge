---
id: T8
title: "Move custom prices into lib/services/custom-prices with parent-scoped lists and owner-scoped writes"
layer: "app"
deps: ["T3", "T4"]
blocks: ["T20"]
acs: ["AC-08", "AC-11"]
files_hint: ["lib/services/custom-prices/", "lib/actions/custom-price-actions.ts", "tests/integration/services/custom-prices/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
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

# T8 — Move custom prices into lib/services/custom-prices with parent-scoped lists and owner-scoped writes

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper · **Blocks:** T20 — Close the move. **Wave:** 4 (DAG level), release wave 1 of sad.md §7.
- **Lane:** own lane. Runs in parallel with T6, T7, T9–T12 and T17.

## Why (user story)

> **As a** Freelancer
> **I want** every read and change made on my behalf, from a page or an Assistant, limited to my own records
> **So that** nobody else's data mixes into mine and nobody can reach mine
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

Custom prices are the one list with a parent that AC-08 names ("the custom prices of B's customer"). This task makes both parent-scoped lists and every custom-price write owner-scoped through the Customer and the product.

## Inlined context

> opt the list belongs to a parent record (e.g. the custom prices of one customer) · S->>D: looks up the parent where the id and the owner match · alt parent missing or foreign → NOT_FOUND, exactly as for an id that never existed · else parent owned → counts the owner's records matching the search on the list's name fields, in any letter case · no page given means the full list as page 1, a page without a size uses 10, a page past the last one falls back to page 1 · reads one page where the owner matches, in today's order ending with the record id
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> BL validates input with the […] schema · alt input invalid → VALIDATION with field errors · else update where id and owner match · alt no row for this id and owner (missing or foreign) → NOT_FOUND · else row updated → success, WA revalidates
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** The current check-then-write-by-bare-id pattern (`findFirst({ id, userId })` then `update({ where: { id } })`) is replaced by writes whose unique `where` carries the owner too, e.g. `{ id, userId }` or `{ id, senderProfile: { userId } }`. A miss (Prisma `P2025`) maps to the same `NOT_FOUND`.
>
> — `sad.md §4, choice 3, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Prisma rejects a relation filter inside a unique `where` for some model (e.g. `Invoice` via `senderProfile`, `CustomPrice` via `customer`) | Medium | Confirm in wave 1 with the first owner-scoped writes. Fallback per ADR-0003: `updateMany`/`deleteMany` with the owner filter and `count === 0 → NOT_FOUND`
>
> — `sad.md §11, risk row 3, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Wrappers keep today's `revalidatePath` lists verbatim.
>
> — `sad.md §11, risk row 1, abridged` · full text: [sad.md](../sad.md)

**Today's revalidations (keep verbatim):** `createCustomPrice` → `customerDetail(customerId)`, `productCustomPrices(productId)`. `updateCustomPrice` → `customerDetail(existing.customerId)`, `productCustomPrices(existing.productId)`. `deleteCustomPrice` → `customerDetail(customerId)`, `productCustomPrices(productId || existing.productId)`. — `lib/actions/custom-price-actions.ts:138-139,193-194,306-307`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice:

| Entity | Aggregate root | Owner path (ADR-0003) | List search fields (ADR-0005) | List order today (id tiebreak added, spec §1 change 4) |
|---|---|---|---|---|
| `CustomPrice` | `Customer` | `customer.userId = A`, and on writes also `product.userId = A` | product `name`, customer `name` | as today, then `id` |

— `data-model.md §Entities, Aggregate roots table, row CustomPrice, verbatim` · full text: [data-model.md](../data-model.md)

> There is no unique `(customerId, productId)` on `CustomPrice`. It was dropped on purpose in `20260105020000_allow_multiple_custom_prices`
>
> — `data-model.md §Entities, write rules, abridged` · full text: [data-model.md](../data-model.md)

## API contract

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listCustomerCustomPrices(actor, customerId, query?: ListQuery)` ★ | `Page<SerializedCustomPrice>` = | parent `NOT_FOUND` "Customer not found." (flow 4). Search on product `name`, customer `name`. Order `product.name asc, id` | `getCustomerCustomPrices(customerId)` → `data.items` |
| `listProductCustomPrices(actor, productId, query?: ListQuery)` ★ | `Page<SerializedCustomPrice>` = | parent `NOT_FOUND` "Product not found.". Same search. Order `customer.name asc, id` | `getProductCustomPrices(productId)` → `data.items` |
| `createCustomPrice(actor, input: CustomPriceSchemaValues)` | `{ id: string }` | `VALIDATION` → `NOT_FOUND` (customer or product missing or foreign, AC-19 by analogy) | `createCustomPrice(data)` |
| `updateCustomPrice(actor, id, input: UpdateCustomPriceValues)` ✎ | `{ customerId: string; productId: string }` (for the wrapper's revalidation) | `VALIDATION` → `NOT_FOUND` | `updateCustomPrice(id, data)` |
| `deleteCustomPrice(actor, id, customerId)` ✎ | `{ customerId: string; productId: string }` | `NOT_FOUND` "Customer not found." (customer missing or foreign) → `NOT_FOUND` "Custom price not found." (no price with this id under that customer), as today | `deleteCustomPrice(id, customerId, productId?)`. `productId?` stays in the wrapper signature and is no longer needed for revalidation |

— `contracts/public-api.md §2.3, Custom prices, verbatim` · full text: [public-api.md](../contracts/public-api.md)

**Resolved at breakdown (contract updated 2026-10-01):** both writes return `{ customerId, productId }` so the wrapper can revalidate without Prisma, and `deleteCustomPrice` keeps today's customer-then-price pairing and messages. `tests/integration/actions/custom-price-validation-and-links.test.ts` must pass unchanged.

## Acceptance criteria

### AC-08 — authorization

> **Given** an Assistant acting for Freelancer A, and a record (invoice, customer, product, custom price, sender profile or bank account) that belongs to Freelancer B
> **When** it asks to read, change or delete that record by its identifier, or asks for a list that belongs to it (for example the custom prices of B's customer)
> **Then** the system answers exactly as it does for an identifier that never existed, and B's record stays unchanged, so A's side cannot even learn that the record exists
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy

> **Given** Freelancer A has 23 customers, of which 5 have "acme" in their name or email in any letter case
> **When** an Assistant acting for A asks for customers matching "ACME", page 1, 2 per page
> **Then** it receives 2 of those 5 customers in the usual order, together with total 5, page 1, 3 pages in all and "more results exist"
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

This task asserts the same envelope for both custom-price lists (search on product and customer name).

## Checklist

- [ ] RED: write `tests/integration/services/custom-prices/custom-prices.test.ts` (request-free). Cover both lists (full list in today's order, search in any case, page/size envelope), create, update and delete.
- [ ] RED: write `tests/integration/services/custom-prices/foreign-record.test.ts`. Cover `listCustomerCustomPrices` with B's customer → `NOT_FOUND` "Customer not found.", `listProductCustomPrices` with B's product → `NOT_FOUND`, `createCustomPrice` with B's customer or B's product → `NOT_FOUND` with nothing stored, and `updateCustomPrice`/`deleteCustomPrice` with B's price id → `NOT_FOUND` with B's row unchanged.
- [ ] Create `lib/services/custom-prices/custom-prices.ts` (`import 'server-only'`). Parent lookup `{ id, userId: actor.userId }` before each list, then `paginate()` with `mode: 'insensitive'` on `product.name` / `customer.name`, ordered `[{ product: { name: 'asc' } }, { id: 'asc' }]` / `[{ customer: { name: 'asc' } }, { id: 'asc' }]`.
- [ ] Writes are owner-scoped through `customer: { userId }`, and create also checks `product.userId = A`. Map `P2025` via `lib/services/_shared/owner-scope.ts`, or fall back to `updateMany`/`deleteMany` with `count === 0 → NOT_FOUND` if Prisma rejects the relation filter in a unique `where` (sad.md §11). Note in the PR which one was used.
- [ ] Rewrite `lib/actions/custom-price-actions.ts` as thin wrappers with the same export names and signatures (`deleteCustomPrice(id, customerId, productId?)` stays), today's revalidations, and `data.items` for the two list actions.
- [ ] Run `tests/integration/actions/custom-price-validation-and-links.test.ts` and the foreign-record parity test unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| List for B's customer or B's product | `NOT_FOUND`, same as a customer/product id that never existed |
| Create with A's customer and B's product | `NOT_FOUND` "Customer or product not found.", nothing stored |
| Update/delete of B's custom price | `NOT_FOUND`, with B's row unchanged |
| Two custom prices for the same customer and product | allowed (no unique constraint), both listed, `id` tiebreak |
| Invalid list query | `VALIDATION`, no records |
| Unexpected failure | `FAILED` with today's message, reported once |

## Definition of Done

- [ ] Request-free integration tests pass for all five functions
- [ ] Foreign-record tests pass for both parent lists and every id-taking write
- [ ] `lib/actions/custom-price-actions.ts` has no `prisma` import. Existing tests pass with 0 changed expectations
- [ ] Every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
