---
slug: ai-assistant
date: 2026-10-12
triage: gap
acs: [AC-16b, AC-17, AC-19]
commit: 4da2469
recurrence_of: none
---

# Fix: the chat cannot explain why a catalogue product is not used, and never offers another sender profile

## Symptom

The owner reported: "The model could not find the product and could not use a sender profile other than the default." This happened in Conversation `v7hebjeez5iripbze2hjqf3p`, read only from the dev DB. The owner's data:

- The default sender profile "Dima Gopko" has one account, Privat, in **EUR**.
- The profile "Dmytro Hopko" (not default) has Mono in **USD**, plus UAH and PLN accounts.
- The catalogue product "WEB DEV" costs 33.00 **USD**.

The conversation went like this:

1. "треба інвойс для my new customer на 176 годин із проуктом web dev …". `propose_draft` returned issues. The chat asked for "the price per hour (or amount) and currency" for web dev.
2. "в мене є готовий продук який має ціну WEB DEV". The model called `search_invoices` and said it found no such product.
3. "33$". `propose_draft` gave `NO_ACCOUNT_IN_CURRENCY` USD on the default profile.
4. "використай платника Dmytro Hopko" and "у платника Dmytro Hopko який не є дефолтним є рахунок в доларах". The model called `list_customers`, treated "Dmytro Hopko" as a Customer, and answered "не знайшов клієнта Dmytro Hopko". It never passed `senderProfile`.

## Root cause

**Product.** The product *was* found. The request named no currency, so the default account (Privat, EUR) set it (spec §1 defaults). "WEB DEV" is priced in USD, so AC-16b correctly left the line unlinked and asked for a EUR price. But `LINE_PRICE_MISSING_IN_CURRENCY` (`lib/services/assistant-drafts/resolve-lines.ts`) carried only `{ lineIndex, currency }`. Nothing told the model that a product matched and was priced in USD. It could only ask "what price and currency?". When the owner insisted the product exists, it looked in the wrong place.

**Sender profile.** There were two gaps.
1. `propose_draft`'s description (`lib/ai/tools/propose-draft.ts`) lists the values to pass: "the Customer, lines, currency, dates, bank account, tax, …". It left out the sender profile. The `senderProfile` field in `draftRequestSchema` carried no description, even though openapi `DraftRequest.senderProfile` has one. The model had no signal that it could name a sender profile.
2. `NO_ACCOUNT_IN_CURRENCY` named only the default profile's own accounts. Another profile, "Dmytro Hopko", had a USD account, but the model could not offer it (AC-17 "offers to draft under another profile if the Freelancer names it"). A later turn sees only the visible text, so the profile name never reached the history either.

**Model behaviour, not pinned.** In Ukrainian invoicing, "платник" (payer) normally means the one who pays: the Customer. So reading "використай платника Dmytro Hopko" as a Customer is a defensible reading of the owner's words. Calling `search_invoices` to look for a product is also a model choice.

## The pinning test

- Integration, `tests/integration/services/assistant-drafts/resolve-draft-request.test.ts`, ""in EUR": the USD product is not linked and the EUR price is asked for". It now expects `products: [{ productId, name, currency: 'USD' }]`. Before the fix it failed with `AssertionError: expected [ { …(3) } ] to deeply equal [ { …(4) } ]`.
- Integration, `tests/integration/services/assistant-drafts/resolve-parties.test.ts`, "fix 2026-10-12: no account in the currency names the other sender profiles that have one, picks none". This is the owner's setup: EUR-only default, a USD profile "Dmytro Hopko", and a PLN-only third profile. Before the fix it failed with `AssertionError: expected [ { …(4) } ] to deeply equal [ ObjectContaining{…} ]`. The two existing exact `NO_ACCOUNT_IN_CURRENCY` cases now also expect `otherProfiles: []`. One of them shows that another Freelancer's profile is never offered.
- Unit, `tests/unit/lib/ai/propose-draft-sender-profile.test.ts`:
  - "the description lists the sender profile among the values to pass". Before the fix it failed with `AssertionError: expected 'Prepare a Draft invoice card from the…' to match /sender profile/i`.
  - "the senderProfile field says what it takes". Before the fix it failed with `TypeError: .toMatch() expects to receive a string, but got undefined` (the field had no description).
- Unit, `tests/unit/lib/ai/issue-text.test.ts`, "names a matching product in another currency, and another sender profile with an account in the currency". This covers the fallback words.

The fix:
- `LINE_PRICE_MISSING_IN_CURRENCY` gains `products: [{ productId, name, currency }]`, the products the line matched (≤ 50). The fallback sentence names them, for example "WEB DEV (USD)". It asks for the price in the invoice currency, or offers to draft in the product's currency.
- `NO_ACCOUNT_IN_CURRENCY` gains `otherProfiles: [{ senderProfileId, name }]`, the Freelancer's other profiles with an account in the asked currency. The fallback sentence says to name one to draft from it. The resolver never picks one.
- `propose_draft`'s description now names the sender profile. The `senderProfile` field carries the openapi description.
- The contract (`contracts/openapi.yaml` DraftIssue) and the schema test fixtures are updated. MCP shares the resolver and gets the same issues.

## Spec patch (confirmed by the owner, applied 2026-10-12)

The new fields add information and contradict no AC. AC-16b's "asks for the EUR price" and AC-17's "never picks the other profile itself" still hold. The owner was not available to confirm, so spec.md is **not** changed. Proposed wording:

- **AC-16b**, append to the second case. Before: "…the line is free text, not linked to the USD product. The chat asks for the EUR price and fills in no price of its own." After: "…the line is free text, not linked to the USD product. The chat says that "Consulting" is priced in USD, asks for the EUR price and fills in no price of its own."
- **AC-19**, append after "…and links to adding one, instead of producing a card in a different currency." Add: "When another of the Freelancer's sender profiles has an account in that currency, the chat names that profile and offers to draft under it if the Freelancer names it; it never picks it itself."

## Follow-ups

- Proposed instruction change, not implemented because it is model behaviour that cannot be pinned without a model run. Add to `CHAT_INSTRUCTIONS` (Writing safety) or to the `propose_draft` description: "The sender profile is the Freelancer's own business the invoice is from; the Customer is who pays. When the Freelancer names one of their sender profiles, pass it as senderProfile, not as the Customer." Verify it with an eval case ("use my Dmytro Hopko profile, it has a USD account") once `pnpm eval:assistant` may run.
- The model looked for a catalogue product with `search_invoices`. No read tool lists products by name for the chat, yet `CHAT_INSTRUCTIONS` says the model "can read the Freelancer's invoices, customers and products". Consider whether the chat needs a `list_products` read, which would be a spec change (roadmap D1 lists the seven read questions).
