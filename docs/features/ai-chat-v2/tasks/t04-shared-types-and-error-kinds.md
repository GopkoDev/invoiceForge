---
id: T04
title: "Add the offer, origin and start-point types and the CHOICE_UNAVAILABLE and ALREADY_ISSUED error details"
layer: "domain"
deps: []
blocks: ["T10", "T16"]
acs: ["AC-12b", "AC-26"]
files_hint: ["types/result.ts", "types/assistant/types.ts", "tests/unit/action-error-details.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T04 — Add the offer, origin and start-point types and the CHOICE_UNAVAILABLE and ALREADY_ISSUED error details

## Place in the sequence

- **Blocked by:** nothing (can start first)
- **Blocks:** T10 — Build Offered choices from resolver issues and pin a chosen option into a draft request, T16 — Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path
- **Wave:** 1 (longest dependency chain); linear position T04 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to issue a draft from its preview after one confirmation, under the editor's rules
> **So that** checking and issuing an Assistant draft is one short step where I created it
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

It defines once the shapes every press and issue result is built from, including the one uniform "no longer available" sentence.

## Inlined context

> `ActionErrorCode` is unchanged. `ActionErrorDetails` gains two kinds:
> ```ts
>   | { kind: 'CHOICE_UNAVAILABLE' }                                   // ★ 409 on /api/chat (AC-12b, AC-13)
>   | { kind: 'ALREADY_ISSUED'; invoice: LinkedInvoiceState };         // ★ issueFromPreview (AC-26)
> ```
> `CHANGED_ELSEWHERE` (invoice-integrity) is reused as is for the outdated preview (AC-26b); no new kind. Every exhaustive `switch` over `details.kind` must handle the new members (`tasks` adds one task to find them).
>
> — `contracts/server-actions.md §ActionResult changes, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> ```ts
> type ChoiceOfferKind = 'CUSTOMER' | 'SENDER_PROFILE' | 'CURRENCY' | 'BANK_ACCOUNT' | 'PRODUCT';
> type ChoiceOfferState = 'OPEN' | 'CHOSEN' | 'CLOSED';
> type MessageOrigin = 'TYPED' | 'PRESSED' | 'DASHBOARD';
> type ConversationStartPoint = 'AI_SECTION' | 'INVOICE_LIST' | 'DASHBOARD_PROMPT' | 'DASHBOARD_CREATE';
> type OfferView = { offerId: string; kind: ChoiceOfferKind; state: ChoiceOfferState;
>   chosenOptionId: number | null; options: Array<{ optionId: number; label: string }> }; // 1..8
> // ConversationMessageView gains origin: MessageOrigin | null and the part
> //   { type: 'data-offer'; id: string; data: { offerId: string } }
> ```
>
> — `contracts/server-actions.md §Shared types, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> error: "This option is no longer available. Choose again or type your request."
> details: { kind: CHOICE_UNAVAILABLE }
>
> — `contracts/openapi.yaml, sendChatMessage 409 example, verbatim` · full text: `contracts/openapi.yaml,`

> **Compile-coupled rule:** this is a shared union in strict TypeScript; the task is green on its own only because it also updates every exhaustive switch in the same commit.
>
> — `sdd tasks skill, contract-task rule, abridged` · full text: `sdd`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `ActionErrorDetails` += `{ kind: 'CHOICE_UNAVAILABLE' }`, `{ kind: 'ALREADY_ISSUED'; invoice: LinkedInvoiceState }`.
- Shared types `ChoiceOfferKind`, `ChoiceOfferState`, `MessageOrigin`, `ConversationStartPoint`, `OfferView`; `ConversationMessageView.origin` and the `data-offer` part.

— `contracts/server-actions.md §ActionResult changes + §Shared types, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-12b — authorization

> **Given** a Conversation whose latest reply offered Acme Corp and Acme GmbH
> **When** a message arrives presented as a pressed option for a record that is not among that reply's Offered choices — an option from an older reply, or a Customer of another Freelancer
> **Then** it is never applied as a choice and never reaches the model; it does not count toward the allowance, and the chat says that this option is no longer available, in the same words whether the option was outdated, belongs to another Freelancer or never existed; the draft never moves toward that record
>
> — `spec.md §5, AC-12b, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — domain invariant

> **Given** a preview opened on a draft, after which the draft was issued from the editor in another tab
> **When** the Freelancer presses Issue in the chat's preview and confirms
> **Then** nothing is issued again; the panel and the card show the invoice as already issued
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add the two `ActionErrorDetails` members and export `CHOICE_UNAVAILABLE_MESSAGE` — `types/result.ts`
- [ ] Add the shared assistant types, `origin` on `ConversationMessageView`, and the `data-offer` part type — `types/assistant/types.ts`
- [ ] `grep -rn "details.kind\|details?.kind"` over `lib/`, `components/`, `app/`: make every exhaustive switch handle the new kinds (or prove it is non-exhaustive)
- [ ] Unit test: the constant equals the contract sentence; a type-level test that `OfferView.options` is the label/optionId pair only (no `ref`) — `tests/unit/action-error-details.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| A switch with a `default` branch | Still compiles; check that the default is the right behaviour for the new kinds |
| `OfferView` sent to the browser | Carries no record reference and no stored request (only `optionId` + `label`) |

## Definition of Done

- [ ] types/result.ts and types/assistant/types.ts export the new kinds and types, every exhaustive switch over ActionErrorDetails.kind handles CHOICE_UNAVAILABLE and ALREADY_ISSUED, the fixed unavailable sentence is one exported constant, and typecheck passes.
- [ ] typecheck passes with no `never` exhaustiveness errors
- [ ] unit test green
- [ ] lint clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
