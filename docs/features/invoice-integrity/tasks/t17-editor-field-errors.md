---
id: T17
title: "Show every new invoice rule refusal under its field in the editor"
layer: "ui"
deps: ["T16"]
blocks: ["T18"]
acs: ["AC-09", "AC-11", "AC-12", "AC-14", "AC-19", "AC-20b"]
files_hint: ["components/invoice-editor/", "lib/helpers/invoice-editor/", "tests/component/invoice-editor-field-errors.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T17 — Show every new invoice rule refusal under its field in the editor

## Place in the sequence

- **Blocked by:** T16 — Render the editor in draft, issued and cancelled modes with Save and issue and retired-product lines kept · **Blocks:** T18 — Round-trip the loaded version and open the changed-elsewhere dialog and stale state on CHANGED_ELSEWHERE · **Wave:** 6 — renders the server's draft-rule and issued refusals into the modes T16 built.
- **Lane:** `components/invoice-editor/` lane (T16 → T17 → T18, serialized).

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

This task makes every new refusal readable on the field it concerns instead of a generic toast.

## Inlined context

> - draft — validation: Save or Save and issue → `VALIDATION`. All failing rules come back together, and each `FieldError` shows the contract text under its field. Edits are kept and nothing is stored. Keys: `bankAccountId` → under the bank account select; `items.<i>.productId` → under that line, naming the product; `items.<i>.total` → under that line's amount; `shipping` → shipping; `subtotal` / `taxAmount` / `total` → under the totals; `discount` → discount; `dueDate` → due date. Every one of these keys becomes a rendered field-error key, so none falls back to a toast. A draft saved before the release with mismatching currencies hits the same state on any save, even a notes-only one
> - issued — validation: Save → `VALIDATION` on `dueDate`: "The due date can't be before the issue date ({issueDate})." under the due date. Edits are kept
> - issued — locked-field refusal: `VALIDATION` + `ISSUED_INVOICE_LOCKED`, reachable only from a tampered or stale form. The result's `error` shows in a destructive `Alert` above the form. Each changed key gets a `FieldError` where it is rendered, the rest go to the toast fallback. Nothing is stored
> - refused: Save → `VALIDATION` + `STATUS_NOT_ALLOWED` (e.g. a lifecycle refusal on Save and issue): `toast.error` with `error` verbatim. Edits are kept
>
> — `screens.md §SCR-02, states draft — validation, issued — validation, issued — locked-field refusal, refused, abridged` · full text: [screens.md](../screens.md)

> Error routing: `VALIDATION` shows a `FieldError` under the field named by its key; a key with no rendered field falls back to `toast.error` (the existing F-41 rule). Strings: where `contracts/server-actions.md` fixes a message, the UI shows it **verbatim** from `error` / `fieldErrors`; it never rewrites it. Reused: `Field`/`FieldError`, `Alert`, `Sonner` — **no new component**.
>
> — `screens.md §Source, Error routing + Strings, abridged` · full text: [screens.md](../screens.md)

> The editor runs the same module [as the service's amount and date bounds].
>
> — `sad.md §4, tactical "Amount and date bounds", abridged` · full text: [sad.md](../sad.md)

Client-side pre-validation lives in `lib/helpers/invoice-editor/validate-invoice-form.ts`; keep it in step with the T05 shared rules (same messages). — repo at HEAD, the code wins.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

| `fieldErrors` key | Message |
|---|---|
| `dueDate` | "The due date can't be before the issue date ({issueDate})." |
| `bankAccountId` | "This account is in {accountCurrency} while the invoice is in {invoiceCurrency}." |
| `items.<i>.productId` | "“{productName}” is priced in {productCurrency} while the invoice is in {invoiceCurrency}." |
| `items.<i>.total` | "The line amount can't exceed 99,999,999.99." |
| `shipping` | "Shipping can't exceed 99,999,999.99." |
| `subtotal` / `taxAmount` / `total` | "The subtotal / tax amount / total can't exceed 99,999,999.99." |
| `discount` | "Discount can't exceed the subtotal plus shipping." |
| any locked field key | "This field can't change on an issued invoice." (+ `details.kind: 'ISSUED_INVOICE_LOCKED'`, `error` = "An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.") |

A failing save may carry several keys in one `VALIDATION`. Lifecycle refusal: `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus, suggestion }`.

— `contracts/server-actions.md §Invoices, Field-error messages + §updateInvoice step 6, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-09 — error

> **Given** a Freelancer editing an issued invoice dated 10 March
> **When** they set its due date to 5 March and save
> **Then** the system blocks the save and shows on the due date field that it cannot be before the issue date, 10 March
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

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

### AC-14 — cross-context

> **Given** an invoice issued before this release whose currency differs from its bank account's
> **When** the Freelancer changes its notes or due date and saves
> **Then** the save succeeds. On an issued invoice only the rules of the fields that actually changed are checked: a changed due date must not be before the issue date (AC-09), while the currency, amount and discount rules are not re-checked, because those fields are fixed. On a draft every rule, the currency rule included, is checked on every save and when it moves to pending from any path. A draft saved before this release with mismatching currencies is therefore blocked on its next save, even a notes-only one, and cannot be issued, with the explanation from AC-11, until the Freelancer fixes it
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — error

> **Given** a Freelancer editing a draft
> **When** they enter 1,000 hours at 150,000 on one line, making the line amount, the subtotal, the tax amount, the shipping or the total larger than 99,999,999.99, and save
> **Then** the system blocks the save and shows that the amount cannot exceed 99,999,999.99: on the line for a line amount, on the shipping field for shipping, and on the totals for the subtotal, tax amount or total. Each of these amounts is checked on its own, so a subtotal over the limit is refused even when a discount brings the total back under it. Nothing is stored and no generic failure is shown
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-20b — error

> **Given** a Freelancer editing a draft whose lines add up to 1,000.00 with a shipping of 200.00
> **When** they enter a discount of 1,250.00 and save, from the editor or from any other path
> **Then** the system blocks the save and shows on the discount field that the discount cannot exceed the sum of the lines plus the shipping. A discount of 1,200.00 is accepted
>
> — `spec.md §5, AC-20b, verbatim` · full text: [spec.md](../spec.md)

(Editor half: the server rules are T05/T06/T08/T09.)

## Checklist

- [ ] `components/invoice-editor/` (summary, items, invoice-details, sender/bank sections) — render `FieldError` for `bankAccountId`, `items.<i>.productId`, `items.<i>.total`, `shipping`, `subtotal`, `taxAmount`, `total`, `discount`, `dueDate`; remove them from the toast fallback set.
- [ ] `components/invoice-editor/invoice-editor-form.tsx` — on `ISSUED_INVOICE_LOCKED` show a destructive `Alert` with `error` above the form + field errors where rendered; on `STATUS_NOT_ALLOWED` `toast.error(error)`; edits kept in every refusal.
- [ ] `lib/helpers/invoice-editor/validate-invoice-form.ts` — import the T05 shared bounds so client pre-checks show the same texts.
- [ ] `tests/component/invoice-editor-field-errors.test.tsx` — one case per key + locked + refused + legacy-draft notes-only save.

## Edge cases

| Case | Behaviour |
|---|---|
| Several rules fail at once (wireframe B) | All field errors shown together, nothing stored |
| Subtotal over limit, discount brings total under | Error under subtotal still shown |
| Discount equals lines + shipping (1,200.00) | Accepted, no error |
| Free-text line in a EUR draft | No currency error |
| Legacy issued invoice with mismatching currency, notes changed | Saves, no error |
| Legacy draft with mismatching currency, notes-only save | `bankAccountId` error, nothing stored |
| Locked key with no rendered field (e.g. `items`) | Toast fallback with its message |

## Definition of Done

- [ ] Component tests show each contract fieldErrors key (bankAccountId, items.<i>.productId, items.<i>.total, shipping, subtotal, taxAmount, total, discount, dueDate) renders its message verbatim under its field with edits kept and no toast fallback, ISSUED_INVOICE_LOCKED shows the destructive Alert, and STATUS_NOT_ALLOWED shows the toast.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
