---
id: T14
title: "Accept choice, origin and startedFrom in the chat request and run the press path in the chat route"
layer: "ports"
deps: ["T12", "T13"]
blocks: ["T15", "T20", "T22", "T29"]
acs: ["AC-08", "AC-08b", "AC-10", "AC-11", "AC-12b", "AC-29", "AC-36"]
files_hint: ["app/api/chat/route.ts", "lib/validations/assistant-chat.ts", "lib/ai/run-turn.ts", "tests/integration/ai-chat-v2-press.test.ts", "tests/contract/ai-chat-v2-chat-request.contract.test.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T14 — Accept choice, origin and startedFrom in the chat request and run the press path in the chat route

## Place in the sequence

- **Blocked by:** T12 — Check a pressed choice against the stored offer and claim or release it with the allowance slot, T13 — Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part
- **Blocks:** T15 — Prove the press safety properties: injection fixture, uniform refusals, concurrent claims, release on failure, metadata-only spans, T20 — Redesign the empty Conversation start with suggested requests and the composer move, and send the start point, T22 — Render Offered choices under a reply and send a press from the chat island, T29 — Extend the evaluation harness with explains and press fields, the own-profile-name setup and this feature's fixtures
- **Wave:** 6 (longest dependency chain); linear position T14 of T31 for the sequential in-place run.
- **Lane:** shares `lib/ai/run-turn.ts` with T01; `lib/ai/run-turn.ts` with T13 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to type a request on the dashboard, see my latest Conversations there, and create an invoice with AI from the dashboard's actions
> **So that** I can use the AI from the page I open first
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It makes a button press an ordinary counted message that refers to exactly the record pressed.

## Inlined context

> session → body (`chatRequestSchema`) → Conversation owner check → `checkChoice` → reserve the slot and `claimOffer` in one transaction (claim `false` → release the slot, 409) → pin + resolve → agent turn → `saveTurn` with `userOrigin = 'PRESSED'`. `COULD_NOT_COMPLETE` / `AI_UNAVAILABLE` → release the slot and `releaseOffer` together.
>
> — `contracts/server-actions.md §Route order for a press, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> 2. **Body** — `400 VALIDATION`: the parent rules, plus the field combinations in ChatRequest
>    (a `choice` needs a `conversationId`; `origin`/`startedFrom` only on a new Conversation and only
>    together for the dashboard prompt; `choice` and `origin` never together).
> …
> 4. **Choice** … Any failure → `409 CONFLICT` + `CHOICE_UNAVAILABLE`, the same words for every
>    cause … Checked before the allowance, so an invalid press is refused as unavailable even when the
>    allowance is used up (ADR-0003 Neutral).
> 5. **Allowance** — the parent `429 RATE_LIMITED` + `ALLOWANCE_USED_UP` (a valid press with no slot
>    left claims nothing, AC-11) and `503 FAILED`.
>
> — `contracts/openapi.yaml, sendChatMessage check order, abridged` · full text: `contracts/openapi.yaml,`

> The Freelancer message is saved with the offer's **stored label** as its text and origin `PRESSED` — the request's `message.parts[0].text` is ignored.
>
> — `contracts/openapi.yaml, sendChatMessage «A valid press», verbatim` · full text: `contracts/openapi.yaml,`

> Message origin and Conversation start point are enum columns. They are set by the server: `PRESSED` only from a valid choice; `DASHBOARD` and the start point from the request's `origin` / `startedFrom`, validated against an enum and accepted only on a Conversation's first message. A forged value can only mislabel the Freelancer's own data.
>
> — `sad.md §5, building-block decisions, verbatim` · full text: [sad.md](../sad.md)

> A press while a turn in the same Conversation is still running → expected: serialized by the Conversation lock. At most one claim succeeds.
> A typed message that repeats a button's label → expected: treated as typed text and matched by name, never as a press (origin typed).
> A request body claiming `origin: DASHBOARD` on a message that is not a Conversation's first → expected: ignored. The origin is set by the server.
>
> — `test-plan.md §Edge cases, verbatim` · full text: [test-plan.md](../test-plan.md)

> **Hard rule:** an invalid press never reaches the model, is never counted, and marks nothing (spec §1 "A press that cannot be applied is turned down before it is processed").
>
> — `spec.md §1, interview decisions, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No schema change. Writes through T11/T12: `MessageAllowanceDay` (reserve/release), `ChoiceOffer` (claim/release), `ConversationMessage` (`origin = PRESSED`, label text), `Conversation.startedFrom`.

— `data-model.md §ChoiceOffer access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `POST /api/chat` (`sendChatMessage`): request `ChatRequest` + `choice?: { offerId, optionId }`, `origin?: 'DASHBOARD'`, `startedFrom?: ConversationStartPoint`.
- Errors: `400 VALIDATION` (combinations, e.g. "A choice can only be sent in a saved conversation."), `401` (proxy), `404 NOT_FOUND`, `409 CONFLICT` + `CHOICE_UNAVAILABLE` "This option is no longer available. Choose again or type your request.", `429 RATE_LIMITED` + `ALLOWANCE_USED_UP`, `503 FAILED`.
- `200`: the parent stream + `data-offer`.

— `contracts/openapi.yaml, operationId sendChatMessage, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

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

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two buttons
> **When** the Freelancer presses the second button
> **Then** each button also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they pressed, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a Freelancer with one message left today and a reply offering two buttons
> **When** they press a button, and then press an Offered choice in the chat's next reply
> **Then** the first press is sent and counts as a message; the second is not processed, no option of that reply is marked as chosen, and the chat says today's allowance is used up and when it renews, exactly as for a typed message
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-12b — authorization

> **Given** a Conversation whose latest reply offered Acme Corp and Acme GmbH
> **When** a message arrives presented as a pressed option for a record that is not among that reply's Offered choices — an option from an older reply, or a Customer of another Freelancer
> **Then** it is never applied as a choice and never reaches the model; it does not count toward the allowance, and the chat says that this option is no longer available, in the same words whether the option was outdated, belongs to another Freelancer or never existed; the draft never moves toward that record
>
> — `spec.md §5, AC-12b, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — happy path

> **Given** a Freelancer on the dashboard with messages left today
> **When** they type "who owes me money?" into the dashboard's prompt box and send it
> **Then** the AI section opens on a new Conversation in which that message is already sent and the reply is being written; the message counts toward the allowance once
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

### AC-36 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or the dashboard's prompt box
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Extend `chatRequestSchema` with `choice`, `origin`, `startedFrom` and the combination refinements — `lib/validations/assistant-chat.ts`
- [ ] Route: after the owner check, `checkChoice` → 409 on `{ ok: false }`; reserve+claim; `pinChoice` on the offer's stored request and `resolveDraftRequest`; `runTurn({ pinned })` (T01 seam); `saveTurn` with the stored label and `PRESSED`; on `COULD_NOT_COMPLETE` / `AI_UNAVAILABLE` release slot + claim — `app/api/chat/route.ts`
- [ ] Typed / dashboard path: `userOrigin` from the validated `origin` only on a new Conversation, else `TYPED`; `startedFrom` only when `conversationId` is null — same file
- [ ] Integration (scripted model, call count asserted): AC-08 press to card; AC-08b Customer → account → card, two slots; AC-10 Cyrillic look-alike pinned by id; AC-11 29 used: press counts, next press 429 and offer stays open, one model call; AC-12b older/foreign/never-existed → same 409 body, 0 calls, 0 slots; AC-29 dashboard first message origin + start point, one slot; AC-36 no session → nothing runs — `tests/integration/ai-chat-v2-press.test.ts`
- [ ] Contract: request examples and refusal body against openapi — `tests/contract/ai-chat-v2-chat-request.contract.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `choice` without `conversationId` | `400 VALIDATION` |
| `choice` and `origin` together | `400 VALIDATION` |
| Malformed `offerId` or non-integer `optionId` | `400`, nothing counted, no model call |
| Free text in a press's message part | Ignored; the saved message is the stored label |
| Invalid press with the allowance used up | `409` unavailable (checked before the allowance) |
| Claim lost to a concurrent press | `409`, the slot released |
| Provider failure after the claim | Slot and claim released; metadata only |

## Definition of Done

- [ ] The chat route validates the new field combinations, refuses an invalid press with the one 409 CHOICE_UNAVAILABLE body before any reservation or model call, reserves and claims a valid press in one transaction, runs the turn from the pinned resolution, saves the stored label with origin PRESSED, releases slot and claim on a system-side failure, and sets DASHBOARD origin and startedFrom only on a new Conversation, proven by integration and contract tests.
- [ ] integration + contract tests green on a throwaway database
- [ ] the scripted model's call count is 0 for every refused press
- [ ] existing ai-assistant chat-route tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
