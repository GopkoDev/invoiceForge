---
id: T31
title: "Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure"
layer: "ports"
deps: ["T08", "T25", "T29"]
blocks: ["T33", "T34"]
acs: ["AC-06", "AC-09", "AC-10", "AC-10b", "AC-11", "AC-42"]
files_hint: ["app/api/chat/route.ts", "lib/ai/stream.ts", "tests/integration/api/chat-route.test.ts", "tests/unit/proxy.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T31 — Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure

## Place in the sequence

- **Blocked by:** T08 — Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure, T25 — Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations, T29 — Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls · **Blocks:** T33 — Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live, T34 — Prove provider-fault handling, the stored-text injection guard and cross-tenant silence through the chat route · **Wave:** 7 — critical flow 1 end to end; every chat UI task reads this stream.
- **Lane:** shares `app/api/chat/route.ts` with T34; shares `tests/unit/proxy.test.ts` with T18 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to help with my own data, my drafts and finding things in the app, and to tell me briefly when something is outside that
> **So that** I know what it is for and never mistake it for tax or legal advice
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the chat to see only my own data and only while I am signed in
> **So that** no one else's data reaches me and no one reaches mine through it
>
> — `spec.md §4, US-13, verbatim` · full text: [spec.md](../spec.md)

This task is the chat's front door: it checks the session, the message, the Conversation and the allowance in a fixed order, streams the reply, saves what the Freelancer saw and gives the slot back when the system fails.

## Inlined context

> One message per request. The checks run in this order (sad.md critical flow 1, flow 5); every refusal before the stream is a JSON `ActionFailure` and nothing is counted:
> 1. **Session** — the proxy refuses an anonymous request with `401` before the handler runs (AC-42).
> 2. **Body** — `400 VALIDATION` for a malformed body, an empty message, or a message over 2,000 characters after trimming.
> 3. **Conversation** — a `conversationId` that is unknown or another Freelancer's answers `404 NOT_FOUND`, worded exactly alike (AC-41). `null` starts a new Conversation, created by the server when the turn is saved.
> 4. **Allowance** — one slot of today's Daily message allowance is reserved with a conditional increment (ADR-0009). None left, including the second of two simultaneous sends for the last slot → `429 RATE_LIMITED` with `AllowanceUsedUpDetails` (AC-10, AC-10b). The reservation cannot be written → `503 FAILED`, fail closed.
>
> Then `200` and the stream. The turn's outcome is the last data part (`data-outcome`):
> - `ANSWERED` — a reply, counted (AC-09). Off-topic refusals (AC-06), mixed messages (AC-06b), questions instead of a card (AC-20..AC-22), "only you can issue" (AC-24) are all `ANSWERED`.
> - `PARTIAL` — the 8-step cap ended the turn: the part found plus "too broad", counted (AC-11b).
> - `COULD_NOT_COMPLETE` — a system-side failure before the reply completed: the slot is released, not counted (AC-11). Text already streamed is discarded by the UI.
> - `AI_UNAVAILABLE` — the model provider failed or rate-limited the call: the slot is released, not counted, shown within 10 s. The rest of the app is unaffected.
>
> Only visible content is saved (ADR-0008) … A turn that ends `COULD_NOT_COMPLETE` or `AI_UNAVAILABLE` saves nothing but its metadata row. Not idempotency-keyed: a retry is a new message.
>
> — `contracts/openapi.yaml §/api/chat post description, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Chosen:** Option 1. It reuses the app's page model, gives `useChat`'s tested streaming, stop and error states, and keeps the stream on a route handler so Next.js does not queue the page's server actions (Create, delete) behind a long reply.
>
> — `adr/0002 §Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-serve-the-chat-from-an-rsc-page-with-a-usechat-island-streaming-from-a-route-handler.md)

> **Chat route.** `app/api/chat/route.ts` runs on the Node.js runtime with the platform's default function duration; no `maxDuration` is set and the turn has no deadlines of its own (owner decision, §11).
>
> — `sad.md §7, Deployment, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Chat route: session via `actingFreelancerForRoute`; the proxy refuses anonymous `/api` with 401 … with nothing processed or counted (AC-42).
>
> — `sad.md §8, Authentication, abridged` · full text: [sad.md](../sad.md)

**OQ-T1 (see T25):** when `conversationId` is null the route pre-generates the id, streams `data-conversation` first, and passes `{ id, isNew: true }` and the turn's pending card to `saveTurn`.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([openapi.yaml](../contracts/openapi.yaml) · [sad.md](../sad.md) §6 critical flow 1) and follow it. Do not guess.

## Data delta

No schema change. Writes through services only: `MessageAllowanceDay` (reserve / release, T08), `Conversation` / `ConversationMessage` / `DraftCard` / `AssistantTurn` (`saveTurn` / `recordTurnMetadata`, T25).

## API contract

`POST /api/chat` (`sendChatMessage`), session cookie:
- Request `ChatRequest { conversationId: RecordId | null; message: { id 1..64; role: user; parts: [{ type: text; text 1..2000 trimmed }] } }`.
- `200` `text/event-stream`, header `x-vercel-ai-ui-message-stream: v1`; custom parts: `data-conversation {conversationId, title}` (first, transient, only for a new Conversation) · `data-allowance` (transient, after the reservation and again after a release) · `data-draft-card {id, data: {cardId}}` (persistent) · `data-link {AppLink}` (persistent) · `data-outcome {outcome: ANSWERED|PARTIAL|COULD_NOT_COMPLETE|AI_UNAVAILABLE, counted}` (last, transient).
- `400 VALIDATION` "Messages can be at most 2,000 characters. Shorten it and send again." (+ `fieldErrors["message.parts.0.text"]`) · `401 UNAUTHORIZED` "Not signed in." (proxy) · `404 NOT_FOUND` "This conversation can't be found." · `429 RATE_LIMITED` "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected." + `details {kind: ALLOWANCE_USED_UP, limit: 30, renewsAt, timeZone}` · `503 FAILED` "The reply couldn't be completed. Try again."
- `ChatOutcome` → `AssistantTurn.outcome`: ANSWERED→ANSWERED, PARTIAL→CAPPED, COULD_NOT_COMPLETE and AI_UNAVAILABLE→FAILED.

— `contracts/openapi.yaml §/api/chat, §ChatDataPart, §ChatOutcome, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-06 — error

> **Given** a signed-in Freelancer
> **When** they ask the chat whether they should charge VAT to a client abroad
> **Then** the Assistant answers in one sentence that it can only help with their own data in the app, drafting invoices, and finding things in the app — it gives no advice, and the message counts toward the Daily message allowance
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — happy path

> **Given** a Freelancer with a Daily message allowance of 30 who has sent 18 messages today
> **When** they send one more message
> **Then** the chat shows 11 messages left today
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today
> **When** they try to send another message
> **Then** the message is not processed; the chat says plainly that today's allowance is used up, when it renews in their own local time, and that an AI client connected through a Personal key is not affected — and their earlier Conversations stay readable
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-10b — domain invariant

> **Given** a Freelancer with one message left today and the chat open in two browser tabs
> **When** they send a message from both tabs at the same moment
> **Then** only one message is processed and the other tab shows that today's allowance is used up
>
> — `spec.md §5, AC-10b, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — error

> **Given** a Freelancer with messages left today
> **When** a reply fails on the system's side before it is complete
> **Then** the chat says the reply could not be completed and invites them to try again, and that message does not count toward the allowance
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-42 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or send a message to the chat
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-42, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Route handler (Node.js runtime, no `maxDuration`): `actingFreelancerForRoute` → zod `ChatRequest` → Conversation check (owner-scoped) → `reserveMessageSlot` → `runTurn` → UI-message stream — `app/api/chat/route.ts`
- [ ] Stream assembly: `data-conversation` first for new, `data-allowance` after reserve, text deltas, `data-draft-card` / `data-link` parts, `data-allowance` after a release, `data-outcome` last — `lib/ai/stream.ts`
- [ ] After the stream: `saveTurn` (answered / partial) or `release()` + `recordTurnMetadata` (failed); an `ALLOWANCE_USED_UP` refusal also records a metadata row (`ALLOWANCE_USED_UP`, not counted) — `app/api/chat/route.ts`
- [ ] Integration tests with a stub model on Postgres — `tests/integration/api/chat-route.test.ts`
- [ ] Proxy unit test: anonymous `POST /api/chat` → 401 before the handler — `tests/unit/proxy.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| 2,001 characters after trim | 400, nothing reserved (spec §6) |
| Whitespace-only message | 400 |
| Foreign `conversationId` | 404, same text as unknown (AC-41) |
| Last slot, two tabs | one 200, one 429 (AC-10b) |
| Reservation write fails | 503, nothing processed |
| Off-topic message | 200, refusal, `ANSWERED`, counted once (AC-06) |
| Provider 429 / error | `AI_UNAVAILABLE`, slot released, `data-allowance` restored (AC-11) |
| Exception after text streamed | `COULD_NOT_COMPLETE`, slot released, only metadata saved |
| Client disconnects mid-stream | turn completes server-side and is saved (counted) — breakdown reading: a disconnect is not a system-side failure (spec §1 D2), so no release |

## Definition of Done

- [ ] Integration tests on /api/chat show 400 for an empty or 2,001-character message with nothing reserved, 404 alike for unknown and foreign Conversations, 429 ALLOWANCE_USED_UP for the 31st message and for the losing tab of two simultaneous sends, a 200 stream with data-conversation, data-allowance and data-outcome parts, an off-topic message counted once, and a provider failure that releases the slot and ends AI_UNAVAILABLE; the proxy test shows an anonymous POST gets 401 before the handler.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
