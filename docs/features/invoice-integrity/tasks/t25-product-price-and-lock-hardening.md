---
id: "T25"
title: "Validate the product price strictly and store the validated value; count product usage owner-scoped inside a transaction under the product row lock"
layer: "app"
deps: []
blocks: ["T26"]
acs: ["AC-20", "AC-13b"]
files_hint: ["lib/validations/product.ts", "lib/services/products/products.ts", "tests/unit/product-price-schema.test.ts", "tests/integration/services/products/currency-lock.test.ts", "tests/unit/services/owner-in-where.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T25 — Validate the product price strictly and store the validated value; count product usage owner-scoped inside a transaction under the product row lock

## Place in the sequence

- **Blocked by:** — · **Blocks:** T26 · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review findings F5, S1 and the product half of F7.

## Inlined context

> F5: the price is validated with `Number()` (`lib/validations/product.ts:9-24`) but stored with `parseFloat()` (`products.ts:84,135`). `" "` passes (`Number(" ")===0`) then `parseFloat(" ")` is NaN → generic FAILED; `"0x10"` validates as 16, stored as 0. The contract requires `^\d{1,8}(\.\d{1,2})?$` (`server-actions.md:266`).
> S1: `invoiceItem.groupBy({ by: ['invoiceId'], where: { productId: id } })` (`products.ts:111`) has no owner in its WHERE (sad §8: every read is owner-scoped in its own WHERE); `owner-in-where.test.ts` misses it.
> F7 (products): `updateProduct` counts usages and updates with no transaction and no lock (`products.ts:109-135`).
>
> — `_review/review-2026-10-08.md F5, S1, F7, abridged`

> | `"12abc"`, `"abc"` | "Price must be a number." (`""` keeps "Price is required") | `"12.345"` | "Price can have at most 2 decimal places." | `"-1"` | "Price can't be negative." | `"100000000"` | "Price is too large." |
>
> — `contracts/server-actions.md §Products, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-20, AC-13b. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] Enforce the contract regex on the raw string (no extra trimming — T13 edge table: `" 12.00 "` follows the rule exactly), keeping the four messages in their existing order.
- [ ] Schema transforms to the validated number (or Prisma.Decimal string) and the service stores exactly that.
- [ ] `updateProduct`: one `prisma.$transaction`; lock `SELECT 1 FROM "Product" WHERE id=$1 AND "userId"=$2 FOR UPDATE` (tagged template); count + update inside.
- [ ] Owner scope in the count WHERE; extend owner-in-where test.

## Edge cases

| Case | Behaviour |
|---|---|
| "12.3" | accepted |
| "" | "Price is required" |
| foreign product id | NOT_FOUND |

## Definition of Done

- [ ] Unit tests show " ", "0x10", "0b11" and "1e3" are refused with the contract price message and that the schema yields the number it validated; an integration test shows the stored price equals the validated value; updateProduct counts usage and updates in one transaction after SELECT … FOR UPDATE on the owner's product, and the usage count query carries the owner in its own WHERE (owner-in-where test covers it).
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
