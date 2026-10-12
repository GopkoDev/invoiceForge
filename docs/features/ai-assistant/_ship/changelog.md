# Changelog — ai-assistant

## ai-assistant — an in-app AI chat that answers from your own data and drafts an invoice from one sentence

**What:** A Freelancer with no AI client of their own gets an AI chat inside Invoice Forge, right after sign-in and with nothing to set up. The same draft action reaches external AI clients through MCP, behind a new opt-in permission.

- **AI section** in the navigation.
  - A start panel with example questions, the messages left today and a link to connect your own AI client.
  - A list of Conversations, newest first, each with a title and the date of its last message. A Conversation can be reopened and continued, deleted one at a time or all at once.
  - Conversations are deleted automatically 90 days after their last message; the list says so.
- **"Create with AI"** next to "New invoice" opens a new Conversation that is ready to draft, with an example request. When today's allowance is used up, it says so before anything is typed and links to the editor.
- **The chat answers three kinds of request, and refuses everything else in one sentence:**
  - questions about the Freelancer's own data, through the same seven read questions MCP already offers, so every figure equals the dashboard;
  - drafting an invoice;
  - short "where is this in the app" help, linking only to pages that exist.

  A message that mixes an in-scope request with an off-topic part gets the in-scope answer plus a one-sentence refusal of the rest.
- **A Draft invoice from one sentence.** "invoice Acme for 20 hours of consulting at $50" gives a **draft card**:
  - every value comes from the Freelancer's words or from the editor's own new-invoice defaults, and every default used is named on the card;
  - anything ambiguous or missing (two matching Customers, no matching Customer, a line without an amount, several bank accounts in the currency) is **asked, never guessed**;
  - catalogue prices and the Customer's custom prices apply when no price is named; a named price wins and the catalogue price is shown beside it;
  - the draft exists only after the Freelancer presses **Create**. The card is rebuilt from current data at that press; if anything changed, an updated card is shown for a second confirmation;
  - one card per message, one live card per Conversation: a newer card replaces the earlier ones, which point to it;
  - text stored in the Freelancer's data (such as a Customer note) is never treated as a request.
- **Assistant drafts are marked** in the invoice list and the editor, naming the chat or the Personal key that created them. The mark is gone once the invoice is issued; the Customer's invoice says nothing about AI. No Assistant can issue, send, edit or delete an invoice.
- **Daily message allowance:** 30 messages a day, renewing at midnight in the Freelancer time zone, shown in the chat. Off-topic and follow-up messages count; messages whose reply failed on the system's side do not; a Create press is never a message and works with no messages left. Two tabs sending the last message at once get exactly one through.
- **Draft permission for MCP.**
  - A new Personal key can be created with Draft permission; an existing key can never gain it.
  - The new MCP tool `create_draft_invoice` applies the same no-guessing rule as the chat and refuses with what to ask instead.
  - Each key may create 50 drafts a day; the Freelancer can lift that cap for today on the Connect your AI page (settings), once it is reached.
  - A request sent with a `repeatKey` is safe to retry for 24 hours: it returns the first draft instead of creating a second one.
- **Privacy.** The public Privacy page names the Vercel AI Gateway and Google as processors of chat text and states the 90-day retention. Debugging traces keep metadata only (tools, steps, duration, cost, outcome), never message text. The data export includes Conversations, and deleting the account deletes them.

**Why:** Most Freelancers will never configure an MCP client, so until now they had no AI access to their invoices, and every invoice was built by hand. The feature's contract is trust and cost: nothing guessed, nothing written without the Freelancer's own Create press, an honest allowance, and deletable history. See [spec](../spec.md) §1–§2.

The key decisions:

- [ADR-0003](../adr/0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key.md): a Gemini Flash-Lite model through the AI SDK and the Vercel AI Gateway; the model id is a setting.
- [ADR-0004](../adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md): Mastra runs the agent; its traces hold metadata only.
- [ADR-0005](../adr/0005-classify-each-message-with-a-topic-router-before-the-tool-agent.md): a topic router classifies each message (in scope / mixed / off-topic, read / draft) before the tool agent runs.
- [ADR-0006](../adr/0006-resolve-every-assistant-draft-in-one-deterministic-service-shared-by-chat-and-mcp.md): one deterministic draft resolver, shared by the chat and MCP, owns the no-guessing rule.
- [ADR-0007](../adr/0007-store-draft-cards-server-side-and-create-only-from-a-create-server-action.md): draft cards are stored on the server, and only the Create server action turns one into an invoice.
- [ADR-0008](../adr/0008-store-conversations-in-prisma-tables-keeping-only-what-the-freelancer-saw.md): Conversations are Prisma tables that keep only what the Freelancer saw.
- [ADR-0009](../adr/0009-count-daily-allowances-in-per-local-day-counter-rows.md): allowances are per-local-day counter rows.
- [ADR-0011](../adr/0011-list-the-mcp-draft-tool-to-every-key-and-refuse-it-without-draft-permission.md): the draft tool is listed to every key and refused without Draft permission.
- [ADR-0012](../adr/0012-keep-mcp-repeat-keys-in-their-own-table-purged-after-24-hours.md): MCP repeat keys live in their own table, purged after 24 hours.
- [ADR-0013](../adr/0013-record-the-assistant-origin-as-write-once-columns-on-the-invoice.md): the Assistant origin is recorded as write-once columns on the invoice.

**How to use:** Open **AI** in the navigation, or **Create with AI** on the invoice list, and write *"invoice Acme for 20 hours of consulting at $50"*. Check the card and press **Create**. For an external client, create a new key with Draft permission on the Connect your AI page (settings) and ask it to create a draft. The chat route and the MCP tool are in [openapi.yaml](../contracts/openapi.yaml); the web actions are in [server-actions.md](../contracts/server-actions.md).

**Operational notes:**
- **Settings (required before deploy):** `AI_GATEWAY_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` (the Google AI Studio key registered with the gateway as bring-your-own-key). Both are in the required-settings list, so `pnpm build` fails without them. Optional: `AI_CHAT_MODEL` (default `google/gemini-2.5-flash-lite`). Never set `E2E` or `AI_CHAT_MODEL=stub:e2e` in a real deployment.
- **Migrations:** eleven additive migrations run on deploy with `prisma migrate deploy`: `20261010100000_create_conversation` … `20261010101000_add_mcp_draft_repeat_proposal`. Each has a down script in `docs/features/ai-assistant/migrations/`.
- **Mastra storage:** run `pnpm mastra:migrate` against the target database beside `prisma migrate deploy`. It creates the `mastra` schema (idempotent; Prisma never sees it).
- **Daily clean-up:** the existing `/api/cron/purge-limits` job now also deletes Conversations 90 days after their last message, MCP repeat marks after 24 hours, traces after 30 days, and turn and counter rows after 400 days. No new cron entry.
- **Security review:** [security-review-2026-10-12.md](./security-review-2026-10-12.md). One MEDIUM (deleting a Conversation mid-turn gave the allowance slot back) and one LOW (chat text could reach Sentry) were fixed before ship (b0b88fd). Sentry now never attaches the `/api/chat` body.
- **Model terms:** the free-tier Gemini key lets Google use content to improve its products (ADR-0003); the Privacy page says so. Review the 14-day cost data against the allowance (spec §8).
- **Rollback:** redeploy the previous build. The new tables and columns are unused by the old code and can stay. To remove them, run the down scripts in reverse order (11 → 01); `08_add_invoice_assistant_origin.down.sql` drops the origin record of existing Assistant drafts.

**Acceptance criteria delivered:** AC-01 – AC-42, including AC-06b, AC-10b, AC-11b, AC-11c, AC-14b, AC-16b and AC-19b (49 criteria).

| ACs | What they guarantee |
|---|---|
| AC-01, AC-33 – AC-34 | The AI section and "Create with AI" work with nothing to set up, and say up front when the allowance is used up |
| AC-02 – AC-05, AC-08 | Read answers equal the dashboard, partial lists are called partial, one time zone and one overdue rule |
| AC-06 – AC-07 | Off-topic requests get a one-sentence refusal; mixed requests keep the in-scope part; app help links only to real pages |
| AC-09 – AC-11c | An honest Daily message allowance, exact under concurrency; system failures and Create presses are not counted |
| AC-12 – AC-19b | A draft card from one sentence with named defaults, created only on Create, never twice, never from an outdated or replaced card, never from stored text; a missing or mismatched bank account is explained in words |
| AC-20 – AC-22 | Ambiguous or missing values are asked, never guessed; no Customer is ever created |
| AC-23 – AC-24 | Assistant drafts are marked, and only the Freelancer issues them |
| AC-25 – AC-32 | Draft permission only on new keys, 50 drafts a day per key with a web lift, the same no-guessing refusals through MCP, safe repeats |
| AC-35 – AC-39 | Conversations are listed, reopened and continued, deleted on request or after 90 days, exported and removed with the account |
| AC-40 – AC-42 | Another Freelancer's data and Conversations look like they do not exist; a Visitor is sent to sign in |
