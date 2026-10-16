---
id: T31
title: "Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility"
layer: "tests"
deps: ["T07", "T24", "T25", "T26", "T28", "T30"]
blocks: []
acs: ["AC-06", "AC-20", "AC-23", "AC-26", "AC-26b", "AC-28", "AC-29", "AC-30", "AC-35", "AC-36"]
files_hint: ["tests/e2e/ai-chat-v2-preview-dashboard.spec.ts", "tests/e2e/ai-chat-v2-preview-dashboard.spec.ts-snapshots/", "tests/e2e/accessibility.spec.ts", "tests/e2e/mcp-key-flows.spec.ts", "tests/e2e/route-sweep.spec.ts"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility

## Place in the sequence

- **Blocked by:** T07 — Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests, T24 — Build the invoice preview panel and the issue confirmation for desktop and phone, T25 — Replace the single AI navigation item with an "AI" group holding AI chat and Connect your AI, T26 — Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI, T28 — Update the privacy page AI section for what the chat stores and shares, and check the terms page, T30 — Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming
- **Blocks:** nothing (leaf)
- **Wave:** 12 (longest dependency chain); linear position T31 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As an** Assistant
> **I want** the same sender-profile, product and Customer reads through a Personal key
> **So that** the Freelancer's own AI client can prepare correct draft requests without guessing ids or names
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to open a created draft's preview from its card in the chat
> **So that** I can check exactly what the Customer would receive without leaving the Conversation
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to issue a draft from its preview after one confirmation, under the editor's rules
> **So that** checking and issuing an Assistant draft is one short step where I created it
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** an "AI" group in the navigation with the chat and the page for connecting my own AI client
> **So that** both AI entry points sit together like the other groups
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to type a request on the dashboard, see my latest Conversations there, and create an invoice with AI from the dashboard's actions
> **So that** I can use the AI from the page I open first
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the privacy page, my data export and account deletion to cover everything the chat stores
> **So that** I can trust what happens to my Conversations, choices and prompts
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It proves the remaining surfaces of US-02 and US-07 to US-12 end to end before ship.

## Inlined context

> | AC-20 | Freelancer opens Preview from the card on a desktop | e2e-through-UI | the panel opens beside the messages, which stay visible; the preview address is set; rendered within 1.5 s |
> | AC-26 | Freelancer issues from the editor in one tab, then confirms in the chat in another | e2e-through-UI | the chat shows the invoice as already issued; nothing changes |
> | AC-26b | Freelancer edits lines in the editor tab, then confirms in the chat tab | e2e-through-UI | nothing issued; the preview shows the new lines; a second Issue and confirm issues the current draft |
> | AC-06 | a read-only key reads profiles, products and Customers over real HTTP | e2e | the outside call through the proxy returns the three answers; no full account number |
> | AC-36 | anonymous visitors are sent to sign in from the AI section, a preview address and the dashboard | e2e | redirect to sign-in for each; the chat route refused through the proxy; nothing counted |
>
> — `test-plan.md §AC coverage, abridged` · full text: [test-plan.md](../test-plan.md)

> Accessibility | 0 serious or critical violations in the automated accessibility check of the AI section, the preview panel and the dashboard AI block; every button and panel reachable by keyboard | existing e2e accessibility suite
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> The two-tab tests use two pages in one signed-in context.
>
> — `test-plan.md §Test data, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — happy path

> **Given** a Personal key without Draft permission
> **When** its Assistant asks for the Freelancer's sender profiles, products, or Customers matching a name
> **Then** it gets the same answers the chat gets, including record ids it can name in a draft request, and no full bank account number
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — happy path

> **Given** a Conversation in which the Freelancer pressed Create and a Draft invoice exists
> **When** they press Preview on that card
> **Then** a panel opens beside the messages with the same invoice preview the editor shows for that draft, an "Open in editor" link and an Issue button; the messages stay visible on a desktop
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

### AC-23 — happy path

> **Given** an open preview of an Assistant draft for Acme Corp of 1,000.00 USD
> **When** the Freelancer presses Issue and confirms in the dialog that names the Customer, the total and the currency and says that its lines and amounts can no longer change once issued
> **Then** the invoice is issued through the same path as issuing from the editor and keeps the invoice number it got when it was created; the preview, the card and every link to it in the Conversation show it as issued, and the Assistant-draft mark disappears as for any issued Assistant draft
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — domain invariant

> **Given** a preview opened on a draft, after which the draft was issued from the editor in another tab
> **When** the Freelancer presses Issue in the chat's preview and confirms
> **Then** nothing is issued again; the panel and the card show the invoice as already issued
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-26b — domain invariant

> **Given** a preview opened on a draft, after which the Freelancer changed that draft's lines in the editor in another tab
> **When** they press Issue in the chat's preview and confirm
> **Then** nothing is issued from the outdated view; the preview reloads with the draft as it is now, and the Freelancer must press Issue and confirm again in a dialog that names its current Customer, total and currency, so they never issue an invoice they did not see. Any saved change to the draft makes the preview outdated, not only a change of lines.
>
> — `spec.md §5, AC-26b, verbatim` · full text: [spec.md](../spec.md)

### AC-28 — happy path

> **Given** a signed-in Freelancer
> **When** they look at the navigation
> **Then** they see an "AI" group, styled like "Management", holding "AI chat", which opens the AI section, and "Connect your AI", which opens the page where Personal keys are managed; the item of the page they are on is marked active
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

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

### AC-35 — happy path

> **Given** a Visitor or a Freelancer reading the privacy page
> **When** they read its AI section
> **Then** it says which chat data is stored (Conversations with their messages, draft cards, Offered choices and the ones chosen, prompts sent from the dashboard, where each message and Conversation came from), how long it is kept (90 days after the last message, or until deleted), who processes message text (the model provider through its gateway), and what the sender-profile and product reads share with an AI client connected through a Personal key (bank name, last four digits, currency — never a full account number)
>
> — `spec.md §5, AC-35, verbatim` · full text: [spec.md](../spec.md)

### AC-36 — authorization

> **Given** a Visitor who is not signed in
> **When** they try to reach the AI section or the dashboard's prompt box
> **Then** they are sent to sign in; no message is processed and nothing is counted
>
> — `spec.md §5, AC-36, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Preview/issue flows incl. two-tab AC-26 and AC-26b; timing of Preview → rendered panel — `tests/e2e/ai-chat-v2-preview-dashboard.spec.ts`
- [ ] Navigation group (AC-28), dashboard prompt (AC-29), latest links + Create invoice with AI (AC-30), privacy page anonymous (AC-35) — same spec
- [ ] Read-only Personal key calls `list_sender_profiles`, `list_products`, `list_customers` through the proxy (AC-06) — `tests/e2e/mcp-key-flows.spec.ts`
- [ ] Anonymous `/ai`, `/ai/{id}?preview=…`, `/dashboard`, `/api/chat`, the two new actions (AC-36) — `tests/e2e/route-sweep.spec.ts`
- [ ] Accessibility pass: AI section (empty, with Offered choices), panel with dialog open, dashboard block — `tests/e2e/accessibility.spec.ts`
- [ ] Visual baselines for SCR-06 at 1440×900 and SCR-09 — snapshots folder

## Edge cases

| Case | Behaviour |
|---|---|
| Docker or sleep fake reds | Check `docker info`, run under `caffeinate` |
| Two-tab race | Use explicit waits on the editor save before confirming |

## Definition of Done

- [ ] Playwright and outside-caller tests show the preview opens beside the messages within 1.5 s, issuing updates panel, card and links, the two-tab already-issued and outdated cases behave per spec, both AI navigation items open and show active, the dashboard prompt sends once and Create invoice with AI opens a drafting Conversation, the privacy page loads anonymously, a read-only key reads the three new tools with no full account number, anonymous AI addresses redirect to sign-in, and the accessibility pass finds no serious or critical violation.
- [ ] the spec passes locally twice in a row
- [ ] accessibility pass clean
- [ ] baselines approved deliberately
- [ ] no leaked testcontainers after the run
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
