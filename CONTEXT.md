---
status: Living
updated_at: "2026-09-26"
---

# Domain Context — invoiceFlow (Invoice Forge)

<!--
CONTEXT.md is the domain glossary — not a spec and not a scratch pad. NO implementation
detail here (no datastore/broker/framework names, no API contracts) — only domain words
and the boundaries between them. Implementation choices live in the SAD and ADRs; behaviour
lives in spec.md.
-->

## Glossary

- Custom price — a price a Freelancer agrees with one Customer for one product, pre-filled into that customer's invoice lines instead of the product's standard price. NOT the price on an invoice line (the Freelancer can still change the line; the custom price stays as agreed).
- Customer — a party a Freelancer bills, kept in the Freelancer's customer list; each invoice keeps a copy of the customer's details as they were when it was issued. NOT Freelancer (a Customer never signs in) and NOT the copy on an invoice (editing a Customer does not rewrite past invoices).
- Freelancer — a signed-in account holder who owns sender profiles, customers, products and invoices and sees only their own data. NOT Customer (the party a Freelancer bills; never signs in).
- Invoice number — the identifier printed on an invoice, unique within its sender profile; assigned from the invoice sequence by default or typed manually by the Freelancer. NOT the internal record id (never shown to customers).
- Invoice sequence — the per-sender-profile running count the system uses to propose the next invoice number; only system-assigned numbers advance it. NOT the invoice number itself (manual numbers do not move the sequence).
- Sender profile — a business identity (company or individual entrepreneur) a Freelancer issues invoices under, with its own legal details, logo, bank accounts, invoice prefix and invoice sequence. NOT the Freelancer's account (one Freelancer can own several sender profiles).
- Visitor — anyone reaching the app or its endpoints without a signed-in session, including scripts and bots outside a browser. NOT Freelancer (a Visitor owns no data and may only see public pages and sign in).

## Invariants

- An invoice number can never repeat within one sender profile.
- A customer or sender profile that has invoices can never be deleted on its own; only deleting the whole account removes them together.
