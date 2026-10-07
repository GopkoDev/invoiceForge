# Tracker — invoice-integrity

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Wrap invoice saves and status changes in Sentry spans and tag generic failures by path](./t01-save-and-status-spans.md) | app | Dmytro Hopko | S | — | done |
| T02 | [Promote the four staged migrations, declare them in the Prisma schema and adapt the test factories](./t02-promote-migrations-and-test-support.md) | migration | Dmytro Hopko | M | — | done |
| T03 | [Encode the status lifecycle as a transition table with decideStatusChange and add the new ActionResult detail kinds](./t03-lifecycle-module.md) | domain | Dmytro Hopko | M | — | done |
| T04 | [Add the pure locked-field comparison for issued invoices built on the write normalizers](./t04-locked-field-comparison.md) | domain | Dmytro Hopko | M | — | done |
| T05 | [Bound every computed amount, cap the discount and require due date ≥ issue date in the shared invoice schema](./t05-amount-and-date-bounds.md) | domain | Dmytro Hopko | M | — | done |
| T06 | [Check the bank account's and every catalogue line product's currency against the invoice in verifyInvoiceRelations](./t06-currency-relations.md) | app | Dmytro Hopko | S | — | done |
| T07 | [Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year](./t07-create-and-duplicate.md) | app | Dmytro Hopko | M | T01, T02, T03, T05, T06 | todo |
| T08 | [Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices](./t08-update-freshness-and-issued-lock.md) | app | Dmytro Hopko | L | T02, T03, T04, T05, T07 | todo |
| T09 | [Apply every draft rule on draft saves and issuing from the editor, refreshing issued details only while the invoice is a draft](./t09-update-draft-branch.md) | app | Dmytro Hopko | M | T05, T06, T08 | todo |
| T10 | [Decide list status changes and deletes under the row lock with the lifecycle and the draft rules on issue](./t10-status-change-and-delete.md) | app | Dmytro Hopko | M | T02, T03, T05, T06, T09 | todo |
| T11 | [Keep exactly one default sender profile per Freelancer under the User row lock](./t11-sender-profile-defaults.md) | app | Dmytro Hopko | M | T02 | todo |
| T12 | [Keep exactly one default bank account per sender profile and lock the currency of an account used by invoices](./t12-bank-account-defaults-and-currency-lock.md) | app | Dmytro Hopko | M | T02 | todo |
| T13 | [Require a strict two-decimal product price and count invoices, not lines, in the product currency lock](./t13-product-price-and-currency-lock.md) | app | Dmytro Hopko | S | — | done |
| T14 | [Print the PDF's sender, Customer and bank blocks from the issued details, account number always](./t14-pdf-from-issued-details.md) | ui | Dmytro Hopko | M | — | done |
| T15 | [Offer only lifecycle-allowed row actions, confirm Cancel with SCR-04 and redraw refused rows at their current status](./t15-list-row-actions-and-cancel.md) | ui | Dmytro Hopko | M | T03, T07, T10 | todo |
| T16 | [Render the editor in draft, issued and cancelled modes with Save and issue and retired-product lines kept](./t16-editor-modes-and-issue.md) | ui | Dmytro Hopko | M | T08, T09 | todo |
| T17 | [Show every new invoice rule refusal under its field in the editor](./t17-editor-field-errors.md) | ui | Dmytro Hopko | M | T16 | todo |
| T18 | [Round-trip the loaded version and open the changed-elsewhere dialog and stale state on CHANGED_ELSEWHERE](./t18-changed-elsewhere-dialog.md) | ui | Dmytro Hopko | M | T08, T17 | todo |
| T19 | [Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms](./t19-profile-account-product-forms.md) | ui | Dmytro Hopko | M | T11, T12, T13 | todo |
| T20 | [Add the count-only pre-release report script and the release runbook](./t20-pre-release-report-and-runbook.md) | infra | Dmytro Hopko | S | T02 | todo |
| T21 | [Prove every invoice write path enforces the same rules: status matrix, race, version bump, tenancy and read-only Assistant](./t21-write-path-conformance.md) | tests | Dmytro Hopko | M | T07, T08, T09, T10 | todo |

**Total:** 21 tasks, ~19 person-days (S ≈ ½ day, M/L ≈ 1 day).
