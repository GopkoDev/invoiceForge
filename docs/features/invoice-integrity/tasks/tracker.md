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
| T07 | [Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year](./t07-create-and-duplicate.md) | app | Dmytro Hopko | M | T01, T02, T03, T05, T06 | done |
| T08 | [Refuse outdated, cancelled, lifecycle-breaking and locked-field saves in updateInvoice and write only the four editable fields on issued invoices](./t08-update-freshness-and-issued-lock.md) | app | Dmytro Hopko | L | T02, T03, T04, T05, T07 | done |
| T09 | [Apply every draft rule on draft saves and issuing from the editor, refreshing issued details only while the invoice is a draft](./t09-update-draft-branch.md) | app | Dmytro Hopko | M | T05, T06, T08 | done |
| T10 | [Decide list status changes and deletes under the row lock with the lifecycle and the draft rules on issue](./t10-status-change-and-delete.md) | app | Dmytro Hopko | M | T02, T03, T05, T06, T09 | done |
| T11 | [Keep exactly one default sender profile per Freelancer under the User row lock](./t11-sender-profile-defaults.md) | app | Dmytro Hopko | M | T02 | done |
| T12 | [Keep exactly one default bank account per sender profile and lock the currency of an account used by invoices](./t12-bank-account-defaults-and-currency-lock.md) | app | Dmytro Hopko | M | T02 | done |
| T13 | [Require a strict two-decimal product price and count invoices, not lines, in the product currency lock](./t13-product-price-and-currency-lock.md) | app | Dmytro Hopko | S | — | done |
| T14 | [Print the PDF's sender, Customer and bank blocks from the issued details, account number always](./t14-pdf-from-issued-details.md) | ui | Dmytro Hopko | M | — | done |
| T15 | [Offer only lifecycle-allowed row actions, confirm Cancel with SCR-04 and redraw refused rows at their current status](./t15-list-row-actions-and-cancel.md) | ui | Dmytro Hopko | M | T03, T07, T10 | done |
| T16 | [Render the editor in draft, issued and cancelled modes with Save and issue and retired-product lines kept](./t16-editor-modes-and-issue.md) | ui | Dmytro Hopko | M | T08, T09 | done |
| T17 | [Show every new invoice rule refusal under its field in the editor](./t17-editor-field-errors.md) | ui | Dmytro Hopko | M | T16 | done |
| T18 | [Round-trip the loaded version and open the changed-elsewhere dialog and stale state on CHANGED_ELSEWHERE](./t18-changed-elsewhere-dialog.md) | ui | Dmytro Hopko | M | T08, T17 | done |
| T19 | [Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms](./t19-profile-account-product-forms.md) | ui | Dmytro Hopko | M | T11, T12, T13 | done |
| T20 | [Add the count-only pre-release report script and the release runbook](./t20-pre-release-report-and-runbook.md) | infra | Dmytro Hopko | S | T02 | done |
| T21 | [Prove every invoice write path enforces the same rules: status matrix, race, version bump, tenancy and read-only Assistant](./t21-write-path-conformance.md) | tests | Dmytro Hopko | M | T07, T08, T09, T10 | done |
| T22 | [Refresh the issued details in the editor after Save and issue and never offer a picker on an issued invoice](./t22-editor-issued-details-after-issue.md) | ui | Dmytro Hopko | M | — | done |
| T23 | [Apply the amount bounds by status and path: shape only on issued saves, every bound on draft saves and on issuing from the list, discount capped at the column limit](./t23-amount-bounds-by-status-and-path.md) | app | Dmytro Hopko | M | T22 | done |
| T24 | [Pin the editor's account-driven currency: picking a bank account sets the draft currency and a catalogue line in another currency is refused on its line](./t24-editor-account-currency-pin.md) | ui | Dmytro Hopko | S | — | done |
| T25 | [Validate the product price strictly and store the validated value; count product usage owner-scoped inside a transaction under the product row lock](./t25-product-price-and-lock-hardening.md) | app | Dmytro Hopko | S | — | done |
| T26 | [Lock the sender profile (and share-lock line products) before the currency checks on every invoice save](./t26-lock-before-currency-checks.md) | app | Dmytro Hopko | M | T23, T25 | done |
| T28 | [Record the outcome of every invoice save and status change on its span so refusals are counted per write path](./t28-refusal-outcome-on-spans.md) | app | Dmytro Hopko | S | T26 | done |
| T27 | [Build row menus from the stored status and the Freelancer's time zone on the list and the dashboard](./t27-row-menus-from-stored-status.md) | ui | Dmytro Hopko | M | T28 | done |
| T29 | [Map a real unique hit on the default index to a retryable CONFLICT and match the index explicitly](./t29-default-index-conflict-mapping.md) | tests | Dmytro Hopko | S | — | done |
| T30 | [Link the new editor field errors to their controls, give Reload a busy state, and scope the editor error and inactive-product tests](./t30-editor-a11y-reload-and-scoped-tests.md) | ui | Dmytro Hopko | M | T22, T24 | done |
| T31 | [Make the product form's currency copy match the refuse-on-save rule and cover the make-default component row](./t31-forms-copy-and-make-default-tests.md) | ui | Dmytro Hopko | S | — | done |
| T32 | [Drive the invoice-integrity flows end to end through the UI](./t32-e2e-through-ui-flows.md) | tests | Dmytro Hopko | L | T22, T23, T27 | done |
| T33 | [Cover the bank account dialog's make-default guard: one switch per double click, a failed switch keeps the dialog open](./t33-bank-account-make-default-tests.md) | tests | Dmytro Hopko | S | — | done |
| T34 | [Read the text of the downloaded PDF in the AC-01 end-to-end test](./t34-ac01-downloaded-pdf-text.md) | tests | Dmytro Hopko | S | — | done |
| T35 | [Describe the invoice, sender-profile and product lock order in data-model.md and sad.md flows 3, 4 and 9](./t35-lock-order-in-design-docs.md) | docs | Dmytro Hopko | S | — | done |
| T36 | [Record the outcome of deleteInvoice on an invoices.delete span and state which write paths the friction signal counts](./t36-delete-outcome-span.md) | app | Dmytro Hopko | S | — | done |
| T37 | [Bind the Due Date and Bank account labels to their picker triggers and select them by name in the AC-07 e2e test](./t37-label-picker-triggers.md) | ui | Dmytro Hopko | S | — | done |
| T38 | [Scope the AC-23 not-found comparison to the not-found card](./t38-ac23-e2e-scope.md) | tests | Dmytro Hopko | S | — | done |
| T39 | [Rename the inner delete function to deleteInvoiceUnspanned to match the other spanned write paths](./t39-delete-unspanned-name.md) | app | Dmytro Hopko | S | — | todo |
| T40 | [Point the Due Date and Bank account picker triggers at their error text with aria-describedby](./t40-picker-error-describedby.md) | ui | Dmytro Hopko | S | — | todo |

**Total:** 40 tasks (T22–T32 are review follow-ups from `_review/review-2026-10-08.md`; T33–T38 from `_review/review-2026-10-08-r2.md`; T39–T40 from `_review/review-2026-10-08-r3.md`).
