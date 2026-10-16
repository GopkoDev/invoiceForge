---
id: T28
title: "Build the DraftCard component in every SCR-03 state and wire Create to createDraftFromCard"
layer: "ui"
deps: ["T20", "T23"]
blocks: ["T35"]
acs: ["AC-11c", "AC-12", "AC-13", "AC-14", "AC-14b", "AC-16", "AC-16b", "AC-18", "AC-19"]
files_hint: ["components/ai/draft-card.tsx", "components/ai/message-list.tsx", "docs/design-system.md", "tests/component/draft-card.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T28 — Build the DraftCard component in every SCR-03 state and wire Create to createDraftFromCard

## Place in the sequence

- **Blocked by:** T20 — Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press, T23 — Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton · **Blocks:** T35 — Add Playwright flows: open the AI section, draft and create from a card, Create with AI, and the Assistant mark · **Wave:** 5 — needs the Create action and the message list it renders in.
- **Lane:** shares `components/ai/message-list.tsx` with T23; shares `docs/design-system.md` with T19, T22, T23 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to describe an invoice in one sentence, check the proposed draft, and create it with one press
> **So that** I get a ready-to-review Draft invoice without filling the editor by hand
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task is the card the Freelancer checks before anything exists: every value with where it came from, one Create button, and an honest state when the card was replaced, outdated or already used.

## Inlined context

**SCR-03 — Draft card (inline in SCR-02).** Rendered for every `data-draft-card` part from its `DraftCardView`. Create calls `createDraftFromCard(cardId)`: never a message, never counted, works with the allowance used up (AC-11c).

**Card content** (AC-12, AC-16, AC-16b, AC-19), from `DraftProposal`:
- **Customer:** `customer.name`.
- **From:** `senderProfile.name`, with "(default)" when `source = DEFAULT`, or "(you named it)" when `REQUEST` (AC-17).
- **Bank account:** `bankAccount.label` · `currency`, with "(default)" or "(matches the currency you asked for)" when `source = REQUEST` (AC-19).
- **Issue date / Due date:** the day, with "(today, default)" / "(in 30 days, default)" when `source = DEFAULT`.
- **Lines:** "{name}  {quantity} {unit} × {rate} = {amount} {currency}". Under each line, the price source: `REQUEST` → "Price you named"; `CUSTOM_PRICE` → "Custom price agreed with {Customer}"; `CATALOGUE` → "Price from your product {name}". With `agreedCustomPrice` → also "Agreed custom price: {value} {currency}" (AC-16b). `productId = null` → "Not linked to a product". `quantitySource` / `unitSource` `DEFAULT` → "(default)" after the quantity or unit (AC-19).
- **Total:** `total` {currency}, then "No tax, discount or shipping. The invoice number is assigned when the draft is created." (AC-12).
- **Defaults used:** "Defaults used: {list}" from `defaultsUsed`, in plain words (sender profile, bank account, issue date, due date, quantity, unit). Hidden when empty.

| State | Trigger / condition | Components |
|---|---|---|
| loading | A card just streamed whose `DraftCardView` has not arrived yet (OQ-S1): a card-sized `Skeleton` | `Skeleton` |
| live | `state = LIVE`. Full content and "Create draft". No draft exists yet | `Card`, `Separator`, `Badge`, `Button` |
| creating | Create pressed: `Spinner` in the button, the button disabled; a second press cannot fire | `Spinner` |
| created | `CREATED`, or `ALREADY_CREATED` with a `DRAFT` invoice, or `state = CREATED` on load. `Badge` "Created"; the button becomes "Draft {invoiceNumber} created." with `ChatLink` "Open draft →"; nothing is issued or sent | `Badge`, `ChatLink` |
| created, issued since | `ISSUED` invoice (AC-36): "Invoice {invoiceNumber}" + `InvoiceStatusBadge` | `ChatLink`, `InvoiceStatusBadge` |
| created, deleted since | `UNAVAILABLE` (AC-36): "This draft is no longer available." No link | `ChatLink` |
| replaced | `REPLACED` result, or `state = REPLACED` on load (AC-14b). Body collapses to the Customer and total, dimmed; `Badge` "Replaced"; "A newer card replaced this one." with "Go to the newer card ↓" (scrolls to `replacedById` / `newerCardId`). No Create | `Badge`, `Button` (link) |
| outdated | `OUTDATED` result (AC-18), or `state = OUTDATED` with a `replacedById` on load. Collapses like `replaced` with `Badge` "Outdated" and "Something changed since this card was made: a price, the Customer, the sender profile, the bank account or the date. Check the updated card below." The updated `LIVE` card renders directly under it | `Badge`, `DraftCard` |
| needs-answers | `NEEDS_ANSWERS` result (OQ-A1). Collapses with `Badge` "Outdated" and one line per `DraftIssue` in fixed copy (e.g. `CUSTOMER_NOT_FOUND` → "{written} is no longer among your Customers."; `NO_SENDER_PROFILE_WITH_ACCOUNT` → "You need a sender profile with a bank account."), then "Nothing was created. Ask again in the chat." On load (`OUTDATED`, no `replacedById`) only "This card is out of date and can't be created. Ask again in the chat." | `Badge`, `Alert` |
| at zero allowance | Messages used up with a live card on screen (AC-11c): exactly `live`; Create works | — |
| not-found | `NOT_FOUND`: `toast.error` "This draft card is no longer available." verbatim; `replaced`-style dimming without a link | `Sonner` |
| create-failed | `FAILED`: `toast.error` "The draft couldn't be created. Try again." verbatim; the card stays `live` | `Sonner` |
| rejected | `UNAUTHORIZED` or a rejected call → `goToSignIn()` | — |

— `screens.md §SCR-03, abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) SCR-03 wireframes · [server-actions.md](../contracts/server-actions.md) §createDraftFromCard) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Props: `card: DraftCardView` (`{ id, state, proposal: DraftProposal, replacedById, invoice: LinkedInvoiceState | null }`), `onCreate(cardId)`.
- `createDraftFromCard(cardId)` → `ok({ kind: 'CREATED' | 'ALREADY_CREATED' | 'REPLACED' | 'OUTDATED' | 'NEEDS_ANSWERS', … })` · `fail('NOT_FOUND', 'This draft card is no longer available.')` · `fail('FAILED', "The draft couldn't be created. Try again.")`.

— `contracts/server-actions.md §Shared types, §createDraftFromCard, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-11c — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today, with a draft card on screen
> **When** they press Create on that card
> **Then** the Draft invoice is created as in AC-13, because a Create press is not a message
>
> — `spec.md §5, AC-11c, verbatim` · full text: [spec.md](../spec.md)

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

### AC-13 — happy path

> **Given** the draft card from AC-12
> **When** the Freelancer presses Create
> **Then** a Draft invoice exists with exactly the card's content and a system-assigned invoice number, and the chat answers with a link that opens it in the editor; nothing is issued or sent
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — domain invariant

> **Given** a draft card that was already used to create a draft
> **When** the Freelancer presses Create again, or the page reconnects and repeats the press
> **Then** no second draft is created and the chat shows the link to the draft created the first time
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

### AC-14b — domain invariant

> **Given** a draft card for 20 hours, after which the Freelancer wrote "make it 25 hours" and got a new card
> **When** they press Create on the first card
> **Then** nothing is created; the first card shows that it was replaced and points to the newer card, which is the only one that can create a draft
>
> — `spec.md §5, AC-14b, verbatim` · full text: [spec.md](../spec.md)

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

### AC-18 — cross-context

> **Given** a draft card on screen, and the Freelancer then changes Acme Corp's custom price in another tab
> **When** they press Create on the old card
> **Then** no draft is created from the outdated card; the chat shows an updated card with the new price and asks them to confirm again, so a draft never differs from the card they confirmed. At every Create press the card is rebuilt from the same request and the current data. If any value differs, the card is outdated: a price, the Customer (renamed or gone), the sender profile or bank account, or "today" in the Freelancer time zone, such as a card from a Conversation reopened on a later day. A card never goes out of date because of time alone.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — domain invariant

> **Given** a Freelancer whose default bank account is in USD and who also has a bank account in EUR
> **When** they write "invoice Acme 600 EUR for the logo design"
> **Then** the draft card uses the EUR bank account and names it, because an invoice and its bank account share one currency. The card has one line "Logo design" of 1 item × 600.00 EUR, and names quantity 1 and the unit "item" as defaults used. If the default sender profile has several EUR bank accounts, the chat asks which one to use before showing a card. If it has no EUR bank account, the chat says so and links to adding one, instead of producing a card in a different currency.
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `DraftCard` component: content rules, every state, Create guarded against a double fire, successor rendered under an `OUTDATED` card — `components/ai/draft-card.tsx`
- [ ] Plug it into the card slot of the message list (with the `cards` map from `getConversation`; `loading` until present) — `components/ai/message-list.tsx`
- [ ] Register `DraftCard` in the design canon — `docs/design-system.md`
- [ ] Component tests for every state and the AC-12 / AC-16 / AC-16b / AC-19 line wording — `tests/component/draft-card.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Two fast clicks on Create | one call |
| `OUTDATED` result | old card collapses; the returned card renders below as `live` |
| `ALREADY_CREATED` with `UNAVAILABLE` | "This draft is no longer available." |
| Phone width | label/value pairs stack; the button is full width |
| `defaultsUsed` empty | line hidden |

## Definition of Done

- [ ] Component tests render SCR-03 loading, live (every source label of AC-12, AC-16, AC-16b, AC-19), creating, created, created issued since, created deleted since, replaced, outdated with its successor, needs-answers, not-found and create-failed, and show Create fires createDraftFromCard once and works with the allowance used up.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
