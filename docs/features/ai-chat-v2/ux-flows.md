---
status: draft
feature_size: "L"
updated_at: "2026-10-14"
---

# UX flows — ai-chat-v2

> User flows for every UI-touching §4 user story of [`spec.md`](./spec.md), produced by `ux-flows` (after `clarify`, before `design`) and read by `design` (evidence for the target-surface + UI-architecture decisions), `sequences` (UI-driven flows align on SCR ids), `screens` (details every inventory row) and `plan-tests` (the e2e-through-UI paths). Flow altitude only: no components, layout or styling. The first iteration's flows in [`ai-assistant/ux-flows.md`](../ai-assistant/ux-flows.md) stay in force; the SCR ids below are this feature's own and do not continue that file's numbering.

## Platform decisions

- **Posture:** responsive-both. `docs/design-system.md` names no posture, so this follows the app and the first iteration. The spec fixes the widths (§1): below 768 px is the phone layout; from 768 to 1279 px the desktop layout, where opening the preview hides the Conversation list behind a toggle; from 1280 px the list, the messages and the preview sit side by side. The flows are the same at every width. Only where the list and the preview open differs, and the flows show it where it matters (US-06, US-07).
- **The AI section is one full-height workspace:** the page never scrolls. The Conversation list (SCR-01) and the messages (SCR-03) scroll on their own, and the message box is always visible. Switching Conversations, starting a new one and opening a preview all happen inside this workspace.
- **A new Conversation is a state, not a record:** New chat, "AI chat" and every "Create invoice with AI" action open SCR-02. A Conversation exists only once its first message is sent, so leaving SCR-02 without sending leaves nothing behind.
- **The Question form is docked above the message box** (SCR-04), not in the message: one form per reply, replacing the first draft's one-choice buttons, shown only for the latest reply while it is open. It asks one question at a time, and answering the last question sends all the answers as one message. Sent, closed and older forms show nothing in the stream beyond the answer message.
- **The Conversation list is persistent:** it stays mounted while the Freelancer switches Conversations, so only the chat pane loads (ADR-0013).
- **Replies are Markdown:** a reply's formatting (lists, tables, bold) shows while it is written and after reopening, and an in-app link in it opens that page (ADR-0012).
- **The preview is a panel, not a page:** a side panel on a desktop and a full-screen sheet on a phone (SCR-06). Editing is never done there. "Open in editor" leaves for the existing editor (SCR-10).
- **Issuing goes through one confirmation dialog** over the preview (SCR-07). Issuing from the editor keeps its own behaviour.
- **The dashboard does not chat:** its only AI entry is "Create invoice with AI" in the header, which opens SCR-02. The dashboard AI block with its prompt box was removed on 2026-10-14 (SCR-09). Every reply is read in the AI section.
- **Navigation:** an "AI" group replaces the single "AI" item and holds "AI chat" and "Connect your AI" (SCR-08).
- **Design input (not decided here):** (1) how a sent form reaches the server so that it is told apart from typed text and checked against the stored questions; (2) how the card and its links learn that the invoice was issued, so they can show it as issued (refresh, push or a local update after the press); (3) whether a new Conversation (SCR-02) and the open preview have their own addresses that survive a reload or a shared link. `design` decides these.

## Screen inventory

| ID | Screen | Purpose | Entry | Exit |
|---|---|---|---|---|
| SCR-01 | Conversation list (pane on a desktop, sheet on a phone) | Past Conversations grouped Today / Yesterday / Previous 7 days / Older by last message, a title search and New chat; scrolls on its own; persistent, so it is not loaded again on a switch and keeps its scroll position and search text | Opening the AI section (SCR-08); the list toggle (768–1279 px with the preview open) or the list control on a phone | SCR-03 (pick a Conversation), SCR-02 (New chat) |
| SCR-02 | New Conversation (empty state) | Greeting, message box in the middle, at least three suggested requests, messages left today; nothing saved until the first message | New chat in SCR-01; "AI chat" in SCR-08; "Create invoice with AI" in the dashboard header (SCR-09); the existing "Create with AI" on the invoice list | SCR-03 (first message sent); SCR-01 (another Conversation, nothing saved) |
| SCR-03 | Conversation | Messages that scroll on their own and follow new text, streamed replies, the message box at the bottom, used-up, refused and "no longer available" answers | SCR-02 after the first message; SCR-01 | SCR-04 (docked), SCR-05 (inline), SCR-06, SCR-15, SCR-01 |
| SCR-04 | Question form (docked above the message box in SCR-03) | Up to 6 questions shown one at a time with a pager and ×: numbered options with a detail line, a "Something else" typed answer and Skip for optional ones; the last answer sends them all; hidden while in flight, back with the picks on a failure | The latest reply in SCR-03 that needs details to draft, while its form is open | The last answer puts the answers as the Freelancer's message in SCR-03; × hides it for the page view; a typed message closes it |
| SCR-05 | Draft card (inline in SCR-03, existing, extended) | The first iteration's card; once created it gets Preview and shows the invoice's live status (draft, issued, no longer available) | A drafting reply in SCR-03 | SCR-06 (Preview), SCR-10 ("Open in editor" link) |
| SCR-06 | Invoice preview panel (side panel on a desktop, full-screen sheet on a phone) | The editor's preview of that invoice, "Open in editor" and, while it is a draft, Issue; states loading / draft / issued / blocked / no longer available / not found / reloaded | Preview on SCR-05 | SCR-07 (Issue), SCR-10 ("Open in editor"), back to SCR-03 (close) |
| SCR-07 | Issue confirmation dialog | Names the Customer, total and currency and says lines and amounts can no longer change once issued; Confirm / Cancel | Issue in SCR-06 | SCR-06 (issued, reloaded, blocked or already issued; or cancelled) |
| SCR-08 | Navigation "AI" group | "AI chat" and "Connect your AI", styled like "Management", the current page's item marked active | Every signed-in page | SCR-02 with SCR-01 (AI chat), SCR-11 (Connect your AI) |
| SCR-09 | Dashboard AI block (removed 2026-10-14) | Only "Create invoice with AI" in the dashboard header remains, next to the existing invoice action; the prompt block was removed by the owner | Dashboard | SCR-02 ("Create invoice with AI") |
| SCR-10 | Invoice editor (existing) | Edit, fix or issue a draft the editor's way; the hand-made fallback | "Open in editor" (SCR-05, SCR-06); "create by hand" (SCR-02 used-up) | — |
| SCR-11 | Connect your AI page (existing) | Where Personal keys are managed | "Connect your AI" in SCR-08 | — |
| SCR-12 | Sign-in (existing) | Where a Visitor is sent | Any attempt to reach the AI section or the dashboard while signed out | The AI section after sign-in |
| SCR-13 | Privacy page (existing, public, AI section updated) | Says which chat data is stored, how long, who processes message text and what the new reads share with a Personal-key client | Footer and legal links | — |
| SCR-14 | Privacy settings (existing) | Data export (now with Question forms, message origin and Conversation start point) and account deletion (now removing them) | Settings navigation | — |
| SCR-15 | Add Customer / Add product pages (existing) | Where a record the chat could not find is added | The link in a "nothing matches" reply in SCR-03 | — |

## Flows

### Flow: US-01 — Find my profiles, accounts and products

```mermaid
flowchart TD
    A["SCR-03 Conversation"] -->|"asks about own profiles, accounts, products or a Customer"| B{"What is asked?"}
    B -->|"which profiles and accounts"| C["SCR-03 reply: profiles and accounts by bank name, last four digits, currency; defaults marked"]
    B -->|"a product's price for a Customer"| D["SCR-03 reply: standard prices per currency and that Customer's custom price"]
    B -->|"a Customer by a misspaced or look-alike name"| E["SCR-03 reply about that Customer, name as saved"]
    B -->|"draft under another profile in another currency"| F["SCR-05 Draft card with that profile and account, marked as taken from the request"]
    B -->|"a Customer or product that matches nothing"| G["SCR-03 reply: nothing matches, with a link to add one"]
    G -->|"follows the link"| H["SCR-15 Add Customer or product"]
    B -->|"names own sender profile as the Customer"| I["SCR-03 reply: a sender profile is your business, a Customer pays; which Customer? No card"]
    I -->|"names the Customer"| A
```

The Freelancer asks in the Conversation about their own records. Asking which sender profiles and bank accounts they have gets a list of profiles with their accounts, each account named by bank name, last four digits and currency, with the default profile and account marked and no full account number. Asking what a product costs for a Customer gets the standard prices per currency plus that Customer's custom price, each exactly as stored. Asking about a Customer with extra spaces, another case or look-alike Latin/Cyrillic letters finds it and shows its saved name. A drafting request under another sender profile in another currency produces a draft card with that profile and its account, marked as taken from the request. A Customer or product that matches nothing gets a plain "nothing matches" with a link to the page where one is added; no record is ever invented. Naming their own sender profile as if it were the Customer gets an explanation of the difference and a question about which Customer to invoice, with no card; the Freelancer answers and the Conversation goes on. Every answer holds only this Freelancer's records.

### Flow: US-03 — Answer a Question form

```mermaid
flowchart TD
    A["SCR-03 Conversation"] -->|"drafting request that needs details"| B{"What did the draft action find?"}
    B -->|"details to choose or type"| C["SCR-04 the form docked above the message box, one question at a time; the reply text stays in the stream"]
    B -->|"nothing missing"| M["SCR-05 Draft card"]
    C -->|"picks a numbered option, types in Something else, or skips an optional question"| D{"Last question answered?"}
    D -->|"no"| C2["SCR-04 next question; the pager keeps earlier picks"]
    C2 --> D
    C -->|"a typed answer is invalid"| E["SCR-04 the problem shown under the question; nothing sent"]
    E --> C
    D -->|"yes: the answers send at once"| F["SCR-04 hidden while in flight; SCR-03 the answer message, one line per question"]
    F --> H{"Accepted?"}
    H -->|"no allowance left"| I["SCR-03 used up and when it renews; SCR-04 back with the picks"]
    H -->|"outdated, changed or someone else's"| K["SCR-03 this form is no longer available; not counted; SCR-04 back with the picks"]
    H -->|"an answer refused"| V["SCR-04 back with the picks; the problem under that question"]
    V --> C
    H -->|"network error or reply failed"| R["SCR-04 back with the picks; the failure notice with Try again re-sends the same form"]
    R -->|"Try again"| F
    H -->|"yes, counted once"| L["SCR-03 the reply"]
    L --> N{"More details needed?"}
    N -->|"yes"| C
    N -->|"no"| M
    C -->|"close ×"| X["SCR-04 hidden for this page view; nothing sent; the form stays open"]
    C -->|"types a message instead"| G["SCR-03 typed message sent; the form closes with no answer"]
    X -->|"reload or reopen"| C
    P["SCR-01 reopens a past Conversation"] --> Q{"Latest reply's form still open?"}
    Q -->|"yes"| C
    Q -->|"no"| S["SCR-03 history shows only the answer messages"]
```

A drafting request that leaves details open gets a Question form docked directly above the message box, while the reply's text stays in the message stream. The form shows one question at a time: the question, a pager such as "‹ 1 of 3 ›" and a close ×. The options are numbered rows with a muted second line (a Customer's email or country, a product's price, an account's currency and last four digits). They come from what the draft action found or, when the chat named no records, from the Freelancer's own records (up to 8), never from the reply's words. Arrow keys move between rows, and Enter or a number key picks. A last row, "Something else", turns into a typed answer, and an optional question has Skip. More matches than the form can list get a count and a typed answer only. Each pick moves to the next question; the pager can go back, and earlier picks are kept. A typed answer is checked first, and an invalid one shows its problem under the question and is not taken.

Answering the last question sends all the answers at once as one message, one line per question ("Which Customer is this invoice for? — Acme GmbH"), counted once. There is no Send button. While the answers are in flight the form is hidden, and only the answer message shows. If the send is refused or fails, the form comes back with the picks kept and the error shown: an answer the server rejects shows its problem under that question; no allowance left shows the used-up notice; a form no longer available shows a notice and is never counted and never reaches the model; a network error or a reply that could not be completed shows a failure notice whose "Try again" re-sends the same form. Otherwise the reply follows: a new form if more details are needed, else the draft card with exactly the chosen records.

The × hides the form for this page view without sending; it stays open, so a reload or reopening the Conversation docks it again (without the picks). Typing a message in the message box instead sends it as a normal message and closes the form with no answer. Reopening a past Conversation docks the latest reply's form if it is still open; sent, closed and older forms show nothing in the stream beyond their answer messages.

### Flow: US-04 — Work in a full-height chat

```mermaid
flowchart TD
    A["Navigation AI chat, or any link into the AI section"] --> B{"Signed in?"}
    B -->|"no"| C["SCR-12 Sign-in; nothing processed or counted"]
    B -->|"yes"| D["SCR-01 grouped list beside SCR-03 or SCR-02; the page itself never scrolls"]
    D -->|"scrolls the list"| E["SCR-01 only the list moves"]
    D -->|"scrolls the messages"| F["SCR-03 only the messages move; message box stays at the bottom"]
    D -->|"types in the search"| G{"Any title matches?"}
    G -->|"yes"| H["SCR-01 only matching Conversations"]
    G -->|"no"| I["SCR-01 says no Conversation matches"]
    D -->|"picks a Conversation"| J["SCR-03 that Conversation"]
    D -->|"New chat"| K["SCR-02 New Conversation"]
    D -->|"switches Conversation"| S["SCR-03 chat pane loads; SCR-01 persistent: not loaded again, scroll position and search text kept, picked one active"]
    J -->|"a reply is being written"| L{"End of messages within 48 px of view?"}
    L -->|"yes"| M["SCR-03 view follows the new text"]
    L -->|"no, scrolled up"| N["SCR-03 view stays put; a jump-to-latest control appears"]
    N -->|"presses jump to latest"| M
```

A Visitor who tries to reach the AI section is sent to sign in, and nothing is processed or counted. A signed-in Freelancer sees the Conversation list, grouped Today / Yesterday / Previous 7 days / Older by last message, beside the open or new Conversation. The page itself never scrolls: scrolling the list moves only the list, and scrolling the messages moves only the messages while the message box stays visible at the bottom. Typing in the search narrows the list to matching titles (ignoring case, extra spaces and look-alike letters) or says that none match. Picking a Conversation opens it, and New chat (at the bottom of the list) opens an empty one. The list is persistent: switching Conversations changes only the chat pane, which shows a loading state, while the list is not loaded again and keeps its scroll position, search text and rows, with the picked Conversation marked active. The list changes later only when a Conversation is created, renamed or deleted, or when a new message moves a Conversation to the top. While a reply is being written, the view follows the new text if the end of the messages is within 48 px of view. If the Freelancer has scrolled further up, the view stays where it is and a control appears that jumps back to the latest message.

### Flow: US-05 — Start from a clear empty state

```mermaid
flowchart TD
    A["New chat, AI chat, or a Create invoice with AI action"] --> B["SCR-02 greeting, message box in the middle, suggested requests"]
    B -->|"presses a suggested request"| C["SCR-02 message box filled; nothing sent or counted"]
    C -->|"edits and sends"| D{"Device asks for reduced motion?"}
    B -->|"types and sends the first message"| D
    D -->|"no"| E["SCR-03 box moves to the bottom with an animation, reply appears above"]
    D -->|"yes"| F["SCR-03 box moves to the bottom without animation"]
    B -->|"leaves without sending"| G["SCR-01 list unchanged; nothing saved"]
```

Every way into a new Conversation shows a greeting, the message box in the middle and at least three suggested requests (drafting an invoice and asking who owes money among them). Pressing a suggestion only fills the message box. Nothing is sent or counted until the Freelancer sends. Sending the first message saves the Conversation, and the message box moves to the bottom with an animation while the reply appears above it. On a device that asks for reduced motion it moves without the animation. Leaving without sending saves nothing, and the list never shows an empty Conversation.

### Flow: US-06 — Use the AI on my phone

```mermaid
flowchart TD
    A["SCR-03 or SCR-02 fills the screen; message box at the bottom"] -->|"opens the Conversation list"| B["SCR-01 as its own sheet"]
    B -->|"picks a Conversation"| C["SCR-03 that Conversation; the sheet closes"]
    B -->|"New chat"| D["SCR-02 New Conversation; the sheet closes"]
    B -->|"closes the sheet"| A
    A -->|"Preview on a draft card"| E["SCR-06 as a full-screen sheet with the desktop's actions"]
    E -->|"closes the preview"| A
    E -->|"Issue"| F["SCR-07 Issue confirmation, as in Flow US-08"]
    E -->|"Open in editor"| G["SCR-10 Invoice editor"]
```

Below 768 px the chat fills the screen with the message box at the bottom. The Conversation list opens as its own sheet and closes when the Freelancer picks a Conversation, starts a new one or dismisses it. Preview on a draft card opens the preview as a full-screen sheet with the same actions as on a desktop: closing returns to the chat, Issue goes through the same confirmation as in US-08, and "Open in editor" leaves for the editor.

### Flow: US-07 — Preview a created draft

```mermaid
flowchart TD
    A["SCR-05 created Draft card in SCR-03"] -->|"Preview"| B{"Invoice exists and is the Freelancer's own?"}
    B -->|"deleted since"| C["SCR-06 no longer available, no Issue; the card shows the same"]
    B -->|"someone else's or never existed"| D["SCR-06 cannot be found, same words for both"]
    B -->|"yes"| E{"Screen width?"}
    E -->|"1280 px and wider"| F["SCR-06 panel beside SCR-01 and SCR-03"]
    E -->|"768 to 1279 px"| G["SCR-06 panel beside SCR-03; SCR-01 behind a toggle"]
    E -->|"narrower than 768 px"| H["SCR-06 full-screen sheet"]
    F --> I["SCR-06 the editor's preview, Open in editor, Issue while a draft"]
    G --> I
    H --> I
    I -->|"Open in editor"| J["SCR-10 Invoice editor"]
    I -->|"Issue"| K["SCR-07 Issue confirmation, as in Flow US-08"]
    I -->|"closes the panel"| L["SCR-03 Conversation"]
```

Pressing Preview on a created draft's card opens the preview panel. If the draft was deleted since, the panel says it is no longer available and offers no Issue, and the card shows the same. A draft that belongs to another Freelancer is answered "cannot be found", in the same words as one that never existed. Otherwise the panel shows the same preview the editor shows, an "Open in editor" link and, while the invoice is a draft, an Issue button. From 1280 px it sits beside the list and the messages. From 768 to 1279 px it sits beside the messages and the list goes behind a toggle. On a phone it is a full-screen sheet. On a desktop the messages stay visible throughout.

### Flow: US-08 — Issue a checked draft from the chat

```mermaid
flowchart TD
    A["SCR-06 preview of a draft"] -->|"Issue"| B["SCR-07 names Customer, total, currency; lines and amounts fixed once issued"]
    B -->|"Cancel"| A
    B -->|"Confirm; never counts toward the allowance"| C{"Still a draft?"}
    C -->|"no, issued elsewhere meanwhile"| D["SCR-06 and the card show it as already issued; nothing issued again"]
    C -->|"yes"| E{"Saved again since the preview loaded?"}
    E -->|"yes"| F["SCR-06 reloads with the draft as it is now; nothing issued"]
    F -->|"Issue again"| B
    E -->|"no"| G{"Passes the invoice-integrity rules?"}
    G -->|"no"| H["SCR-06 blocked with the editor's explanation; stays a draft"]
    H -->|"Open in editor"| I["SCR-10 Invoice editor"]
    G -->|"yes"| J["SCR-06 issued, invoice number kept; card and links show issued; Assistant mark gone"]
    K["SCR-03 asks the chat in words to issue"] --> L["SCR-03 only you can issue, with a link to the preview or the editor"]
    L -->|"opens the preview"| A
```

From an open preview, Issue opens a confirmation that names the Customer, the total and the currency and says the lines and amounts can no longer change once issued. Cancel returns to the preview. Confirming is never a message, so it works with the allowance used up. If the invoice was issued elsewhere in the meantime, nothing is issued again and the panel and card show it as already issued. If the draft was saved again after the preview loaded, nothing is issued. The preview reloads with the current draft, and the Freelancer has to press Issue and confirm again in a dialog with the current figures. If the draft breaks an invoice-integrity rule, issuing is blocked with the editor's own explanation, it stays a draft, and "Open in editor" leads to the fix. Otherwise it is issued through the editor's path with its number kept, and the preview, the card and every system-made link show it as issued, without the Assistant-draft mark. Asking the chat in words to issue gets "only you can issue" with a link to the preview or the editor. The chat never issues.

### Flow: US-09 — Find the AI in the navigation

```mermaid
flowchart TD
    A["SCR-08 AI group in the navigation, current item marked active"] -->|"AI chat"| B["SCR-02 New Conversation beside SCR-01"]
    A -->|"Connect your AI"| C["SCR-11 Connect your AI page"]
```

The navigation shows an "AI" group styled like "Management" in place of the old single "AI" item. "AI chat" opens the AI section on a new Conversation with the list beside it. "Connect your AI" opens the existing page where Personal keys are managed. The item of the current page is marked active.

### Flow: US-10 — Start a chat from the dashboard

```mermaid
flowchart TD
    A["Dashboard header"] -->|"Create invoice with AI"| B{"Allowance left today?"}
    B -->|"yes"| C["SCR-02 New Conversation ready to draft"]
    B -->|"no"| D["SCR-02 used-up state with create by hand, as ai-assistant AC-34"]
    D -->|"create by hand"| E["SCR-10 Invoice editor, new invoice"]
```

The dashboard prompt block (prompt box, latest Conversations, "none yet") was removed by the owner on 2026-10-14 (SCR-09). What remains is "Create invoice with AI" in the dashboard header, next to the existing invoice action: it opens a new Conversation ready to draft, started from the dashboard. With the allowance used up, it opens the used-up state, which says when the allowance renews and offers creating the invoice by hand, as in the first iteration (ai-assistant AC-34).

### Flow: US-11 — Watch the reply being written

```mermaid
flowchart TD
    A["SCR-03 sends a message"] --> B["SCR-03 the reply's words appear progressively"]
    B --> C["SCR-03 the complete reply"]
    B --> F["SCR-03 Markdown formatting and in-app links shown as the text arrives"]
    D["SCR-01 reopens the Conversation later"] --> E["SCR-03 the saved reply shown whole at once, same formatting and in-app links"]
```

After a message is sent, the reply's words appear one after another as they are written. The text never shows up only once it is complete. Reopening the Conversation later shows the saved reply whole at once. Following the new text is shown in US-04.

The reply is Markdown: lists, tables and bold text show formatted while it is written and after reopening, raw HTML is shown as text, and an in-app link (for example an invoice number) opens that page in the app. Any other address stays plain text.

### Flow: US-12 — Know what the chat keeps about me

```mermaid
flowchart TD
    A["SCR-13 Privacy page, AI section"] --> B["What is stored, how long, who processes message text, what the reads share with a Personal-key client"]
    C["SCR-14 Privacy settings"] -->|"downloads the data export"| D["Export with Conversations, messages, Question forms with their questions, options and answers, message origin, Conversation start point"]
    C -->|"deletes the account and confirms"| E["All chat data deleted with the rest of the account"]
```

A Visitor or a Freelancer reading the privacy page finds, in its AI section, which chat data is stored, that it is kept 90 days after the last message or until deleted, who processes message text, and what the sender-profile and product reads share with a Personal-key client (bank name, last four digits, currency, never a full number). In privacy settings, the data export now includes every Conversation with its messages, the Question forms with their questions, options and the answers sent, each message's origin (typed or a form's answers; older history may also read pressed or sent from the dashboard), and where each Conversation was started. Deleting the account through the existing confirmation removes all of it.

### Out of scope

- **US-02 — Same reads in my own AI client.** The Freelancer's own AI client calls the reads through a Personal key. There is no screen in this app, so there is no flow. Its UI-visible parts (what the privacy page says the reads share, and the "Connect your AI" entry) are covered by US-12 and US-09.

## AC coverage

| AC | Shown by | Notes |
|---|---|---|
| AC-01 | Flow US-01 → "which profiles and accounts" branch | No full account number |
| AC-02 | Flow US-01 → "a product's price for a Customer" branch | Exact stored figures |
| AC-03 | Flow US-01 → look-alike name branch | Name shown as saved |
| AC-04 | Flow US-01 → "draft under another profile" → SCR-05 | First iteration's draft rules |
| AC-05 | Flow US-01 → "matches nothing" → SCR-15 | Never names a missing record |
| AC-05b | Flow US-01 → "names own sender profile as the Customer" branch | No card |
| AC-06 | N/A: Personal-key MCP answer, no UI (US-02 out of scope) | Contract-tested in `api` / `plan-tests` |
| AC-07 | Flow US-01 (chat side: answers hold own records only) | Personal-key side has no UI |
| AC-08 | Flow US-03 → last answer sends → reply → SCR-05 | Customer chosen in the form |
| AC-08b | Flow US-03 → "More details needed?" loop back to SCR-04 → SCR-05 | One form per reply; sent once the last question is answered |
| AC-09 | Flow US-03 → SCR-04 (options only from the draft action's findings) | Invariant of SCR-04's content; injection fixture in `plan-tests` |
| AC-10 | Flow US-03 → SCR-04 (email on look-alike Customers) → last answer sends → SCR-05 | Exact record chosen |
| AC-11 | Flow US-03 → "no allowance left" branch | A sent form counts as one message; refused, the form comes back with the picks |
| AC-12 | Flow US-03 → typed message closes the form; reopen → history shows only the answer messages |  |
| AC-12b | Flow US-03 → "outdated, changed or someone else's" branch | Uniform words, not counted, never reaches the model |
| AC-13 | Flow US-03 → reopen (SCR-01) → "Latest reply's form still open? yes" → SCR-04 docked again |  |
| AC-14 | Flow US-03 → more matches than listed: a count and a typed answer only |  |
| AC-15 | Flow US-04 → scroll branches (E, F) | Page never scrolls |
| AC-16 | Flow US-04 → "End of messages within 48 px of view?" decision | Jump-to-latest control |
| AC-17 | Flow US-04 → grouped list D, search branches H / I | New chat at the list's bottom |
| AC-18 | Flow US-05 (all branches) | Reduced motion; empty Conversation never saved |
| AC-19 | Flow US-06 (all branches) | Below 768 px |
| AC-20 | Flow US-07 → "yes" → width branches → I | Messages stay visible on a desktop |
| AC-21 | Flow US-07 → "deleted since" branch | Card shows the same |
| AC-22 | Flow US-07 → "someone else's or never existed" branch | Same words as never existed |
| AC-23 | Flow US-08 → happy path to J | Number kept, Assistant mark gone |
| AC-24 | Flow US-08 → "asks the chat in words to issue" branch (K, L) | ai-assistant AC-24 in force |
| AC-25 | Flow US-08 → "Passes the invoice-integrity rules? no" → SCR-10 | |
| AC-26 | Flow US-08 → "Still a draft? no" branch | |
| AC-26b | Flow US-08 → "Saved again since the preview loaded? yes" → reload → Issue again | |
| AC-27 | Flow US-08 → Confirm edge ("never counts toward the allowance") | |
| AC-28 | Flow US-09 (both branches) | Active item marked |
| AC-29 | Removed by the owner 2026-10-14 (fix 2026-10-14-question-form-ux, T80) | — |
| AC-30 | Flow US-10 → "Create invoice with AI" → SCR-02 | Only the header action remains |
| AC-31 | Removed by the owner 2026-10-14 (fix 2026-10-14-question-form-ux, T80) | — |
| AC-32 | Removed by the owner 2026-10-14 (fix 2026-10-14-question-form-ux, T80) | — |
| AC-33 | Flow US-11 (both paths) | |
| AC-34 | Flow US-12 → export and account deletion branches | |
| AC-35 | Flow US-12 → SCR-13 | Visitor or Freelancer |
| AC-36 | Flow US-04 → "Signed in? no" → SCR-12 | The dashboard is signed-in only |
| AC-37 | Flow US-03 → SCR-04 docked form with options and "Something else" | |
| AC-38 | Flow US-03 → "Something else" typed answer; invalid answer shown under the question | |
| AC-39 | Flow US-03 → SCR-04 date options in the app format | |
| AC-40 | Flow US-03 → "types a message instead" branch | Nothing sent from the form; closed with no answer |
| AC-42 | Flow US-11 (Markdown formatting and in-app links) | Same while written and after reopening |
| AC-52 | Flow US-04 → "switches Conversation" branch | Persistent list: not loaded again, scroll position and search text kept |
| AC-54 | Flow US-03 → SCR-04 options from the Freelancer's own records when the chat named none | Up to 8, with a detail line; input only with no records |
| AC-55 | Flow US-03 (docked, one question at a time; last pick sends; hidden while in flight; failure → back with the picks and the error; × hides for the page view; typed message closes; Something else; Skip) | |
| AC-56 | Flow US-03 → question text only, English chrome, app date formats; answer message "<question> — <answer>" | |
