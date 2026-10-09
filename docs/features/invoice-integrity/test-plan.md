---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["implementing engineer", "Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
---

# Test plan — invoice-integrity

Every invoice rule holds once, in the shared business layer, for every caller. An issued invoice and its PDF keep the issued details they were issued with. Statuses follow one lifecycle with no way back to draft and a final cancelled state. A save made from an outdated view is refused. Currency, amount, date, price and discount rules come back as field errors. Each Freelancer has exactly one default sender profile, and each sender profile exactly one default bank account. The year in a system-assigned number comes from the issue date.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: the status transition table and its decision (25 from–to pairs, payment date set and cleared), the issued-invoice locked-field comparison, amount bounds, the discount cap, due date ≥ issue date, the strict product price format, and the number year taken from the issue date's calendar day. | In-memory, no I/O. An injected clock wherever "now" matters (payment date, the Kyiv midnight case). |
| Integration | Invoice, sender-profile, bank-account and product server actions and the services behind them: create, update, status change, delete, duplicate, the read side (editor data, PDF data, Assistant reads), the default switch, the currency locks, migrations 01–04 with the default repair, and the pre-release report. | A throwaway database container per suite, with the repo migrations plus the promoted migrations 01–04 applied. Never the `.env` database. No mocked datastore. The race and parallel-default tests use real separate connections. |
| Contract | The `ActionResult` refusal kinds and `details` shapes in `contracts/server-actions.md`, and the Assistant's tool list (read-only tools only). | Validate the real result against the agreed document. No hand-written stubs. |
| E2E | Request-boundary flows through the real entry point: a foreign invoice's direct link, and an Assistant connected with a Personal key. | A production build against the throwaway database, driven over HTTP with a seeded session or Personal key. |
| Load | <!-- N/A: no load scenario. Owner decision 2026-10-07: the only latency NFR is relative to the production baseline and is checked as a production metric (see "NFR validation"). --> | — |
| Component | The UI states screens.md adds: SCR-01 row actions per status, SCR-02 draft / issued / cancelled modes and every field error, SCR-03 bank block and retired-product lines, SCR-04 cancel confirmation, SCR-05 changed-elsewhere dialog and stale state, SCR-09 / SCR-10 / SCR-12 default, currency-lock and price states. | Render in a component harness with props and stubbed action results. Assert text and behaviour, with no full app boot. |
| Visual-regression | <!-- N/A: owner decision 2026-10-07. The repo has no visual-diff baseline, and the component tests assert each new state's content. --> | — |
| E2E-through-UI | The critical flows from `ux-flows.md` driven through the rendered UI: US-01 (issued details survive record changes, draft refreshes then freezes), US-03 (status moves and paid undo), cancel then duplicate, US-04 (due date moved on an overdue invoice), and US-05 (two tabs). | The flow scripts come from `ux-flows.md` and run against a production build and the throwaway database, signed in as a seeded Freelancer. |

## AC coverage

Every §5 acceptance criterion maps to at least one row. The Level column is the owner-confirmed choice (2026-10-07), and `implement` writes each test at that level without re-deciding it. "Flow N" refers to sad.md §6, "SCR-NN" to screens.md, and "Tnn" to tasks.json.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 | notes-only save on an issued invoice keeps every other field | integration | After the sender profile's legal name, the Customer's address and the account's IBAN change, a notes edit on a paid invoice stores the new notes. The issued details, lines, amounts, dates, currency, number, status and payment date are byte-equal to before. |
| AC-01 | issued invoice's PDF text is identical after its records change | integration | For every invoice in the issued fixture, the PDF text extracted before and after changing the sender profile, Customer and bank account is identical. The logo is excluded. This is the NFR "PDF fidelity" test. |
| AC-01 | reopening and redownloading an issued invoice shows the old details | e2e-through-UI | After editing the three records, the editor and the downloaded PDF still show the old legal name, address and IBAN (flow US-01, A3 → A4, A5). |
| AC-02 | draft save refreshes its issued details from the current records | integration | After the Customer's address is corrected, saving the draft stores the corrected address in the draft's issued details. |
| AC-02 | issuing freezes the issued details of the last save, from the editor and from the list | integration | A Customer change made after the draft's last save does not reach the invoice when it is issued, whether issued from the editor or from the list. A later change does not reach it either. |
| AC-02 | draft PDF prints its last save, not the current records | integration | A draft PDF shows the details from the draft's last save, even after a record changed later. |
| AC-02 | save the draft, issue it, then change the Customer | e2e-through-UI | The draft shows the corrected address. After issuing, a further Customer change does not appear in the editor or the PDF (flow US-01, A6 → A7 → A9). |
| AC-03 | PDF bank block prints the account number, plus IBAN and SWIFT only when present | component | Given issued details with an account number and no IBAN, SCR-03 shows the bank name, account holder and account number, with no empty IBAN or SWIFT label. Given all of them, all are shown. |
| AC-03 | PDF data comes from the invoice's issued details | integration | The read side returns the bank block from the issued details, account number included, even after the bank account record changes. |
| AC-04 | transition table accepts exactly the lifecycle moves | unit | Over all 25 from–to pairs: draft → pending; pending → paid, overdue, cancelled; hand-marked overdue → pending while not past due; overdue → paid, cancelled; paid → pending are accepted. Every other different-status pair is refused. The 5 same-status pairs are "no change". |
| AC-04 | entering paid records the payment date and paid to pending clears it | unit | Paid gets the injected "now" as its payment date. Paid → pending clears it. A same-status request never touches it. |
| AC-04 | every write path applies the lifecycle under the row lock | integration | Through the list status change and the editor update, each refused pair leaves the invoice and its payment date unchanged, and each accepted pair stores the new status. A same-status request is accepted together with the rest of the save. This is the NFR "Status lifecycle coverage" matrix. |
| AC-04 | row actions offer only the moves allowed from the row's status | component | SCR-01 for each status offers exactly the allowed moves. No issued row offers back-to-draft, and no draft offers Cancel. |
| AC-04 | mark paid, then undo to pending, from the list | e2e-through-UI | The row shows paid with its payment date, then pending with no payment date (flow US-03, C7 → C9 / C10). |
| AC-04b | creation in a non-draft status is refused | unit | The create rule refuses pending, overdue, paid and cancelled with the "a new invoice always starts as a draft" explanation. |
| AC-04b | create and duplicate store only drafts | integration | A create with each non-draft status is refused and stores nothing. A duplicate of an invoice in each status, cancelled included, is stored as a draft with a new number, and the source is unchanged. |
| AC-05 | paid to draft is refused with the cancel-and-duplicate suggestion | unit | The decision refuses with the reason "an issued invoice can never return to draft" and the suggestion to cancel and duplicate. |
| AC-05 | paid to draft is refused on every write path and leaves status and payment date unchanged | integration | Through the list and the update path, the refusal carries the explanation. Status and payment date are unchanged. |
| AC-05 | no back-to-draft action on any issued row | component | SCR-01 rows for pending, overdue and paid offer no move to draft. |
| AC-06 | cancelled invoice refuses status change, edit and delete | integration | Each attempt is refused with "a cancelled invoice is final". The invoice keeps its number, stays in the list and can still be printed and duplicated. |
| AC-06 | cancelled invoice opens read-only and its row offers only view, download, print and Duplicate | component | SCR-02 cancelled mode shows every field read-only with no Save. The SCR-01 cancelled row offers only those four actions. |
| AC-06 | cancel with confirmation, then duplicate | e2e-through-UI | SCR-04 states that cancelling is final. On confirm the row shows cancelled. Duplicate opens a new fully editable draft (flow US-03, C6; flow US-04, D9). |
| AC-07 | due date, notes, payment terms and PO number save on an issued invoice | integration | A pending invoice that went past due yesterday saves its new due date and note and is no longer derived as overdue. Every other field is unchanged. A hand-marked overdue invoice stays overdue after its due date moves into the future. |
| AC-07 | move the due date of an overdue invoice in the editor | e2e-through-UI | After saving, the list no longer shows the invoice as overdue (flow US-04, D5 → D8). |
| AC-08 | locked-field comparison flags any change outside the four editable fields | unit | A change to each locked field is flagged: a line's product, description, unit, quantity or price, tax, discount, shipping, terms, issue date, currency, Customer, sender profile, bank account and number. Changes to the due date, notes, payment terms and PO number are not. Values equal after normalization are not flagged. |
| AC-08 | locked-field change on an issued invoice is refused | integration | Refused with "an issued invoice can only change its due date, notes, payment terms and PO number" and the cancel-and-duplicate hint. Nothing is stored. |
| AC-08 | issued editor shows every locked field read-only | component | SCR-02 issued mode shows only the four editable fields as inputs, plus the permanent info note. |
| AC-09 | due date before the issue date fails validation | unit | 5 March against an issue date of 10 March fails on the due date. A due date equal to the issue date passes. |
| AC-09 | issued invoice save with an early due date is blocked | integration | The field error is on the due date and names the issue date. Nothing is stored. |
| AC-09 | due date error renders under the due date field | component | SCR-02 shows the message under the due date, with the edits intact. |
| AC-10 | outdated editor save is refused after a list status change | integration | The editor's save carries the version from before the list marked the invoice paid. It is refused as "changed elsewhere". The invoice stays paid with its payment date, and nothing from the refused save is stored. |
| AC-10 | outdated save is refused after any change elsewhere, notes-only included, for drafts too | integration | A notes-only edit made elsewhere makes the earlier view outdated, for a draft and for an issued invoice. Every write path bumps the version. |
| AC-10 | outdated editor save racing a status change never loses the status or payment date | integration | 50 runs with both writes released together: 0 lost status or payment-date changes. Each run ends either with the editor save refused, or with the list change applied on top of the editor save. This is the NFR "Concurrent saves" test. |
| AC-10 | list status change is judged by the lifecycle against the current status | integration | A list change is not version-checked. Marking paid an invoice cancelled elsewhere is refused as a change out of cancelled. |
| AC-10 | changed-elsewhere dialog and stale state | component | SCR-05 opens on the refusal. Reload discards the edits. Close keeps the edits on screen, and every further save is refused the same way until a reload. |
| AC-10 | save from an editor tab opened before the invoice was paid in another tab | e2e-through-UI | The second tab shows SCR-05. After a reload the invoice shows paid (flow US-05, E2 → E4 → E5 / E6). |
| AC-11 | draft with a bank account in another currency is blocked | integration | A EUR draft with a USD account is refused with the field error on the bank account naming both currencies. Nothing is stored. |
| AC-11 | currency error renders under the bank account select | component | SCR-02 shows the message under the bank account select. |
| AC-12 | catalogue line priced in another currency is blocked and named | integration | A EUR draft with a "Consulting" (USD) line is refused with the field error on that line naming the product. An inactive catalogue product is checked too. A free-text line is not checked. |
| AC-12 | line currency error renders under that line | component | SCR-02 shows the message under the offending line, naming the product. |
| AC-13 | currency change on a bank account used by invoices is refused with the count | integration | An account used by three invoices (a draft and a cancelled one among them) refuses the currency change, naming 3. Other fields of the account still save. An account used by no invoice can change its currency. |
| AC-13 | bank account form shows the currency-lock error | component | SCR-10 shows the message with the count under the currency field. |
| AC-13b | currency change on a product used on invoices is refused with the invoice count | integration | A product on two lines of one invoice and one line of another is refused, naming 2 invoices (not 3 lines). Drafts and cancelled invoices count. Other fields still save. |
| AC-13b | product form shows the currency-lock error | component | SCR-12 shows the message with the count under the currency field. |
| AC-14 | legacy issued invoice with mismatched currencies saves a notes or due-date change | integration | The save succeeds. Only the due-date rule is checked, and the currency, amount and discount rules are not re-checked. |
| AC-14 | legacy draft with mismatched currencies is blocked on any save and on issue | integration | A notes-only save is refused with the AC-11 explanation. Issuing it from the list or from the editor is refused the same way. |
| AC-15 | deactivated product's line is kept exactly on open and on draft save | integration | On the draft (after a notes change) and on the paid invoice, the line's description, quantity, price, amount and custom-price marking are unchanged, and the total is unchanged. |
| AC-15 | editor keeps the retired line with no removal warning and does not offer the product | component | SCR-02 shows the line as saved, with no "invalid items will be removed" warning. The product is missing from the add-line picker. |
| AC-16 | deleted product's line reads back as free text | integration | After the product is deleted, the invoice's line keeps its description, quantity, price and amount with no product link. The total is unchanged. |
| AC-16 | PDF prints a deleted product's line as free text | component | SCR-03 renders the line with its description, quantity, price and amount. |
| AC-17 | parallel make-default requests leave exactly one default | integration | 10 parallel requests over a Freelancer's sender profiles, and 10 over one profile's bank accounts: exactly 1 default each time. This is the NFR "Default uniqueness" test. |
| AC-17 | failed default switch keeps the old default | integration | When making B the default fails partway, A is still the only default. |
| AC-17 | unique index refuses a direct second default | integration | A direct write that sets a second default sender profile, or a second default bank account in one profile, is refused by the database. This is the index backstop. |
| AC-17 | double-click on make default sends a single switch and shows one default | component | SCR-07 and SCR-08 show exactly one default marked after a double-click. A failed switch shows an error and keeps A marked. |
| AC-17b | first created becomes default, deleting the default promotes the earliest remaining, unset is refused | integration | For sender profiles and for one profile's bank accounts: the first one created is the default, deleting the default makes the earliest-created remaining one the default, and an attempt to unset the default without a replacement is refused. |
| AC-17b | the current default cannot be switched off in the form | component | SCR-09 and SCR-10 show the default checkbox checked and disabled on the current default, and enabled on the others. |
| AC-18 | release repair leaves exactly one earliest-created default and changes nothing else | integration | Fixture: two defaults, none, and one non-earliest default, for profiles and for accounts. After migrations 03–04, each parent has exactly its earliest-created default (the earliest of several, or the earliest overall when there was none). No `updatedAt` and no invoice changes. Down then up again is clean. |
| AC-19 | each amount is checked against 99,999,999.99 on its own | unit | A line amount, subtotal, tax amount, shipping or total over the limit fails at its own path. A subtotal over the limit fails even when a discount brings the total under it. Exactly 99,999,999.99 passes. |
| AC-19 | save with 1,000 h at 150,000 is blocked with field errors and stores nothing | integration | The errors are on the line, the totals and shipping as applicable. There is no generic failure and nothing is stored. |
| AC-19 | amount errors render on the line, shipping and totals | component | SCR-02 shows each message at its field. |
| AC-20 | product price must be a number with at most two decimals | unit | "12abc" and "12.345" fail. "12", "12.3" and "12.30" pass. |
| AC-20 | product save with a malformed price is blocked | integration | The field error is on the price and nothing is stored, for create and for update. |
| AC-20 | price error renders under the product price field | component | SCR-12 shows the message under the price. |
| AC-20b | discount cannot exceed the lines plus shipping | unit | 1,250.00 against 1,000.00 + 200.00 fails on the discount. 1,200.00 passes. |
| AC-20b | draft save with an excessive discount is blocked from any path | integration | The field error is on the discount and nothing is stored, through the editor's action and through a direct call. |
| AC-20b | discount error renders under the discount field | component | SCR-02 shows the message under the discount. |
| AC-21 | number year is the issue date's year | unit | An issue date of 28 Dec 2026, with "now" set to 2 Jan 2027, gives year 2026. |
| AC-21 | counter runs on across years | integration | After INV-2026-0041, an invoice dated 28 Dec 2026 gets INV-2026-0042, and the next one dated in 2027 gets INV-2027-0043. |
| AC-21b | system-assigned number is kept when the issue date moves to another year | integration | The draft numbered INV-2026-0042 keeps its number after its issue date moves to 3 Jan 2027. |
| AC-22 | issue date's calendar day decides the year, not the server clock | unit | With "now" at 31 Dec 2026 22:30 UTC (00:30 1 Jan 2027 in Kyiv) and an issue date of 1 Jan 2027, the year is 2027. |
| AC-22 | creation just after midnight in Kyiv numbers with 2027 | integration | The stored number carries 2027. |
| AC-23 | foreign invoice is answered exactly as a missing one on every write path | integration | For status change, update, cancel, delete and duplicate, B's invoice id and a random id give identical "not found" results. B's invoice is unchanged. |
| AC-23 | direct link to a foreign invoice shows not found | e2e | The rendered SCR-13 is identical for B's invoice id and a non-existent id. |
| AC-24 | Assistant tool list offers no write capability | contract | The tool list returned for a Personal key validates against the agreed read-only list. No tool changes an invoice or its status. |
| AC-24 | Assistant connected with a Personal key cannot change an invoice | e2e | Through the real entry point, every listed tool is read-only, and a call naming an unlisted write tool is refused. The invoice is unchanged. |
| AC-25 | a direct call gets the same refusal as the editor on every write path | integration | Calling the actions directly with the Freelancer's session (no editor), a forbidden status change, a locked-field edit and a mismatched-currency draft each get the same refusal and explanation as the editor. Nothing is stored. |
| AC-25 | refusal results match the agreed shapes | contract | Each refusal kind and its `details` validate against `contracts/server-actions.md`. Field errors carry the documented keys. |
| AC-26 | Assistant read returns the Customer name from the issued details | integration | After the Customer is renamed, the Assistant's invoice read returns the issued name, the same name the PDF prints. |

## Edge cases / error paths

Every error and authorization AC (AC-09, AC-11, AC-19, AC-20, AC-20b, AC-23, AC-24) already has its own dedicated row above. These boundary and failure cases come from the spec, the SAD and the data model, and are written as their own tests:

- Hand-marked overdue invoice whose due date has already passed, moved to pending → expected: refused. A past-due invoice is overdue regardless of its stored status (unit + integration).
- Paid → pending → paid → expected: the second paid records a new payment date, not the first one (unit).
- Same-status request on a paid invoice together with a notes change → expected: the notes save and the payment date is untouched (integration).
- Deleting a draft that was issued from another tab after the list loaded → expected: refused, because only drafts can be deleted. The invoice is unchanged (integration).
- Duplicate of a cancelled invoice → expected: a new draft with a fresh number and no reference to the source. The source stays cancelled (integration).
- Bank account currency change where the only invoice using it is cancelled → expected: refused, naming 1 (integration).
- Deleting the only sender profile or bank account → expected: allowed, and no default remains because none exist (integration).
- Typed (manual) number with an issue date in another year → expected: the typed number is stored as is, with no year rewrite (integration).
- Issued invoice save that sends locked fields unchanged, with normalization-equal values (whitespace, trailing zeros) → expected: not treated as a change, and the save succeeds (unit).
- Database unavailable or failing mid-save → expected: the save stores nothing partially, the caller gets the generic failure, and the failure is tagged with its path in error tracking (integration, T01).
- Malformed invoice id in a direct call or a link → expected: not found, never an error state (integration).
- Migrations 01–04 → expected: each up applies on a copy of the repo schema, each down reverts it, and the repair runs before the partial unique indexes are created (integration).
- Pre-release report → expected: it prints counts per category and changes no row (integration, T20).

## Test data

- **Seed strategy:** factories that follow the `data-model.md` entity shapes. Freelancer (user plus a session usable as a cookie, and a Personal key for the Assistant rows), SenderProfile, BankAccount (account number with and without IBAN or SWIFT), Customer, Product (active, inactive, deleted), and Invoice with items. `createInvoice` takes `status`, `version` and issued-details overrides, so the status matrix can seed every status directly, bypassing the service by design. A **legacy invoice** builder covers an issued or draft invoice whose currency differs from its bank account's. Every authorization suite seeds **two** Freelancers, so that "someone else's invoice" is real data.
- **Factory change (T02):** `createSenderProfile` and `createBankAccount` default `isDefault` to "true only if first under its parent", with the override kept. Every existing test whose expectations change because of this is listed in the PR (NFR "Changed test expectations").
- **Issued fixture for PDF fidelity:** a set of issued invoices covering an account number only, IBAN only, IBAN with SWIFT, a retired-product line and a deleted-product line. Their PDF text is extracted before and after the records change.
- **Default-repair fixture:** users and profiles with two defaults, none, and one non-earliest default, plus accounts in the same three shapes (data-model "Test fixtures").
- **PII guard:** `user-<n>@example.test` emails, `Test Sender Profile` names, and placeholder account numbers (`0000000000`). No real names, emails or IBANs.
- **Integration dependency:** a throwaway database container per suite, with the repo migrations and the promoted 01–04 applied. **Never** the `.env` database. No mocked datastore. The race (50 runs) and parallel-default (10 requests) tests need committed data on real separate connections.
- **Time:** an injected clock for the payment date, overdue derivation and the number year. Time-zone cases pass the zone explicitly.
- **Cleanup boundary:** per-test truncation of the app tables (the existing truncate helper, with no new table to add), and a new container per suite. E2E and e2e-through-UI runs use a fresh database per run, and each test seeds its own Freelancer.

## NFR validation (load)

<!-- N/A: no load scenario. Owner decision 2026-10-07. -->

- **NFR: latency p95 of invoice save and status change ≤ 1.10 × the pre-release p95** → not a synthetic load test, because the baseline is real production traffic. It is checked as a production metric: the save and status-change spans (shipped ahead by T01), p95 over the 7 days after release against the 7 days before, with a threshold of ≤ 10 % slower.
- **Numeric NFRs that are integration tests, not load:** "Concurrent saves" (0 lost changes across 50 runs) → AC-10 race row. "Default uniqueness" (exactly 1 default after 10 parallel requests) → AC-17 parallel row. "Status lifecycle coverage" (25 pairs on every write path) → the AC-04 unit and integration rows plus the AC-04b rows. "PDF fidelity" (100 % identical text) → the AC-01 PDF row.
- **NFR: 0 generic failures from user input** → the field-error rows for AC-09, AC-11, AC-12, AC-19, AC-20 and AC-20b, plus error tracking for 30 days after release.

## CI placement

- **On every PR:** unit, component, contract and integration. Integration needs the throwaway container. The AC-10 race runs all 50 iterations here, and the AC-17 parallel test runs 10 requests.
- **Pre-release (and nightly):** e2e and e2e-through-UI against a production build.
- **After release:** the latency comparison (7 days before vs 7 days after) and the generic-failure count (30 days) from error tracking, and a re-run of the pre-release report to confirm 0 new rule violations (spec §7).
- **PR review:** every existing test whose expectation changed because it encoded now-forbidden behaviour is listed in the pull request.
