---
id: T19
title: "Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms"
layer: "ui"
deps: ["T11", "T12", "T13"]
blocks: []
acs: ["AC-13", "AC-13b", "AC-17b", "AC-20"]
files_hint: ["components/sender-profiles/sender-profile-form.tsx", "components/modals/sender-profile/bank-account-modal.tsx", "components/products/product-form.tsx", "tests/component/default-and-currency-lock-forms.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T19 — Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms

## Place in the sequence

- **Blocked by:** T11 — Keep exactly one default sender profile per Freelancer under the User row lock, T12 — Keep exactly one default bank account per sender profile and lock the currency of an account used by invoices, T13 — Require a strict two-decimal product price and count invoices, not lines, in the product currency lock · **Blocks:** — · **Wave:** 3 — renders the outcomes those three services now return.
- **Lane:** own lane.

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

> **As a** Freelancer
> **I want** an amount that is too large, a due date before the issue date, or a malformed price to be explained on the field
> **So that** I know what to fix instead of seeing a generic failure
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task makes the three record forms show the default rule and the currency and price refusals on their fields.

## Inlined context

> SCR-09 — Sender profile form (`SenderProfileForm`, `Checkbox`, `FieldDescription`)
> - default — first profile: "Set as default sender profile" checked and disabled, `FieldDescription` "Your first sender profile is the default."
> - default — not the default: checkbox enabled and unchecked; checking + saving makes this the only default
> - default — current default: **checked and disabled**, `FieldDescription` "This is your default sender profile. To change it, make another profile the default."
> - default-switch-failed: `CONFLICT` "Couldn't change the default sender profile. Please try again." → `toast.error` verbatim; values kept
> - validation — isDefault: `fieldErrors.isDefault` (tampered request) → `FieldError` under the checkbox
>
> SCR-10 — Bank account form (`BankAccountModal`): same three checkbox states with "The first account of a sender profile is its default." / "This is the default account. To change it, make another account the default."; **currency-locked**: changed currency on an account N invoices use → `CONFLICT` + `HAS_INVOICES` → `FieldError` under currency "The currency of an account used by {N} invoice(s) can't change."; the dialog stays open with every value kept; not locked up front, the refusal comes on save. default-switch-failed: "Couldn't change the default account. Please try again." toast, dialog stays open.
>
> SCR-12 — Product form (`ProductForm`): **validation — price** → `FieldError` under price: "Price must be a number." / "Price can have at most 2 decimal places." / "Price can't be negative." / "Price is too large.", values kept; **currency-locked** → `FieldError` under currency "The currency of a product used on {N} invoice(s) can't change."; if the product has custom prices, the existing `CurrencyChangeWarningModal` still shows first and this refusal follows its confirm.
>
> — `screens.md §SCR-09, §SCR-10, §SCR-12, abridged` · full text: [screens.md](../screens.md)

> Decision 3: make default stays the existing "Set as default" `Checkbox` in SCR-09 and SCR-10; the lists get no new action. `CONFLICT` routed by `details.kind`: `HAS_INVOICES` shows a `FieldError` on currency; a default race shows the result's `error`. **New components: None.**
>
> — `screens.md §Source, decision 3 + Error routing + §New components, abridged` · full text: [screens.md](../screens.md)

Current code: `sender-profile-form.tsx:229` and `bank-account-modal.tsx:235` render the `isDefault` checkbox, defaulting to `false` on create (lines 66/67). — repo at HEAD, the code wins.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `createBankAccount` / `createSenderProfile`: first record stored as default whatever was sent; P2002 → `CONFLICT` "Couldn't change the default account. Please try again." / "Couldn't change the default sender profile. Please try again."
- `updateBankAccount`: currency change with N ≥ 1 invoices → **`CONFLICT`**, `error` and `fieldErrors.currency` = "The currency of an account used by {N} invoice(s) can't change.", `details: { kind: 'HAS_INVOICES', invoiceCount: N }`; `isDefault = false` on the default → `VALIDATION`, `fieldErrors.isDefault = ["The default account can't be switched off. Make another account the default instead."]` (profiles: "The default sender profile can't be switched off. Make another profile the default instead.").
- `updateProduct`: currency lock → `CONFLICT` + `fieldErrors.currency` "The currency of a product used on {N} invoice(s) can't change." + `HAS_INVOICES`; `ProductFormValues.price` → `VALIDATION` with the four price messages (same texts as `lib/validations/custom-price.ts`).

— `contracts/server-actions.md §Bank accounts, §Sender profiles, §Products, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-13 — domain invariant

> **Given** a bank account used by three invoices, counting invoices in any status, drafts and cancelled invoices included
> **When** the Freelancer tries to change that account's currency
> **Then** the system refuses and explains that the currency of an account used by invoices cannot change, naming how many invoices use it. Other fields of the account can still be edited
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-13b — domain invariant

> **Given** a catalogue product that appears on a line of at least one invoice in any status, drafts and cancelled invoices included
> **When** the Freelancer tries to change that product's currency
> **Then** the system refuses and explains that the currency of a product used on invoices cannot change, naming how many invoices use it. Other fields of the product can still be edited
>
> — `spec.md §5, AC-13b, verbatim` · full text: [spec.md](../spec.md)

### AC-17b — domain invariant

> **Given** a Freelancer managing sender profiles, or the bank accounts of one sender profile
> **When** they create the first one, delete the current default while others remain, or try to unset the default without choosing another
> **Then** the first one created becomes the default automatically; after the default is deleted, the earliest-created remaining one becomes the default; and the default cannot simply be unset, only replaced by making another one the default. At every moment exactly one is the default while any exist
>
> — `spec.md §5, AC-17b, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** a Freelancer creating or editing a product
> **When** they enter "12abc" or "12.345" as its price
> **Then** the system blocks the save and shows on the price field that it must be a number with at most two decimal places, the same rule custom prices already follow
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

(Form half; the service rules are T11/T12/T13.)

## Checklist

- [ ] `components/sender-profiles/sender-profile-form.tsx` — checkbox states (first / not default / current default) with the SCR-09 `FieldDescription` texts; default-race `CONFLICT` toast verbatim; `fieldErrors.isDefault` under the checkbox.
- [ ] `components/modals/sender-profile/bank-account-modal.tsx` — the SCR-10 checkbox states; route `CONFLICT` + `HAS_INVOICES` to a `FieldError` under currency, dialog stays open with values kept; default-race toast.
- [ ] `components/products/product-form.tsx` — strict price rule in the form (shared schema from T13) with the four messages; `HAS_INVOICES` → `FieldError` under currency, after `CurrencyChangeWarningModal` when it applies.
- [ ] `tests/component/default-and-currency-lock-forms.test.tsx` — one test per state above.

## Edge cases

| Case | Behaviour |
|---|---|
| First profile / first account of a profile | Checkbox checked + disabled with the "first" description |
| Editing the current default | Checkbox checked + disabled; cannot be unticked |
| Currency changed back to the stored value, other edits kept | Save succeeds |
| Product with custom prices, currency changed, used on invoices | `CurrencyChangeWarningModal` first, then the currency `FieldError` |
| `""` price | "Price is required" (unchanged) |
| Two tabs switching default at once, one loses | `toast.error` with the race message, previous default unchanged |

## Definition of Done

- [ ] Component tests show the default checkbox checked-and-disabled with the contract FieldDescription for a first or current default, enabled otherwise, HAS_INVOICES rendering a FieldError under currency with values kept in BankAccountModal and ProductForm, the default-race CONFLICT as a verbatim toast, and the four price messages under price.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
