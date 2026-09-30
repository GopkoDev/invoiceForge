---
id: T7
title: "Move products into lib/services/products with search, paging and owner-scoped writes"
layer: "app"
deps: ["T3", "T4"]
blocks: ["T20"]
acs: ["AC-01", "AC-08", "AC-11"]
files_hint: ["lib/services/products/", "lib/actions/product-actions.ts", "tests/integration/services/products/"]
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

# T7 — Move products into lib/services/products with search, paging and owner-scoped writes

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper · **Blocks:** T20 — Close the move. **Wave:** 4 (DAG level), release wave 1 of sad.md §7.
- **Lane:** own lane. Runs in parallel with T6, T8–T12 and T17.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** every list to accept an optional search text, page and page size and to tell me the total and whether more results exist
> **So that** I never mistake a partial list for the whole one
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task moves the product list, reads and writes into request-free business functions. The products page, the product picker (`onlyActive`) and the active toggle keep calling them through unchanged wrappers.

## Inlined context

> WA->>BL: updateCustomer(actor, id, input) · BL validates input with the customer schema · alt input invalid → VALIDATION with field errors · else BL->>DB: update where id and owner match · alt no row for this id and owner (missing or foreign) → NOT_FOUND · else row updated → success, WA revalidates the […] list and detail pages
>
> — `sad.md §6, Critical flow 1, abridged (same shape for products)` · full text: [sad.md](../sad.md)

> S->>S: validates the list query with the shared list schema · alt page or page size not a whole number of at least 1, or search longer than 100 characters → VALIDATION […] · else counts the owner's records matching the search on the list's name fields, in any letter case · no page given means the full list as page 1, a page without a size uses 10, a page past the last one falls back to page 1 · reads one page where the owner matches, in today's order ending with the record id
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. It is explicit at every call site and needs no infrastructure.
>
> — `adr/0003 §Decision outcome, abridged` · full text: [0003](../adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md)

> **Hard rule:** Move domain by domain (§7), with the existing suite as an oracle (0 changed expectations, reviewed in `review`). Wrappers keep today's `revalidatePath` lists verbatim.
>
> — `sad.md §11, risk row 1, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** 100% of business functions that take a record identifier have a foreign-record test (read, change, delete) proving AC-08
>
> — `spec.md §6, Tenant isolation, verbatim` · full text: [spec.md](../spec.md)

**Today's revalidations (keep verbatim):** `createProduct`, `deleteProduct` and `toggleProductActive` → `protectedRoutes.products`. `updateProduct` → `protectedRoutes.products`, `protectedRoutes.productEdit(id)`. — `lib/actions/product-actions.ts:121,187-188,238,273`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice:

| Entity | Aggregate root | Owner path (ADR-0003) | List search fields (ADR-0005) | List order today (id tiebreak added, spec §1 change 4) |
|---|---|---|---|---|
| `Product` | root | `userId = A` | `name` | as today, then `id` |

— `data-model.md §Entities, Aggregate roots table, row Product, verbatim` · full text: [data-model.md](../data-model.md)

Today's order starts `isActive: 'desc'` (`lib/actions/product-actions.ts:49`). Keep the full existing `orderBy` and append `{ id: 'asc' }`.

## API contract

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listProducts(actor, query?: ListQuery & { onlyActive?: boolean })` ★ | `Page<SerializedProduct>` = | search on `name`. Order: today's (`isActive desc, …`), then `id` | `getProducts({ onlyActive })` → `data.items` |
| `getProduct(actor, id)` | `SerializedProduct` = | `NOT_FOUND` "Product not found." | `getProduct(id)` |
| `createProduct(actor, input: ProductFormValues)` | `{ id: string }` | `VALIDATION` | `createProduct(data)` |
| `updateProduct(actor, id, input: ProductFormValues)` | `void` | `VALIDATION` → `NOT_FOUND` | `updateProduct(id, data)` |
| `deleteProduct(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` "Cannot delete product used in {n} invoice(s). Consider deactivating it instead." (=, no `details`) † | `deleteProduct(id)` |
| `toggleProductActive(actor, id)` | `void` | `NOT_FOUND` | `toggleProductActive(id)` |

— `contracts/public-api.md §2.2, Products, verbatim` · full text: [public-api.md](../contracts/public-api.md)

† The used-in-invoices branch is preserved from today's code but drawn in no sad.md §6 flow. It is parked as spec §8 OQ (owner `sequences`). Keep it as it is today.

## Acceptance criteria

### AC-01 — happy

> **Given** a signed-in Freelancer with existing sender profiles, customers, products, custom prices, bank accounts and invoices
> **When** the Freelancer opens any list, detail page, the invoice editor, a picker or the dashboard, or saves any form
> **Then** they see the same records, values, order, messages and confirmations as before the change (except the deliberate dashboard naming and tie order in AC-06), and every existing automated check passes with its expected values unchanged (the only removed check is the one for the unused list-all-invoices function)
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

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

This task asserts the same shape for products (search on `name`).

## Checklist

- [ ] RED: write `tests/integration/services/products/products.test.ts` (request-free, `actingFreelancerForTest`). Cover a case-insensitive name search with page and size (AC-11 shape for products), the full list with no query in today's order, `onlyActive`, get/create/update, toggle, and the used-in-invoices `CONFLICT`.
- [ ] RED: write `tests/integration/services/products/foreign-record.test.ts` for `getProduct`, `updateProduct`, `deleteProduct` and `toggleProductActive` with B's id → `NOT_FOUND`, B's row unchanged.
- [ ] Create `lib/services/products/products.ts` (`import 'server-only'`) with the six functions. Parse input with `lib/validations/product.ts`. Keep today's serialization to `SerializedProduct`.
- [ ] Owner-scoped writes `{ id, userId: actor.userId }` with `P2025 → NOT_FOUND` (`lib/services/_shared/owner-scope.ts`), or the `updateMany`/`deleteMany` fallback. `toggleProductActive` reads `isActive` and writes under the owner.
- [ ] Rewrite `lib/actions/product-actions.ts` as thin wrappers with the same export names and signatures, today's revalidations, and `getProducts({ onlyActive })` → `data.items`.
- [ ] Run the existing product tests and the product picker component tests unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| B's product id on get/update/delete/toggle | `NOT_FOUND` "Product not found.", with B's row unchanged |
| Product used in invoices | `CONFLICT` "Cannot delete product used in {n} invoice(s). Consider deactivating it instead." |
| `onlyActive: true` with a search | only active products matching the name, in today's order |
| Invalid list query | `VALIDATION`, no records |
| Unexpected failure | `FAILED` with today's message, reported once |

## Definition of Done

- [ ] Request-free integration tests for all six functions pass
- [ ] Foreign-record tests pass for every id-taking function
- [ ] `lib/actions/product-actions.ts` has no `prisma` import. Existing tests pass with 0 changed expectations
- [ ] Every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
