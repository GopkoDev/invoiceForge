# Changelog — invoice-integrity

## invoice-integrity — issued invoices stay the document the Customer received, and every invoice rule holds on the server

**What:** every invoice rule is now enforced once, in the shared business layer. The editor, the invoice list, a stale tab, a script using the Freelancer's session and any future Assistant write tool all get the same answer.

- **Issued invoices are fixed documents.** A draft follows the current sender profile, Customer and bank account on each save. From the moment it is issued, an invoice keeps the details it was issued with. Only its due date, notes, payment terms and PO number can change. Anything else is done by Cancel, then Duplicate. A cancelled invoice is read-only.
- **The PDF prints the issued details**, including the bank name, account holder, account number, IBAN and SWIFT, not today's records.
- **One status lifecycle:**
  - every new invoice, including a duplicate, starts as a draft;
  - draft → pending;
  - pending → paid, overdue or cancelled;
  - overdue → paid or cancelled; an invoice marked overdue by hand can also go back to pending while its due date has not passed;
  - paid → pending, to undo a mistaken payment.

  Cancelled is final. An issued invoice never returns to draft, and only drafts can be deleted. The list's row menus offer only the allowed changes and ask for confirmation before Cancel.
- **Saves from an outdated view are refused.** If the invoice changed after the view was loaded, the editor says so and offers to reload, instead of overwriting a newer status or payment date.
- **Currency, amount and date rules** now hold on the server and come back as plain errors under the field they concern:
  - the bank account must be in the invoice's currency;
  - catalogue lines must be in the invoice's currency;
  - every amount is at most 99,999,999.99;
  - prices have at most two decimals;
  - the discount cannot exceed the lines plus shipping;
  - the due date is not before the issue date.

  An account or product already used by invoices cannot change its currency.
- **Exactly one default** sender profile per Freelancer and one default bank account per sender profile. The default cannot simply be unset.
- **The year in a system-assigned invoice number** comes from the invoice's issue date, not the system clock. The counter keeps running across years.
- **Another Freelancer's invoice** is answered exactly like one that does not exist.
- **Assistants still have no write tools.** Personal keys are read-only. The Assistant's invoice answers show the issued Customer name, the same name the PDF prints.

**Why:** an invoice is a legal and financial document. Before this change, last year's paid invoice silently printed today's bank details. A paid invoice could be turned back into a draft and deleted, and currency checks lived only in the browser ([spec](spec.md) §1–§2). These rules are also the prerequisite for letting an Assistant create and edit drafts. The key decisions:

- [ADR-0001](adr/0001-freeze-the-existing-snapshot-columns-at-issue-and-print-from-them.md): the existing snapshot columns are frozen at issue and the PDF prints from them.
- [ADR-0002](adr/0002-decide-every-status-change-in-one-pure-lifecycle-module.md): every status change is decided in one pure lifecycle module.
- [ADR-0003](adr/0003-compare-locked-fields-in-one-update-path-and-refuse-any-difference.md): locked fields are compared in one update path, and any difference is refused.
- [ADR-0004](adr/0004-detect-outdated-views-with-an-invoice-version-counter.md): outdated views are detected with an invoice version counter.
- [ADR-0005](adr/0005-guard-single-defaults-with-partial-unique-indexes-and-a-parent-row-lock.md): single defaults are guarded by partial unique indexes and a parent row lock.

**How to use:**
- Nothing changes on the Freelancer's happy path.
- The editor now opens an issued invoice with only the due date, notes, payment terms and PO number editable, and shows each refusal under its field.
- Server actions keep their names. Their new refusals (`VALIDATION` with field errors, `CONFLICT` for a changed-elsewhere invoice, not-found for a foreign one) are listed in [server-actions.md](contracts/server-actions.md).

**Operational notes:**

- **Migrations:** they must run **before** the code deploy, because the new code reads `Invoice.version` and `pnpm build` does not migrate. The steps are in the [release runbook](release.md). Four migrations are added:
  - `20261007100000_add_invoice_version`;
  - `20261007100100_create_invoice_bank_account_id_index` (`CONCURRENTLY`, its own migration);
  - `20261007100200_single_default_sender_profile`;
  - `20261007100300_single_default_bank_account`.

  The two single-default migrations each repair duplicate or missing defaults by keeping the earliest-created one, then create a partial unique index, in one transaction. No issued invoice is rewritten.
- **Release order** ([release.md](release.md)):
  0. The `invoices.save` / `invoices.status-change` spans ship **at least 7 days earlier**. They provide the p95 baseline for spec §6.
  1. Run the read-only, count-only report against production: `node --env-file=.env.prod scripts/invoice-integrity-report.ts`. Confirm the host it prints first.
  2. Migrate dev and verify.
  3. Migrate production.
  4. Deploy the code.
- **Feature flag / config:** none.
- **Rollback:**
  1. Deploy the previous build first.
  2. Run the staged down scripts in [`migrations/`](migrations/) in reverse order (`04` → `01`), by hand; Prisma has no down step.
  3. Leave the default repair in place; the previous build works with exactly one default.
- **After release:**
  - at 7 days, compare the p95 of the save and status-change spans with the baseline;
  - at 30 days, re-run the report; new rule violations should be 0 (spec §7).

**Acceptance criteria delivered:**
- AC-01 to AC-26, including AC-04b, AC-13b, AC-17b, AC-20b and AC-21b.
- AC-01, AC-02, AC-04, AC-06, AC-07, AC-10 and AC-23 are also verified end to end through the UI, on a production build against a throwaway Postgres.
