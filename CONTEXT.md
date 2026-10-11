---
status: Living
updated_at: "2026-10-11"
---

# Domain Context — Invoice Forge

<!--
CONTEXT.md is the domain glossary — not a spec and not a scratch pad. NO implementation
detail here (no datastore/broker/framework names, no API contracts) — only domain words
and the boundaries between them. Implementation choices live in the SAD and ADRs; behaviour
lives in spec.md.
-->

## Glossary

- Assistant draft — a Draft invoice that an Assistant created rather than the Freelancer in the editor; it follows every Draft invoice rule and shows which Assistant created it (the chat, or the key's name at creation) until it is issued or deleted; the origin itself stays recorded after issuing but is never shown again. NOT a separate kind of invoice (editing, issuing or deleting it works exactly as for any draft) and NOT trusted data (the Freelancer reviews it before issuing).
- Assistant — a program that reads and, where allowed, changes data on behalf of exactly one Freelancer and sees only that Freelancer's data: either the in-app AI chat, which acts inside that Freelancer's signed-in session, or an external MCP client, which acts through a Personal key and never through a browser session. NOT Freelancer (an Assistant never signs in itself and owns nothing) and NOT Visitor (an Assistant always acts for a known Freelancer).
- Cancelled invoice — an invoice the Freelancer withdrew after issuing it; it is no longer owed, keeps its invoice number, stays listed and printable, and can never change again. NOT a deleted invoice (only drafts can be deleted) and NOT a draft (it was issued once).
- Contributor — a developer who clones the repository to run, test or change the app, following its README and tests. NOT Freelancer (a Contributor works on the code, not on their own invoices in the app) and NOT Visitor (a Contributor is defined by working on the repository, not by reaching the running app).
- Conversation — one saved exchange between a Freelancer and the in-app Assistant, listed in the AI section so the Freelancer can reopen it; deleted 90 days after its last message, when the Freelancer deletes it (one or all), or with the account. NOT the Draft invoices it created (deleting a Conversation leaves them untouched) and NOT an external Assistant's own history.
- Custom price — a price a Freelancer agrees with one Customer for one product, pre-filled into that customer's invoice lines instead of the product's standard price. NOT the price on an invoice line (the Freelancer can still change the line; the custom price stays as agreed).
- Customer — a party a Freelancer bills, kept in the Freelancer's customer list; each invoice keeps a copy of the customer's details as they were when it was issued. NOT Freelancer (a Customer never signs in) and NOT the copy on an invoice (editing a Customer does not rewrite past invoices).
- Daily message allowance — how many messages a Freelancer may send to the in-app Assistant per day, the day ending at midnight in the Freelancer time zone; shown to the Freelancer together with what remains. NOT the per-key call limit of an external Assistant (that protects shared capacity and never counts chat messages).
- Dashboard period — the date range a Freelancer's dashboard figures cover: a named preset (such as the current month or all time) or a custom from–to range of at most 5 years. NOT an invoice's issue or due dates (the period selects which invoices are counted; it never changes them).
- Debtor — a Customer who has at least one overdue invoice from the Freelancer in the selected currency, ranked by the total overdue amount. NOT every Customer with an unpaid invoice (pending invoices that are not yet overdue do not make a Customer a Debtor).
- Default bank account — the one bank account of a sender profile that a new invoice under that profile starts from; a sender profile with bank accounts has exactly one. NOT a restriction (any of the profile's accounts can be chosen on a draft).
- Default sender profile — the one sender profile a Freelancer's new invoices start from; a Freelancer with sender profiles has exactly one. NOT a restriction (any of the Freelancer's profiles can be chosen on a draft).
- Draft invoice — an invoice still being prepared and not yet sent to the Customer; it can be edited in full or deleted, and its issued details follow the current sender profile, Customer and bank account on every save. NOT an issued invoice (a draft is never counted, listed as owed or numbered by issuing).
- Draft permission — an opt-in setting chosen only when a Personal key is created and never added to a key later, which lets that key's Assistant create Draft invoices; it never lets an Assistant issue, send, edit or delete an invoice. NOT a second account role (it belongs to one key; revoking the key removes it).
- Expected payment — a pending (issued, not yet paid, not overdue) invoice the Freelancer expects to be paid, grouped by currency and ordered by due date. NOT revenue (revenue counts only paid invoices).
- Freelancer time zone — the time zone saved on the Freelancer's account that decides where "today", day boundaries and dashboard periods fall for every surface, the dashboard and Assistants alike; filled from the browser on first use and changeable in settings; until one is saved, every surface uses UTC. NOT the browser's current time zone (that only proposes the initial value).
- Freelancer — a signed-in account holder who owns sender profiles, customers, products and invoices and sees only their own data. NOT Customer (the party a Freelancer bills; never signs in).
- Invoice number — the identifier printed on an invoice, unique within its sender profile; assigned from the invoice sequence by default or typed manually by the Freelancer. NOT the internal record id (never shown to customers).
- Invoice sequence — the per-sender-profile running count the system uses to propose the next invoice number; only system-assigned numbers advance it. NOT the invoice number itself (manual numbers do not move the sequence).
- Issued details — the copy of the sender profile's, Customer's and bank account's details that an invoice keeps and prints; refreshed from the current records while the invoice is a draft and fixed from the moment it is issued. NOT the current sender profile, Customer or bank account (changing those never changes an issued invoice).
- Issued invoice — an invoice that has left draft and was not cancelled: pending, overdue or paid; the default scope whenever invoices are listed, counted or summed. NOT a draft (never sent to the Customer) and NOT a cancelled invoice (no longer owed).
- Off-topic request — a message to the in-app Assistant that asks for anything other than the Freelancer's own data in the app, creating a Draft invoice, or where something is in the app — for example tax, legal or general invoicing advice, wording a reminder, or general chat; it is answered with a one-sentence refusal. NOT a request the Assistant cannot complete yet for missing details (that gets a follow-up question, not a refusal).
- Overdue invoice — an issued, unpaid invoice that the Freelancer marked overdue or whose due date (a calendar day) is before today's date in the Freelancer time zone; every surface (dashboard, invoice list, Assistant) applies this one rule. NOT a pending invoice that is not yet due, and NOT dependent on the Freelancer marking it by hand.
- Personal key — a named secret a Freelancer creates in the app and gives to one Assistant so it can read that Freelancer's data — and, when its Draft permission is on, create Draft invoices — without a browser session; shown in full only once, revocable at any time, and removed with the account. NOT Sign-in link (a Personal key never creates a browser session) and NOT the Freelancer's account (revoking a key leaves the account untouched).
- Sender profile — a business identity (company or individual entrepreneur) a Freelancer issues invoices under, with its own legal details, logo, bank accounts, invoice prefix and invoice sequence. NOT the Freelancer's account (one Freelancer can own several sender profiles).
- Sign-in link — a single-use link emailed to the address a Visitor typed on the sign-in page; opening it signs that address in as a Freelancer (creating the account on first use). NOT an invoice or share link (it grants a session, not access to a document) and NOT proof the requester owns the address until it is opened.
- Visitor — anyone reaching the app or its endpoints without a signed-in session, including scripts and bots outside a browser. NOT Freelancer (a Visitor owns no data and may only see public pages and sign in).

## Invariants

- An invoice number can never repeat within one sender profile.
- A customer or sender profile that has invoices can never be deleted on its own; only deleting the whole account removes them together.
- An issued invoice never returns to draft, and a cancelled invoice never changes again.
- Once issued, an invoice keeps its issued details, lines, amounts, issue date and currency; only its due date, notes, payment terms and PO number can still change.
- An invoice, its bank account and every catalogue product on its lines share one currency.
- A Freelancer has exactly one default sender profile while they have any, and a sender profile exactly one default bank account while it has any.
