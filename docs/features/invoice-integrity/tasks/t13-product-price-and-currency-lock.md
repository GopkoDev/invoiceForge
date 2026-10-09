---
id: T13
title: "Require a strict two-decimal product price and count invoices, not lines, in the product currency lock"
layer: "app"
deps: []
blocks: ["T19"]
acs: ["AC-13b", "AC-20"]
files_hint: ["lib/validations/product.ts", "lib/services/products/products.ts", "tests/unit/product-price-schema.test.ts", "tests/integration/services/products/currency-lock.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T13 — Require a strict two-decimal product price and count invoices, not lines, in the product currency lock

## Place in the sequence

- **Blocked by:** — · **Blocks:** T19 — Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms · **Wave:** 1 — no schema change; `InvoiceItem_productId_idx` and the `HAS_INVOICES` detail kind already exist.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** an invoice, its bank account and its catalogue products to share one currency
> **So that** my Customer is never asked to pay a EUR amount into a USD account
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** an amount that is too large, a due date before the issue date, or a malformed price to be explained on the field
> **So that** I know what to fix instead of seeing a generic failure
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task makes a malformed product price a field error and makes the product currency lock name how many invoices use the product.

## Inlined context

> The product price uses the strict two-decimal format custom prices already use (AC-09, AC-19, AC-20, AC-20b).
>
> — `sad.md §4, Amount and date bounds, abridged` · full text: [sad.md](../sad.md)

> Flow 9: read the record of this owner → if the currency changed, count invoices in any status that have a line with the product → not found → not found; product price is not a number with at most two decimal places → field error on the price; currency changed and N above zero → field error on the currency, used by N invoices so it cannot change; allowed → write the record, no invoice touched.
>
> — `sad.md §6, Flow 9, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** 0 generic failures for amount, date, price, discount or currency input; each comes back as a field error.
>
> — `spec.md §6, NFR Generic failures from user input, verbatim` · full text: [spec.md](../spec.md)

Code today (commit 87862ef): `updateProduct` (`lib/services/products/products.ts:93`) uses `_count.invoiceItems` (lines, not invoices) and returns `CONFLICT` with "Cannot change currency for product used in N invoice(s)…" without `fieldErrors`/`details`. The custom-price rule and texts live in `lib/validations/custom-price.ts` — reuse them.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. `Product.price` stays `DECIMAL(10,2)`; the AC-13b count is `SELECT count(DISTINCT "invoiceId") FROM "InvoiceItem" WHERE "productId" = $id` → existing `InvoiceItem_productId_idx`.

— `data-model.md §Product + §Invoice access patterns (AC-13b), abridged` · full text: [data-model.md](../data-model.md)

## API contract

`ProductFormValues.price` (`lib/validations/product.ts`) — `string`; must match `^\d{1,8}(\.\d{1,2})?$` with value `≤ 99 999 999.99`; runs in the form and in `createProduct` / `updateProduct` → `VALIDATION`:

| Input | `fieldErrors.price` |
|---|---|
| `"12abc"`, `"abc"` | "Price must be a number." (`""` keeps "Price is required") |
| `"12.345"` | "Price can have at most 2 decimal places." |
| `"-1"` | "Price can't be negative." |
| `"100000000"` | "Price is too large." |

`updateProduct` currency lock: count `DISTINCT invoiceId`; message "The currency of a product used on {N} invoice(s) can't change."; result `CONFLICT` with `fieldErrors.currency` and `details: { kind: 'HAS_INVOICES', invoiceCount: N }`. The unit lock and every other outcome unchanged; `toggleProductActive` unchanged.

— `contracts/server-actions.md §Products, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-13b — domain invariant

> **Given** a catalogue product that appears on a line of at least one invoice in any status, drafts and cancelled invoices included
> **When** the Freelancer tries to change that product's currency
> **Then** the system refuses and explains that the currency of a product used on invoices cannot change, naming how many invoices use it. Other fields of the product can still be edited
>
> — `spec.md §5, AC-13b, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** a Freelancer creating or editing a product
> **When** they enter "12abc" or "12.345" as its price
> **Then** the system blocks the save and shows on the price field that it must be a number with at most two decimal places, the same rule custom prices already follow
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/validations/product.ts` — replace the loose price rule with the custom-price rule (shared helper or import from `lib/validations/custom-price.ts`), keeping "Price is required" for `""`.
- [ ] `lib/services/products/products.ts` — `updateProduct`: when currency changed, count distinct invoices via `InvoiceItem.productId`; refuse with `CONFLICT` + `fieldErrors.currency` + `HAS_INVOICES`. Keep the unit lock as is.
- [ ] `tests/unit/product-price-schema.test.ts` — the four messages, `"12.34"` and `"0"` accepted.
- [ ] `tests/integration/services/products/currency-lock.test.ts` — product on 2 lines of one invoice + 1 line of a cancelled invoice → N = 2; unchanged currency with a new name saves.

## Edge cases

| Case | Behaviour |
|---|---|
| two lines with the product on the same invoice | counted once |
| product only on a cancelled or draft invoice | refused, N = 1 |
| product not on any line | currency change saved |
| price `"12.3"` | accepted |
| price `" 12.00 "` | follows the custom-price rule exactly (no extra trimming) |
| foreign product id | `NOT_FOUND` |

## Definition of Done

- [ ] Unit tests show the product schema returns the four contract price messages for 12abc, 12.345, -1 and 100000000, and an integration test shows a currency change on a product used on N distinct invoices (any status) returns CONFLICT with HAS_INVOICES N and fieldErrors.currency.
- [ ] Any existing product test whose expectation changes is listed for the PR.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
