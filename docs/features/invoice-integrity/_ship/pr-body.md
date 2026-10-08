# Invoice integrity — feature description

_Source: [`docs/features/invoice-integrity/_ship/feature.md`](docs/features/invoice-integrity/_ship/feature.md)_

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

- Specification: [`spec.md`](docs/features/invoice-integrity/spec.md)
- Architecture: [`sad.md`](docs/features/invoice-integrity/sad.md)
- Decisions: [`adr/`](docs/features/invoice-integrity/adr/)
- Server actions: [`contracts/server-actions.md`](docs/features/invoice-integrity/contracts/server-actions.md)
- Release runbook: [`release.md`](docs/features/invoice-integrity/release.md)
- Changelog: [`changelog.md`](docs/features/invoice-integrity/_ship/changelog.md)

---

## Summary

Issued invoices now stay the document the Customer received, and every invoice rule is enforced once, in the shared business layer, so the editor, the list, a stale tab, a script and any future Assistant write tool get the same answer. This is the prerequisite for Assistant draft writes. See the [spec](docs/features/invoice-integrity/spec.md) and the [changelog](docs/features/invoice-integrity/_ship/changelog.md).

## Acceptance criteria

- AC-01 — an issued invoice and its PDF keep the old legal name, address and IBAN after the records change ✓
- AC-02 — a draft follows the current records on save; issuing freezes the details saved at its last save ✓
- AC-03 — the PDF prints bank name, holder, account number (+ IBAN/SWIFT) from the issued details ✓
- AC-04 — only the lifecycle's transitions are accepted; paid records and undo clears the payment date ✓
- AC-04b — a new invoice or a duplicate always starts as a draft ✓
- AC-05 — an issued invoice can never return to draft ✓
- AC-06 — cancelled is final, stays listed and printable; Duplicate is still offered; only drafts can be deleted ✓
- AC-07 — an issued invoice's due date, notes, payment terms and PO number can change; nothing else does ✓
- AC-08 — any other change to an issued invoice is read-only in the editor and refused by the server ✓
- AC-09 — a due date before the issue date is refused on the due date field ✓
- AC-10 — a save from an outdated view is refused as changed-elsewhere; nothing is stored ✓
- AC-11 — a bank account in another currency is refused on the bank account field ✓
- AC-12 — a catalogue line in another currency is refused, naming the line ✓
- AC-13 — a used bank account cannot change its currency (count named) ✓
- AC-13b — a used product cannot change its currency (count named) ✓
- AC-14 — on an issued invoice only the changed fields' rules are checked ✓
- AC-15 — a line whose catalogue product was deactivated keeps its saved values ✓
- AC-16 — a line whose product was deleted stays as free text; the total is unchanged ✓
- AC-17 — making another profile/account the default leaves exactly one default ✓
- AC-17b — first one becomes default; deleting the default promotes the earliest; the default cannot be unset ✓
- AC-18 — release repairs duplicate/missing defaults by keeping the earliest-created; nothing else changes ✓
- AC-19 — any amount above 99,999,999.99 is refused on its own field ✓
- AC-20 — a price with more than two decimals is refused on the price field ✓
- AC-20b — a discount above lines + shipping is refused ✓
- AC-21 — the number's year comes from the issue date; the counter keeps running across years ✓
- AC-21b — the number is fixed at first save ✓
- AC-22 — the year never comes from the system clock ✓
- AC-23 — another Freelancer's invoice is answered exactly like a missing one ✓
- AC-24 — Personal keys stay read-only; no write capability is offered ✓
- AC-25 — every non-editor path gets the same refusal and stores nothing ✓
- AC-26 — the Assistant shows the issued Customer name, the same as the PDF ✓

## Design

- Spec: `docs/features/invoice-integrity/spec.md`
- Architecture: `docs/features/invoice-integrity/sad.md`
- Decisions: `docs/features/invoice-integrity/adr/` (ADR-0001 … ADR-0005)
- Data model + migrations: `docs/features/invoice-integrity/data-model.md` (`20261007100000` … `20261007100300`)
- Server actions: `docs/features/invoice-integrity/contracts/server-actions.md`
- UX: `ux-flows.md`, `screens.md`; test plan: `test-plan.md`
- Reviews: `_review/review-2026-10-08*.md` (r4: PASS)
- Release runbook: `docs/features/invoice-integrity/release.md`

## Tasks (SDD-Task trailers)

T01–T40, 42 commits. `git log main..invoice-integrity --grep SDD-Task`:

- T01 4b09578 wrap invoice saves and status changes in Sentry spans
- T02 6ec2251 promote version, bank-account index and single-default migrations
- T03 feb90cf encode the status lifecycle as a transition table
- T04 2b550f0 add the locked-field comparison for issued invoices
- T05 63cbf3e bound every computed amount, cap the discount, check the due date
- T06 c57a68a check account and line-product currencies in verifyInvoiceRelations
- T07 37a0df7 create and duplicate only drafts, numbered by the issue date's year
- T08 3692c26 refuse outdated, cancelled, lifecycle-breaking and locked-field saves
- T09 16aff74 apply every draft rule on draft saves and issuing from the editor
- T10 30e7a8b decide list status changes and deletes under the row lock
- T11 9f33000 keep exactly one default sender profile under the User row lock
- T12 89be1d1 one default bank account per profile and a currency lock for used accounts
- T13 9c655ee strict product price and invoice-counted currency lock
- T14 add01cb print the PDF from the invoice's issued details
- T15 e990e55 offer only lifecycle-allowed row actions and confirm Cancel
- T16 322b65b editor modes for draft, issued and cancelled invoices
- T17 2a45e30 show every invoice rule refusal under its field in the editor
- T18 01a1784 round-trip the loaded version and handle changed-elsewhere in the editor
- T19 0abe453 default checkbox states and currency/price errors in the forms
- T20 30cc6af count-only pre-release report and release runbook
- T21 93e733e prove every invoice write path enforces the same rules
- T22 948ae35 refresh issued details in the editor after Save and issue
- T23 5e3a08a, d48dd4c apply the amount bounds by status and path; align the update action's check order
- T24 48fc71a pin the editor's account-driven currency and the currency refusals
- T25 494475d validate product price strictly and lock the product row on update
- T26 abe42ff lock the sender profile and share-lock line products before the currency checks
- T27 daffa2e build row menus from the stored status and the Freelancer's time zone
- T28 ad0ccfc record the outcome of every invoice save and status change on its span
- T29 390dc4f drive a real default-index unique hit to CONFLICT
- T30 6ba63d2 link editor field errors to their triggers, busy Reload, scoped tests
- T31 f6082af align product currency copy and guard make-default double submit
- T32 bf20511, 62c8030 UI e2e flows; mount the cancel confirmation on the list and dashboard
- T33 5943711 cover the bank account dialog's make-default guard
- T34 031af5a read the text of the downloaded PDF in the AC-01 e2e test
- T35 5c74a49 describe the invoice, sender-profile and product lock order
- T36 47b089f record the outcome of deleteInvoice on an invoices.delete span
- T37 5e691b3 name the editor's date and bank account pickers by their labels
- T38 9005f87 compare only the not-found card in the AC-23 e2e test
- T39 942f38c name the inner delete function deleteInvoiceUnspanned
- T40 63de88c describe the due date and bank account pickers by their error text

## Verification

- Unit + component + contract: `vitest` 170 files, 1501/1501 passed
- Integration (throwaway Postgres via testcontainers): 103 files, 925 passed; the 49 skipped are the "no container runtime" placeholders only
- Lint + typecheck: `tsc --noEmit` clean; `eslint` 0 errors, 6 warnings, none from this feature. Five are pre-existing; the sixth is an unused import that predates the feature, in a file the feature touched.
- Ran the feature: Playwright drove a real production build (`next build` + `next start`) in a browser, against a throwaway Postgres with all four migrations applied. 8/8 passed:
  - **AC-01:** after the Customer, sender profile and bank account change, the issued invoice's editor and the text of the downloaded PDF still show the old legal name, address and IBAN, and the new ones are absent.
  - **AC-02:** a draft follows the corrected Customer on save, and stops following it once issued.
  - **AC-04:** marking an invoice paid shows the payment date, and undoing to pending clears it.
  - **AC-06:** Cancel asks for confirmation, then the row shows cancelled. The cancelled invoice is read-only, its row offers four actions, and Duplicate opens an editable draft.
  - **AC-07:** after the due date is moved into the future, the list no longer shows the invoice as overdue.
  - **AC-10:** a save from a stale second tab opens the changed-elsewhere dialog and stores nothing; reloading shows the invoice paid.
  - **AC-23:** a link to another Freelancer's invoice and a link to a missing invoice render the identical not-found card, with no data leaked.
- Independent review: 4 rounds, the last one `PASS` (`_review/review-2026-10-08-r4.md`).

## Operational notes

- **Migrations run before the code deploy.** The new code reads `Invoice.version`, and `pnpm build` does not migrate. Follow [release.md](docs/features/invoice-integrity/release.md):
  0. Spans ship ≥ 7 days earlier, to set the p95 baseline.
  1. Run the read-only, count-only report against production.
  2. Run `prisma migrate deploy` on dev, then verify.
  3. Run it on production, then verify.
  4. Deploy the code.
- The two single-default migrations repair duplicate and missing defaults by keeping the earliest-created one. No invoice is rewritten. `Invoice_bankAccountId_idx` is created `CONCURRENTLY`; check `indisvalid` after it runs.
- **Rollback:** deploy the previous build first. Then, by hand, run the staged `docs/features/invoice-integrity/migrations/0{4,3,2,1}_*.down.sql` in reverse order. The default repair stays.
- **Feature flag / config:** none.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
