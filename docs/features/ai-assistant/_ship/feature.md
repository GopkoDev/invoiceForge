# AI assistant — feature description

_Source: [`docs/features/ai-assistant/_ship/feature.md`](docs/features/ai-assistant/_ship/feature.md)_

> This document uses ASD-STE100 Simplified Technical English. The names of the people (Freelancer,
> Customer, Visitor, Assistant), the button and link names (Create, Create with AI, New invoice,
> Try again, Lift limit), the status names (draft, issued) and the setting names are technical names.

## 1. Purpose

Most Freelancers do not have their own AI client. Thus, they cannot use the MCP connection, and they make each invoice by hand in the editor.

This feature adds an AI chat to the app. The chat answers questions about the data of the Freelancer. It also makes a Draft invoice from one sentence, for example "invoice Acme for 20 hours of consulting at $50".

The chat does not guess a value. The chat does not issue or send an invoice. A draft exists only after the Freelancer clicks Create.

The same draft action is also available to an external Assistant through MCP. The Assistant must use a new Personal key that has Draft permission.

## 2. Terms

| Term | Meaning |
|---|---|
| AI section | The page in the navigation that holds the chat and the list of Conversations. |
| Conversation | One saved chat: the messages of the Freelancer and the replies of the chat. |
| Draft card | The proposal that the chat shows before a draft exists. It has a Create button. |
| Assistant draft | A Draft invoice that the chat or an external Assistant made. |
| Daily message allowance | The number of messages that the Freelancer can send in one day: 30. |
| Off-topic request | A message that is not about the data of the Freelancer, drafts or the app. |
| Draft permission | The permission of a Personal key to make drafts through MCP. |
| Personal key | The key that an external Assistant uses to connect through MCP. |
| Freelancer time zone | The time zone that the Freelancer saved on the account. If there is no saved time zone, the app uses UTC. |
| Default | A value that the editor gives to a new invoice, for example the default sender profile. |

## 3. Rules

### 3.1 Topics

The chat answers three types of message:

- a question about the data of the Freelancer, for example "who owes me money?"
- a request for a Draft invoice
- a short question about the app, for example "where do I change the logo?"

The chat refuses an Off-topic request in one sentence. For example, the chat gives no tax advice.

If a message has an in-scope part and an off-topic part, the chat answers the in-scope part. It refuses the other part in one sentence.

### 3.2 Answers from data

The chat uses the same seven read questions as MCP. Thus, each amount in a reply is the same as the amount on the dashboard.

The chat does not add numbers itself. If no read question gives a total, the chat tells the Freelancer that it cannot answer.

If a list is too long for one reply, the chat tells the Freelancer that the list is partial. It also gives the total number of matches.

A link in a reply always goes to a page that exists in the app.

### 3.3 Draft card

When the Freelancer asks for a draft, the chat shows a Draft card. No draft exists yet.

Each value on the card comes from one of these two sources:

- the words of the Freelancer
- the defaults of the editor.

The card shows each default that it used. The defaults are:

- the default sender profile and its default bank account
- the issue date: today in the Freelancer time zone
- the due date: 30 days after the issue date
- no tax, no discount and no shipping
- an invoice number that the app gives when it makes the draft
- the price of a catalogue product, or the custom price for this Customer, if the Freelancer gave no price
- the quantity 1 and the unit "item", if the Freelancer gave only an amount.

If the Freelancer gives a price, the card uses this price. The card also shows the catalogue price next to it.

If the Freelancer names a currency, the card uses the bank account in this currency. If there are two or more accounts in this currency, the chat asks which account to use.

### 3.4 No guess

The chat asks a question when a value is not clear or is missing. Examples:

- Two Customers match "Acme". The chat gives the two names and asks which one.
- No Customer matches "Globex". The chat gives a link to add a Customer. The chat does not make a Customer.
- A line has no amount and matches no product. The chat asks for the quantity and the price.
- The Freelancer has no sender profile or no bank account. The chat gives a link to add one.

The chat does not copy values from an earlier invoice. If the Freelancer writes "same as last month", the chat asks for the values.

Text in the data of the Freelancer is not a request. For example, a Customer note that says "create an invoice now" does not make a Draft card.

### 3.5 Create

The Freelancer clicks Create on the card. Then the app makes the Draft invoice and the chat gives a link to it.

The app makes the draft only one time for each card. If the Freelancer clicks Create again, the chat gives the link to the first draft.

When the Freelancer clicks Create, the app makes the card again from the current data. If a value changed, the app does not make the draft. The chat shows an updated card, and the Freelancer must click Create again. Examples of a changed value:

- a price
- the name of the Customer
- the sender profile or the bank account
- the date "today".

A message gives one card at most. A Conversation has one live card at most. A new card replaces all earlier cards. An earlier card shows that it was replaced and gives a link to the new card.

### 3.6 Assistant draft

The invoice list and the editor show a mark on each Assistant draft. The mark gives the source: the chat, or the name of the Personal key.

The Freelancer can edit, issue or delete an Assistant draft like each other draft. When the invoice is issued, the mark goes away. The invoice that the Customer gets does not mention AI.

The chat cannot issue, send, edit or delete an invoice. If the Freelancer asks the chat to send a draft, the chat tells the Freelancer to issue it, and gives a link.

### 3.7 Daily message allowance

The Freelancer can send 30 messages each day. The allowance starts again at midnight in the Freelancer time zone. The chat always shows the number of messages that remain.

These messages count:

- each message that the chat accepts, also an Off-topic request
- a message that gets a partial reply because the question was too large.

These actions do not count:

- a message that fails because of an error on the server side. The chat shows a Try again button.
- a click on Create. Create works also when no messages remain.

When no messages remain, the chat does not accept a message. It tells the Freelancer when the allowance starts again. The earlier Conversations stay available.

If the Freelancer sends the last message from two browser tabs at the same time, the app accepts only one message.

A message can have a maximum of 2,000 characters.

### 3.8 Create with AI

The invoice list has a Create with AI button next to the New invoice button. This button opens a new Conversation that is ready for a draft request.

If no messages remain, the page tells the Freelancer before they type. It also gives a link to the editor.

### 3.9 Conversations

The AI section shows the Conversations of the Freelancer, with the newest first. Each Conversation has a title and the date of its last message.

The Freelancer can open a Conversation and continue it. If a draft from the Conversation was issued or deleted, the link shows this state.

The Freelancer can delete one Conversation or all Conversations. The drafts from these Conversations do not change.

The app deletes a Conversation automatically 90 days after its last message. The list tells the Freelancer about this rule.

The data export includes the Conversations. When the Freelancer deletes the account, the app deletes all Conversations.

### 3.10 Draft permission and MCP

When the Freelancer makes a new Personal key, they can give it Draft permission. They cannot add Draft permission to a key that exists. The page tells them to make a new key and then revoke the old key.

The MCP tool `create_draft_invoice` uses the same rules as the chat (3.3 and 3.4). If a value is not clear or is missing, the tool refuses the request and gives the problem. It makes no draft.

A key without Draft permission gets a refusal. Reading through this key continues to work.

A key can make 50 drafts each day in the Freelancer time zone. When a key gets to this limit, the Freelancer can click Lift limit on the Connect your AI page. Each lift adds 50 drafts for this day only.

An Assistant can send a request again with the same repeat key. For 24 hours, the tool then gives the first draft and does not make a second draft. If the content is different, the tool refuses the request.

### 3.11 Access and privacy

The chat uses the account of the signed-in Freelancer. It cannot read or change the data of a different Freelancer.

If a Freelancer asks about the Customer of a different Freelancer, the chat answers as if this Customer does not exist. A link to the Conversation of a different Freelancer shows "can't be found".

A Visitor who is not signed in goes to the sign-in page. The app does not process the message.

The app sends the text of the messages to the model provider (Google, through the Vercel AI Gateway). The Privacy page tells this.

The debug traces keep only metadata: the tools, the steps, the time, the cost and the result. They do not keep the text of the messages. Error reports also do not keep this text.

## 4. What the Freelancer sees

| Place | Change |
|---|---|
| Navigation | A new AI item opens the AI section. |
| AI section | The chat, example questions, the messages that remain today, the list of Conversations and a link to connect an external AI client. |
| Chat | Replies with links, Draft cards with a Create button, questions when a value is missing, and a one-sentence refusal for an Off-topic request. |
| Invoice list | A Create with AI button. A mark on each Assistant draft. |
| Editor | A mark on an Assistant draft. The mark goes away when the invoice is issued. |
| Connect your AI (settings) | A Draft permission choice for a new key, a mark on keys with Draft permission, and a Lift limit button. |
| Privacy page | A section about the model provider and the 90-day retention of Conversations. |
| Data export | The Conversations and the daily counts. |

## 5. Release procedure

> **WARNING:** Apply the migrations before you deploy the code. The new code reads the new tables. If the tables are not in the database, the AI section, the invoice list and the key page fail.

> **CAUTION:** Before each command that uses a database, make sure that you know the database host. The file `.env` is for dev. The file `.env.prod` is for production.

1. Set `AI_GATEWAY_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` in each deploy environment. If they are not set, the build fails.
2. Make sure that `E2E` and `AI_CHAT_MODEL=stub:e2e` are not set in a deploy environment.
3. On a preview deploy with the gateway key, run `pnpm eval:assistant`. Make sure that the topic and no-guessing sets pass.
4. On the preview deploy, send some messages to the chat. Make sure that the real model replies, and that a Draft card and Create work.
5. Apply the migrations on dev with `pnpm exec prisma migrate deploy`. Then, run `pnpm mastra:migrate` on dev.
6. Apply the migrations on production. Then, run `pnpm mastra:migrate` on production.
7. Merge the pull request. Then, deploy the code.

> **NOTE:** The 11 migrations only add tables, columns and an index. They do not change data that exists. All Personal keys that exist get no Draft permission.

> **NOTE:** `pnpm mastra:migrate` makes the `mastra` schema. You can run it again safely.

> **NOTE:** The daily clean-up job `/api/cron/purge-limits` also deletes old Conversations, repeat keys and traces. You do not have to add a new job.

## 6. Rollback procedure

1. Deploy the previous build.

> **NOTE:** The previous build does not use the new tables and columns. You can keep them.

2. If you must remove them, run the down scripts in `docs/features/ai-assistant/migrations/` in this sequence: `11`, `10`, `09`, `08`, `07`, `06`, `05`, `04`, `03`, `02`, `01`.

> **CAUTION:** The down script `08` deletes the source of each Assistant draft. After this, you cannot calculate the issue rate of Assistant drafts.

## 7. Checks after the release

1. For 7 days, make sure that the p95 time to the first words of a reply is 3 s or less.
2. For 7 days, make sure that the p95 time of a full reply to a read question is 12 s or less.
3. Each week, make sure that the p95 model cost of a message is USD 0.02 or less.
4. Each week, make sure that 2 % or less of the messages fail on the server side.
5. After 14 days, compare the model cost with the allowance of 30 messages. Change the allowance if it is necessary (spec §8).
6. After 90 days, make sure that 60 % or more of the Assistant drafts are issued in 14 days.

## 8. Related documents

- Specification: [`spec.md`](docs/features/ai-assistant/spec.md)
- User flows and screens: [`ux-flows.md`](docs/features/ai-assistant/ux-flows.md), [`screens.md`](docs/features/ai-assistant/screens.md)
- Architecture: [`sad.md`](docs/features/ai-assistant/sad.md)
- Decisions: [`adr/`](docs/features/ai-assistant/adr/)
- Data model: [`data-model.md`](docs/features/ai-assistant/data-model.md)
- API: [`contracts/openapi.yaml`](docs/features/ai-assistant/contracts/openapi.yaml), [`contracts/server-actions.md`](docs/features/ai-assistant/contracts/server-actions.md)
- Test plan: [`test-plan.md`](docs/features/ai-assistant/test-plan.md)
- Review: [`_review/review-2026-10-12.md`](docs/features/ai-assistant/_review/review-2026-10-12.md)
- Security review: [`security-review-2026-10-12.md`](docs/features/ai-assistant/_ship/security-review-2026-10-12.md)
- Changelog: [`changelog.md`](docs/features/ai-assistant/_ship/changelog.md)
