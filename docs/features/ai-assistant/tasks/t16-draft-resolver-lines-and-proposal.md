---
id: T16
title: "Resolve draft lines against the catalogue and custom prices, apply the quantity and unit defaults and finish resolveDraftRequest"
layer: "app"
deps: ["T07"]
blocks: ["T20", "T21"]
acs: ["AC-12", "AC-16", "AC-16b", "AC-22"]
files_hint: ["lib/services/assistant-drafts/resolve-lines.ts", "lib/services/assistant-drafts/resolve.ts", "lib/services/assistant-drafts/fingerprint.ts", "lib/services/assistant-drafts/index.ts", "tests/contract/assistant-draft-resolver.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T16 — Resolve draft lines against the catalogue and custom prices, apply the quantity and unit defaults and finish resolveDraftRequest

## Place in the sequence

- **Blocked by:** T07 — Resolve the Customer, sender profile, bank account, currency and dates of a draft request with no guessing · **Blocks:** T20 — Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press, T21 — Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction · **Wave:** 3 — second half of the resolver; completes the shared no-guessing guard.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to describe an invoice in one sentence, check the proposed draft, and create it with one press
> **So that** I get a ready-to-review Draft invoice without filling the editor by hand
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the AI to ask me when the customer or the bank account is unclear or an amount is missing
> **So that** no draft ever carries a value I did not give and the app does not set by default
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task finishes the no-guessing resolver: every line takes its quantity, unit and price from the Freelancer's words, the catalogue, the Customer's custom price, or a named default — and anything else becomes a question.

## Inlined context

> - for a line that matches a catalogue product in the invoice's currency and names no price, that product's price, or the Customer's custom price for it; the line stays linked to the product;
> - for a line that names an amount but no quantity, quantity 1; for a line that names no unit, the unit "item".
> - no tax, discount or shipping;
> - a system-assigned invoice number;
>
>   Every default used is named back to the Freelancer.
> - **Words win over the catalogue.** A price the Freelancer names is used even when a catalogue or custom price exists, and the card shows the catalogue or custom price beside it. A catalogue product in a different currency from the invoice is not linked. The line is free text, its catalogue price is not used, and the chat asks for a price when none was named.
> - **Matching names.** A Customer or catalogue product matches when its name contains the word the Freelancer used, ignoring case. Exactly one match is used … No match → … a free-text line that needs an amount (AC-22).
>
> — `spec.md §1, decisions "Defaults", "Words win", "Matching names", abridged` · full text: [spec.md](../spec.md)

> **When:** an incomplete or ambiguous draft request arrives in the chat or through MCP … **Then:** "100 % of incomplete or ambiguous draft requests in the evaluation set end in a question (chat) or a refusal (MCP); 0 drafts carry a value from neither the request nor the editor defaults". **How verify:** a contract test calls `resolveDraftRequest` directly with fixture requests for AC-12, AC-16–AC-22, AC-30 and AC-31. It asserts that every proposal value carries a source of `request` or `default`, and that every incomplete case returns `needs`.
>
> — `sad.md §10, QG-1 first scenario, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. (**Server-side card rows** — `propose_draft` stores the structured request, the resolved content and a content fingerprint as a Draft card …; the Create press … locks the card, re-resolves, compares fingerprints and creates in the same transaction.)
>
> — `adr/0007 §Decision outcome + Option 1, abridged` · full text: [ADR-0007](../adr/0007-store-draft-cards-server-side-and-create-only-from-a-create-server-action.md)

> **Hard rule:** Amounts are exact decimal strings from the read questions and the resolver, never converted between currencies.
>
> — `sad.md §8, Money and figures, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** The resolver emits `InvoiceFormInput`; origin is passed as a separate service argument.
>
> — `sad.md §11, risk row 10, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [openapi.yaml](../contracts/openapi.yaml) `DraftProposal` / `DraftIssue` · [ADR-0006](../adr/0006-resolve-every-assistant-draft-in-one-deterministic-service-shared-by-chat-and-mcp.md)) and follow it. Reuse the existing invoice calculation helpers for amounts and totals. Do not guess.

## Data delta

No DB changes. Reads (owner-scoped): `Product` (name contains, case-insensitive; price, currency, unit), `CustomPrice` (product × Customer).

## API contract

```ts
resolveDraftRequest(actor: ActingFreelancer, request: DraftRequest, today: LocalDate):
  Promise<ActionResult<{ kind: 'PROPOSAL'; proposal: DraftProposal } | { kind: 'ISSUES'; issues: DraftIssue[] }>>;
```
- `resolveDraftRequest` is pure apart from reads, and is shared by `propose_draft` and Create (ADR-0006).
- `DraftProposalLine { name, productId | null, quantity, unit, rate, amount, quantitySource REQUEST|DEFAULT, unitSource REQUEST|CATALOGUE|DEFAULT, rateSource REQUEST|CUSTOM_PRICE|CATALOGUE, agreedCustomPrice | null }`; `subtotal`; `total` (equal to subtotal: no tax, discount or shipping); `invoiceNumber: null` on a card; `defaultsUsed` = every field path whose source is DEFAULT.
- Line issues: `LINE_AMOUNT_MISSING {lineIndex, description}` (no quantity or price and no catalogue match), `LINE_PRICE_MISSING_IN_CURRENCY {lineIndex, currency}` (product with no price in the invoice currency and none named).
- Also: `toInvoiceFormInput(proposal)` for the create paths, and `fingerprintRequest(request)` — lower-case hex SHA-256 of the canonical (key-sorted, trimmed) request, used by repeat marks (ADR-0012) and card comparison.

— `contracts/server-actions.md §MCP adapter; openapi.yaml DraftProposal, DraftProposalLine, DraftIssue, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-12 — happy path

> **Given** a Freelancer whose default sender profile has a default bank account in USD, and a Customer named Acme Corp
> **When** they write in the chat "invoice Acme for 20 hours of consulting at $50"
> **Then** the chat shows a draft card with:
> - Customer Acme Corp;
> - one line of 20 × 50.00 USD = 1,000.00 USD;
> - the sender profile and the bank account, each named as the default used;
> - issue date today and due date in 30 days;
> - no tax, discount or shipping;
> - an invoice number to be assigned on creation;
> - a Create button.
>
> No draft exists yet.
>
> — `spec.md §5, AC-12, verbatim` · full text: [spec.md](../spec.md)

### AC-16 — cross-context

> **Given** a catalogue product "Consulting" priced 50 USD, with a custom price of 45 USD agreed with Acme Corp
> **When** the Freelancer writes "invoice Acme for 20 hours of consulting" without a price
> **Then** the draft card uses 45.00 USD per hour and names the custom price agreed with Acme Corp as its source
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

### AC-16b — cross-context

> **Given** the catalogue product "Consulting" from AC-16, priced only in USD
> **When** the Freelancer writes "invoice Acme for 20 hours of consulting at $60", or "invoice Acme for 20 hours of consulting in EUR"
> **Then** in the first case the card uses 60.00 USD, the price they named, keeps the line linked to "Consulting" and shows the agreed custom price of 45.00 USD beside it. In the second case the line is free text, not linked to the USD product. The chat asks for the EUR price and fills in no price of its own.
>
> — `spec.md §5, AC-16b, verbatim` · full text: [spec.md](../spec.md)

### AC-22 — error

> **Given** a Customer Acme Corp and no catalogue product matching "website"
> **When** the Freelancer writes "invoice Acme for the website"
> **Then** the chat asks for the amount — the quantity and the price — and fills in no value of its own
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Line resolution: product contains-match; same currency → link, price = named, else custom price for the Customer, else catalogue; other currency → free text, `LINE_PRICE_MISSING_IN_CURRENCY` if no named price; no match and no amount → `LINE_AMOUNT_MISSING`; quantity default 1 when an amount is named; unit = named, else product unit, else "item" — `lib/services/assistant-drafts/resolve-lines.ts`
- [ ] Compose `resolveParties` (T07) + lines → `DraftProposal` with `defaultsUsed`, subtotal = total; `toInvoiceFormInput` — `lib/services/assistant-drafts/resolve.ts`
- [ ] Canonical fingerprint — `lib/services/assistant-drafts/fingerprint.ts`
- [ ] Barrel export — `lib/services/assistant-drafts/index.ts`
- [ ] Contract test over the AC fixtures, plus "every value has a source" and "every incomplete case → ISSUES" sweeps — `tests/contract/assistant-draft-resolver.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| "20 hours of consulting at $50", no product | free-text line 20 × 50.00, `rateSource: REQUEST` |
| Product Consulting 50 USD + custom 45 USD for Acme, no price named | 45.00, `CUSTOM_PRICE`, linked (AC-16) |
| Same, "at $60" | 60.00, `REQUEST`, linked, `agreedCustomPrice: "45.00"` (AC-16b) |
| Same, "in EUR" | free text, `LINE_PRICE_MISSING_IN_CURRENCY` EUR (AC-16b) |
| "600 EUR for the logo design" | 1 (default) item (default) × 600.00 EUR (AC-19) |
| "for the website", no product | `LINE_AMOUNT_MISSING` (AC-22) |
| Two products match the line word | ask which (same rule as Customers) — a line issue naming both |
| Customer or parties issues plus line issues | all issues returned together |

## Definition of Done

- [ ] A contract test calls resolveDraftRequest with the AC-12, AC-16, AC-16b, AC-19 and AC-22 fixtures and asserts every proposal value carries a source, words win over catalogue and custom prices with agreedCustomPrice beside them, a product in another currency is not linked and yields LINE_PRICE_MISSING_IN_CURRENCY, a line with no amount yields LINE_AMOUNT_MISSING, and the canonical fingerprint is stable for equal requests.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
