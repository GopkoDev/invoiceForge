# Security review — ai-assistant (diff cfa67f0..HEAD)

Date: 2026-10-12 · Scope: everything ai-assistant adds on top of mcp-server: the chat route, the conversation pages and actions, Draft cards, MCP `create_draft_invoice`, allowances, purge, tracing, export and deletion, and the new dependencies · Read-only review (no edits, no DB, no commits), required by spec §6.1 before ship.

## Verdict

**Not CLEAN at review time: one MEDIUM, one LOW. Both are fixed — see Resolution.** Isolation, the Draft permission, the per-key draft cap, repeat keys, prompt-injection gating, the stream contents, cron auth and the e2e stub gate are all sound. **M-01** let any signed-in Freelancer get around the Daily message allowance, the feature's only control on model cost, by deleting a Conversation while its turns were still running. **L-01** was a privacy gap: on a server error, the chat message text could reach Sentry.

## Findings

### M-01 (MEDIUM): deleting a Conversation while a turn is running gives back the allowance slot after the full answer was already streamed

- `app/api/chat/route.ts:178` streams every text chunk to the browser before the turn is saved (`:205`).
- `lib/services/conversations/save-turn.ts:37-42`: when the Conversation row is gone, `saveTurn` returns `NOT_FOUND`.
- `app/api/chat/route.ts:212-214,224-225` treated any failed save as `counted = false` and called `slot.release()`.
- `lib/services/conversations/delete.ts:13` (`deleteConversation`, exposed by `lib/actions/assistant-actions.ts:20`) takes no lock that the running turn holds.

**Attack.**
1. The Freelancer creates a Conversation X. This costs 1 counted message.
2. They fire up to the remaining ~29 parallel `POST /api/chat` with `conversationId: X`. Each passes `loadHistory` and reserves a slot.
3. While those turns stream (several seconds each), they call `deleteConversation(X)`.
4. Every turn delivers its full answer, fails at `saveTurn` with NOT_FOUND, and gives its slot back.
5. They repeat from step 1.

The result is about 29 answered turns of up to 8 agent steps each for every counted message, with no limit. The paid Gemini/Gateway spend grows without bound for any self-signed-up account. Spec §1 D2 allows a slot back only when "the reply failed on the system's side", and this failure is caused by the user.

**Minimal fix.** In the route, treat a `saveTurn` NOT_FOUND as counted: keep the slot and send `ANSWERED`, with no `data-conversation`. Release the slot only on a real system fault.

### L-01 (LOW): Sentry can receive the Freelancer's chat message text

- `sentry.server.config.ts:121-125`: `httpIntegration({ ignoreIncomingRequestBody: isMcpUrl })` skipped the request body only for `/api/mcp`.
- `@sentry/core@10.76.0` `integrations/http/server-subscription.js:52-58` captures any other incoming body up to "medium" size, whether or not `sendDefaultPii` is set.
- `scrubMcpRequest` (`:72-81`) also stripped `request.data` only for MCP.
- Errors reported during a chat request carry the body: `failed()` in `loadHistory`/`saveTurn` (`lib/services/_shared/result-helpers.ts:76`) and `onRequestError` (`instrumentation.ts:15`).

**Attack.** Not attacker-driven. Any DB fault during `POST /api/chat` sent the user's message to Sentry as `request.data`, up to 2,000 characters of financial text (Customer names, amounts). That is outside the processors that spec §6.1 and sad.md §8 name ("errors through redactError", metadata only).

**Minimal fix.** Make `ignoreIncomingRequestBody` and the request scrub also match `/api/chat`, with the same decode-tolerant matching.

## Resolution

- **M-01 — fixed.** `app/api/chat/route.ts`: a `saveTurn` NOT_FOUND (the Conversation was deleted during its own turn) keeps the slot and ends `ANSWERED, counted: true`; `saveTurn` has already written the counted metadata row, so no FAILED row is added. Only other save failures release the slot. Pinned by `tests/integration/api/chat-route.test.ts` › "a Conversation deleted during its own turn (security review M-01)" (RED before the fix: `COULD_NOT_COMPLETE, counted: false`).
- **L-01 — fixed.** `sentry.server.config.ts`: one decode-tolerant matcher covers `/api/mcp` and `/api/chat`. `hasPrivateBody` drives `ignoreIncomingRequestBody`, and `scrubPrivateRequest` (was `scrubMcpRequest`) drops the body and cookies of a chat event (all headers too for MCP). Pinned by `tests/unit/config/mcp-sentry-scrub.test.ts`, including the `/api/%63hat` and trailing-slash forms.

## Checked and found sound (no finding)

**Session and isolation**
- **Chat authn**: `/api/chat` is not public, so the proxy returns 401 to anonymous requests (`proxy.ts:99-106`). The handler also calls `actingFreelancerForRoute` (`route.ts:63-67`). The actor always comes from the session, never from the body. The body schema is `.strict()` (`lib/validations/assistant-chat.ts:44-64`).
- **CSRF**:
  - The chat route has no Origin check. It relies on the Auth.js default session cookie (`SameSite=Lax`, httpOnly; no override in `auth.config.ts`/`auth.ts`), so a cross-site `fetch`/form POST carries no session.
  - The Create, delete and lift actions are Next server actions, which check Origin.
- **Tenant scoping (AC-40/41/42)**:
  - `loadHistory`/`getConversation`/`listConversations` filter on `userId` (`conversations.ts:53,113,141,157,183`). `readInvoiceStates` filters on `senderProfile.userId` (`:81`).
  - Delete is `deleteMany({id,userId})` (`delete.ts:13,23`).
  - Raw SQL is all tagged-template and owner-scoped: `cards.ts:99-104`, `save-turn.ts:37-38`, `allowance.ts:102-120` and `key-drafts.ts:39-78`, which joins `k."userId"`. The diff adds no `Unsafe` or `Prisma.raw`.
  - Unknown and foreign ids return the same NOT_FOUND. The page path goes through `notFound()` (`unwrap-page-result.ts:19-21`).
  - A new Conversation id is minted by the server (`route.ts:134`), so a client cannot make a row under a chosen id.
- **Resolver**: customers, products, custom prices and sender profiles/accounts are all read with `userId: actor.userId` (`resolve-parties.ts:59-70,226-236`, `resolve-lines.ts:122-133`). A model-supplied `customerId`/`productId` from another tenant gets the same not-found result.

**Prompt injection and data in the stream**
- **Prompt injection (AC-15)**:
  - `propose_draft` parks no card unless the router judged the Freelancer's own latest message as `draft` (`propose-draft.ts:66`, `router.ts:51`). An invalid intent degrades to `read` (`router.ts:38`).
  - Tool descriptions carry `DATA_NOT_INSTRUCTIONS`, and stored names stay `{freelancerText}`.
  - Creating a draft needs the Create press (`cards.ts:90-157`), which re-resolves the request and refuses changed content (`:125`).
  - The chat tools cannot issue, send, edit or delete (`agent.ts:20-26`).
- **Stream contents**:
  - Only `text-*`, `data-link`, `data-draft-card {cardId}`, `data-allowance`, `data-outcome` and `data-conversation` reach the browser. `tool-call`/`tool-result` are consumed on the server (`run-turn.ts:198-206`), and `onError` returns a fixed string (`route.ts:161`).
  - Links come only from tool results (`run-turn.ts:68-79`). They render through `APP_MAP`/`protectedRoutes` and React escaping (`chat-link.tsx:20-47`); there is no `dangerouslySetInnerHTML` in `components/ai`.
- **Bank numbers**: the card and issues show only `bankName ••last4` (`resolve-parties.ts:36`, `create-for-key.ts:67`). The read tools select no bank columns (unchanged from mcp-server).

**Draft permission, cap and repeat keys**
- **Draft permission (AC-26/29)**:
  - It is set only in `createPersonalKey` (`personal-keys.ts:51-69`; the schema is a boolean defaulting to false).
  - No update path writes `canCreateDrafts`. The only `personalKey.update*` calls are revoke, `lastUsedAt` and `firstSuccessAt`. The migration defaults existing keys to false.
  - It is read live on every MCP call (`authenticate.ts` SELECT with `revokedAt IS NULL`). It is enforced before argument parsing (`lib/mcp/server.ts:131-138`) and again in the service (`create-for-key.ts:109-111`).
- **Per-key cap and lift**:
  - Taking a slot is a conditional `UPDATE … WHERE created < allowance` inside the invoice transaction (`key-drafts.ts:35-43`), so parallel calls cannot pass 50 and a rollback gives the slot back.
  - Lifting needs owner + not revoked + Draft permission + `created >= allowance`, so a double click lifts once (`:67-79`).
- **Repeat keys**:
  - The primary key is `(personalKeyId, repeatKey)`, so a mark is scoped per key and therefore per tenant. The replayed invoice is read with `customer.userId` (`create-for-key.ts:122-126`).
  - Content that differs from the first call gets `CONFLICT` (`:121`). A race goes through the unique-violation path and answers with the winner's mark (`:199-202`).
  - Marks are honoured for 24 h only (`repeat-marks.ts:26`) and purged after 24 h (`purge.ts:16-21`).

**Allowance and cost caps**
- **Allowance race (AC-10b)**: the day row is created with `skipDuplicates`, then a conditional increment `used < 30` with `RETURNING` (`allowance.ts:96-111`). Release is idempotent per reservation, and a DB failure fails closed (503).
- **Size and cost caps**: the message is at most 2,000 characters after trim, with one text part (`assistant-chat.ts:56,60`). History is capped at 40 on the server (`conversations.ts:21,191`; `run-turn.ts:117`), steps at `maxSteps: 8` (`agent.ts:11`, `run-turn.ts:182`), and draft lines at 50 (`schema.ts:40`). There is no route-level byte cap: `request.json()` is bounded only by the platform limit and needs a session. Not reported.

**Purge, traces, export and deletion**
- **Cron**: a constant-time Bearer `CRON_SECRET` check that fails closed when the secret is unset (`app/api/cron/purge-limits/route.ts:20-27`). It deletes only:
  - Conversations idle for more than 90 days, with messages and cards cascading;
  - repeat marks older than 24 h;
  - Mastra traces older than 30 days;
  - turns and counters older than 400 days.

  Steps are isolated, and Sentry gets only the step name.
- **Traces**: `metadataOnlyProcessor` rebuilds attributes from an allow-list and clears `input`/`output`/`metadata`/`requestContext`/`tags`. Error messages are replaced with `redacted` (`metadata-only-processor.ts:61-95`). The agent has no Mastra memory, so no threads are stored. The router uses `generateText` outside Mastra, so it is not traced. `AssistantTurn` holds metadata only (`turn-row.ts`).
- **Export and deletion**:
  - The export adds Conversations (text, links, card proposals), daily message counts, `canCreateDrafts` and the per-key draft days. It omits `assistantKeyId` (`account.ts:132-195`).
  - Every new table cascades from User or PersonalKey (`ai.prisma:35,55,73-74,97,118`; `auth.prisma` `PersonalKeyDraftDay`/`McpDraftRepeat`). `McpDraftRepeat` is not exported, but it lives for 24 h only.

**Stub model, secrets and dependencies**
- **e2e stub**: selected only when `E2E === '1'` and `AI_CHAT_MODEL === 'stub:e2e'` together (`lib/ai/model.ts:9`). Only `tests/e2e/support/start-app-server.mjs:124-125` sets them. `vercel.json` and `.github` set neither, and nothing else in `lib`/`app` reads `E2E`.
- **Secrets**: `AI_GATEWAY_API_KEY`/`GOOGLE_GENERATIVE_AI_API_KEY` are server-only required settings (`lib/env/required-settings.ts:15-16`). They have no `NEXT_PUBLIC_` form, are never sent to the client, and are not logged. Side note: the Google key is not read by app code (it is registered at the Gateway as bring-your-own-key), so it need not live in the runtime env.
- **Dependencies**: exact pins: `ai@7.0.137`, `@ai-sdk/gateway@4.0.110`, `@ai-sdk/google@4.0.93`, `@ai-sdk/react@4.0.140`, `@mastra/core@1.76.0`, `@mastra/pg@1.31.0`, `@mastra/observability@1.19.0`. `pnpm audit --prod` reports only `sprintf-js` (moderate DoS, GHSA-hp3w-g68c-fv3c) through `@mastra/core>gray-matter>js-yaml>argparse`. That is an argparse CLI path and no user input reaches it, so it is not exploitable.
- **Write paths**: `createInvoice`'s new `origin`/`tx` parameters are reachable only from the services. The browser-facing `createInvoice` action passes two arguments (`lib/actions/invoice-actions/invoice-actions.ts:56`), so a browser cannot forge an Assistant origin.
