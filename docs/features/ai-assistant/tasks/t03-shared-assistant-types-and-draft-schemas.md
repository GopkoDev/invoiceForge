---
id: T03
title: "Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas"
layer: "domain"
deps: []
blocks: ["T07", "T08", "T10", "T17"]
acs: ["AC-10", "AC-29", "AC-31"]
files_hint: ["types/result.ts", "types/assistant/types.ts", "lib/services/assistant-drafts/schema.ts", "lib/validations/assistant-chat.ts", "tests/unit/services/assistant-draft-schema.test.ts", "tests/unit/types/action-result-codes.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T03 — Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas

## Place in the sequence

- **Blocked by:** nothing — starts in wave 1 · **Blocks:** T07 — Resolve the Customer, sender profile, bank account, currency and dates of a draft request with no guessing, T08 — Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure, T10 — List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice, T17 — Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached · **Wave:** 1 — pure types and schemas that the resolver, counters and chat build on; no schema dependency.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant
> **I want** to create a Draft invoice for the Freelancer who gave me a key with Draft permission, under the same no-guessing rule as the chat
> **So that** Freelancers who use their own AI client get the same drafting as the chat
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task fixes the typed vocabulary both channels speak — the new result codes and the draft request, proposal and issue shapes — so refusals like AC-10, AC-29 and AC-31 have one representation.

## Inlined context

> ```ts
> export type ActionErrorCode =
>   | 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED' | 'RATE_LIMITED'
>   | 'FORBIDDEN';                                                                        // ★ known caller, no right (AC-29)
>
> type ActionErrorDetails =
>   | /* … existing kinds … */
>   | { kind: 'ALLOWANCE_USED_UP'; limit: 30; renewsAt: string; timeZone: string }        // ★ AC-10, AC-34
>   | { kind: 'DRAFT_ISSUES'; issues: DraftIssue[] }                                       // ★ AC-31, AC-17
>   | { kind: 'DRAFT_LIMIT_REACHED'; created: number; allowance: number; renewsAt: string }; // ★ AC-27
> ```
>
> Every exhaustive `switch` over `ActionErrorCode` or `details.kind` must handle the new members. `tasks` adds one task to find them. The web UI receives `ALLOWANCE_USED_UP` only. `FORBIDDEN`, `DRAFT_ISSUES` and `DRAFT_LIMIT_REACHED` reach only the MCP tool and the agent.
>
> — `contracts/server-actions.md §ActionResult changes, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> ```ts
> type DraftCardState = 'LIVE' | 'REPLACED' | 'OUTDATED' | 'CREATED';  // DraftCard.state
> type LinkedInvoiceState =                       // read when rendered, never stored (AC-36)
>   | { state: 'DRAFT'; invoiceId: string; invoiceNumber: string }
>   | { state: 'ISSUED'; invoiceId: string; invoiceNumber: string; status: InvoiceDisplayStatus }
>   | { state: 'UNAVAILABLE' };                   // deleted, or not this Freelancer's
> type DraftCardView = { id: string; state: DraftCardState; proposal: DraftProposal;
>   replacedById: string | null; invoice: LinkedInvoiceState | null };
> type ConversationSummary = { id: string; title: string; lastMessageAt: string };
> type ConversationMessageView = { id: string; role: 'user' | 'assistant'; parts: Array<
>     | { type: 'text'; text: string } | { type: 'data-link'; data: AppLink }
>     | { type: 'data-draft-card'; id: string; data: { cardId: string } }>; createdAt: string };
> ```
>
> — `contracts/server-actions.md §Shared types — types/assistant/types.ts, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **The model proposes, code decides** (ADR-0006, ADR-0007). The agent's only write-shaped tool, `propose_draft`, carries the request's own words as a strict structured request (Customer word or id, lines as stated, currency or symbol, dates, optional fields). It never carries resolved values.
>
> — `sad.md §4, strategic choice 4, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** zod 3.25 (a 4.x copy is also pulled in transitively). … Every new AI package (SDK, provider, UI hook) … must accept zod 3.25 schemas.
>
> — `sad.md §2, Technical, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md)) and follow it. Do not guess.

## Data delta

No DB changes. (The `DraftCard.request` / `proposal` JSONB shapes are these schemas; T01's factory switches to them.)

## API contract

Zod schemas mirroring `components.schemas`, one-to-one:
- `DraftRequest` — `customer` (1..200) **xor** `customerId` (RecordId); `senderProfile?` (1..200); `currency?` (1..8, code or symbol as written); `lines` 1..50 of `DraftRequestLine { description 1..200; quantity? ^\d{1,8}(\.\d{1,2})?$; unit? ≤20; price? same pattern }`; `issueDate?`, `dueDate?` (LocalDate); `notes?` ≤2000; `additionalProperties: false`.
- `DraftProposal` — `customer {customerId, name, source: REQUEST}`, `senderProfile {…, source REQUEST|DEFAULT}`, `bankAccount {bankAccountId, label, currency, source DEFAULT|REQUEST}`, `currency`, `issueDate`/`dueDate {value, source}`, `lines` 1..50 of `DraftProposalLine {name, productId|null, quantity, unit, rate, amount, quantitySource REQUEST|DEFAULT, unitSource REQUEST|CATALOGUE|DEFAULT, rateSource REQUEST|CUSTOM_PRICE|CATALOGUE, agreedCustomPrice|null}`, `subtotal`, `total`, `invoiceNumber: string|null`, `defaultsUsed: string[]`.
- `DraftIssue` — discriminated on `kind`: `NO_SENDER_PROFILE_WITH_ACCOUNT` · `DEFAULT_PROFILE_WITHOUT_ACCOUNT {defaultSenderProfileId, otherProfiles[]}` · `CUSTOMER_NOT_FOUND {written}` · `CUSTOMER_AMBIGUOUS|CUSTOMER_NEAR_MISS {written, candidates ≤50}` · `LINE_AMOUNT_MISSING {lineIndex, description}` · `LINE_PRICE_MISSING_IN_CURRENCY {lineIndex, currency}` · `CURRENCY_UNCLEAR|SENDER_PROFILE_NOT_FOUND {written, options[]}` · `NO_ACCOUNT_IN_CURRENCY {currency, senderProfileId}` · `SEVERAL_ACCOUNTS_IN_CURRENCY {currency, accounts[]}`.
- `AppLink` — `{kind: invoice, invoiceId, label}` | `{kind: page, page: AppPageKey, senderProfileId?}`; `AppPageKey` enum: `dashboard, invoices, new-invoice, customers, new-customer, products, sender-profiles, new-sender-profile, sender-profile-bank-accounts, settings-profile, settings-privacy, settings-assistants, ai`.
- `AllowanceState {limit: 30, used 0..30, left 0..30, renewsAt, timeZone}`; `ChatRequest {conversationId: RecordId|null, message {id 1..64, role: user, parts: [exactly one {type: text, text 1..2000}]}}`.

— `contracts/openapi.yaml §components.schemas DraftRequest…ChatRequest, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-10 — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today
> **When** they try to send another message
> **Then** the message is not processed; the chat says plainly that today's allowance is used up, when it renews in their own local time, and that an AI client connected through a Personal key is not affected — and their earlier Conversations stay readable
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — authorization

> **Given** a Personal key without Draft permission
> **When** its Assistant tries to create a draft
> **Then** the attempt is refused with an explanation that the key can only read and that the Freelancer can create a key with Draft permission; nothing is created
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — error

> **Given** a Personal key with Draft permission
> **When** the Assistant asks to create a draft for "Acme" while two Customers match, or with a line that has no quantity or price and matches no catalogue product
> **Then** the attempt is refused and the answer names what is ambiguous or missing (the matching Customers, or the line without an amount); nothing is created — the same rule the chat follows
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `FORBIDDEN` and the three detail kinds — `types/result.ts`
- [ ] Find every exhaustive `switch`/map over `ActionErrorCode` or `details.kind` (`grep -rn "case 'RATE_LIMITED'\|satisfies Record<ActionErrorCode" lib components app`) and handle the new members (HTTP status maps: `FORBIDDEN` → 403) — the files the grep finds
- [ ] Shared view types — `types/assistant/types.ts`
- [ ] Draft schemas (`DraftRequest`, `DraftProposal`, `DraftIssue`, `CreateDraftInvoiceInput` = request + `repeatKey?` 1..200) — `lib/services/assistant-drafts/schema.ts`
- [ ] Chat schemas (`ChatRequest` with trim-then-length on the text, `AppLink`, `AppPageKey`, `AllowanceState`) — `lib/validations/assistant-chat.ts`
- [ ] Unit tests: every openapi example parses; `customer` + `customerId` together fails; a 2,001-character text fails after trim; an extra property fails — `tests/unit/services/assistant-draft-schema.test.ts`, `tests/unit/types/action-result-codes.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Both `customer` and `customerId`, or neither | schema rejects |
| `quantity: "20.005"` or `"-1"` | schema rejects (pattern) |
| Message text of spaces only | rejected as empty after trim |
| `lines` of 51 items | schema rejects |
| A switch that only logs unknown codes | still add the cases — the compiler must keep it exhaustive |

## Definition of Done

- [ ] types/result.ts carries FORBIDDEN and the ALLOWANCE_USED_UP, DRAFT_ISSUES and DRAFT_LIMIT_REACHED detail kinds, every exhaustive switch over ActionErrorCode or details.kind handles them, and unit tests parse the openapi.yaml examples through the new zod schemas (DraftRequest, DraftProposal, DraftIssue, AppLink, AllowanceState, ChatRequest) and reject the documented invalid shapes.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
