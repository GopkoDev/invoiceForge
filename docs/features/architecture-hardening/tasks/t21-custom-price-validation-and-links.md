---
id: T21
title: "Validate custom prices on create and update and link them to an explicit owned Customer"
layer: "app"
deps: ["T00", "T08"]
blocks: []
acs: ["AC-16", "AC-31"]
files_hint: ["lib/validations/custom-price.ts", "lib/actions/custom-price-actions.ts", "components/modals/customer/custom-price-modal.tsx", "components/customers/customer-custom-prices.tsx", "components/products/product-custom-prices.tsx", "hooks/use-product-custom-price-modal.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T21 — Validate custom prices on create and update and link them to an explicit owned Customer

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them · **Blocks:** — · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`lib/actions/custom-price-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** the system to recompute and check every amount I save
> **So that** the totals on my PDFs and dashboard are always correct and never negative
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

This task makes custom prices obey the same rules on update as on create and always link the chosen Customer and product (fixing L8 and L10).

## Inlined context

> ```ts
> type CustomPriceInput = {
>   customerId: string;        // ★ explicit and required (L10: was context.customerId || data.productId)
>   productId: string;
>   name?: string;             // trimmed, ≤ 100
>   price: number;             // > 0, ≤ 99 999 999.99, 2 dp
>   notes?: string;            // trimmed, ≤ 500
> };
> ```
>
> Order: `UNAUTHORIZED` → `VALIDATION` (the shared schema, now **before** the lookups) → `NOT_FOUND` if the customer **or** product isn't the caller's (AC-31, one message: "Customer or product not found.") → `success`. No `as` casts (L8).
>
> — `contracts/server-actions.md §createCustomPrice, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> The **same schema and messages as create** (AC-16): "Price must be a number.", "Price must be positive.", "Note must be 500 characters or fewer." The ownership chain `CustomPrice → Customer.userId`. The `customerId` / `productId` arguments are dropped, because the price keeps its link (flow 9). Outcomes: `UNAUTHORIZED`, `VALIDATION`, `NOT_FOUND`, `success`.
>
> — `contracts/server-actions.md §updateCustomPrice, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** **No unique (`customerId`, `productId`).** SAD §6 flow 9 hints at "the pair uniqueness index", but the repo deliberately **dropped** that unique in `20260105020000_allow_multiple_custom_prices`. [...] it is **not** added.
>
> — `data-model.md §Entities, CustomPrice, abridged` · full text: [data-model.md](../data-model.md)

> | default-create | Opened with "Add". From SCR-09 the Freelancer picks a product; from SCR-10, a Customer (`Combobox`). The form also has a price `Input`, a name `Input` and a note `Textarea` (AC-31) | `CustomPriceModal` (existing), `Combobox`, `Field`, `Input`, `Textarea` | wireframe below |
> | default-edit | Opened with "Edit". Customer and product are shown **read-only**, because `updateCustomPrice` no longer takes their ids (flow 9) | `CustomPriceModal`, `Field` | wireframe below |
> | validation | `VALIDATION`: a `FieldError` with the contract text ("Price must be a number.", "Price must be positive.", "Note must be 500 characters or fewer."). Create and update use **the same** messages (AC-16) | `FieldError` | wireframe below |
> | not-found | `NOT_FOUND`: `Alert` (destructive) inside the dialog, "Customer or product not found." The dialog stays open (AC-31) | `Alert` | wireframe below |
> | saving | Save in flight: the Save `Button` shows a `Spinner` | `Button`, `Spinner` | — |
> | saved | Success → the dialog closes, `toast.success` shows, and the price is listed on SCR-09 / SCR-10 | `Sonner` | — |
> | save-failed | `FAILED`: `toast.error`, and the dialog stays open with the values kept | `Sonner` | — |
>
> — `screens.md §SCR-11 Custom price dialog, states, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** | Input validation | Every action re-runs the entity's zod schema, **with no `as` casts that bypass it** (L8). **Link parameters are parsed with fallback-to-default schemas**: page ≥ 1, page size ∈ {10, 20, 30, 50, 100} (the sizes the list offers, `components/invoices/invoices-table-footer.tsx:29`), sort field, order, status and tab from enums; anything invalid becomes its default, and the controls show what was applied |
>
> — `sad.md §8, row Input validation, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `CustomPrice.customerId` | TEXT | NOT NULL, FK → `Customer(id)` CASCADE | set explicitly from the chosen Customer (AC-31) |
| `CustomPrice.productId` | TEXT | NOT NULL, FK → `Product(id)` CASCADE | ownership checked (AC-31) |
| `CustomPrice.price` | DECIMAL(10,2) | NOT NULL | shared schema on create **and** update (AC-16) |

— `data-model.md §Entities, CustomPrice, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `createCustomPrice(data: CustomPriceInput): ActionResult<{ id }>` · `updateCustomPrice(id, { name?, price, notes? }): ActionResult<void>`.

— `contracts/server-actions.md §Custom prices, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-16 — error

> **Given** a Freelancer updating a Customer's custom price with a negative amount, a non-number, or a note longer than allowed
> **When** the Freelancer saves it
> **Then** the system blocks the save with the same field messages it shows when a custom price is created
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — cross-context

> **Given** a Freelancer adding a custom price for a chosen Customer and product, from either the product's page or the customer's page
> **When** the Freelancer saves it
> **Then** the custom price is linked to exactly that Customer and that product, and if either one isn't the Freelancer's own, the save is blocked as not found
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] One shared schema (`customPriceSchema`) with the three contract messages; `customerId` + `productId` required for create — `lib/validations/custom-price.ts`
- [ ] `createCustomPrice`: guard → schema → both lookups scoped to the Freelancer → `NOT_FOUND` "Customer or product not found." → create with the explicit ids — `lib/actions/custom-price-actions.ts`
- [ ] `updateCustomPrice(id, { name, price, notes })`: guard → same schema (pick) → ownership via `CustomPrice → Customer.userId` → update; remove every `as` cast
- [ ] Callers pass `customerId` explicitly from SCR-09 (current customer) and SCR-10 (Combobox pick) — `components/customers/customer-custom-prices.tsx`, `components/products/product-custom-prices.tsx`, `hooks/use-product-custom-price-modal.tsx`
- [ ] Modal: read-only Customer/product on edit; `FieldError`s; `Alert` on `NOT_FOUND`; spinner on save — `components/modals/customer/custom-price-modal.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Update with price `-5` | `VALIDATION` "Price must be positive." (same as create) |
| Update with note of 501 chars | `VALIDATION` "Note must be 500 characters or fewer." |
| Create from a product page with another Freelancer's customer id | `NOT_FOUND` "Customer or product not found." |
| Two prices for the same pair | Allowed (named tiers; no pair unique) |

## Definition of Done

- [ ] in `pnpm dev`: update with a negative price / non-number / long note shows the same messages as create (AC-16)
- [ ] a price added from a product page is linked to the picked Customer (DB check); a tampered foreign `customerId` returns not-found (AC-31)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
