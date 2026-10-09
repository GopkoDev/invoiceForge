---
id: T12
title: "Keep exactly one default bank account per sender profile and lock the currency of an account used by invoices"
layer: "app"
deps: ["T02"]
blocks: ["T19"]
acs: ["AC-13", "AC-17", "AC-17b"]
files_hint: ["lib/services/bank-accounts/bank-accounts.ts", "lib/actions/bank-account-actions.ts", "tests/integration/services/bank-accounts/single-default-and-currency-lock.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T12 — Keep exactly one default bank account per sender profile and lock the currency of an account used by invoices

## Place in the sequence

- **Blocked by:** T02 — Promote the four staged migrations, declare them in the Prisma schema and adapt the test factories · **Blocks:** T19 — Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms · **Wave:** 2 — needs `BankAccount_senderProfileId_isDefault_key` and `Invoice_bankAccountId_idx` from T02.
- **Lane:** own lane (parallel with T11, same pattern for sender profiles).

## Why (user story)

> **As a** Freelancer
> **I want** an invoice, its bank account and its catalogue products to share one currency
> **So that** my Customer is never asked to pay a EUR amount into a USD account
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** exactly one default sender profile and one default bank account per profile at all times
> **So that** a new invoice always starts from the profile and account I chose
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task makes the bank-account service keep one default per sender profile and refuse a currency change once any invoice uses the account.

## Inlined context

> The service guarantees "at least one" under a lock on the parent (`User` row for profiles, `SenderProfile` row for accounts) that also serializes the 10 parallel requests. Make-default clears and sets inside that transaction, so a failure rolls back to the old default. Create sets `isDefault` when no sibling exists; delete of the default promotes the earliest-created remaining sibling in the same transaction; an update that tries to clear the flag without choosing another is refused.
>
> — `adr/0005-…, Decision outcome, abridged` · full text: [ADR-0005](../adr/0005-guard-single-defaults-with-partial-unique-indexes-and-a-parent-row-lock.md)

> A bank account's currency change is refused with a count of the invoices that use it, mirroring the existing product rule (AC-13, AC-13b). No database constraint.
>
> — `sad.md §4, Currency invariant, abridged` · full text: [sad.md](../sad.md)

> Flow 9: read the record of this owner → if the currency changed, count invoices in any status that use the account → not found → not found; currency changed and N above zero → field error on the currency, used by N invoices so it cannot change; allowed → write the record, no invoice touched. Flow 10: lock the parent row; make default / create / delete default / unset / unique-index hit → as for sender profiles, per sender profile.
>
> — `sad.md §6, Flows 9 and 10, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Exactly 1 default after 10 parallel "set as default" requests, for sender profiles and for bank accounts.
>
> — `spec.md §6, NFR Default uniqueness, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** every write scoped by owner; a unique hit on a default index → retryable `CONFLICT`; never `FAILED` for user input.
>
> — `sad.md §8, Authorization / Error handling, abridged` · full text: [sad.md](../sad.md)

Code today (commit 87862ef): `lib/services/bank-accounts/bank-accounts.ts` clears sibling defaults with a separate `updateMany` (no transaction/lock), has no currency lock, and `deleteBankAccount` does not promote.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column / index | Constraints | Change |
|---|---|---|
| `BankAccount.isDefault` | partial UNIQUE (`senderProfileId`) WHERE `isDefault` = true (`BankAccount_senderProfileId_isDefault_key`, T02) | written under `SELECT 1 FROM "SenderProfile" WHERE "id" = $sp AND "userId" = $owner FOR UPDATE` |
| `BankAccount.currency` | NOT NULL | can no longer change once any invoice (any status) uses the account |
| `Invoice_bankAccountId_idx` (T02) | — | read: `SELECT count(*) FROM "Invoice" WHERE "bankAccountId" = $id`, only when the submitted currency differs |

Earliest-created remaining account → `ORDER BY "createdAt", "id"` via `BankAccount_senderProfileId_idx`.

— `data-model.md §BankAccount + §Invoice access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`lib/actions/bank-account-actions.ts`, signatures unchanged; default writes lock the **sender profile** row.
- `createBankAccount`: profile missing/foreign → `NOT_FOUND`; first account → `isDefault = true` whatever was sent; `isDefault = true` with others → clear then set; P2002 → `CONFLICT` "Couldn't change the default account. Please try again." (rolled back).
- `updateBankAccount`, in order: (1) missing/foreign → `NOT_FOUND`; (2) `currency ≠ stored` and N ≥ 1 invoices use it → **`CONFLICT`**, `error` = "The currency of an account used by {N} invoice(s) can't change.", `fieldErrors.currency` same text, `details: { kind: 'HAS_INVOICES', invoiceCount: N }`, other fields not saved; (3) `isDefault = false` on the current default → `VALIDATION`, `fieldErrors.isDefault = ["The default account can't be switched off. Make another account the default instead."]`; (4) `isDefault = true` → clear and set (repeat → `success`); (5) P2002 → the retryable `CONFLICT`.
- `deleteBankAccount`: deleting the default with others remaining promotes the earliest-created (`createdAt`, then `id`) in the same transaction; the "used by invoices" refusal is unchanged.

— `contracts/server-actions.md §Bank accounts, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-13 — domain invariant

> **Given** a bank account used by three invoices, counting invoices in any status, drafts and cancelled invoices included
> **When** the Freelancer tries to change that account's currency
> **Then** the system refuses and explains that the currency of an account used by invoices cannot change, naming how many invoices use it. Other fields of the account can still be edited
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — happy path

> **Given** a Freelancer with two sender profiles, A being the default
> **When** they make B the default by double-clicking, or from two tabs at the same moment
> **Then** exactly one profile is the default afterwards. The same holds for bank accounts within one sender profile. If making B the default fails, A stays the default
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-17b — domain invariant

> **Given** a Freelancer managing sender profiles, or the bank accounts of one sender profile
> **When** they create the first one, delete the current default while others remain, or try to unset the default without choosing another
> **Then** the first one created becomes the default automatically; after the default is deleted, the earliest-created remaining one becomes the default; and the default cannot simply be unset, only replaced by making another one the default. At every moment exactly one is the default while any exist
>
> — `spec.md §5, AC-17b, verbatim` · full text: [spec.md](../spec.md)

(Sender-profile half of AC-17/AC-17b is T11; the form states are T19.)

## Checklist

- [ ] `lib/services/bank-accounts/bank-accounts.ts` — helper: `$transaction` + lock `SenderProfile` by id and owner `FOR UPDATE`; no row → `NOT_FOUND`.
- [ ] `createBankAccount`: first → default; `isDefault` → clear others then insert.
- [ ] `updateBankAccount`: currency lock first (count via `Invoice.bankAccountId`, any status) → `CONFLICT` + `HAS_INVOICES` + `fieldErrors.currency`; then unset refusal; then switch.
- [ ] `deleteBankAccount`: promote the earliest-created remaining when the default is deleted.
- [ ] Map P2002 on `BankAccount_senderProfileId_isDefault_key` to the retryable `CONFLICT`.
- [ ] `lib/actions/bank-account-actions.ts` — no rule; pass through, revalidate on success.
- [ ] `tests/integration/services/bank-accounts/single-default-and-currency-lock.test.ts` — AC-13 with 3 invoices (draft, pending, cancelled) → N = 3; same request without currency change saves the IBAN; AC-17/17b cases; 10 parallel set-default → exactly 1.

## Edge cases

| Case | Behaviour |
|---|---|
| currency unchanged, account used by invoices | other edits saved |
| currency changed, account used only by a cancelled invoice | refused, N = 1 |
| currency changed and `isDefault = false` on the default | currency `CONFLICT` wins (step order) |
| default account of profile A while profile B also has a default | independent; each profile keeps one |
| delete the only account of a profile | as today (no default needed) |
| foreign account / profile id | `NOT_FOUND` |

## Definition of Done

- [ ] Integration tests show the AC-17/AC-17b rules under the SenderProfile row lock (first default, switch, promote on delete, unset refused, P2002 → retryable CONFLICT, 10 parallel requests → exactly 1 default) and a currency change on an account used by N invoices of any status returns CONFLICT with HAS_INVOICES N and fieldErrors.currency while other-field edits still save when the currency is unchanged.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
