# Changelog — ai-chat-v2

## ai-chat-v2 — choices as buttons, preview and issue in the chat, and a full-height AI workspace

**What:** The AI chat now finishes a draft without leaving the chat and without retyping. The Freelancer can check and issue the draft right where it was made. The AI is easy to find from the navigation and the dashboard. Every rule of the first iteration ([ai-assistant](../../ai-assistant/_ship/changelog.md)) stays: nothing is guessed, a draft exists only after **Create**, the Daily message allowance applies, and the AI never issues an invoice.

- **Three new read questions,** shared by the chat and MCP and open to every Personal key (no Draft permission needed):
  - `list_sender_profiles` returns the sender profiles with their bank accounts. Each account shows the bank name, the last four digits, the currency and the default mark. A full account number, other bank details and tax numbers are never returned.
  - `list_products` returns the catalogue with the prices per currency. When a Customer is named by its id, it also returns that Customer's custom prices.
  - `list_customers` searches Customers by name. The search ignores case, extra spaces and letters that look the same in Latin and Cyrillic.

  Each answer holds at most 20 records and the total number of matches. The chat instructions now say what the chat can really read. They also explain that a sender profile is the Freelancer's own business, and a Customer is the party who pays.
- **Offered choices as buttons.** The draft action may need a choice: several matching Customers or products, a "did you mean" Customer, several bank accounts in a currency, a sender profile or account that matched none or several, or an unclear currency. The reply then shows the options as buttons.
  - The buttons are built in code from the draft action's own findings, never from the model's text. A stored note cannot add a button.
  - One choice is offered at a time, with at most 8 buttons. When more records match, the reply gives the count and asks for a more exact name.
  - A press is sent as a reference to the stored option, so the chat uses exactly the record pressed and never a look-alike. Look-alike Customer names also show the email.
  - A press is a message. It counts toward the allowance and is refused when the allowance is used up.
  - A press that cannot be applied is turned down before the model sees it and is not counted. This covers an option from an older reply, another Freelancer's record, or a deleted record. The chat answers in the same words in every case.
  - Only the latest reply's buttons can be pressed. Older ones stay visible and show the chosen option. Buttons are saved with the Conversation and shown again when it is reopened.
- **A full-height AI workspace.** The page itself never scrolls.
  - The Conversation list scrolls on its own. It is grouped into Today, Yesterday, Previous 7 days and Older, and it has a search that ignores look-alike letters and a New chat button.
  - The messages scroll on their own. They follow new text while the Freelancer is at the bottom (within 48 px), and offer "Jump to latest" after they scroll up.
  - The message box is always visible.
  - A new Conversation shows a greeting, the message box in the middle and suggested requests. After the first message the box moves down with an animation, or without one under reduced motion. An empty Conversation is never saved.
  - On a phone (under 768 px) the list opens as a sheet and the preview as a full-screen sheet.
- **Preview and issue from the chat.** A created draft's card has a **Preview** button. It opens the same invoice preview the editor shows, an "Open in editor" link and, while the invoice is a draft, **Issue invoice**.
  - Issuing asks for one confirmation that names the Customer, the total and the currency. It then follows the editor's issuing path and every invoice-integrity rule.
  - A draft saved again after the preview was opened is never issued from that view. The preview reloads, and the Freelancer confirms again.
  - A draft already issued elsewhere is not issued twice.
  - Opening a preview and issuing are not messages and never count.
  - The card, the preview and every link to that invoice in the Conversation show it as issued.
- **Findable AI.** The navigation has an "AI" group with "AI chat" and "Connect your AI". The dashboard has a prompt box that opens the AI section with the Conversation already running. It also shows the 3 latest Conversations and a "Create invoice with AI" action. When the allowance is used up, the prompt box says so up front.
- **Streamed replies are a requirement.** A reply appears word by word, and a browser test pins this. A reopened reply is shown whole.
- **Honest data notice.** The data export now includes the Offered choices and the chosen ones, where each message came from (typed, pressed or dashboard) and where each Conversation was started. Account deletion removes all of it. The privacy page's AI section describes what this iteration stores and shares (wording pending the owner's approval, see below).

**Why:** In the first iteration the drafting flow stalled whenever the Freelancer had to choose. The chat could not read sender profiles, accounts or products. A retyped name could match the wrong record again. The page scrolled as a whole, and a draft could only be checked in the editor. See [spec](../spec.md) §1–§2.

The key decisions:

- [ADR-0001](../adr/0001-store-each-set-of-offered-choices-as-a-server-side-offer-row-tied-to-its-reply.md): each set of Offered choices is a server-side offer row tied to its reply.
- [ADR-0002](../adr/0002-build-offered-choices-in-code-from-the-draft-resolvers-typed-issues.md): the choices are built in code from the draft resolver's typed issues. The model only words the question.
- [ADR-0003](../adr/0003-send-a-press-as-an-option-reference-and-pin-the-chosen-record-into-the-draft-request-in-code.md): a press is an option reference, and the chosen record is pinned into the draft request in code.
- [ADR-0004](../adr/0004-match-look-alike-names-in-the-app-with-one-shared-fold-without-a-stored-search-key.md): one shared name fold for look-alike matching, with no stored search key.
- [ADR-0005](../adr/0005-give-a-saved-conversation-and-an-open-preview-their-own-addresses-and-keep-a-new-conversation-at-ai.md): a saved Conversation and an open preview have their own addresses. A new Conversation stays at `/ai`.
- [ADR-0006](../adr/0006-load-the-chats-invoice-preview-through-an-owner-scoped-server-action-and-the-shared-document-model.md): the preview loads through an owner-scoped server action and the shared document model.
- [ADR-0007](../adr/0007-issue-from-the-preview-through-the-invoice-status-service-guarded-by-the-version-the-preview-showed.md): issuing goes through the invoice status service and is guarded by the version that the preview showed.
- [ADR-0008](../adr/0008-keep-invoice-states-in-one-workspace-store-fed-by-loads-and-action-results-without-push.md): invoice states live in one workspace store, fed by loads and action results.
- [ADR-0009](../adr/0009-hand-the-dashboard-prompt-to-the-ai-section-through-a-one-time-session-storage-entry.md): the dashboard prompt reaches the AI section through a one-time session-storage entry.

**How to use:** Write *"invoice Acme for 20 hours at $50"* in **AI chat**. If two Customers match, press the right button. Press **Create draft**, then **Preview** on the card, and **Issue invoice** after checking it. You can also type a question into the dashboard's prompt box. An MCP client can call `list_sender_profiles`, `list_products` and `list_customers` with any Personal key. The chat request fields (`choice`, `origin`, `startedFrom`) and the MCP tools are in [openapi.yaml](../contracts/openapi.yaml). The new web actions (`loadInvoicePreview`, `issueFromPreview`, `listConversationSummaries`, `listLatestConversations`) are in [server-actions.md](../contracts/server-actions.md).

**Operational notes:**
- **Migrations:** five migrations run on deploy with `prisma migrate deploy`:
  - `20261013100000_create_choice_offer` creates the `ChoiceOffer` table and its two enums;
  - `20261013101000_add_conversation_message_origin` adds a nullable column;
  - `20261013102000_backfill_conversation_message_origin` is a data step that sets `TYPED` on existing Freelancer messages;
  - `20261013103000_add_conversation_started_from` adds a column with the default `AI_SECTION`;
  - `20261013104000_add_invoice_issued_from_chat` adds a column with the default `false`.

  All five are idempotent and additive. The down scripts are in [`migrations/`](../migrations/).
- **Settings, cron, services:** none new. The ai-assistant settings (`AI_GATEWAY_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, optional `AI_CHAT_MODEL`) still apply. Offers are deleted with their Conversation, so the existing 90-day purge and account deletion cover them.
- **Depends on ai-assistant:** this branch is built on `feat/ai-assistant` (PR #10). Merge that first.
- **Before release (owner):** run the real-model evaluation `pnpm eval:assistant` with the gateway key. It includes the new AC-05b, AC-14 `many-studios`, AC-24 and pressed-record rows. Also run the read/issue load scenarios from the [test plan](../test-plan.md).
- **Rollback:** redeploy the previous build. The new table and columns are unused by the old code and can stay. To remove them, run the down scripts in reverse order (05 → 01). Down 05 drops the "issued from the chat" KPI history. Down 01 drops every stored Offered choice.

**Acceptance criteria delivered:** AC-01 – AC-36, including AC-05b, AC-08b, AC-12b and AC-26b (40 criteria). AC-35 (the privacy page) is implemented, and its wording waits for the owner's approval.

| ACs | What they guarantee |
|---|---|
| AC-01 – AC-07 | The chat and MCP read sender profiles, accounts (never a full number), products with custom prices and look-alike Customer names, only the Freelancer's own. A sender profile is never taken for a Customer |
| AC-08 – AC-14 | Choices are buttons built from the draft action's findings, one choice at a time, at most 8. A press is exact, counted, refused when the allowance is used up, and turned down without counting when it cannot be applied. Reopened Conversations keep their choices |
| AC-15 – AC-19, AC-36 | A full-height workspace with scrolling panes, follow-to-latest, grouped and searchable Conversations, a greeting start screen and a phone layout. A Visitor is sent to sign in |
| AC-20 – AC-27 | Preview and issue from the chat through the editor's rules, after one confirmation. No issue from an outdated view and no issue twice. Nothing counted. The AI still never issues |
| AC-28 – AC-32 | The AI group in the navigation, and the dashboard prompt, latest Conversations and "Create invoice with AI" |
| AC-33 | Replies appear word by word |
| AC-34 – AC-35 | The export and account deletion cover the choices and origins, and the privacy page says what is stored and shared |
