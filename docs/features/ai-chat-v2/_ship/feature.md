# AI chat v2 — feature description

_Source: [`docs/features/ai-chat-v2/_ship/feature.md`](docs/features/ai-chat-v2/_ship/feature.md)_

> This document uses ASD-STE100 Simplified Technical English. The names of the people (Freelancer,
> Customer, Visitor, Assistant), the button and link names (Create draft, Preview, Issue invoice,
> Open in editor, New chat, Jump to latest, AI chat, Connect your AI, Create invoice with AI), the
> status names (draft, issued) and the setting names are technical names.

## 1. Purpose

This feature adds to the AI chat of [ai-assistant](../../ai-assistant/_ship/feature.md). All the rules of the first iteration stay the same: the chat does not guess a value, a draft exists only after the Freelancer clicks Create draft, each message counts toward the Daily message allowance, and the AI does not issue an invoice.

With this feature, the Freelancer can:

- choose a Customer, bank account, product, sender profile or currency with one click on a button;
- look at a draft and issue it in the chat;
- use an AI section that fills the screen and does not scroll as one page;
- start a chat from the navigation or from the dashboard.

## 2. Terms

| Term | Meaning |
|---|---|
| Offered choice | A button under a reply of the chat. Each button is one record (or currency) that the draft action found. |
| Press | A click on an Offered choice. A press is a message. |
| Preview | The panel in the chat that shows a Draft invoice as the editor shows it. |
| Look-alike letters | Latin and Cyrillic letters that look the same, for example "A" and "А". |
| Start point | The place where the Freelancer started a Conversation: the AI section, the invoice list, the dashboard prompt or "Create invoice with AI" on the dashboard. |

## 3. Rules

### 3.1 Read questions

The chat and MCP have three new read questions. Each Personal key can use them. A key does not need Draft permission.

- **Sender profiles.** The answer gives each sender profile, which profile is the default, and its bank accounts. For each account, the answer gives the bank name, the last four digits, the currency and the default mark. The answer does not give the full account number, other bank data or a tax number.
- **Products.** The answer gives each product with its unit and its prices in each currency. If the request names a Customer, the answer also gives the custom prices of that Customer.
- **Customers.** The answer gives the Customers that match a name. The match ignores case, extra spaces and look-alike letters.

Each answer gives 20 records or fewer, and the total number of matches.

A sender profile is the business of the Freelancer. A Customer is the party who pays. The chat does not use a sender profile as a Customer.

### 3.2 Offered choices

1. The draft action can find more than one record, or no exact record. Then the reply shows the records as buttons.
2. The buttons come only from the draft action. The text of the model cannot add a button. Text in the data of the Freelancer cannot add a button.
3. A reply asks for one choice only. A reply shows 8 buttons or fewer. If more records match, the reply gives the number and asks for a more exact name.
4. If a question needs a typed value (for example an amount), the reply shows no buttons.
5. A press uses the exact record of the button. The chat does not match the press to a record with a similar name.
6. A press counts toward the Daily message allowance. If the allowance is used up, the chat refuses the press and marks no button as chosen.
7. The chat refuses a press that it cannot apply. Examples: a button of an older reply, a record of a different Freelancer, a record that was deleted. The chat does not send this press to the model and does not count it. The chat always uses the same words: the option is no longer available.
8. Only the buttons of the latest reply operate. After a newer message, the older buttons stay visible and show the chosen button.
9. The buttons are saved with the Conversation.

### 3.3 AI section

- The page does not scroll. The Conversation list and the messages scroll independently. The message box is always visible.
- The Conversation list has the groups Today, Yesterday, Previous 7 days and Older. The groups use the date of the last message in the Freelancer time zone. The search ignores case, extra spaces and look-alike letters.
- The messages follow new text when the Freelancer is at the bottom (48 px or less from the end). If the Freelancer scrolls up, the view does not move, and "Jump to latest" shows.
- A new Conversation shows a greeting, the message box in the middle and suggested requests. A click on a suggested request only fills the message box. After the first message, the box moves to the bottom.
- The app saves a Conversation only after its first message.
- On a screen that is narrower than 768 px, the Conversation list opens as a sheet, and the preview opens as a full-screen sheet.
- A reply shows word by word while the chat writes it.

### 3.4 Preview and issue

1. After Create draft, the card shows **Preview**. Preview opens the same invoice preview that the editor shows, with **Open in editor** and, for a draft, **Issue invoice**.
2. Issue invoice opens a dialog. The dialog shows the Customer, the total and the currency. It also tells that the lines and amounts cannot change after the invoice is issued.
3. After the Freelancer confirms, the app issues the invoice through the same procedure as the editor. All the invoice-integrity rules apply. If a rule blocks the issue, the panel shows the message of the editor.
4. If the draft was saved again after the preview opened, the app does not issue it. The preview loads again, and the Freelancer must confirm again.
5. If the invoice is already issued, the app does not issue it again.
6. To open a preview and to issue are not messages. They do not count.
7. Only the Freelancer can issue. The AI cannot issue an invoice.

### 3.5 Navigation and dashboard

- The navigation has the group "AI" with "AI chat" and "Connect your AI".
- The dashboard has a prompt box. A message from the prompt box opens the AI section with a new Conversation, and the reply starts. This message counts once.
- The dashboard shows the 3 latest Conversations and "Create invoice with AI".
- If the allowance is used up, the prompt box tells this and links to the editor. The app does not send a message.

### 3.6 Privacy

- The data export includes the Offered choices, the chosen buttons, the source of each message (typed, press or dashboard) and the Start point of each Conversation.
- When the Freelancer deletes the account, the app deletes all of this data.
- The app deletes the Offered choices with their Conversation (90 days after the last message, or when the Freelancer deletes it).

## 4. Release procedure

1. Merge [ai-assistant](../../ai-assistant/_ship/feature.md) (PR #10) first. This feature is built on it.
2. The owner approves the AI section of the privacy page and sets its "Last updated" date.
3. The owner decides if the terms page must name the model provider in its list of sub-processors (spec §8).
4. On a preview deploy with the gateway key, run `pnpm eval:assistant`. Make sure that the topic and no-guessing sets pass, also the new rows for AC-05b, AC-14, AC-24 and presses.
5. Apply the migrations on dev with `pnpm exec prisma migrate deploy`.
6. Apply the migrations on production.
7. Merge the pull request. Then, deploy the code.

> **NOTE:** The 5 migrations add one table and three columns. The migration `20261013102000_backfill_conversation_message_origin` sets the source `TYPED` on the messages of the Freelancer that exist. You can run each migration again safely.

> **NOTE:** There are no new settings, cron jobs or services.

## 5. Rollback procedure

1. Deploy the previous build.

> **NOTE:** The previous build does not use the new table and columns. You can keep them.

2. If you must remove them, run the down scripts in `docs/features/ai-chat-v2/migrations/` in this sequence: `05`, `04`, `03`, `02`, `01`.

> **CAUTION:** The down script `05` deletes the "issued from the chat" mark. After this, you cannot calculate the share of drafts issued from the chat. The down script `01` deletes all the Offered choices.

## 6. Checks after the release

1. Each week, make sure that the p95 model cost of a message is USD 0.02 or less.
2. Make sure that the p95 time of the new read questions is 800 ms or less, the p95 time to open a preview is 1.5 s or less, and the p95 time to issue from the chat is 2 s or less.
3. After 60 days, make sure that the Freelancer answers 70 % or more of the Offered choices with a press, and that the median number of messages to a draft card is 2 or less.
4. After 60 days, make sure that 25 % or more of the new Conversations start from the dashboard.
5. After 90 days, make sure that 30 % or more of the drafts made in the chat are issued from the chat.

## 7. Related documents

- Specification: [`spec.md`](docs/features/ai-chat-v2/spec.md)
- User flows and screens: [`ux-flows.md`](docs/features/ai-chat-v2/ux-flows.md), [`screens.md`](docs/features/ai-chat-v2/screens.md)
- Architecture: [`sad.md`](docs/features/ai-chat-v2/sad.md)
- Decisions: [`adr/`](docs/features/ai-chat-v2/adr/)
- Data model: [`data-model.md`](docs/features/ai-chat-v2/data-model.md)
- API: [`contracts/openapi.yaml`](docs/features/ai-chat-v2/contracts/openapi.yaml), [`contracts/server-actions.md`](docs/features/ai-chat-v2/contracts/server-actions.md)
- Test plan: [`test-plan.md`](docs/features/ai-chat-v2/test-plan.md)
- Review: [`_review/review-2026-10-13.md`](docs/features/ai-chat-v2/_review/review-2026-10-13.md)
- Changelog: [`changelog.md`](docs/features/ai-chat-v2/_ship/changelog.md)
