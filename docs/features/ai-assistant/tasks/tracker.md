# Tracker — ai-assistant

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables](./t01-promote-migrations-and-test-support.md) | migration | Dmytro Hopko | M | — | done |
| T02 | [Move the seven read-question definitions from lib/mcp/tools into the shared lib/assistant-tools registry, behaviour unchanged](./t02-move-read-tool-registry.md) | ports | Dmytro Hopko | S | — | done |
| T03 | [Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas](./t03-shared-assistant-types-and-draft-schemas.md) | domain | Dmytro Hopko | M | — | done |
| T04 | [Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema](./t04-ai-runtime-and-mastra-storage.md) | infra | Dmytro Hopko | M | — | done |
| T05 | [Name the AI model provider, the gateway and the chat retention on the public Privacy page](./t05-privacy-page-model-provider.md) | docs | Dmytro Hopko | S | — | done |
| T06 | [Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads](./t06-invoice-assistant-origin-and-issued-at.md) | app | Dmytro Hopko | M | T01 | done |
| T07 | [Resolve the Customer, sender profile, bank account, currency and dates of a draft request with no guessing](./t07-draft-resolver-parties-and-defaults.md) | app | Dmytro Hopko | M | T03 | done |
| T08 | [Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure](./t08-daily-message-allowance.md) | app | Dmytro Hopko | M | T01, T03 | done |
| T09 | [Set Draft permission only when a Personal key is created and return it from the key list and the key check](./t09-personal-key-draft-permission.md) | app | Dmytro Hopko | S | T01 | done |
| T10 | [List and open Conversations owner-scoped, with Draft card views and the current state of every linked invoice](./t10-conversation-reads.md) | app | Dmytro Hopko | M | T01, T03 | done |
| T11 | [Strip every text-bearing attribute from Mastra spans before export and pin it with a span contract test](./t11-metadata-only-span-processor.md) | infra | Dmytro Hopko | S | T04 | done |
| T12 | [Classify every chat message as in_scope, mixed or off_topic before the agent and end off-topic turns with the fixed refusal](./t12-topic-router.md) | app | Dmytro Hopko | M | T04 | done |
| T13 | [Wrap the shared read questions as chat tools bound to the acting Freelancer and add find_in_app over a fixed app map](./t13-chat-read-tools-and-app-map.md) | app | Dmytro Hopko | M | T02, T04 | done |
| T14 | [Add the four independent AI retention steps to the daily purge cron](./t14-daily-clean-up-steps.md) | wiring | Dmytro Hopko | S | T01, T04 | done |
| T15 | [Add Conversations and the AI counters to the data export 2.2 and prove account deletion leaves no AI row](./t15-data-export-and-account-deletion.md) | ports | Dmytro Hopko | S | T01 | done |
| T16 | [Resolve draft lines against the catalogue and custom prices, apply the quantity and unit defaults and finish resolveDraftRequest](./t16-draft-resolver-lines-and-proposal.md) | app | Dmytro Hopko | M | T07 | done |
| T17 | [Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached](./t17-key-daily-draft-limit-and-lift.md) | app | Dmytro Hopko | M | T03, T09 | done |
| T18 | [Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice](./t18-ai-section-route-and-conversation-list.md) | ui | Dmytro Hopko | M | T10 | done |
| T19 | [Add "Create with AI" to the invoice list header and the AssistantMark to draft rows and the editor header](./t19-create-with-ai-entry-and-assistant-mark.md) | ui | Dmytro Hopko | S | T06 | done |
| T20 | [Store Draft cards with one live card per Conversation and create the Draft invoice only from the Create press](./t20-draft-cards-and-create-press.md) | app | Dmytro Hopko | M | T06, T10, T16 | done |
| T21 | [Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction](./t21-create-draft-for-key.md) | app | Dmytro Hopko | M | T06, T16, T17 | todo |
| T22 | [Build the AI start panel with example prompts, the start=draft variant and the AllowanceNotice counter and used-up modes](./t22-ai-start-panel-and-allowance-notice.md) | ui | Dmytro Hopko | M | T08, T18 | todo |
| T23 | [Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton](./t23-conversation-page-and-chat-links.md) | ui | Dmytro Hopko | M | T10, T18 | todo |
| T24 | [Add the Draft permission choice, the permission badges, the read-only explanation and the lift action to Connect your AI](./t24-connect-your-ai-draft-permission-ui.md) | ui | Dmytro Hopko | M | T17 | todo |
| T25 | [Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations](./t25-conversation-writes-and-deletes.md) | app | Dmytro Hopko | M | T10, T20 | todo |
| T26 | [Register create_draft_invoice through registerDraftTool for every key and map its results to the MCP tool answer](./t26-mcp-create-draft-tool.md) | ports | Dmytro Hopko | S | T02, T21 | todo |
| T27 | [Add the propose_draft tool that resolves the Freelancer's own words into a pending Draft card or into questions](./t27-propose-draft-tool.md) | app | Dmytro Hopko | M | T04, T20 | todo |
| T28 | [Build the DraftCard component in every SCR-03 state and wire Create to createDraftFromCard](./t28-draft-card-component.md) | ui | Dmytro Hopko | M | T20, T23 | todo |
| T29 | [Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls](./t29-chat-agent.md) | app | Dmytro Hopko | M | T11, T12, T13, T27 | todo |
| T30 | [Mount the AI-section modal container and confirm deleting one or all Conversations from the list and the Conversation header](./t30-delete-conversations-dialog.md) | ui | Dmytro Hopko | S | T18, T23, T25 | todo |
| T31 | [Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure](./t31-chat-route.md) | ports | Dmytro Hopko | M | T08, T25, T29 | todo |
| T32 | [Add the labelled topic-boundary set and the no-guessing set as a Mastra evaluation run that blocks a failing change](./t32-evaluation-sets.md) | tests | Dmytro Hopko | M | T29 | todo |
| T33 | [Build the useChat island: send only the new message, show waiting, streaming and every outcome, and keep the allowance live](./t33-chat-island.md) | ui | Dmytro Hopko | M | T22, T23, T31 | todo |
| T34 | [Prove provider-fault handling, the stored-text injection guard and cross-tenant silence through the chat route](./t34-chat-resilience-injection-and-tenancy.md) | tests | Dmytro Hopko | M | T31 | todo |
| T35 | [Add Playwright flows: open the AI section, draft and create from a card, Create with AI, and the Assistant mark](./t35-e2e-ai-flows.md) | tests | Dmytro Hopko | M | T19, T28, T33 | todo |

**Total:** 35 tasks, ~30.5 person-days (S = ½ day, M = 1 day).
