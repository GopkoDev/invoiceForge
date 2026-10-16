---
id: T10
title: "Build Offered choices from resolver issues and pin a chosen option into a draft request"
layer: "domain"
deps: ["T04", "T08"]
blocks: ["T11", "T12", "T13"]
acs: ["AC-08", "AC-08b", "AC-09", "AC-10", "AC-14"]
files_hint: ["lib/services/assistant-drafts/offers.ts", "lib/services/assistant-drafts/pin.ts", "tests/unit/offer-from-issues.test.ts", "tests/unit/pin-choice.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T10 — Build Offered choices from resolver issues and pin a chosen option into a draft request

## Place in the sequence

- **Blocked by:** T04 — Add the offer, origin and start-point types and the CHOICE_UNAVAILABLE and ALREADY_ISSUED error details, T08 — Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates
- **Blocks:** T11 — Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen, T12 — Check a pressed choice against the stored offer and claim or release it with the allowance slot, T13 — Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part
- **Wave:** 3 (longest dependency chain); linear position T10 of T31 for the sequential in-place run.
- **Lane:** shares `lib/services/assistant-drafts/offers.ts` with T12 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

It is the code that decides every button: options come only from the resolver's typed issue, never from the model's text.

## Inlined context

> | `CUSTOMER_AMBIGUOUS`, `CUSTOMER_NEAR_MISS` | Customer |
> | `SENDER_PROFILE_NOT_FOUND`, `DEFAULT_PROFILE_WITHOUT_ACCOUNT`, `NO_ACCOUNT_IN_CURRENCY` with other profiles | sender profile |
> | `CURRENCY_UNCLEAR` | currency |
> | `SEVERAL_ACCOUNTS_IN_CURRENCY`, `BANK_ACCOUNT_NOT_FOUND`, `BANK_ACCOUNT_AMBIGUOUS` | bank account |
> | `PRODUCT_AMBIGUOUS` | product |
>
> — `sad.md §5, «Which issues become offers» table, verbatim` · full text: [sad.md](../sad.md)

> - **One choice per reply.** When a reply carries several issues, the first offer-able one wins, in the order Customer → sender profile → currency → bank account → product (the order the draft is resolved in).
> - **The 8-button cap.** Above 8 options there is no offer, and the reply states the count (AC-14).
> - **No offer** for every other kind of the `DraftIssue` union: … `LINE_AMOUNT_MISSING`, `LINE_QUANTITY_MISSING`, `LINE_PRICE_MISSING_IN_CURRENCY`, `PRODUCT_NOT_FOUND`, `FIELD_INVALID`; … `NO_SENDER_PROFILE_WITH_ACCOUNT`, `CUSTOMER_NOT_FOUND`; … `BANK_ACCOUNT_CURRENCY_MISMATCH`
>
> — `sad.md §5, «Which issues become offers», abridged` · full text: [sad.md](../sad.md)

> **What a button shows.** A Customer button shows the saved name; when two offered Customers' names look the same once case, spaces and look-alike letters are ignored, each also shows the Customer's email, or "no email" when it has none. A bank account button shows bank name, last four digits and currency; a product button shows name, unit and the price in the invoice currency; a sender profile button shows its name; a currency button shows its code. The label is fixed when the option is offered, and the Freelancer's sent message shows that label.
>
> — `spec.md §1, interview decisions, verbatim` · full text: [spec.md](../spec.md)

> **Pins** (ADR-0003): `CUSTOMER` → `customerId` (drops `customer`); `SENDER_PROFILE` → `senderProfileId` (drops `senderProfile`); `CURRENCY` → `currency`; `BANK_ACCOUNT` → `bankAccount` = the account id; `PRODUCT` → `lines[lineIndex].productId`.
>
> — `contracts/server-actions.md §Chat route internals, Pins, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Chosen:** Option 1. The safety property then holds by construction, not by validation: the model has no input into what is offered, the injection test reduces to "offers equal `offerFromIssue(issue)`"
>
> — `adr/0002 §Decision outcome, abridged` · full text: [adr/0002](../adr/0002-build-offered-choices-in-code-from-the-draft-resolvers-typed-issues.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Shapes only (stored later by T11): `ChoiceOffer.options` = 1…8 frozen `{ optionId (position), label, ref }`; `ref` is `customerId` / `senderProfileId` / `bankAccountId` / `productId` / currency code; `lineIndex` for `PRODUCT` only. No migration here.

— `data-model.md §ChoiceOffer, options + lineIndex, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `offerFromIssues(issues, { invoiceCurrency }) → { kind: 'OFFER'; offerKind; lineIndex; options } | { kind: 'TOO_MANY'; count } | { kind: 'NONE' }`
- `pinChoice(request, kind, lineIndex, ref) → DraftRequest`
- `StoredOfferOption` / `OfferOptionLabel` per openapi.

— `contracts/server-actions.md §Chat route internals, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-08 — happy path

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the chat asks which Customer they mean and shows two buttons, "Acme Corp" and "Acme GmbH", under its reply; pressing "Acme GmbH" sends that choice as their message and the chat continues with a draft card for Acme GmbH
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-08b — happy path

> **Given** a Freelancer with Customers Acme Corp and Acme GmbH, and two USD bank accounts on their default sender profile
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the reply offers buttons for the Customer only; after they press "Acme GmbH", the next reply offers the two USD accounts as buttons, and after they press one, the chat shows a draft card for Acme GmbH with that account
>
> — `spec.md §5, AC-08b, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a reply asking the Freelancer to choose among accounts, where the model's text names an account that is not among the options the draft action found
> **When** the reply is shown
> **Then** the Offered choices show only the options the draft action found; no button ever offers an option the system did not find, whatever the reply's words say
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two buttons
> **When** the Freelancer presses the second button
> **Then** each button also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they pressed, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — error

> **Given** a Freelancer with 12 Customers whose names contain "Studio"
> **When** they write "invoice Studio for 3 days at 450 EUR a day"
> **Then** the chat shows no buttons, says that 12 Customers match, and asks them to type a more exact name
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `StoredOfferOption` zod schema (`optionId`, `label`, `ref`) and `offerFromIssues` with the order, the 1…8 bound and `TOO_MANY` — `lib/services/assistant-drafts/offers.ts`
- [ ] Labels: Customer name, + " (email)" / " (no email)" only when two offered names fold equal (shared `foldName`); bank "{bankName} ·{lastFour} {currency}"; product "{name}, {unit}, {price} {currency}"; profile name; currency code — same file
- [ ] `pinChoice` per kind — `lib/services/assistant-drafts/pin.ts`
- [ ] Unit tests: two Acme Customers → `CUSTOMER` offer in order (AC-08); Customer + bank issues → Customer only (AC-08b); same issue with any text → same options (AC-09); look-alike labels with email / "no email", distinct names without (AC-10); 12 matches → `TOO_MANY` 12, 8 → offer of 8, 9 → `TOO_MANY` (AC-14); single option is a valid offer — `tests/unit/offer-from-issues.test.ts`, `tests/unit/pin-choice.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Exactly 8 options | Offer with 8 buttons |
| 9 or more options | `TOO_MANY` with the count; no offer |
| Near-miss with one candidate | Offer with one button |
| `NO_ACCOUNT_IN_CURRENCY` with empty `otherProfiles` | `NONE` (no offer) |
| `CURRENCY_UNCLEAR` options | Only the `Currency` codes the resolver found |
| Pin `CUSTOMER` on a request that had `customer` text | Text dropped, `customerId` set |

## Definition of Done

- [ ] offerFromIssues maps issues to at most one offer in the order Customer, sender profile, currency, bank account, product, returns TOO_MANY above 8 and NONE for non-offer kinds, builds labels per spec §1 with email or "no email" only for look-alike Customers, and pinChoice writes each kind's record into the request, all proven by unit tests.
- [ ] unit tests green
- [ ] the module imports no model or AI SDK code
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
