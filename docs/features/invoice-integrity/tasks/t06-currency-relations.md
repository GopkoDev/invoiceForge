---
id: T06
title: "Check the bank account's and every catalogue line product's currency against the invoice in verifyInvoiceRelations"
layer: "app"
deps: []
blocks: ["T07", "T09", "T10"]
acs: ["AC-11", "AC-12"]
files_hint: ["lib/services/invoices/helpers.ts", "tests/integration/services/invoices/currency-relations.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T06 — Check the bank account's and every catalogue line product's currency against the invoice in verifyInvoiceRelations

## Place in the sequence

- **Blocked by:** — · **Blocks:** T07 — Create and duplicate invoices only as drafts…, T09 — Apply every draft rule on draft saves and issuing from the editor…, T10 — Decide list status changes and deletes under the row lock… · **Wave:** 1 — reads existing columns only.
- **Lane:** own lane (`lib/services/invoices/helpers.ts`).

## Why (user story)

> **As a** Freelancer
> **I want** an invoice, its bank account and its catalogue products to share one currency
> **So that** my Customer is never asked to pay a EUR amount into a USD account
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task puts the currency invariant in the business layer that every invoice write calls.

## Inlined context

> **Currency invariant.** Enforced in the business layer: `verifyInvoiceRelations` requires the bank account's currency to equal the invoice's and loads every catalogue product on the lines by id, inactive ones included, to compare currencies (AC-11, AC-12). … No database constraint.
>
> — `sad.md §4, tactical "Currency invariant", abridged` · full text: [sad.md](../sad.md)

> `else` bank account currency differs from the invoice currency → field error on the bank account, account in USD while the invoice is in EUR · `else` a catalogue product line in another currency, inactive products included → field error naming the line, free-text lines are not checked. *For `implement`:* the order of the `alt` branches in flow 4 is the order checks run.
>
> — `sad.md §6, flow 4 branches + Notes from sequences, abridged` · full text: [sad.md](../sad.md)

> The line-currency check (AC-12) compares the **catalogue product's** currency with the invoice's, because a free-text line has no currency of its own. The nullable `InvoiceItem.currency` column stays unused by these rules.
>
> — `data-model.md §InvoiceItem, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** Authorization — every read scoped by owner; another Freelancer's record is answered exactly like a missing one (`NOT_FOUND`, AC-23). Error handling — currency refusals are `VALIDATION` with `fieldErrors`, never `FAILED`.
>
> — `sad.md §8, Authorization + Error handling rows, abridged` · full text: [sad.md](../sad.md)

Current code: `verifyInvoiceRelations` (`lib/services/invoices/helpers.ts:156`) and `verifyItemProductsOwnership` (`:193`) check ownership only. Today the editor drops mismatching lines client-side (retired by T16). Callers (T07 create/duplicate, T09 draft save, T10 issue from list) run it inside their transaction; return field errors, don't throw.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Reads `BankAccount.currency`, `Product.currency` / `isActive` by id (`BankAccount_pkey`, `Product_pkey`), bounded by the line count.
— `data-model.md §Invoice access patterns, "Draft rules on create, save and issue", abridged` · full text: [data-model.md](../data-model.md)

## API contract

> | `bankAccountId` | **new rule:** the account's `currency` must equal the invoice's `currency` | AC-11 |
> | `items[].productId` | **new rule:** when set, the catalogue product's `currency` must equal the invoice's `currency`. Inactive products are loaded and checked too. A line with no `productId` (free text) is not checked | AC-12, AC-15 |
>
> | `bankAccountId` | "This account is in {accountCurrency} while the invoice is in {invoiceCurrency}." |
> | `items.<i>.productId` | "“{productName}” is priced in {productCurrency} while the invoice is in {invoiceCurrency}." |
>
> — `contracts/server-actions.md §Shared input: InvoiceFormInput + §Field-error messages, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-11 — error

> **Given** a Freelancer editing a draft in EUR
> **When** they choose a bank account held in USD and save
> **Then** the system blocks the save and explains on the bank account field that the account is in USD while the invoice is in EUR
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12 — cross-context

> **Given** a Freelancer whose catalogue product "Consulting" is priced in USD
> **When** they save a EUR draft that has a "Consulting" line, from the editor or from any other path
> **Then** the system blocks the save and names the line whose product is in a different currency. Lines typed as free text, without a catalogue product, are not checked
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

(This task owns the rule; T09 wires it into the draft save, T17 renders it.)

## Checklist

- [ ] `lib/services/invoices/helpers.ts` — extend `verifyInvoiceRelations` (or add `checkInvoiceCurrencies(tx, actor, { currency, bankAccountId, items })`) returning `NOT_FOUND` for missing/foreign records, else `fieldErrors` with the two contract messages; load products by id **without** an `isActive` filter.
- [ ] Keep the existing ownership semantics and call sites compiling.
- [ ] `tests/integration/services/invoices/currency-relations.test.ts` — USD account on EUR invoice; active USD product line; inactive USD product line; free-text line ignored; foreign bank account → `NOT_FOUND`.

## Edge cases

| Case | Behaviour |
|---|---|
| Line with `productId = null` (free text / deleted product) | Not checked |
| Inactive product in another currency | Refused, same message |
| Several mismatching lines | One `items.<i>.productId` key per line |
| Bank account and a line both mismatching | Both keys returned together |
| Foreign or missing product/account | `NOT_FOUND`, identical message |

## Definition of Done

- [ ] Integration tests show verifyInvoiceRelations returns fieldErrors.bankAccountId for a USD account on a EUR invoice and items.<i>.productId naming an inactive or active USD product on a EUR invoice, ignores free-text lines, and still answers NOT_FOUND for a foreign record.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
