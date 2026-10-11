---
id: T22
title: "Build the AI start panel with example prompts, the start=draft variant and the AllowanceNotice counter and used-up modes"
layer: "ui"
deps: ["T08", "T18"]
blocks: ["T33"]
acs: ["AC-01", "AC-10", "AC-33", "AC-34"]
files_hint: ["app/(protected)/ai/page.tsx", "components/ai/start-panel.tsx", "components/ai/allowance-notice.tsx", "docs/design-system.md", "tests/component/ai-start-panel.test.tsx", "tests/component/allowance-notice.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T22 — Build the AI start panel with example prompts, the start=draft variant and the AllowanceNotice counter and used-up modes

## Place in the sequence

- **Blocked by:** T08 — Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure, T18 — Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice · **Blocks:** T33 — Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live · **Wave:** 4 — needs the allowance read and the /ai page.
- **Lane:** shares `app/(protected)/ai/page.tsx` with T18, T33; shares `docs/design-system.md` with T19, T23, T28 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** an AI section in the navigation that holds the chat and a link to connecting my own AI client
> **So that** I can use AI on my invoices right after signing in, with nothing to set up
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** a "Create with AI" entry next to "New invoice"
> **So that** I find AI drafting exactly where I create invoices, even if I never open the AI section
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task is what a Freelancer sees first: a chat ready for a question with examples, the messages left today, a draft-ready variant from "Create with AI", and an honest used-up notice.

## Inlined context

**SCR-01 states this task builds (the start panel; the list column is T18):**

| State | Trigger / condition | Components |
|---|---|---|
| default | Signed in, messages left, opened from the navigation (AC-01; flow 4 `else` navigation). Start panel: heading "Ask about your invoices", four example questions, the composer, "{left} of 30 messages left today", and the link "Connect your own AI client →" to SCR-07 | `Card`, `Button` (outline, one per example), `Textarea`, `Button`, `NEW: AllowanceNotice` (counter mode) |
| example picked | Clicking an example fills the composer with its text and focuses it. Nothing is sent until Send, so an example never spends a message by accident | `Textarea` |
| start=draft | `?start=draft` with messages left (AC-33; flow 4 Create with AI). Heading "Draft an invoice", the composer placeholder `e.g. "Invoice Acme for 20 hours of consulting at $50"`, and one example chip with that text in place of the four questions. The list is unchanged | `Card`, `Button` (outline), `Textarea` |
| used-up | `left = 0` from the navigation (AC-10). The composer and the example questions are replaced by `AllowanceNotice` (used-up mode). The list stays readable and every past Conversation opens | `NEW: AllowanceNotice` (used-up mode) |
| used-up from Create with AI | `?start=draft` with `left = 0` (AC-34). Before anything is typed: `AllowanceNotice` (used-up mode) plus "Create it by hand →" to `/invoices/new` (SCR-06) | `NEW: AllowanceNotice`, `buttonVariants` link |

Examples (wireframe): "Who owes me money right now?", "What's overdue today?", "How much did I invoice this month?", "Where do I change the logo on my invoices?". Used-up copy: "You've used today's 30 messages" / "They renew at 00:00 your time. An AI client connected with a Personal key isn't affected, and your conversations stay readable." / "Connect your own AI client →".

> - **Dates:** every date and time is shown in the Freelancer time zone (UTC until one is saved), in the app's existing format. `renewsAt` shows as "at 00:00" when it is the next local midnight, otherwise as "tomorrow at {HH:mm}" or "at {HH:mm}" (the 24-hour mark after a time-zone change, ADR-0009).
>
> | `AllowanceNotice` | … two modes: the counter "{left} of 30 messages left today", and the used-up notice that replaces the composer with the renewal time and the Personal-key note. … Contract: props `state: AllowanceState`, `usedUpMessage?: string` (the `429` `error`), `handMadeLink?: boolean` (AC-34) | pending |
>
> — `screens.md §SCR-01, §Source Dates, §New components, abridged` · full text: [screens.md](../screens.md)

The composer here sends the first message; the send itself (streaming, `history.replaceState` to `/ai/{id}`) is the chat island of T33. This task renders the composer and passes the text to an `onSend` prop the island supplies; until T33 lands the start panel's Send is wired to a stub that the island replaces.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) SCR-01 wireframes) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Reads `getAllowanceState(actor)` → `AllowanceState { limit: 30, used, left, renewsAt, timeZone }`; it writes nothing. "Create with AI" (AC-33) is the route `/ai?start=draft`. It needs no server call beyond `getAllowanceState`. When `left = 0` the page shows the used-up state with a link to the hand-made editor (AC-34).

— `contracts/server-actions.md §getAllowanceState + "Create with AI", abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-01 — happy path

> **Given** a signed-in Freelancer who has never used AI in the app
> **When** they open the AI section from the navigation
> **Then** they see the chat ready for a question, a few example questions, how many messages they have left today, and a link to the page where they can connect their own AI client — with nothing to set up first
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today
> **When** they try to send another message
> **Then** the message is not processed; the chat says plainly that today's allowance is used up, when it renews in their own local time, and that an AI client connected through a Personal key is not affected — and their earlier Conversations stay readable
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-33 — happy path

> **Given** a Freelancer on their invoice list
> **When** they choose "Create with AI" next to "New invoice"
> **Then** a new Conversation opens in the AI section, ready to draft, with an example request to start from
>
> — `spec.md §5, AC-33, verbatim` · full text: [spec.md](../spec.md)

### AC-34 — cross-context

> **Given** a Freelancer who has used their whole Daily message allowance today
> **When** they choose "Create with AI"
> **Then** before they type anything they are told that today's allowance is used up and when it renews, with a link to create the invoice by hand in the editor
>
> — `spec.md §5, AC-34, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `AllowanceNotice` (counter / used-up, `renewsAt` formatting rule, optional hand-made link) — `components/ai/allowance-notice.tsx`
- [ ] `StartPanel` (default / start=draft / example picked / used-up variants; `onSend` prop) — `components/ai/start-panel.tsx`
- [ ] Read `getAllowanceState` and `start` in the `/ai` page; render the panel in the right pane — `app/(protected)/ai/page.tsx`
- [ ] Register `AllowanceNotice` in the design canon — `docs/design-system.md`
- [ ] Component tests (incl. Kyiv midnight "at 00:00" and the 24-hour-mark wording) — `tests/component/ai-start-panel.test.tsx`, `tests/component/allowance-notice.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Example clicked | fills and focuses; sends nothing |
| `left = 0` from navigation | notice replaces composer; list readable (AC-10) |
| `left = 0` via `?start=draft` | notice + "Create it by hand →" before typing (AC-34) |
| `renewsAt` not a local midnight | "tomorrow at {HH:mm}" / "at {HH:mm}" |
| Unknown `start` value | treated as navigation |

## Definition of Done

- [ ] Component tests render SCR-01 default (four examples, composer, "{left} of 30 messages left today", the connect link), example picked (fills, never sends), start=draft, used-up and used-up from Create with AI (with "Create it by hand →" to /invoices/new), and AllowanceNotice formats renewsAt per the manifest rule.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
