---
id: T20
title: "Redesign the empty Conversation start with suggested requests and the composer move, and send the start point"
layer: "ui"
deps: ["T14", "T19"]
blocks: ["T21"]
acs: ["AC-18", "AC-30"]
files_hint: ["components/ai/chat-island.tsx", "components/ai/start-panel.tsx", "components/ai/composer.tsx", "app/(protected)/ai/page.tsx", "config/routes.config.ts", "app/(protected)/invoices/layout.tsx", "docs/design-system.md", "tests/component/ai-start-panel.test.tsx", "tests/unit/start-point-from-address.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T20 — Redesign the empty Conversation start with suggested requests and the composer move, and send the start point

## Place in the sequence

- **Blocked by:** T14 — Accept choice, origin and startedFrom in the chat request and run the press path in the chat route, T19 — Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets
- **Blocks:** T21 — Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming
- **Wave:** 7 (longest dependency chain); linear position T20 of T31 for the sequential in-place run.
- **Lane:** shares `app/(protected)/ai/page.tsx` with T19; `components/ai/chat-island.tsx` with T21; `components/ai/chat-island.tsx` with T22; `components/ai/chat-island.tsx` with T23; `components/ai/chat-island.tsx` with T24; `app/(protected)/ai/page.tsx` with T26 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** a new Conversation to greet me with the message box in the middle and suggested requests
> **So that** I know what to ask before I type anything
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to type a request on the dashboard, see my latest Conversations there, and create an invoice with AI from the dashboard's actions
> **So that** I can use the AI from the page I open first
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

It gives every new Conversation a clear starting point and records where it was started.

## Inlined context

> `StartPanel` changes from a `Card` to the kit's empty state: the right pane centres, vertically and horizontally, a greeting, a max-`2xl` composer and the suggested requests, with the `AllowanceNotice` counter under the composer. Nothing is saved until the first message (AC-18). … Suggested requests: 1. "Invoice Acme for 20 hours of consulting at $50" 2. "Who owes me money right now?" 3. "What's overdue today?" 4. "Which bank accounts do I have?"
>
> — `screens.md §SCR-02, abridged` · full text: [screens.md](../screens.md)

> sending (composer moves) | The first message is sent (AC-18; Flow 9). At once, the greeting and suggestions fade out, the composer moves to the bottom with the translate transition, and the message appears above it in SCR-03 `waiting`. Under `prefers-reduced-motion` the composer jumps to the bottom with no transition. The island does not remount. The address stays `/ai` until `data-conversation`, then `history.replaceState` → `/ai/{id}`
>
> — `screens.md §SCR-02, state «sending», verbatim` · full text: [screens.md](../screens.md)

> | `/ai` | `startedFrom` absent → `AI_SECTION` |
> | `/ai?start=draft&from=invoices` (the invoice list's "Create with AI"; the existing `/ai?start=draft` link gains `from=invoices`) | `startedFrom: 'INVOICE_LIST'` |
> | `/ai?start=draft&from=dashboard` | `startedFrom: 'DASHBOARD_CREATE'` |
> An unknown `from` value, or `start=draft` with no `from`, sends `AI_SECTION` / `INVOICE_LIST` respectively and is never an error. With the allowance used up, the `start=draft` entries show the used-up state with the hand-made editor link (ai-assistant AC-34).
>
> — `contracts/server-actions.md §Addresses and start points, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> Motion | The composer move and the panel transitions honour `prefers-reduced-motion` (AC-18).
>
> — `sad.md §8, Motion row, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Island → `POST /api/chat` first message with `startedFrom` (`AI_SECTION` omitted, `INVOICE_LIST`, `DASHBOARD_CREATE`).

— `contracts/openapi.yaml, ChatRequest + example createWithAiFromDashboard, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-18 — happy path

> **Given** a Freelancer who opens a new Conversation
> **When** the page appears, and then they send the first message
> **Then** they first see a greeting, the message box in the middle and suggested requests; after sending, the message box moves to the bottom with an animation and the reply appears above it. A Freelancer whose device asks for reduced motion sees the move without animation. Pressing a suggested request only fills the message box. A new Conversation left without a message is not saved and never appears in the Conversation list.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — happy path

> **Given** a Freelancer with five Conversations
> **When** they open the dashboard
> **Then** they see the three latest Conversations by last message, each a link that reopens it, a link to all Conversations, and a "Create invoice with AI" action next to the dashboard's existing invoice action that opens a new Conversation ready to draft. A Freelancer with no Conversations sees that there are none yet instead of the list.
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Pure `startPointFromAddress(searchParams)` + unit test (unknown `from`, missing `from`) — `components/ai/` helper, `tests/unit/start-point-from-address.test.ts`
- [ ] `StartPanel` → centred empty state, suggestions fill and focus the box — `components/ai/start-panel.tsx`
- [ ] Composer move transition with `motion-reduce` variant; island sends `startedFrom` on the first message only — `components/ai/chat-island.tsx`, `composer.tsx`
- [ ] `/ai` page passes the start point; `aiStartDraft` route gains `from=invoices` — `app/(protected)/ai/page.tsx`, `config/routes.config.ts`, `app/(protected)/invoices/layout.tsx`
- [ ] Update `StartPanel` / `ChatIsland` / `Composer` contracts in the inventory — `docs/design-system.md`
- [ ] Component tests: greeting, ≥ 3 suggestions incl. drafting and "who owes me money", fill-only, no transition under reduced motion, used-up with hand-made link — `tests/component/ai-start-panel.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Leaves without sending | Nothing saved; the list unchanged |
| `?start=draft&from=bogus` | `AI_SECTION`, no error |
| `?start=draft` with no `from` | `INVOICE_LIST` |
| Allowance used up on a drafting start | `AllowanceNotice` used-up + "Create it by hand →" |

## Definition of Done

- [ ] A new Conversation shows a centred greeting, the composer and at least four fixed suggested requests that only fill the box, the first send moves the composer down with a transition that reduced motion removes, the island sends startedFrom from the address (from=invoices, from=dashboard, unknown or missing values mapped per contract), the invoice list's Create with AI link carries from=invoices, and the used-up drafting start shows the hand-made link.
- [ ] unit + component tests green
- [ ] design-system inventory updated
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
