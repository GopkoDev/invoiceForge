---
id: T26
title: "Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI"
layer: "ui"
deps: ["T18", "T22"]
blocks: ["T31"]
acs: ["AC-29", "AC-30", "AC-31", "AC-32", "AC-36"]
files_hint: ["components/dashboard/ai-block.tsx", "app/(protected)/dashboard/_sections.tsx", "components/dashboard/header/dashboard-header.tsx", "components/dashboard/index.ts", "components/ai/ai-handoff.ts", "components/ai/chat-island.tsx", "app/(protected)/ai/page.tsx", "docs/design-system.md", "tests/component/dashboard-ai-block.test.tsx", "tests/component/ai-handoff.test.tsx", "tests/integration/ai-chat-v2-dashboard.test.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T26 — Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI

## Place in the sequence

- **Blocked by:** T18 — List every Conversation summary and the latest three, and add the grouping and title-search helpers, T22 — Render Offered choices under a reply and send a press from the chat island
- **Blocks:** T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility
- **Wave:** 10 (longest dependency chain); linear position T26 of T31 for the sequential in-place run.
- **Lane:** shares `app/(protected)/ai/page.tsx` with T19; `app/(protected)/ai/page.tsx` with T20; `components/ai/chat-island.tsx` with T21; `components/ai/chat-island.tsx` with T22; `components/ai/chat-island.tsx` with T23; `components/ai/chat-island.tsx` with T24 — serialized in id order.

## Why (user story)

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

It lets the Freelancer start or resume a Conversation from the page they open first.

## Inlined context

> **Chosen:** Option 1. The text never leaves the browser except in the chat request itself. Consumption is a single take-and-delete in one tab, and the turn keeps the one counted path.
>
> — `adr/0009 §Decision outcome, abridged` · full text: [adr/0009](../adr/0009-hand-the-dashboard-prompt-to-the-ai-section-through-a-one-time-session-storage-entry.md)

> W->>W: store the prompt under a one-time hand-off id in session storage
> W->>W: open the AI section with that hand-off id
> W->>W: chat island takes the entry and removes it, drops the id from the address
> W->>C: first message, origin dashboard, started from the dashboard prompt
> …
> Note over W,C: a reload or Back finds no entry, so the prompt is never sent twice
>
> — `sad.md §6, Critical flow 3, abridged` · full text: [sad.md](../sad.md)

> SCR-09: `DashboardHeader` gains a "Create invoice with AI" outline link (sparkles) before "Create Invoice" → `/ai?start=draft&from=dashboard`. `DashboardAiBlock` (RSC, own `Suspense`, after `DashboardBanners`): `Card` "Ask AI"; left: `InputGroup` + `Textarea` (placeholder "Ask about your invoices or describe one to draft", `aria-label` "Message to AI"), send `Button` "Send to AI", `AllowanceNotice` counter; right: "Recent conversations" (≤ 3 `Item` links) + "All conversations →". States: loading · default · none yet ("No conversations yet. Your chats with AI will show here.") · validation empty ("Type a message first.") · validation too long ("Messages can be at most 2,000 characters. Shorten it and send again." + "{n} / 2,000") · sending · used-up (`AllowanceNotice` used-up + "Create it by hand →" to `/invoices/new`; links stay usable).
>
> — `screens.md §SCR-09, abridged` · full text: [screens.md](../screens.md)

> A dashboard hand-off entry that is missing, already taken, or blocked by the browser → expected: a plain new Conversation. Nothing is sent or counted (component).
>
> — `test-plan.md §Edge cases, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

Read-only on the dashboard: `MessageAllowanceDay` (via `getAllowanceState`), `Conversation` (latest three). The first message writes through the chat route (`origin = DASHBOARD`, `startedFrom = DASHBOARD_PROMPT`).

— `data-model.md §ConversationMessage + §Conversation, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `listLatestConversations(actor, 3)` + `getAllowanceState` (RSC).
- `POST /api/chat` with `origin: 'DASHBOARD'`, `startedFrom: 'DASHBOARD_PROMPT'`, `conversationId: null` (example `dashboardPrompt`).

— `contracts/server-actions.md §Dashboard prompt box + contracts/openapi.yaml sendChatMessage, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-29 — happy path

> **Given** a Freelancer on the dashboard with messages left today
> **When** they type "who owes me money?" into the dashboard's prompt box and send it
> **Then** the AI section opens on a new Conversation in which that message is already sent and the reply is being written; the message counts toward the allowance once
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — happy path

> **Given** a Freelancer with five Conversations
> **When** they open the dashboard
> **Then** they see the three latest Conversations by last message, each a link that reopens it, a link to all Conversations, and a "Create invoice with AI" action next to the dashboard's existing invoice action that opens a new Conversation ready to draft. A Freelancer with no Conversations sees that there are none yet instead of the list.
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — error

> **Given** a Freelancer on the dashboard
> **When** they send an empty prompt, or one longer than the chat's message limit
> **Then** nothing is sent and no Conversation is created; the prompt box explains that a message is needed, or how long a message may be
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

### AC-32 — cross-context

> **Given** a Freelancer who has used their whole Daily message allowance today
> **When** they open the dashboard
> **Then** the prompt box says that today's allowance is used up and when it renews, and offers to create the invoice by hand in the editor; nothing is sent and no Conversation is created
>
> — `spec.md §5, AC-32, verbatim` · full text: [spec.md](../spec.md)

### AC-36 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or the dashboard's prompt box
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Hand-off helper: `writeHandoff(text) → id`, `takeHandoff(id) → text | null` (take-and-delete, try/catch around storage) — `components/ai/ai-handoff.ts`
- [ ] `DashboardAiBlock` RSC + client prompt box (chat message rule; same-tab navigation) — `components/dashboard/ai-block.tsx`, `components/dashboard/index.ts`, `app/(protected)/dashboard/_sections.tsx`
- [ ] "Create invoice with AI" link in the header — `components/dashboard/header/dashboard-header.tsx`
- [ ] Island consumes `?handoff=` once, drops it with `replaceState`, sends with dashboard origin/start point; missing entry → plain new Conversation — `components/ai/chat-island.tsx`, `app/(protected)/ai/page.tsx`
- [ ] Register `DashboardAiBlock` — `docs/design-system.md`
- [ ] Component: hand-off holds the text, URL only the id (AC-29); second mount/reload sends nothing; empty/too long refused, no hand-off (AC-31); used-up shows hand-made link, no send (AC-32); latest three / none yet / Create link (AC-30) — `tests/component/`
- [ ] Integration: used-up dashboard creates nothing; latest three of five owner-scoped; anonymous dashboard request redirected (AC-36) — `tests/integration/ai-chat-v2-dashboard.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `sessionStorage` blocked | Plain new Conversation, nothing sent |
| Entry already taken (React double effect) | Sent once only |
| Prompt of exactly 2,000 characters | Accepted |
| Allowance used up | Latest links and All conversations stay usable |

## Definition of Done

- [ ] The dashboard shows the AI block with up to three latest Conversation links, All conversations, the prompt box validated by the chat message rule, and a Create invoice with AI link before Create Invoice, a valid prompt is stored under a one-time sessionStorage hand-off id and opens /ai?handoff={id}, the island takes and deletes the entry exactly once and sends it with origin DASHBOARD and startedFrom DASHBOARD_PROMPT, and the used-up state offers the hand-made link and sends nothing.
- [ ] component + integration tests green
- [ ] prompt text never appears in a URL
- [ ] design-system inventory updated
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
