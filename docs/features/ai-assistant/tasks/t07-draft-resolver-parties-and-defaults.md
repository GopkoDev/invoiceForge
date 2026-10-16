---
id: T07
title: "Resolve the Customer, sender profile, bank account, currency and dates of a draft request with no guessing"
layer: "app"
deps: ["T03"]
blocks: ["T16"]
acs: ["AC-17", "AC-19", "AC-20", "AC-21"]
files_hint: ["lib/services/assistant-drafts/resolve-parties.ts", "lib/services/assistant-drafts/currency-symbols.ts", "tests/unit/services/assistant-drafts/currency-symbols.test.ts", "tests/integration/services/assistant-drafts/resolve-parties.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T07 — Resolve the Customer, sender profile, bank account, currency and dates of a draft request with no guessing

## Place in the sequence

- **Blocked by:** T03 — Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas · **Blocks:** T16 — Resolve draft lines against the catalogue and custom prices, apply the quantity and unit defaults and finish resolveDraftRequest · **Wave:** 2 — first half of the deterministic resolver (ADR-0006); reads existing tables only.
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

This task delivers the "asked, never guessed" half of the resolver for everything except the lines: which Customer, which sender profile and bank account, which currency and which dates — each either named in the request, an editor default, or an issue.

## Inlined context

> One deterministic service, `resolveDraftRequest(actor, request)` in `lib/services/assistant-drafts/`, does all the work: name matching, currency-symbol rules, catalogue and custom prices, the editor's new-invoice defaults, and the no-guessing guard. It returns either questions or refusals, or a proposal whose every value names its source.
>
> — `sad.md §4, strategic choice 4, abridged` · full text: [sad.md](../sad.md)

> - **Defaults the draft may take without asking:**
>   - the default sender profile and its default bank account, which also sets the currency when the request names none;
>   - when the request names a different currency, the default sender profile's one bank account in that currency (several such accounts → the Freelancer is asked which; none → the Freelancer is told);
>   - issue date today in the Freelancer time zone, due 30 days later;
> - **Matching names.** A Customer or catalogue product matches when its name contains the word the Freelancer used, ignoring case. Exactly one match is used, and the card shows its full name. Several matches → the Freelancer is asked which one. No match → no Customer (AC-21) … A near miss such as a typo may be offered as a question ("did you mean Acme Corp?") but is never filled in. An external Assistant may name the exact Customer or product it found through the read questions instead of a name.
> - **Currency symbols.** "$" means USD, "€" EUR and "£" GBP. When the default bank account is in another dollar currency (such as CAD or AUD), "$" is ambiguous and the Freelancer is asked which currency they mean.
>
> — `spec.md §1, decisions "Defaults", "Matching names", "Currency symbols", abridged` · full text: [spec.md](../spec.md)

> **Chosen:** Option 1. Only deterministic code can prove "no value from neither the request nor the defaults", and one service is the same rule for the chat and for MCP.
>
> — `adr/0006 §Decision outcome, abridged` · full text: [ADR-0006](../adr/0006-resolve-every-assistant-draft-in-one-deterministic-service-shared-by-chat-and-mcp.md)

> **Hard rule:** Every read and write goes through a service as the `ActingFreelancer`, scoped by owner in the `WHERE` clause. The agent's tools receive the actor bound by the route, never an id from the model.
>
> — `sad.md §8, Authorization and tenancy, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** "Today", day boundaries and allowance days use the Freelancer time zone saved on the account (UTC until saved); invoice dates are calendar days.
>
> — `sad.md §8, Time, verbatim` · full text: [sad.md](../sad.md)

Sad §6 flow 6 branches this half covers: no sender profile with a bank account → issue; default profile has no bank account but another has → issue naming the others, never picks; no Customer → issue; several Customers → issue naming each; currency unclear, no account in it, or several → issue.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) §6 flow 6 · [openapi.yaml](../contracts/openapi.yaml) `DraftIssue`) and follow it. Reuse the editor's own defaults from `lib/services/invoices/editor-data.ts` (`newInvoiceDefaults`, a private function at `editor-data.ts:118` today — export it rather than duplicate it).

## Data delta

No DB changes. Reads (owner-scoped): `Customer` (name contains, case-insensitive), `SenderProfile` (`isDefault`, name), `BankAccount` (per profile, `currency`, default flag), `User.timeZone`.

## API contract

`resolveParties(actor, request: DraftRequest, today: LocalDate)` → `{ ok: true; parties: { customer, senderProfile, bankAccount, currency, issueDate, dueDate } } | { ok: false; issues: DraftIssue[] }` (internal; T16 composes it into `resolveDraftRequest`). Issues it may return: `NO_SENDER_PROFILE_WITH_ACCOUNT`, `DEFAULT_PROFILE_WITHOUT_ACCOUNT {defaultSenderProfileId, otherProfiles}`, `SENDER_PROFILE_NOT_FOUND {written, options}`, `CUSTOMER_NOT_FOUND {written}`, `CUSTOMER_AMBIGUOUS | CUSTOMER_NEAR_MISS {written, candidates ≤ 50}`, `CURRENCY_UNCLEAR {written, options}`, `NO_ACCOUNT_IN_CURRENCY {currency, senderProfileId}`, `SEVERAL_ACCOUNTS_IN_CURRENCY {currency, accounts}`. Sources: customer `REQUEST`; senderProfile `REQUEST | DEFAULT`; bankAccount `DEFAULT | REQUEST` (REQUEST when the request's currency picked it); dates `REQUEST | DEFAULT`.

— `contracts/openapi.yaml §DraftIssue, DraftProposal; server-actions.md §MCP adapter resolveDraftRequest, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-17 — cross-context

> **Given** a Freelancer who has no sender profile, or whose sender profiles have no bank account
> **When** they ask the chat to draft an invoice
> **Then** the chat explains that a sender profile with a bank account is needed before any invoice can be drafted and links to where they set one up; no draft card is shown. When only the default sender profile lacks a bank account and another profile has one, the chat says so, links to adding an account to the default profile, and offers to draft under another profile if the Freelancer names it. It never picks the other profile itself. An external Assistant is refused with the same explanation.
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-19 — domain invariant

> **Given** a Freelancer whose default bank account is in USD and who also has a bank account in EUR
> **When** they write "invoice Acme 600 EUR for the logo design"
> **Then** the draft card uses the EUR bank account and names it, because an invoice and its bank account share one currency. The card has one line "Logo design" of 1 item × 600.00 EUR, and names quantity 1 and the unit "item" as defaults used. If the default sender profile has several EUR bank accounts, the chat asks which one to use before showing a card. If it has no EUR bank account, the chat says so and links to adding one, instead of producing a card in a different currency.
>
> — `spec.md §5, AC-19, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — error

> **Given** a Freelancer with two Customers, Acme Corp and Acme GmbH
> **When** they write "invoice Acme for 20 hours at $50"
> **Then** the chat asks which of the two Customers they mean, naming both, and shows no draft card until one is chosen
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-21 — error

> **Given** a Freelancer with no Customer matching "Globex"
> **When** they write "invoice Globex for 3 days at 450 USD a day"
> **Then** the chat says there is no Customer called Globex and links to the form for adding a Customer; it creates no Customer and shows no draft card
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Symbol table and the dollar-ambiguity rule (`$` vs CAD/AUD default account) — `lib/services/assistant-drafts/currency-symbols.ts`
- [ ] Customer by `customerId` (owner-scoped; foreign id = not found) or by contains-match; near miss only as `CUSTOMER_NEAR_MISS` — `lib/services/assistant-drafts/resolve-parties.ts`
- [ ] Sender profile: named → match or `SENDER_PROFILE_NOT_FOUND`; absent → default; default without account and others with → `DEFAULT_PROFILE_WITHOUT_ACCOUNT`; none with account → `NO_SENDER_PROFILE_WITH_ACCOUNT` — same file
- [ ] Bank account and currency: no currency → default account; named currency → the profile's one account in it, else `NO_ACCOUNT_IN_CURRENCY` / `SEVERAL_ACCOUNTS_IN_CURRENCY` — same file
- [ ] Dates: request dates else today (Freelancer time zone) and +30 days — same file
- [ ] Tests for AC-17, AC-19, AC-20, AC-21, `$` with a CAD default, `£`, a foreign `customerId` — `tests/unit/services/assistant-drafts/currency-symbols.test.ts`, `tests/integration/services/assistant-drafts/resolve-parties.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Customer `customerId` of another Freelancer | `CUSTOMER_NOT_FOUND`, same as unknown (AC-40 spirit) |
| "Acme" matches Acme Corp and Acme GmbH | `CUSTOMER_AMBIGUOUS` naming both (AC-20) |
| "Acmee" — no contains-match, one close name | `CUSTOMER_NEAR_MISS`, never filled in |
| No sender profile at all, or none with an account | `NO_SENDER_PROFILE_WITH_ACCOUNT` (AC-17) |
| Default profile without account, another with | `DEFAULT_PROFILE_WITHOUT_ACCOUNT` + others; never picks one (AC-17) |
| "600 EUR", default USD, one EUR account | EUR account, `source: REQUEST` (AC-19) |
| Several EUR accounts / none | `SEVERAL_ACCOUNTS_IN_CURRENCY` / `NO_ACCOUNT_IN_CURRENCY` (AC-19) |
| "$" with a CAD default account | `CURRENCY_UNCLEAR` |
| Several issues at once | all returned, in request order |

## Definition of Done

- [ ] Unit and integration tests drive resolveParties with the AC-17, AC-19, AC-20 and AC-21 fixtures plus the currency-symbol cases and assert each returns the named DraftIssue (never a picked value) or a party block whose every value carries source REQUEST or DEFAULT, using only the acting Freelancer's rows.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
