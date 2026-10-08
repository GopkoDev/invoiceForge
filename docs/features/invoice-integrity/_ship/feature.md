# Invoice integrity — feature description

> This document uses ASD-STE100 Simplified Technical English. The status names (draft, pending, paid,
> overdue, cancelled) and the names of the people (Freelancer, Customer, Assistant) are technical
> names.

## 1. Purpose

An invoice is a legal and financial document. After the Freelancer sends an invoice, the invoice must not change. This feature keeps each issued invoice the same as the document that the Customer received.

The business layer applies all invoice rules. The editor, the invoice list, an old browser tab, a script and an Assistant get the same result. Thus, no path can go around a rule.

## 2. Terms

| Term | Meaning |
|---|---|
| Draft | An invoice that the Freelancer has not sent. You can change all of its fields. |
| Issued invoice | An invoice with the status pending, paid, overdue or cancelled. |
| Issued details | The sender, Customer and bank account data that the system keeps with the invoice. |
| Outdated view | An editor page that shows the invoice as it was before a later change. |
| Default | The sender profile or bank account that the system selects first for a new invoice. |

## 3. Rules

### 3.1 Issued invoice

A draft gets the current sender profile, Customer and bank account data each time that you save it.

When the invoice goes to pending, the system keeps its issued details. After this time, a change to the sender profile, the Customer or the bank account does not change the invoice.

On an issued invoice, you can change only these fields:

- the due date
- the notes
- the payment terms
- the PO number.

To change a different field, cancel the invoice. Then duplicate it. The duplicate is a new draft.

A cancelled invoice is read-only.

### 3.2 PDF

The PDF shows the issued details of the invoice. It does not show the current records.

The PDF shows the bank name, the account holder and the account number. If the issued details contain an IBAN and a SWIFT code, the PDF also shows them.

### 3.3 Status lifecycle

Each new invoice starts as a draft. A duplicate also starts as a draft.

The system accepts only the status changes in this table:

| From | To |
|---|---|
| draft | pending |
| pending | paid, overdue, cancelled |
| overdue | paid, cancelled |
| overdue (set by the Freelancer, due date not passed) | pending |
| paid | pending |

When the invoice goes to paid, the system records the payment date. When the invoice goes from paid back to pending, the system removes the payment date.

The system does not accept other status changes. These are the most important limits:

- A cancelled invoice cannot change its status.
- An issued invoice cannot go back to draft.
- You can delete only a draft.

### 3.4 Outdated view

The system counts each change to an invoice. The editor sends this count when you save.

If the invoice changed after the editor loaded it, the system does not accept the save. The editor tells you that the invoice changed in a different place. Reload the invoice, then do your change again. The system keeps nothing from the save that it did not accept.

### 3.5 Currency

The invoice, its bank account and its catalogue products must have the same currency.

- If the bank account has a different currency, the system shows an error on the bank account field.
- If a catalogue product has a different currency, the system shows an error on the line of that product.
- The system does not examine the currency of a line without a catalogue product.

If an invoice uses a bank account or a product, you cannot change the currency of that bank account or product. The error message shows the number of invoices that use it. You can change its other fields.

### 3.6 Amounts and dates

The system examines these limits on a draft:

- Each amount must be 99,999,999.99 or less. This limit applies to each line, the shipping, the subtotal, the tax and the total.
- A price must have a maximum of two decimal places.
- The discount must not be more than the sum of the lines plus the shipping.
- The due date must not be before the issue date.

On an issued invoice, the system examines only the fields that you changed. For example, if you change the due date, the system examines the due date only.

Each error shows on the field that has the problem. The system does not show a general error for these problems.

### 3.7 Default sender profile and bank account

Each Freelancer has exactly one default sender profile. Each sender profile has exactly one default bank account.

- The first sender profile that you create becomes the default. The first bank account in a sender profile also becomes the default.
- If you delete the default, the oldest remaining item becomes the default.
- To change the default, make a different item the default. You cannot remove the default without a replacement.
- If the system cannot set the new default, the old default stays.

### 3.8 Invoice number

The system gives a number to the invoice at the first save. The year in the number comes from the issue date. It does not come from the system clock.

The counter does not go back to 1 at the start of a new year. Example: INV-2026-0042 is followed by INV-2027-0043.

After the first save, the number does not change. To use a different number, type it manually.

### 3.9 Access

If you open the invoice of a different Freelancer, the system shows the same page as for an invoice that does not exist. The system does not change that invoice.

An Assistant can only read data. A Personal key gives no permission to write.

The Assistant shows the Customer name from the issued details. This is the same name that the PDF shows.

## 4. What the Freelancer sees

In the editor:

| Status | Fields that you can change |
|---|---|
| Draft | All fields |
| Pending, paid, overdue | Only the due date, notes, payment terms and PO number |
| Cancelled | No fields. The editor is read-only. |

The row menu in the invoice list shows only the permitted actions for the stored status. Each menu also contains View, Download and Print.

| Status | Other actions in the row menu |
|---|---|
| Draft | Edit, Duplicate, Mark as Pending, Delete |
| Pending | Edit, Duplicate, Mark as Paid, Mark as Overdue, Cancel Invoice |
| Overdue | Edit, Duplicate, Mark as Paid, Cancel Invoice. Mark as Pending shows only if the due date is today or later. |
| Paid | Edit, Duplicate, Mark as Pending |
| Cancelled | Duplicate |

Before the system cancels an invoice, it asks you to confirm.

If the status changed in a different place, the system does not accept the action. The list shows an error message and the current status of the invoice.

In the editor, when you select a bank account on a draft, the invoice gets the currency of that bank account.

## 5. Release procedure

> **WARNING:** Run the migrations before you deploy the code. The new code reads the `Invoice.version` column. If this column is not in the database, the invoice pages and the invoice saves fail.

> **CAUTION:** Before each command that uses a database, make sure that you know the database host. The file `.env` is for dev. The file `.env.prod` is for production.

1. Deploy the `invoices.save` and `invoices.status-change` spans a minimum of 7 days before step 6.
2. Run the count-only report on production:
   `node --env-file=.env.prod scripts/invoice-integrity-report.ts`
3. Make sure that the first line of the report shows the production host. Record the counts in `release.md`.
4. Apply the migrations on dev with `pnpm exec prisma migrate deploy`. Then, do the checks in `release.md` step 2.
5. Apply the migrations on production. Then, do the same checks.
6. Deploy the code.

> **NOTE:** If a migration fails, it rolls back automatically. Stop the release. Do not deploy the code.

> **NOTE:** The migrations change no invoice. They only repair sender profiles and bank accounts that have more than one default or no default. The oldest item becomes the default.

## 6. Rollback procedure

1. Deploy the previous build.
2. Run the down scripts in `migrations/` in this sequence: `04`, `03`, `02`, `01`.

> **NOTE:** Prisma has no down step. Run the down scripts manually. Do not reverse the repair of the defaults. The previous build also works with one default.

## 7. Checks after the release

1. After 7 days, compare the p95 time of the save and status-change spans with the baseline from step 1. The increase must be 10 % or less.
2. After 30 days, run the report again. The number of new rule violations must be 0.

## 8. Related documents

- Specification: [`spec.md`](../spec.md)
- Architecture: [`sad.md`](../sad.md)
- Decisions: [`adr/`](../adr/)
- Server actions: [`contracts/server-actions.md`](../contracts/server-actions.md)
- Release runbook: [`release.md`](../release.md)
- Changelog: [`changelog.md`](changelog.md)
