---
status: draft
feature_size: "L"
updated_at: "2026-10-11"
---

# UX flows — ai-assistant

> User flows for every UI-touching §4 user story of [`spec.md`](./spec.md), produced by `ux-flows` (after `clarify`, before `design`) and read by `design` (evidence for the target-surface + UI-architecture decisions), `sequences` (UI-driven flows align on SCR ids), `screens` (details every inventory row) and `plan-tests` (the e2e-through-UI paths). Flow altitude only: no components, layout or styling.

## Platform decisions

- **Posture:** responsive-both. `docs/design-system.md` names no posture, so this follows the rest of the app, which already adapts to phone widths. On a wide screen the Conversation list and the open Conversation share one view. On a phone the list is its own step before the Conversation. The flows below are the same on both. Only the arrangement differs, and `screens` decides it.
- **Navigation shape:** the AI section is a new top-level navigation entry. "Create with AI" on the invoice list is a second way into the same section, opening a fresh Conversation and not a separate surface.
- **Draft card is inline, not a page:** the proposed draft lives inside the Conversation as a card with one Create action. Creating never leaves the chat. The answer carries a link that opens the draft in the existing editor.
- **Confirmations are dialogs:** deleting one or all Conversations goes through a confirmation dialog over the AI section. The Draft permission choice lives in the existing new-key dialog on the Connect your AI page.
- **Allowance is always visible:** the remaining Daily message allowance shows wherever a message can be sent (AI section start and every Conversation). The used-up state replaces the message box and does not block reading.
- **Links out are to existing pages only:** the chat links to the editor, sender profiles, the Customer form and the Connect your AI page. It introduces no new destination pages.
- **Design input (not decided here):** replies must appear progressively (first words ≤ 3 s, §6). Whether that is streamed and how is a `design` decision.

## Screen inventory

| ID | Screen | Purpose | Entry | Exit |
|---|---|---|---|---|
| SCR-01 | AI section | Start a new Conversation (example questions, messages left today, link to connect an AI client) and list past Conversations newest first, with the 90-day retention notice | Navigation "AI"; "Create with AI" (SCR-05); back from SCR-02 | SCR-02 (send a first message or open a past one), SCR-04, SCR-07 |
| SCR-02 | Conversation | The exchange with the in-app Assistant: messages, answers with links, follow-up questions, refusals, messages left today, used-up and unavailable states | SCR-01 | SCR-03 (card shown inline), SCR-06, SCR-09, SCR-10, SCR-07, SCR-01 |
| SCR-03 | Draft card (inline in SCR-02) | The proposed draft: Customer, lines, sender profile and bank account, dates, defaults used and their sources, Create; states live / replaced / outdated / created | A drafting answer in SCR-02 | Create → link to SCR-06; replaced → newer card |
| SCR-04 | Delete Conversations dialog | Confirm deleting one Conversation or all of them; drafts are untouched | SCR-01 or SCR-02 delete action | SCR-01 |
| SCR-05 | Invoice list (existing) | Adds "Create with AI" next to "New invoice" and the Assistant mark on Assistant drafts | Navigation | SCR-01 (Create with AI), SCR-06 |
| SCR-06 | Invoice editor (existing) | Opens a created draft, shows the Assistant mark until it is issued; also the hand-made fallback when the allowance is used up | Link in SCR-02, SCR-05 | SCR-05 |
| SCR-07 | Connect your AI page (existing, settings) | Key list with "can create drafts" marks, each key's daily draft count and lift action, last-lifted time, and the "drafting needs a new key" explanation on read-only keys | SCR-01 link, SCR-02 link, settings navigation | SCR-08 |
| SCR-08 | New key dialog (existing, extended) | Name the key, choose Draft permission (only here), then the one-time key reveal | SCR-07 | SCR-07 |
| SCR-09 | Sender profiles (existing) | Where the logo is set and bank accounts are added | Chat links (AC-07, AC-17, AC-19) | — |
| SCR-10 | Customer form (existing) | Add a Customer the chat could not find | Chat link (AC-21) | — |
| SCR-11 | Sign-in (existing) | Where a Visitor is sent | Any AI section or chat attempt while signed out | SCR-01 after sign-in |
| SCR-12 | Not found (existing) | A Conversation that does not exist or belongs to someone else | A Conversation link | — |
| SCR-13 | Privacy settings (existing) | Data export (now including Conversations) and account deletion (now removing them) | Settings navigation | — |

## Flows

### Flow: US-01 — Open the AI section

```mermaid
flowchart TD
    A["Navigation: AI"] --> B{Signed in?}
    B -->|no| C["SCR-11 Sign-in"]
    B -->|yes| D["SCR-01 AI section: chat ready, example questions, messages left today"]
    D -->|"pick an example or type"| E["SCR-02 Conversation"]
    D -->|"connect my own AI client"| F["SCR-07 Connect your AI"]
    D -->|"open a past Conversation"| E
```

A Freelancer chooses AI in the navigation. Signed out, they go to sign-in. Signed in, the AI section opens with nothing to set up: a chat ready for a question, a few example questions, how many messages are left today and a link to the Connect your AI page. Picking an example or typing a question starts a Conversation. The link goes to the existing key page, and a past Conversation can be opened from the list (detailed in US-11).

### Flow: US-02 — Ask about my invoices

```mermaid
flowchart TD
    A["SCR-02 Conversation"] -->|"asks who owes me / what is overdue / show INV-042"| B{Reply completes?}
    B -->|"system-side failure"| C["SCR-02 could not complete, try again; not counted"]
    B -->|"model provider unavailable"| D["SCR-02 AI temporarily unavailable"]
    B -->|yes| E{Answer fits?}
    E -->|yes| F["SCR-02 answer matching the dashboard, with invoice links"]
    E -->|"more matches than one answer"| G["SCR-02 partial list, total count, offer to narrow"]
    E -->|"needs more work than one message allows"| H["SCR-02 partial answer, too broad, counted"]
    F -->|"open an invoice link"| I["SCR-06 Invoice editor"]
    G -->|"narrower question"| A
    H -->|"narrower question"| A
```

The Freelancer asks about Debtors, overdue invoices, expected payments, summary figures, Customers or one invoice. If the reply fails on the system's side, the chat says so and invites a retry, and the message is not counted. If the model provider is down, the chat says AI is temporarily unavailable. Otherwise the answer matches the dashboard and links to invoices, which open in the editor. When more invoices match than fit, the answer says it is partial, gives the total count and offers to narrow. When the question needs more work than one message may use, the chat gives what it found, says it was too broad and counts the message. Both lead back to a narrower question.

### Flow: US-03 — Stay on topic

```mermaid
flowchart TD
    A["SCR-02 Conversation"] -->|sends a message| B{What kind?}
    B -->|"own data, e.g. what Acme paid this year"| C["SCR-02 answer from own data"]
    B -->|"where is X in the app"| D["SCR-02 short answer + link"]
    D -->|follow link| E["SCR-09 Sender profiles or another existing page"]
    B -->|"entirely off-topic, e.g. VAT advice"| F["SCR-02 one-sentence refusal; counted"]
    B -->|"in-scope part + off-topic part"| G["SCR-02 in-scope answer or draft card + one-sentence refusal of the rest"]
```

Every message is sorted into a kind. A question about the Freelancer's own data is answered from it, even when it mentions money. A "where is this" question gets a short answer and a link to an existing page, such as sender profiles for the logo. An entirely off-topic message gets a one-sentence refusal and still counts. A mixed message gets the in-scope answer or draft card, plus a one-sentence refusal of the off-topic part, and is not counted as an Off-topic request.

### Flow: US-04 — Know my daily allowance

```mermaid
flowchart TD
    A["SCR-02 Conversation: N messages left today"] -->|sends a message| B{Messages left?}
    B -->|"none, or another tab took the last one"| C["SCR-02 used up: renews at local midnight, AI clients via keys unaffected, history readable"]
    B -->|"message over 2,000 characters"| D["SCR-02 too long, shorten it; not counted"]
    B -->|yes| E["SCR-02 reply; counter shows N minus 1"]
    C -->|"draft card already on screen"| F["SCR-03 Create still works"]
    C -->|"read past Conversations"| G["SCR-01 AI section"]
```

The messages left today show in every Conversation. Sending a message lowers the counter by one. When none are left, or a second tab took the last one at the same moment, the message is not processed. The chat then says the allowance is used up, when it renews in local time, and that AI clients connected through keys are unaffected, and earlier Conversations stay readable. A message longer than 2,000 characters is turned back before processing and not counted. A draft card already on screen can still be created at zero, because Create is not a message.

### Flow: US-05 — Draft an invoice from one sentence

```mermaid
flowchart TD
    A["SCR-02 Conversation"] -->|"invoice Acme for 20 hours of consulting at 50 USD"| B{Sender profile with a bank account?}
    B -->|"none at all"| C["SCR-02 explains + link"]
    C --> C2["SCR-09 Sender profiles"]
    B -->|"default profile has no account, another has"| D["SCR-02 explains, link to add one, offers drafting under a named profile"]
    B -->|yes| E{Currency account found?}
    E -->|"none in that currency"| F["SCR-02 says so + link to add one"]
    E -->|"several in that currency"| G["SCR-02 asks which account"]
    G -->|answers| A
    E -->|yes| H["SCR-03 Draft card: values, defaults and their sources, Create"]
    H -->|"asks a change, e.g. make it 25 hours"| I["SCR-03 new card; earlier card marked replaced"]
    I --> H
    H -->|Create| J{Card still current?}
    J -->|"price, Customer, profile, account or today changed"| K["SCR-03 updated card, confirm again"]
    K -->|Create| J
    J -->|yes| L["SCR-02 draft created + link"]
    L -->|"Create pressed again or replayed"| L
    L -->|open link| M["SCR-06 Invoice editor: Assistant draft"]
```

The Freelancer describes an invoice in one sentence. With no sender profile or no bank account at all, the chat explains and links to sender profiles. If only the default profile lacks an account, the chat says so, links to adding one, and offers to draft under another profile the Freelancer names. If the request names a currency with no matching account, the chat says so and links to adding one. With several accounts in that currency, it asks which. Otherwise a draft card appears showing every value, which defaults were used and where prices came from. Asking for a change produces a new card and marks the earlier one replaced, so only the newest can be created. On Create the card is checked against current data. If anything changed, including the day, an updated card asks for confirmation again. Once current, the draft is created and the chat links to it in the editor. Pressing Create again, or a replayed press, shows the same link and creates nothing.

### Flow: US-06 — Be asked, never guessed

```mermaid
flowchart TD
    A["SCR-02 Conversation"] -->|drafting request| B{Customer match?}
    B -->|"no Customer, e.g. Globex"| C["SCR-02 no such Customer + link; nothing created"]
    C --> C2["SCR-10 Customer form"]
    B -->|"several, e.g. Acme Corp and Acme GmbH"| D["SCR-02 asks which, naming both"]
    B -->|"near miss, e.g. a typo"| E["SCR-02 asks: did you mean ...?"]
    D -->|picks one, counted| A
    E -->|confirms| A
    B -->|exactly one| F{Every line has an amount?}
    F -->|"no amount and no catalogue product"| G["SCR-02 asks quantity and price"]
    F -->|"product in another currency, no price named"| H["SCR-02 asks the price in the invoice currency"]
    G -->|answers| A
    H -->|answers| A
    F -->|"dollar sign while the default account is another dollar"| I["SCR-02 asks which currency"]
    I -->|answers| A
    F -->|yes| J["SCR-03 Draft card"]
```

Before any card appears, the request must name exactly one Customer and an amount for every line. If no Customer matches, the chat says so and links to the Customer form, and it creates nothing. If several match, it asks which one and names them all. A near miss is offered back as a question and never filled in. A line with no amount and no catalogue product, or a product in another currency with no price named, gets a question for the missing amount. A "$" while the default account is in another dollar currency gets a currency question. Each answer is a new, counted message that goes back through the same checks. Only a complete request reaches the draft card.

### Flow: US-07 — Recognise an Assistant draft

```mermaid
flowchart TD
    A["SCR-05 Invoice list"] -->|sees mark: created by in-app chat or key name| B["SCR-06 Invoice editor: Assistant draft"]
    B -->|edit or delete| C["SCR-05 like any draft"]
    B -->|issue| D["SCR-06 issued invoice: mark gone, nothing about AI on the invoice"]
    E["SCR-02 Conversation"] -->|"asks the chat to send or issue it"| F["SCR-02 only you can issue + link"]
    F --> B
```

Assistant drafts carry a mark in the invoice list and the editor. The mark names the in-app chat, or the key's name as it was when the draft was created. The Freelancer can edit or delete the draft like any other. Issuing it removes the mark, and the invoice the Customer gets says nothing about AI. Asking the chat to send or issue a draft gets a reply that only the Freelancer can issue, with a link to the draft.

### Flow: US-08 — Give my own AI client draft access

```mermaid
flowchart TD
    A["SCR-07 Connect your AI"] -->|create a new key| B["SCR-08 New key dialog"]
    B -->|"chooses Draft permission"| C["SCR-08 key shown once"]
    B -->|"leaves it read-only"| C
    C --> D["SCR-07 key list: marked can create drafts or read-only"]
    D -->|"looks for draft access on a read-only key"| E["SCR-07 explains: create a new key with Draft permission, then revoke the old one"]
    E --> B
    D -->|"key reached 50 drafts today"| F["SCR-07 lift the limit"]
    F --> G["SCR-07 50 more until midnight local time, last-lifted time shown"]
```

On the Connect your AI page the Freelancer creates a new key and decides in the dialog whether it gets Draft permission. The key is shown once, as before. The key list marks each key as able to create drafts or read-only. A read-only key, including every key from before this release, offers no way to add the permission. The page explains that drafting needs a new key and that the old one can be revoked afterwards. When a key has reached its 50 drafts for the day, the Freelancer can lift the limit. That gives 50 more until local midnight, and the page shows when the limit was last lifted.

### Flow: US-10 — Start drafting from the invoice list

```mermaid
flowchart TD
    A["SCR-05 Invoice list"] -->|Create with AI| B{Messages left today?}
    B -->|yes| C["SCR-01 new Conversation, ready to draft, example request"]
    C -->|sends request| D["SCR-02 Conversation, Flow US-05"]
    B -->|no| E["SCR-01 used up, renewal time, link to create by hand"]
    E -->|create by hand| F["SCR-06 Invoice editor: new invoice"]
```

"Create with AI" sits next to "New invoice". With messages left, it opens a new Conversation that is ready to draft, with an example request, and the drafting flow (US-05) follows. With none left, the Freelancer learns before typing that today's allowance is used up and when it renews, and gets a link to create the invoice by hand in the editor.

### Flow: US-11 — Return to a past conversation

```mermaid
flowchart TD
    A["SCR-01 AI section: Conversations newest first, title + last message date"] -->|open one| B["SCR-02 whole exchange"]
    B -->|continue, counted| B
    B -->|"draft link whose invoice was issued"| C["SCR-02 link shows issued"]
    B -->|"draft link whose invoice was deleted"| D["SCR-02 link shows no longer available"]
    B -->|"old draft card pressed"| E["SCR-03 rebuilt, outdated if the day changed, confirm again"]
```

The AI section lists past Conversations, newest first, each with a title and the date of its last message. Opening one shows the whole exchange, and new messages continue it and count. A link to a draft that has since been issued shows it as issued, and one whose draft was deleted shows it as no longer available. A card left over from an earlier day is rebuilt on Create and asks for confirmation again (US-05).

### Flow: US-12 — Control my conversation history

```mermaid
flowchart TD
    A["SCR-01 AI section: kept 90 days after the last message"] -->|"delete one or delete all"| B["SCR-04 Delete Conversations dialog"]
    B -->|cancel| A
    B -->|confirm| C["SCR-01 deleted ones gone; their drafts unchanged"]
    D["SCR-13 Privacy settings"] -->|download data export| E["export includes Conversations"]
    D -->|delete account| F["every Conversation deleted with the account"]
```

The Conversation list says that Conversations are kept for 90 days after their last message. The automatic deletion itself happens out of sight. The Freelancer can delete one Conversation or all of them through a confirmation dialog. Confirming removes them from the list for good, and any drafts they created stay as they were. From privacy settings, the data export now includes Conversations, and deleting the account deletes them with everything else.

### Flow: US-13 — Only my data, only when signed in

```mermaid
flowchart TD
    A["Visitor reaches the AI section or sends a message"] --> B["SCR-11 Sign-in; nothing processed or counted"]
    C["Freelancer opens a Conversation link"] --> D{Their own?}
    D -->|yes| E["SCR-02 Conversation"]
    D -->|"someone else's or never existed"| F["SCR-12 Not found, same for both"]
    G["SCR-02 asks about Globex, which only another Freelancer has"] --> H["SCR-02 same answer as for a Customer that does not exist"]
```

A signed-out Visitor who reaches the AI section or tries to send a message goes to sign-in, and nothing is processed or counted. A Conversation link opens only for its owner. Anyone else sees the same not-found page as for a Conversation that never existed. Asking about a Customer that only another Freelancer has gets exactly the answer for a Customer that does not exist.

### Out of scope

- **US-09 — Create a draft from an external client.** The actor is an external Assistant talking to MCP and has no screen in Invoice Forge. Its visible results show up in Flow US-07 (the Assistant mark) and Flow US-08 (key list, draft limit and lift).

## AC coverage

| AC | Shown by | Notes |
|---|---|---|
| AC-01 | Flow US-01 → SCR-01 | Nothing to set up; allowance + Connect link |
| AC-02 | Flow US-02 → answer matching the dashboard | Per-currency Debtors |
| AC-03 | Flow US-02 → answer with invoice link → SCR-06 | |
| AC-04 | Flow US-02 → partial list branch | |
| AC-05 | Flow US-02 → answer matching the dashboard | Overdue rule is data, not flow; plan-tests covers it |
| AC-06 | Flow US-03 → entirely off-topic branch | |
| AC-06b | Flow US-03 → mixed branch | |
| AC-07 | Flow US-03 → where-is-X branch → SCR-09 | |
| AC-08 | Flow US-03 → own-data branch | |
| AC-09 | Flow US-04 → counter N minus 1 | |
| AC-10 | Flow US-04 → used-up branch | |
| AC-10b | Flow US-04 → "another tab took the last one" | |
| AC-11 | Flow US-02 → system-side failure branch | |
| AC-11b | Flow US-02 → too-broad branch | |
| AC-11c | Flow US-04 → Create still works at zero | |
| AC-12 | Flow US-05 → SCR-03 Draft card | |
| AC-13 | Flow US-05 → draft created + link → SCR-06 | |
| AC-14 | Flow US-05 → Create pressed again or replayed | |
| AC-14b | Flow US-05 → new card, earlier marked replaced | |
| AC-15 | N/A: no flow branch | No card ever appears from stored text; the rule is behavioral, covered by plan-tests injection fixtures |
| AC-16 | Flow US-05 → SCR-03 (price sources on the card) | |
| AC-16b | Flow US-06 → product in another currency branch; SCR-03 price sources | Named price beside the custom price is card content (screens) |
| AC-17 | Flow US-05 → no profile/account branches → SCR-09 | |
| AC-18 | Flow US-05 → card still current? → updated card | |
| AC-19 | Flow US-05 → currency account branches | |
| AC-20 | Flow US-06 → several Customers branch | |
| AC-21 | Flow US-06 → no Customer branch → SCR-10 | |
| AC-22 | Flow US-06 → no amount branch | |
| AC-23 | Flow US-07 → mark in SCR-05/SCR-06, gone on issue | |
| AC-24 | Flow US-07 → asks the chat to send or issue | |
| AC-25 | Flow US-08 → SCR-08 Draft permission → key list | |
| AC-26 | Flow US-08 → read-only key explanation | |
| AC-27 | N/A: MCP-only refusal | The UI side (count + lift) is AC-28 |
| AC-28 | Flow US-08 → lift the limit | |
| AC-29 | N/A: MCP-only (US-09) | |
| AC-30 | N/A: MCP-only (US-09) | Its draft's mark is AC-23 |
| AC-31 | N/A: MCP-only (US-09) | |
| AC-32 | N/A: MCP-only (US-09) | |
| AC-33 | Flow US-10 → new Conversation ready to draft | |
| AC-34 | Flow US-10 → used-up branch → SCR-06 | |
| AC-35 | Flow US-11 → list + whole exchange + continue | |
| AC-36 | Flow US-11 → issued / no longer available links | |
| AC-37 | Flow US-12 → SCR-04 confirm | |
| AC-38 | Flow US-12 → retention notice on SCR-01 | The deletion itself is a background job, no flow |
| AC-39 | Flow US-12 → SCR-13 export / account deletion | |
| AC-40 | Flow US-13 → Globex answer | |
| AC-41 | Flow US-13 → SCR-12 Not found | |
| AC-42 | Flow US-13 → SCR-11 Sign-in | |
