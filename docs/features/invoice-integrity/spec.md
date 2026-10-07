---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
---

# Spec — invoice-integrity

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (project-wide; this feature adds *Cancelled invoice*, *Default bank account*, *Default sender profile*, *Draft invoice*, *Issued details* and four invariants)
> **Reference module / docs / channels used:** [`brief.md`](./brief.md) (the idea baseline and findings D1–D11), [`mcp-server/spec.md`](../mcp-server/spec.md) (the overdue rule and Freelancer time zone that absorbed D3), and a read-only check of each finding against the current code on `main` @ `db42b85`.

## 1. Context

An invoice is a legal and financial document. Once a Freelancer sends it, it must keep saying what was sent, its status must follow a sensible lifecycle, and its money must add up. Today several of those guarantees hold only in the browser, or not at all. The PDF and every save re-read the current sender profile, Customer and bank account, so last year's paid invoice silently shows today's bank details. The business layer accepts any status change, so a paid invoice can be turned back into a draft and deleted, leaving a gap in the numbering. Currency consistency and several amount and date bounds are checked only in the editor, so a stale tab or a direct call can store a EUR invoice that prints a USD account. The people affected are every Freelancer with issued invoices, and the Customers who receive and pay those invoices.

There is no incident behind this. The trigger is sequencing. `service-layer` moved every invoice rule into one business layer that the web app and Assistants share, and `mcp-server` gave Assistants read access. The next roadmap step, letting an Assistant create and edit drafts, was explicitly deferred until the server enforces status transitions (D4) and currency rules (D6). This feature is that prerequisite. A check of the current code confirmed D1, D2, D5, D6, D8, D9 and D11 are still open, D4, D7 and D10 are partly open, and D3 is closed: `mcp-server` already derives overdue invoices from the due date in the Freelancer time zone, so D3 is out of scope here.

**Committed approach.** Every rule is enforced once, in the shared business layer, so the editor, any other web path and any future Assistant write tool get the same answer. The rules:
- **Issued invoices are fixed documents.** A draft is fully editable and follows the current records on each save. From the moment it is issued, an invoice keeps its issued details, lines, amounts, issue date, currency, number and every other field; only its due date, notes, payment terms and PO number can change. Anything else needs Cancel and then Duplicate.
- **The PDF prints the invoice's issued details**, including the bank account number, not the current records.
- **One status lifecycle:** every new invoice, including a duplicate, starts as a draft; draft → pending; pending → paid, overdue or cancelled; overdue (marked by hand) → pending while not yet past due, paid or cancelled; paid → pending to undo a mistaken payment. Cancelled is final, an issued invoice never returns to draft, and only drafts can be deleted.
- **A save made from an outdated view is refused** rather than overwriting a newer status or payment date. A view is outdated when the invoice changed in any way after the view was loaded. Status changes from the invoice list are judged by the lifecycle against the invoice's current status.
- **Currency, amount and date rules** from the editor also hold in the business layer and come back as plain field errors.
- **Exactly one default** sender profile per Freelancer and one default bank account per sender profile.
- **The year in a system-assigned invoice number comes from the invoice's issue date.**

The approach was chosen at easy interview depth, without competitive research, from the audit's directions and the Freelancer's decisions below.

Decisions taken during the interview, recorded for traceability:

- **Editing an issued invoice:** only the due date, notes, payment terms and PO number (payment terms and PO number added during clarify, because they travel with the due date and are often corrected after sending). Every other change requires cancelling the invoice and duplicating it. A cancelled invoice is read-only. (Freelancer's choice over "editable with fixed details" and "paid and cancelled read-only".)
- **Status matrix:** the brief's matrix without any path back to draft; cancelled is final. Two changes from the brief: draft → cancelled is removed, because a draft is simply deleted and a cancelled invoice is, by definition, one withdrawn after issuing. Overdue → pending is allowed only for an invoice marked overdue by hand whose due date has not passed, so that the matrix agrees with `mcp-server`'s overdue rule, under which a past-due invoice is overdue regardless of its stored status.
- **Numbering:** the year comes from the issue date; the counter keeps running across years without resetting; the number is still assigned on first save.
- **Existing data:** before release, a count-only report lists records that already break the new rules. Duplicate defaults are repaired automatically at release by keeping the earliest-created default. No invoice is changed by the release.
- **Assistants get no write tools here.** The rules live in the shared business layer, so the later drafts feature inherits them unchanged.

## 2. Goals

- An issued invoice stays the document the Customer received. Its PDF and its details do not change when the Freelancer later edits their sender profile, Customer or bank account, or edits the invoice's due date, notes, payment terms and PO number.
- No caller, whether the editor, a stale tab, a script using the Freelancer's session or a future Assistant, can move an invoice through a status change outside the lifecycle, store an invoice whose currencies disagree, or overwrite a newer status with an older one.
- Every invalid amount, date or currency is answered with a plain explanation tied to the field, never a generic failure. This makes the business layer safe to open to Assistant writes.

## 3. Non-goals

- **Overdue derivation (D3).** It shipped with `mcp-server`, which shares one overdue rule and the Freelancer time zone across every surface.
- **Partial payments, a manually entered payment date, credit notes or formal cancellation documents.** Each changes the money model and needs its own feature. Cancel then Duplicate is the correction path for now.
- **Keeping a copy of the sender profile's logo.** The logo is an image, not legal or payment data, and copying it per invoice multiplies storage. An issued invoice's PDF shows the current logo.
- **Automatic repair of existing invoices.** Rewriting issued documents without the Freelancer is exactly what this feature forbids. Only duplicate defaults are repaired automatically, because that changes no document.
- **A per-year reset of the invoice counter or numbering on issue.** Both change visible numbering for existing users and need a migration; the year fix alone removes the wrong-year numbers.
- **Editor UX races, date formatting in tables and accessibility.** These belong to `editor-ux`.
- **Assistant write tools.** That is the next feature; this one only makes it safe.

## 4. User stories

### US-01: Issued invoice keeps its details

**As a** Freelancer
**I want** an issued invoice to keep the sender, Customer and bank details it was issued with
**So that** re-opening or re-downloading it years later gives the document my Customer actually received

### US-02: Customer can pay from the PDF

**As a** Customer
**I want** the invoice PDF to show the payment details that were valid when it was issued, including the account number
**So that** I can pay it even when the account has no IBAN, and the copy I hold matches the Freelancer's

### US-03: Statuses follow one lifecycle

**As a** Freelancer
**I want** only sensible status changes to be accepted
**So that** a paid or cancelled invoice cannot be rewound into a draft, deleted, or silently lose its payment date

### US-04: Correct an issued invoice safely

**As a** Freelancer
**I want** to change only the due date, notes, payment terms and PO number of an issued invoice, and to cancel and duplicate it for anything else
**So that** small corrections stay easy while what I billed stays fixed

### US-05: An old view never overwrites a newer change

**As a** Freelancer
**I want** a save from an outdated editor to be refused with an explanation
**So that** marking an invoice paid in one tab is never undone by saving it in another

### US-06: One currency per invoice

**As a** Freelancer
**I want** an invoice, its bank account and its catalogue products to share one currency
**So that** my Customer is never asked to pay a EUR amount into a USD account

### US-07: Retired products do not break old invoices

**As a** Freelancer
**I want** invoices to keep their lines when I deactivate or delete a product
**So that** an invoice's lines and total never change just because I tidied up my product list

### US-08: Exactly one default profile and account

**As a** Freelancer
**I want** exactly one default sender profile and one default bank account per profile at all times
**So that** a new invoice always starts from the profile and account I chose

### US-09: Plain errors for out-of-range values

**As a** Freelancer
**I want** an amount that is too large, a due date before the issue date, or a malformed price to be explained on the field
**So that** I know what to fix instead of seeing a generic failure

### US-10: Invoice number year matches the invoice

**As a** Freelancer
**I want** the year in a system-assigned invoice number to be the year of the invoice's issue date
**So that** an invoice dated in December is not numbered with next year

### US-11: The same rules for every caller

**As an** Assistant
**I want** every invoice rule to live in the one business layer I share with the web app, and to read an invoice's issued details
**So that** my answers match the PDF, and later write tools cannot bypass what the web app enforces

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** a Freelancer with a paid invoice issued last year
**When** they change that sender profile's legal name, the Customer's address and the bank account's IBAN, then open the invoice, download its PDF, edit its notes and save
**Then** the invoice and its PDF still show the old legal name, address and IBAN, and every field other than the notes is unchanged

### AC-02 (US-01) — happy path

**Given** a Freelancer with a draft invoice for a Customer whose address they have just corrected
**When** they save the draft
**Then** the draft shows the corrected address. When they later issue it, from the editor or from the invoice list, the issued details saved with the draft at its last save become fixed and no longer change. A Customer, sender profile or bank account change made after the draft's last save reaches the invoice only if the draft is saved again before it is issued. The PDF of a draft prints the issued details from its last save

### AC-03 (US-02) — happy path

**Given** an issued invoice whose bank account has an account number and no IBAN
**When** the Freelancer downloads the PDF and sends it to the Customer
**Then** the PDF prints the bank name, account holder and account number from the invoice's issued details, plus the IBAN and SWIFT code when the issued details contain them

### AC-04 (US-03) — happy path

**Given** a Freelancer with invoices in each status
**When** they change statuses
**Then** only these changes are accepted: draft to pending; pending to paid, overdue or cancelled; overdue that was marked by hand to pending, while the due date has not passed; overdue to paid or cancelled; paid to pending. Entering paid records the payment date, the moment the invoice was marked paid, and paid to pending clears it. A request for the status the invoice already has is not a status change: it is accepted together with the rest of the save, subject to the other rules, and never touches the payment date. Every other change is refused, and the invoice is left as it was

### AC-04b (US-03) — domain invariant

**Given** a Freelancer creating a new invoice or duplicating an existing one, from the editor or from any other path
**When** the new invoice is saved with any status other than draft
**Then** the system refuses and explains that a new invoice always starts as a draft and is issued by moving it to pending. A duplicate is always created as a draft

### AC-05 (US-03) — domain invariant

**Given** a Freelancer with a paid invoice
**When** they try to turn it back into a draft
**Then** the system refuses, tells them an issued invoice can never return to draft, and suggests cancelling and duplicating it instead. Its status and payment date are unchanged

### AC-06 (US-03) — domain invariant

**Given** a Freelancer with a cancelled invoice
**When** they try to change its status, edit any field, or delete it
**Then** the system refuses and tells them a cancelled invoice is final. The invoice keeps its number and stays in the list and printable. Duplicate is still offered

### AC-07 (US-04) — happy path

**Given** a Freelancer with a pending invoice that became overdue yesterday
**When** they move its due date to next week, add a note and save
**Then** both changes are saved, the invoice is no longer counted as overdue, and its issued details, lines, amounts, issue date, currency and number are unchanged. An invoice the Freelancer marked overdue by hand stays overdue when its due date is moved into the future, until they move it back to pending themselves

### AC-08 (US-04) — domain invariant

**Given** a Freelancer with an issued invoice
**When** they try to change any field other than the due date, notes, payment terms and PO number, such as a line (its product, description, unit, quantity or price), the tax, the discount, the shipping, the terms, the issue date, the currency, the Customer, the sender profile, the bank account or the number
**Then** the editor shows those fields as read-only. Any such change that reaches the system anyway is refused with the explanation that an issued invoice can only change its due date, notes, payment terms and PO number, and that cancelling and duplicating it is the way to correct it

### AC-09 (US-04) — error

**Given** a Freelancer editing an issued invoice dated 10 March
**When** they set its due date to 5 March and save
**Then** the system blocks the save and shows on the due date field that it cannot be before the issue date, 10 March

### AC-10 (US-05) — domain invariant (concurrent edge)

**Given** a Freelancer has a pending invoice open in the editor, and marks it paid from the invoice list in another tab
**When** they save from the editor that was opened before the payment
**Then** the system refuses the save and tells them the invoice was changed elsewhere and must be reloaded. The invoice stays paid with its payment date, and nothing from the refused save is stored. The same refusal applies to drafts and to any change made elsewhere after the editor was opened, including a notes-only edit. A status change from the invoice list is not checked for freshness; it is accepted or refused by AC-04 against the invoice's current status, so marking paid an invoice that was cancelled elsewhere is refused as a change out of cancelled

### AC-11 (US-06) — error

**Given** a Freelancer editing a draft in EUR
**When** they choose a bank account held in USD and save
**Then** the system blocks the save and explains on the bank account field that the account is in USD while the invoice is in EUR

### AC-12 (US-06) — cross-context

**Given** a Freelancer whose catalogue product "Consulting" is priced in USD
**When** they save a EUR draft that has a "Consulting" line, from the editor or from any other path
**Then** the system blocks the save and names the line whose product is in a different currency. Lines typed as free text, without a catalogue product, are not checked

### AC-13 (US-06) — domain invariant

**Given** a bank account used by three invoices, counting invoices in any status, drafts and cancelled invoices included
**When** the Freelancer tries to change that account's currency
**Then** the system refuses and explains that the currency of an account used by invoices cannot change, naming how many invoices use it. Other fields of the account can still be edited

### AC-13b (US-06) — domain invariant

**Given** a catalogue product that appears on a line of at least one invoice in any status, drafts and cancelled invoices included
**When** the Freelancer tries to change that product's currency
**Then** the system refuses and explains that the currency of a product used on invoices cannot change, naming how many invoices use it. Other fields of the product can still be edited

### AC-14 (US-06) — cross-context

**Given** an invoice issued before this release whose currency differs from its bank account's
**When** the Freelancer changes its notes or due date and saves
**Then** the save succeeds. On an issued invoice only the rules of the fields that actually changed are checked: a changed due date must not be before the issue date (AC-09), while the currency, amount and discount rules are not re-checked, because those fields are fixed. On a draft every rule, the currency rule included, is checked on every save and when it moves to pending from any path. A draft saved before this release with mismatching currencies is therefore blocked on its next save, even a notes-only one, and cannot be issued, with the explanation from AC-11, until the Freelancer fixes it

### AC-15 (US-07) — cross-context

**Given** a draft and a paid invoice that each have a line for the product "Consulting 2025", which the Freelancer has since deactivated
**When** the Freelancer opens either invoice, and saves the draft after changing its notes
**Then** the line stays with its description, quantity, price, amount and custom-price marking exactly as they were saved, and the total is unchanged. No warning offers to remove it. "Consulting 2025" is not offered when adding new lines

### AC-16 (US-07) — happy path

**Given** an invoice with a line for a product the Freelancer later deleted
**When** they open the invoice or download its PDF
**Then** the line still shows its description, quantity, price and amount as free text, and the total is unchanged

### AC-17 (US-08) — happy path

**Given** a Freelancer with two sender profiles, A being the default
**When** they make B the default by double-clicking, or from two tabs at the same moment
**Then** exactly one profile is the default afterwards. The same holds for bank accounts within one sender profile. If making B the default fails, A stays the default

### AC-17b (US-08) — domain invariant

**Given** a Freelancer managing sender profiles, or the bank accounts of one sender profile
**When** they create the first one, delete the current default while others remain, or try to unset the default without choosing another
**Then** the first one created becomes the default automatically; after the default is deleted, the earliest-created remaining one becomes the default; and the default cannot simply be unset, only replaced by making another one the default. At every moment exactly one is the default while any exist

### AC-18 (US-08) — cross-context

**Given** Freelancers who, before this release, ended up with two default sender profiles, a sender profile with two default bank accounts, or sender profiles or bank accounts with no default at all
**When** the release is applied
**Then** where there were several defaults, only the earliest-created of them stays the default. Where there was none, the earliest-created sender profile, or the earliest-created bank account of that profile, becomes the default. Nothing else about their profiles, accounts or invoices changes, and from then on AC-17 holds

### AC-19 (US-09) — error

**Given** a Freelancer editing a draft
**When** they enter 1,000 hours at 150,000 on one line, making the line amount, the subtotal, the tax amount, the shipping or the total larger than 99,999,999.99, and save
**Then** the system blocks the save and shows that the amount cannot exceed 99,999,999.99: on the line for a line amount, on the shipping field for shipping, and on the totals for the subtotal, tax amount or total. Each of these amounts is checked on its own, so a subtotal over the limit is refused even when a discount brings the total back under it. Nothing is stored and no generic failure is shown

### AC-20 (US-09) — error

**Given** a Freelancer creating or editing a product
**When** they enter "12abc" or "12.345" as its price
**Then** the system blocks the save and shows on the price field that it must be a number with at most two decimal places, the same rule custom prices already follow

### AC-20b (US-09) — error

**Given** a Freelancer editing a draft whose lines add up to 1,000.00 with a shipping of 200.00
**When** they enter a discount of 1,250.00 and save, from the editor or from any other path
**Then** the system blocks the save and shows on the discount field that the discount cannot exceed the sum of the lines plus the shipping. A discount of 1,200.00 is accepted

### AC-21 (US-10) — happy path

**Given** a Freelancer whose last system-assigned number for a sender profile was INV-2026-0041
**When** on 2 January 2027 they create an invoice with issue date 28 December 2026
**Then** it is numbered INV-2026-0042, and the next invoice dated in 2027 gets INV-2027-0043

### AC-21b (US-10) — domain invariant

**Given** a draft created on 28 December 2026 with issue date 28 December 2026 and system-assigned number INV-2026-0042
**When** the Freelancer moves its issue date to 3 January 2027 and saves
**Then** the number stays INV-2026-0042. The year is taken from the issue date only when the number is assigned, on the first save; a Freelancer who wants a different number types it by hand

### AC-22 (US-10) — cross-context

**Given** a Freelancer in the Kyiv time zone at 00:30 on 1 January 2027, while it is still 31 December 2026 in UTC
**When** they create an invoice with issue date 1 January 2027
**Then** its system-assigned number carries 2027, because the year comes from the issue date, not from the system's clock

### AC-23 (US-11) — authorization

**Given** two Freelancers, A and B
**When** A tries to change the status of, edit, cancel or delete one of B's invoices by referring to it directly
**Then** the system answers exactly as for an invoice that does not exist, and B's invoice is unchanged

### AC-24 (US-11) — authorization

**Given** an Assistant connected with a Freelancer's Personal key
**When** it tries to change any invoice, including its status
**Then** no such capability is offered, and the invoice is unchanged. Personal keys are read-only

### AC-25 (US-11) — cross-context

**Given** a request that does not come from the editor, such as a stale tab or a script using the Freelancer's own session
**When** it asks for a forbidden status change, an issued-invoice edit beyond the due date, notes, payment terms and PO number, or a draft with mismatching currencies
**Then** it receives the same refusal and explanation the editor would get, and nothing is stored

### AC-26 (US-11) — cross-context

**Given** an issued invoice whose Customer's name the Freelancer changed after issuing it
**When** an Assistant asks for that invoice
**Then** the answer shows the Customer name from the invoice's issued details, the same name the PDF prints

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95, invoice save and status change | no more than 10 % slower than the 7 days before release | save and status-change spans in error tracking, 7-day window after release |
| PDF fidelity | 100 % of fixture issued invoices produce identical PDF text before and after their sender profile, Customer and bank account are changed. This is text, not byte-for-byte as the brief proposed, because the logo stays current (§3) | automated test over a seeded fixture, run in CI |
| Status lifecycle coverage | 100 % of the 25 from–to status pairs tested on every write path: of the 20 pairs between different statuses, each outside AC-04 refused; the 5 same-status pairs accepted with status and payment date unchanged; creation in each non-draft status refused (AC-04b) | automated test matrix, run in CI |
| Concurrent saves | 0 lost status or payment-date changes across 50 runs of an outdated editor save racing a status change | integration test |
| Default uniqueness | exactly 1 default after 10 parallel "set as default" requests, for sender profiles and for bank accounts | integration test |
| Generic failures from user input | 0 generic failures for amount, date, price, discount or currency input; each comes back as a field error | automated tests per AC-09, AC-11, AC-12, AC-19, AC-20, AC-20b + error tracking, 30 days after release |
| Changed test expectations | 100 % of existing automated tests pass, except those that encode now-forbidden behaviour; each such change is listed in the pull request | CI run + pull request review |

## 6.1 Security / privacy

- **Data classification:** Confidential. Invoices hold Customers' names, addresses and bank details, and their integrity has legal weight.
- **Personal data touched:** none new. Existing issued details (Customer contact and bank account data) are kept unchanged rather than refreshed.
- **AuthZ/AuthN impact:** no new roles, credentials or capabilities. Every write path runs the same ownership check, limiting the acting Freelancer to their own records, together with the new lifecycle, currency, issued-invoice and freshness rules in the shared business layer. Personal keys stay read-only.
- **Abuse cases:**
  - **Cross-tenant edits or status changes:** another Freelancer's invoice is treated as non-existent (AC-23).
  - **Bypassing the editor** (a stale tab, a script with the Freelancer's session, a future Assistant): the same refusals apply on every path (AC-25).
  - **Rewinding a paid invoice to erase it:** an issued invoice cannot return to draft, and only drafts can be deleted (AC-05, AC-06).
  - **Payment-detail tampering on an issued invoice:** the issued details and currency are fixed after issue, so a changed bank account never reaches an already-sent invoice (AC-01, AC-08).
  - **Assistant write attempts before write tools exist:** no write capability is offered, because Personal keys are read-only (AC-24).
- **Security review:** Required (size M). No new authorization boundary is added, but the review must confirm that every invoice write path goes through the new rules.

## 7. Metrics / KPIs

- **New rule violations after release:** records breaking the new invariants (mismatched currencies on new drafts, more than one default, due date before issue date, impossible status history), counted by re-running the pre-release report. Baseline: the pre-release report's counts. Target: 0 records created after the release, checked 30 days after release.
- **Generic save failures:** generic "save failed" errors on invoices and products per week in error tracking. Baseline: TBD, measured over the 14 days before release from error tracking. Target: at least 90 % fewer within 30 days of release.
- **"My invoice changed" reports:** support reports or bug tickets saying an issued invoice's details, lines, total or payment date changed without the Freelancer's action. Baseline: 0 known. Target: 0 within 90 days of release.
- **Cancel-and-duplicate corrections:** issued invoices cancelled and duplicated within 7 days per month. This shows how much friction the issued-invoice lock adds. Baseline: 0 (new path). Target: no more than 5 % of issued invoices per month within 60 days of release; above that, revisit which fields stay editable.

## 8. Open questions

- [ ] What does the pre-release report find, and does any category besides duplicate defaults need a one-time repair? Default now: report counts only and repair nothing else. — owner: Dmytro Hopko, due: before the production deploy of `invoice-integrity`
- [x] How are existing Freelancers told that issued invoices are now locked except for the due date, notes, payment terms and PO number? **Resolved 2026-10-07 at `screens`:** a permanent info note in the editor on every issued invoice (screens.md SCR-02 `issued`), replacing the one-time-note default; nothing stored, no schema change. — owner: Dmytro Hopko, due: before `sdd:tasks`
- [ ] Should a duplicate made to correct a cancelled invoice show a reference to the invoice it replaces? Default now: no reference; the cancelled one keeps its number and stays listed. — owner: Dmytro Hopko, due: before `sdd:design`
