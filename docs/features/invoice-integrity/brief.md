# Brief — invoice-integrity

> Input for `/sdd:specify invoice-integrity`. Written 2026-10-02 from the read-only project audit
> (schema/business-logic pass). Code references point at branch `service-layer` @ `f9a6ed3`, i.e. the
> layout after the business rules moved into `lib/services/`.

## Why

An invoice is a legal and financial document. Once it is issued it must keep saying what was sent, its
status must follow a sane lifecycle, and its money must add up. Today several of those guarantees hold
only in the browser, or not at all:

- the PDF and every save re-read live sender / customer / bank data, so old invoices silently change;
- any status transition is accepted on the server, so a paid invoice can be turned back into a draft and deleted;
- `OVERDUE` is never set automatically, so dashboard Debtors and Expected payments are wrong by default;
- currency consistency and several amount bounds are checked only in the browser.

`service-layer` deliberately kept behaviour unchanged (parity). Now that every rule lives once in
`lib/services/`, each fix here applies to the web app, the planned AI chat and the planned MCP server at the
same time. These rules must exist **before any Assistant gets write tools**; D3 is needed even for a
read-only chat ("who owes me?").

## Findings in scope

| ID | Problem | Where | Failure scenario | Direction (to be decided in specify/design) |
|---|---|---|---|---|
| D1 | The PDF prints live sender, customer and bank data, not the snapshot stored on the invoice | `lib/helpers/invoice-pdf-helpers.tsx:67-117`, `components/invoice-editor/invoice-pdf-document.tsx` | Freelancer changes bank; re-downloading last year's PAID invoice prints the new IBAN — no longer the document that was sent | Render from the invoice's snapshot columns (`senderName`, `customerName`, `bankIban`, …); keep relations only for the logo |
| D2 | Every save — of any status, PAID included — re-copies the snapshot from live records | `lib/services/invoices/invoices.ts:661-663` (update), `:417-419` (create) | Fixing a typo in the notes of a 2025 PAID invoice rewrites its "Bill To" and bank details to today's values | Re-snapshot only while DRAFT or when the referenced record changes; otherwise keep the stored snapshot (or an explicit "refresh details" action) |
| D3 | `OVERDUE` is only ever set by hand ("Mark as Overdue") | no scheduled job; `lib/services/dashboard/queries.ts:52-57` counts only stored `PENDING` / `OVERDUE` | An invoice due 3 months ago stays PENDING: it shows as an on-time Expected payment and Debtors stays empty | Derive overdue at read time (`PENDING AND dueDate < start of today in the Freelancer's zone`) or a scheduled `PENDING → OVERDUE` job |
| D4 | The server accepts any status transition | `lib/helpers/invoice-status.ts:29` (`applyStatusChange`), status update and delete in `lib/services/invoices/invoices.ts` | Direct call (or a future Assistant): PAID → DRAFT → delete erases an issued invoice and leaves a numbering gap; PAID → DRAFT also clears `paidAt` | One allowed-transition matrix inside `applyStatusChange`; anything else → `CONFLICT`; applied on every write path |
| D5 | An editor save overwrites a concurrent status change | `lib/services/invoices/invoices.ts:524` (read outside the transaction), `:400` / update path applies `validatedData.status` | Invoice open in the editor; marked Paid from the list in another tab; saving the editor writes PENDING back and clears `paidAt` | Optimistic concurrency (`updatedAt` / version in the `where`, 0 rows → `CONFLICT`), or the editor stops sending `status` |
| D6 | Invoice currency vs bank account and product currencies is checked only in the browser; a bank account's currency can change while invoices reference it | `lib/services/invoices/helpers.ts:156` (`verifyInvoiceRelations`), `lib/services/bank-accounts/bank-accounts.ts` (update) | A stale tab, a direct call or an Assistant stores a EUR invoice that prints a USD account's IBAN, or USD product lines priced as EUR | Server requires `invoice.currency === bankAccount.currency` and every owned product's currency to match; block a bank-account currency change once invoices reference it (as products already do) |
| D7 | Deactivating a product strips its lines from old invoices on their next edit | `lib/services/invoices/editor-data.ts:43` (loads only `isActive` products), `store/invoice-editor-store/helpers.ts:189-194`, `hooks/use-editor-header-buttons.tsx` | Deactivate "Consulting 2025", fix a note on a PAID invoice → the line is flagged "currency does not match", removed, and the total changes without the totals-changed confirmation | Load every product referenced by the invoice's items, active or not; never auto-remove lines on an existing invoice; drop the price-equality custom-price heuristic |
| D8 | The PDF never prints the bank account number | `components/invoice-editor/invoice-pdf-document.tsx:368-375` | Non-IBAN accounts (UAH, US ACH, UK sort code) give the customer nothing to pay to | Print `accountNumber` (from the snapshot, `bankAccountNumber`) when present |
| D9 | "Set as default" is two queries without a transaction or a DB constraint | `lib/services/sender-profiles/sender-profiles.ts:104,141`, `lib/services/bank-accounts/bank-accounts.ts:74,108` | Double-click or two tabs → two defaults; a failure between the queries → none; editor pre-selection then depends on row order | Wrap in `$transaction`; partial unique indexes `SenderProfile(userId) WHERE isDefault` and `BankAccount(senderProfileId) WHERE isDefault` (migration) |
| D10 | Amount and date validation doesn't match the columns | `lib/validations/invoice.ts:33-79`, `lib/validations/product.ts:12` | 1,000 h × 150,000 overflows `Decimal(10,2)` → generic "Failed" instead of a field error; due date before issue date accepted; product price `"12abc"` passes `parseFloat` | Bound computed line amount / subtotal / total (or widen the columns); `dueDate >= issueDate`; product price uses the same strict 2-decimal numeric schema as custom prices; cap discount |
| D11 | The year in a system-assigned invoice number comes from the server clock (UTC), not the invoice; the counter never resets | `lib/services/invoices/numbering.ts:30` | Invoice dated 2026-12-28 created on 2027-01-02 → `INV-2027-…`; a Kyiv user saving at 00:30 on 1 January gets the previous year | Take the year from `issueDate` in the Freelancer's zone; decide on a per-year counter reset under the same row lock |

## Out of scope

- Security patches (dependency upgrades, proxy check, sign-in email limits) — separate `security-patch` feature.
- Editor UX races (edits during an in-flight save, number hint after a fast profile switch), time-zone-aware date
  formatting in tables, accessibility — separate `editor-ux` feature.
- Partial payments (`amountPaid` exists but is unused), a manually entered payment date, credit notes / cancellation documents.
- Bulk repair of already-affected historical invoices beyond what the new rules correct on the next edit (to be confirmed in specify — see open questions).
- Any AI / MCP work.

## Open questions for specify

1. **D2 — policy for issued invoices.** Are non-DRAFT invoices editable at all? If yes, which fields, and does a sender/customer/bank change on an issued invoice need an explicit confirmation?
2. **D3 — derived vs stored overdue.** Compute overdue at read time (no job, always correct, but `status` in the DB stays PENDING) or run a scheduled job (status stored, needs Vercel Cron + idempotency)? Which time zone decides "today" for a job?
3. **D4 — the transition matrix.** Proposed: DRAFT → PENDING / CANCELLED; PENDING → PAID / OVERDUE / CANCELLED; OVERDUE → PAID / CANCELLED; PAID → PENDING (undo a mistaken payment)? CANCELLED → terminal? Can a non-DRAFT invoice ever go back to DRAFT?
4. **D5 — mechanism.** Optimistic concurrency (requires the editor to send a version and handle `CONFLICT` in the UI) vs the editor no longer sending `status`.
5. **D7 — existing lines whose product was deleted** (not just deactivated): keep the line as free text?
6. **D11 — numbering.** Per-year counter reset? Allocate the number on DRAFT → PENDING instead of first save (no gaps from deleted drafts)? Both change visible behaviour for existing users.
7. **Existing data.** Run a one-time report (counts only) of invoices that already have a mismatched currency, a stale snapshot or an impossible status history, and decide whether anything needs a migration.

## Success criteria (draft)

- An issued invoice's PDF is byte-for-byte the same before and after its sender profile, customer or bank account changes.
- No server path (web, direct action call, business function) can perform a status transition outside the matrix; each forbidden transition has a test.
- Dashboard Debtors and Expected payments classify a past-due unpaid invoice as overdue without any manual action.
- A save that started from a stale editor state never overwrites a newer status or payment date.
- Every currency, amount and date rule that exists in the browser is also enforced by the business layer and returns a field error, not a generic failure.
- Existing automated tests keep passing except where an expectation encodes the old, now-forbidden behaviour — each such change is listed in the PR.

## Notes for the pipeline

- Depends on `service-layer` being merged (all rules referenced above live in `lib/services/`).
- Likely size **M**; one small migration for the partial unique indexes (D9), possibly more if D3 stores status via a job or D11 adds a per-year counter.
- Touches UI only lightly (D5 conflict message, D2 confirmation if chosen, D7 editor behaviour) → `ux-flows` / `screens` probably needed only for those states.
- Suggested route: `specify → clarify → design → data-model → plan-tests → tasks → implement → review → ship`.
