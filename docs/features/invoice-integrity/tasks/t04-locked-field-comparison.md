---
id: T04
title: "Add the pure locked-field comparison for issued invoices built on the write normalizers"
layer: "domain"
deps: []
blocks: ["T08"]
acs: ["AC-08"]
files_hint: ["lib/helpers/invoice-locked-fields.ts", "tests/unit/invoice-locked-fields.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T04 — Add the pure locked-field comparison for issued invoices built on the write normalizers

## Place in the sequence

- **Blocked by:** — · **Blocks:** T08 — Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices · **Wave:** 1 — a pure module, no schema dependency.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to change only the due date, notes, payment terms and PO number of an issued invoice, and to cancel and duplicate it for anything else
> **So that** small corrections stay easy while what I billed stays fixed
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task builds the one comparison that decides whether a save to an issued invoice touched anything beyond its four editable fields.

## Inlined context

> **Chosen:** Option 1. It implements AC-08 and AC-14 literally and keeps one save contract for every caller. Comparison uses the same normalizers as the write: amounts as two-decimal strings from the shared decimal module, dates as calendar days (an unedited legacy instant counts as unchanged, as `keepUnchangedLegacyDay` already does), lines compared in order on product, description, unit, quantity and price, the number by its normalized key. A difference returns `VALIDATION` with the AC-08 explanation and a field error on each changed locked field; nothing is stored.
>
> — `adr/0003-…, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-compare-locked-fields-in-one-update-path-and-refuse-any-difference.md)

> **Hard rule (risk):** The locked-field comparison drifts from the write normalizers and refuses a legitimate notes-only save (ADR-0003) — Mitigation: One comparison module built on the same decimal and calendar-day helpers as the write; unit tests per locked field, including legacy instants and decimal scale.
>
> — `sad.md §11, risk "locked-field comparison drifts", abridged` · full text: [sad.md](../sad.md)

> | Locked on an issued invoice: every other business column (the issued details, `invoiceNumber`/`invoiceNumberKey`, `senderProfileId`, `customerId`, `bankAccountId`, `issueDate`, `currency`, `subtotal`, `taxRate`, `taxAmount`, `discount`, `shipping`, `total`, `terms`, the `InvoiceItem` rows) | Compared with the submitted values using the write normalizers. Any difference → `VALIDATION`. |
>
> — `data-model.md §Invoice, existing columns whose meaning this feature fixes, abridged` · full text: [data-model.md](../data-model.md)

Helpers to reuse (code wins): `normalizeInvoiceNumber` (`lib/services/invoices/numbering.ts:21`), the shared decimal module (`lib/helpers/invoice-calculations.ts`), calendar days (`lib/helpers/calendar-day.ts`), `keepUnchangedLegacyDay` (grep for it). The module is pure and `lib/helpers` — import nothing `server-only`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. The output keys and message the caller (T08) returns:

> **Locked fields (ADR-0003, AC-08):** each locked field is compared with the stored value using the write normalizers: amounts as 2-dp strings, dates as calendar days (an unedited legacy instant counts as unchanged), lines in order by `productId`, `productName`, `description`, `unit`, `quantity` and `price`, and the number by its normalized key. On any difference → `VALIDATION`. `error` = "An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it." `details: { kind: 'ISSUED_INVOICE_LOCKED' }`. There is one `fieldErrors` entry per changed key: `invoiceNumber`, `senderProfileId`, `customerId`, `bankAccountId`, `issueDate`, `currency`, `taxRate`, `discount`, `shipping`, `terms`, `items` (count or order changed), `items.<i>.<field>`.
>
> Field message: "This field can't change on an issued invoice."
>
> — `contracts/server-actions.md §updateInvoice step 6 + §Field-error messages, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-08 — domain invariant

> **Given** a Freelancer with an issued invoice
> **When** they try to change any field other than the due date, notes, payment terms and PO number, such as a line (its product, description, unit, quantity or price), the tax, the discount, the shipping, the terms, the issue date, the currency, the Customer, the sender profile, the bank account or the number
> **Then** the editor shows those fields as read-only. Any such change that reaches the system anyway is refused with the explanation that an issued invoice can only change its due date, notes, payment terms and PO number, and that cancelling and duplicating it is the way to correct it
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

(This task owns the comparison; T08 wires the refusal, T16 the read-only editor.)

## Checklist

- [ ] `lib/helpers/invoice-locked-fields.ts` — `compareLockedFields(stored, submitted): Record<string, string[]>` (empty = no difference) and the exported message constants.
- [ ] Normalize both sides with the same helpers the write uses (decimal 2-dp, calendar day, normalized number key).
- [ ] Lines: count/order change → `items`; per-index field change → `items.<i>.<field>`.
- [ ] `tests/unit/invoice-locked-fields.test.ts` — one case per locked key, unedited invoice (no diff), legacy `T12:34` instant vs same calendar day (no diff), `150` vs `150.00` (no diff), editable fields changed only (no diff).

## Edge cases

| Case | Behaviour |
|---|---|
| Legacy stored instant, same calendar day submitted | Unchanged |
| `"150"` vs stored `150.00` | Unchanged |
| Number differs only in case/whitespace | Unchanged (normalized key) |
| Lines reordered | `items` difference |
| Only due date, notes, payment terms, PO number changed | Empty result |

## Definition of Done

- [ ] Unit tests show compareLockedFields returns no difference for an unedited issued invoice (legacy instants and decimal scale included) and exactly one contract fieldErrors key per changed locked field, items.<i>.<field> and items for count/order changes included.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
