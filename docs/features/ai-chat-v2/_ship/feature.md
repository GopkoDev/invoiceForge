# AI chat v2 — feature description

_Source: [`docs/features/ai-chat-v2/_ship/feature.md`](docs/features/ai-chat-v2/_ship/feature.md)_

> This document uses ASD-STE100 Simplified Technical English. The names of the people (Freelancer,
> Customer, Visitor, Assistant), the button and link names (Create draft, Preview, Issue invoice,
> Open in editor, New chat, Jump to latest, AI chat, Connect your AI, Create invoice with AI), the
> status names (draft, issued) and the setting names are technical names. The button names of a Question
> form (Send, Other…, Skip) are technical names.

## 1. Purpose

This feature adds to the AI chat of [ai-assistant](../../ai-assistant/_ship/feature.md). All the rules of the first iteration stay the same: the chat does not guess a value, a draft exists only after the Freelancer clicks Create draft, each message counts toward the Daily message allowance, and the AI does not issue an invoice.

With this feature, the Freelancer can:

- answer the open questions of the chat in one Question form above the message box, one question at a time, picking from their own records;
- read formatted replies with links to the pages of the app;
- look at a draft and issue it in the chat;
- use an AI section that fills the screen and does not scroll as one page;
- start a chat from the navigation or with "Create invoice with AI" on the dashboard.

## 2. Terms

| Term | Meaning |
|---|---|
| Question form | A form for the latest reply of the chat, shown above the message box. It has 1 to 6 questions, shown one at a time. |
| Question | One part of a Question form. It asks for a record, a currency, a date, a value or a free answer. |
| Option | A button in a question. Each option is one record, currency or date that the app checked. |
| Send | Answering the last question of a Question form sends all its answers as one message. |
| Offered choice | A button under a reply, from an earlier build of this feature. The app shows it as a Question form with one question. |
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

### 3.2 Question forms

1. If the chat needs a decision or a value from the Freelancer, the reply ends with one Question form. The chat does not ask these questions in the text.
2. A reply has one form or no form. A reply with a draft card has no form.
3. A form has 6 questions or fewer. If more questions are open, the form shows the first 6 in this sequence: Customer, sender profile, bank account, currency, products, issue date, due date, quantities and prices, the other values, free questions. The next form asks the remaining questions.
4. Each question shows one line of question text: the chat's, or an English default from the app. There are no field headings. The app shows the question text as plain text. A record question without options gets up to 8 of the Freelancer's own records from the app, each with a second line (email or country, price, currency and last four digits).
5. The options come only from records that the app loaded for this Freelancer. The label of an option comes from the stored record. The text of the model cannot add an option. Text in the data of the Freelancer cannot add an option. If the chat names a record of a different Freelancer, or a record that does not exist, the app does not show the form.
6. A question shows 8 options or fewer. If more records match, the question gives the number of matches and asks for a more exact name.
7. A question about a record, a currency or a date also has "Other…". "Other…" opens a text box (or a date picker) for the answer of the Freelancer. The app compares a typed name as it compares a typed message.
8. Look-alike Customer names also show the email.
9. The app calculates the date options in the Freelancer time zone, for example "Yesterday · 12 Oct 2026" and "14 days after the issue date".
10. The tax rate, discount, PO number, payment terms and notes are optional. They have "Skip".
11. The form checks each typed answer before it sends it. Examples: an amount must be a number more than 0, a date must be a real day, a due date must not be before the issue date. The form shows the error below the question.
12. Send is available only when each required question has an answer.
13. One Send is one message. It counts once toward the Daily message allowance. If the allowance is used up, the app refuses the Send and marks no answer as chosen.
14. The message shows one line for each answer, "question — answer". The app makes this text from the stored labels and the typed answers.
15. The app puts the answers into the draft. A selected record is used exactly. The chat does not match it again by name. Then the app runs the draft action, and the reply shows the draft card or the next form.
16. The app refuses a Send that it cannot apply. Examples: a form of an older reply, a form of a different Freelancer, a question or option that is not in the form, a record that was deleted. The app does not send this Send to the model and does not count it. The chat always uses the same words: "This form is no longer available. Answer the latest questions or type your request."
17. Only the form of the latest reply operates. After a newer message, the older forms stay visible. They cannot change and show the answers that were sent.
18. If the Freelancer types a message and does not send the form, the app does not save the answers of the form.
19. The forms and their answers are saved with the Conversation.

### 3.3 AI section

- The page does not scroll. The Conversation list and the messages scroll independently. The message box is always visible.
- The Conversation list has the groups Today, Yesterday, Previous 7 days and Older. The groups use the date of the last message in the Freelancer time zone. The search ignores case, extra spaces and look-alike letters.
- The messages follow new text when the Freelancer is at the bottom (48 px or less from the end). If the Freelancer scrolls up, the view does not move, and "Jump to latest" shows.
- A new Conversation shows a greeting, the message box in the middle and suggested requests. A click on a suggested request only fills the message box. After the first message, the box moves to the bottom.
- The app saves a Conversation only after its first message.
- On a screen that is narrower than 768 px, the Conversation list opens as a sheet, and the preview opens as a full-screen sheet.
- A reply shows word by word while the chat writes it.
- When the Freelancer selects a different Conversation, only the chat pane loads. The Conversation list does not load again. It keeps its scroll position, its search text and its rows. The address changes to the selected Conversation.
- On a screen that is 768 px or wider, the search row of the Conversation list and the chat header have the same height.
- Each loading placeholder has the size and position of the content that replaces it. Thus, nothing moves when the content loads.
- The avatar of a reply is level with the first line of the reply.

### 3.4 Preview and issue

1. After Create draft, the card shows **Preview**. Preview opens the same invoice preview that the editor shows, with **Open in editor** and, for a draft, **Issue invoice**.
2. Issue invoice opens a dialog. The dialog shows the Customer, the total and the currency. It also tells that the lines and amounts cannot change after the invoice is issued.
3. After the Freelancer confirms, the app issues the invoice through the same procedure as the editor. All the invoice-integrity rules apply. If a rule blocks the issue, the panel shows the message of the editor.
4. If the draft was saved again after the preview opened, the app does not issue it. The preview loads again, and the Freelancer must confirm again.
5. If the invoice is already issued, the app does not issue it again.
6. To open a preview and to issue are not messages. They do not count.
7. Only the Freelancer can issue. The AI cannot issue an invoice.

### 3.5 Formatted replies

- A reply can show bold and italic text, lists, tables, code and links.
- A link operates only if its address is a path of a page of this app (for example an invoice, a Customer or a Conversation). The app shows all other addresses as plain text. This includes outside sites and full addresses on the domain of the app.
- A link to an invoice opens the invoice in the editor. A link to a record of a different Freelancer, or to a deleted record, opens the "not found" page.
- The app shows HTML in a reply as text. The app does not run it.
- While the chat writes a reply, an incomplete format mark shows as typed. When the mark is complete, the format shows.
- The messages of the Freelancer show as plain text.

### 3.6 Dates and search

- Each message tells the chat the date of today, the day of the week and the Freelancer time zone. Thus, "yesterday" and "last Friday" are real days.
- The chat searches for a Customer or product before it says that the record does not exist.
- The chat can give a link to an invoice or a draft.
- The invoice search can filter by the day when the invoice was made, and sort by this day. Thus, the chat can find "the last draft created in January".

### 3.7 Navigation and dashboard

- The navigation has the group "AI" with "AI chat" and "Connect your AI".
- The dashboard shows "Create invoice with AI". Its AI block (prompt box, latest Conversations) was removed by the owner on 2026-10-14.
- If the allowance is used up, the prompt box tells this and links to the editor. The app does not send a message.

### 3.8 Privacy

- The data export includes the Question forms with their questions, options and the answers that were sent (typed text also), the Offered choices and the chosen buttons, the source of each message (typed, press, form or dashboard) and the Start point of each Conversation.
- When the Freelancer deletes the account, the app deletes all of this data.
- The app deletes the forms and the Offered choices with their Conversation (90 days after the last message, or when the Freelancer deletes it).

## 4. Release procedure

1. Merge [ai-assistant](../../ai-assistant/_ship/feature.md) (PR #10) first. This feature is built on it.
2. The owner approves the AI section of the privacy page and sets its "Last updated" date.
3. The owner decides if the terms page must name the model provider in its list of sub-processors (spec §8).
4. On a preview deploy with the gateway key, run `pnpm eval:assistant`. Make sure that the topic and no-guessing sets pass, also the rows for AC-05b, AC-14, AC-24 and the form rows (`form-not-prose-uk`, `form-not-prose-en`, `single-profile-not-asked`, `yesterday-date`, `search-before-add`, `link-to-draft`, `last-draft-january`).
5. Apply the migrations on dev with `pnpm exec prisma migrate deploy`.
6. Apply the migrations on production.
7. Merge the pull request. Then, deploy the code.

> **NOTE:** The 8 migrations add one table, five columns and two enum values. The migration `20261013102000_backfill_conversation_message_origin` sets the source `TYPED` on the messages of the Freelancer that exist. The migration `20261013107000_backfill_choice_offer_questions` changes the Offered choices that exist into forms with one question. You can run each migration again safely.

> **NOTE:** There are no new settings, cron jobs or services. There are two new runtime packages, `react-markdown` 10.1.0 and `remark-gfm` 4.0.1.

## 5. Rollback procedure

1. Deploy the previous build.

> **NOTE:** The previous build does not use the new table and columns. You can keep them.

2. If you must remove them, run the down scripts in `docs/features/ai-chat-v2/migrations/` in this sequence: `08`, `07`, `06`, `05`, `04`, `03`, `02`, `01`.

> **CAUTION:** The down script `06` deletes all the Question forms and changes the source of the form messages to `TYPED`. The down script `05` deletes the "issued from the chat" mark. After this, you cannot calculate the share of drafts issued from the chat. The down script `01` deletes all the Offered choices and forms.

## 6. Checks after the release

1. Each week, make sure that the p95 model cost of a message is USD 0.02 or less.
2. Make sure that the p95 time of the new read questions is 800 ms or less, the p95 time to open a preview is 1.5 s or less, and the p95 time to issue from the chat is 2 s or less.
3. After 60 days, make sure that the Freelancer answers 70 % or more of the Question forms with Send, and that the median number of messages to a draft card is 2 or less.
4. After 60 days, make sure that 25 % or more of the new Conversations start from the dashboard.
5. After 30 days, make sure that 5 % or less of the replies to a drafting request ask for values in the text with no form and no draft card (weekly sample, examined by a person).
6. After 90 days, make sure that 30 % or more of the drafts made in the chat are issued from the chat.

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
- Security reviews: [`security-review-2026-10-14.md`](docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md), [`security-review-2026-10-13.md`](docs/features/ai-chat-v2/_ship/security-review-2026-10-13.md)
