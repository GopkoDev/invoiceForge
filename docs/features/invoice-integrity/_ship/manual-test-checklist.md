# Manual test checklist — invoice-integrity

The Playwright suite already drives AC-01, AC-02, AC-04, AC-06, AC-07, AC-10 and AC-23 through the UI, on a production build. For those, a short re-check is enough. Every other AC has only unit and integration tests, so test those by hand first.

## Before you start

1. Make sure `.env` points at the dev host (`ep-billowing-resonance-…`): `grep DATABASE_URL .env`.
2. Make sure the migrations are applied: `pnpm exec prisma migrate status` must print "Database schema is up to date".
3. Start the app with `pnpm dev`.

**Dev data on 2026-10-08, after the migrations:**

| Report category | Draft | Issued |
|---|---|---|
| Invoice currency differs from its bank account | 3 | 1 |
| Catalogue line in another currency | 4 | 0 |
| Issued invoices saved after a related record changed (upper bound) | — | 9 |

How to use these invoices in the tests:
- **The mismatched drafts** cannot be saved until you correct their currency. They are ready-made cases for AC-11 and AC-12.
- **The mismatched issued invoice** keeps its currency. A change to only its notes or due date must still save, which tests AC-14.

## Issued invoices and the PDF

- [ ] **AC-03:** issue an invoice with a bank account that has no IBAN. The PDF shows the bank name, account holder and account number. Do it again with an account that has an IBAN and SWIFT; the PDF shows both.
- [ ] **AC-01 (short re-check):** issue an invoice. Then change the sender profile, the Customer and the bank account. The editor and the PDF still show the old details.
- [ ] **AC-08:** on an issued invoice, only the due date, notes, payment terms and PO number can be edited. All other fields are read-only.
- [ ] **AC-09:** on an issued invoice, set the due date before the issue date. The error shows under the due date field, and a screen reader reads the error text on the field.

## Status lifecycle (the row menu "…" in the invoice list)

- [ ] **Menus by status:**
  - Draft: Mark as Pending and Delete, with no Cancel.
  - Pending: Mark as Paid, Mark as Overdue and Cancel Invoice.
  - Paid: Mark as Pending only.
  - Cancelled: View, Download, Print and Duplicate only.
- [ ] **Overdue set by hand:** "Mark as Pending" shows while the due date is today or later. It does not show after the due date has passed.
- [ ] **AC-05 / AC-06:** an issued invoice cannot go back to draft. Only a draft can be deleted. Duplicate on a cancelled invoice opens a new draft.
- [ ] **AC-04b:** a duplicate of any invoice is a draft.
- [ ] **Cancel:** the system asks for confirmation before it cancels. If you do not confirm, nothing changes.

## Outdated view (AC-10)

- [ ] Open the same invoice in two tabs. In tab A, mark it paid. In tab B, save it. The "changed elsewhere" dialog opens with Reload, and nothing from tab B is stored.
- [ ] Close that dialog without reloading. The warning above the form stays, and the next save opens the dialog again.
- [ ] From an old list tab, change the status of an invoice that is already cancelled. An error toast shows, and the row is redrawn at the current status.

## Currency

- [ ] **AC-11:** on a draft, select a USD bank account. The invoice currency changes to USD.
- [ ] **AC-11:** a draft whose bank account has a different currency is refused on save, with the error on the bank account field.
- [ ] **AC-12:** add a catalogue product in another currency. The error names that line.
- [ ] **AC-12:** a line typed as free text, without a catalogue product, is not checked.
- [ ] **AC-13:** change the currency of a bank account that invoices use. The change is refused, and the message gives the number of invoices. Its other fields still save.
- [ ] **AC-13b:** the same check for a product.

## Amounts and prices

- [ ] **AC-19:** a line amount, the shipping or the total above 99,999,999.99 is refused, with the error on that field.
- [ ] **AC-20:** a price with three decimal places is refused, with the error on the price field.
- [ ] **AC-20b:** a discount above the sum of the lines plus shipping is refused. A discount exactly equal to that sum is accepted.
- [ ] **AC-14:** on an issued invoice, a change to only the notes saves. Amount and currency rules are not re-checked.

## Retired products

- [ ] **AC-15:** deactivate a product. An old invoice that uses it does not change, and the product is not offered for new lines.
- [ ] **AC-16:** delete a product. Its line stays as free text, and the total is the same.

## Defaults

- [ ] **AC-17:** make a different sender profile, or a different bank account, the default. Afterwards exactly one is the default. A double click sends one request.
- [ ] **AC-17b:** the first profile or account that you create becomes the default. If you delete the default, the oldest remaining one becomes the default. You cannot clear the default checkbox without choosing a replacement.
- [ ] **AC-18:** after the migration, the report shows 0 in all four default rows, and no other data changed.

## Invoice number

- [ ] **AC-21 / AC-22:** a draft with a 2027 issue date gets `INV-2027-…`, and the counter does not go back to 1.
- [ ] **AC-21b:** after the first save, a change to the issue date does not change the number.

## Access and the Assistant

- [ ] **AC-23:** open another account's invoice by a direct link. The page is the same as for an invoice that does not exist.
- [ ] **AC-24:** through an AI assistant connected with a Personal key, no write tool is offered.
- [ ] **AC-26:** the Customer name in the Assistant's answer is the same as the name in the PDF.

## Regression

- [ ] Run the whole happy path once: create, issue, mark paid, download the PDF, print. The dashboard and the list show the right statuses and amounts.
