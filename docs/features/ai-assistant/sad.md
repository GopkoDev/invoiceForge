---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
target_surfaces: [backend-service, web-frontend]  # filled in §4 — subset of: backend-service | web-frontend | mobile-app | desktop-app | cli | worker | library-sdk. Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — ai-assistant

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** An in-app AI chat inside Invoice Forge for Freelancers who have no AI client of their own: a new **AI section** in the navigation, a **"Create with AI"** entry next to "New invoice", answers about the Freelancer's own invoices through the seven existing read questions, short "where is this in the app" help, and the headline action, a **real Draft invoice from one sentence** that exists only after the Freelancer presses Create on the card the chat proposed. The same draft action ships at once to external Assistants over MCP, behind a new **Draft permission** that can be chosen only when a Personal key is created, capped at 50 drafts per key per day. Both channels share one no-guessing rule that lives inside the action itself: every value on an Assistant draft comes from the request or the editor's own new-invoice defaults, and anything else is asked (chat) or refused (MCP). Spend is bounded by an honest **Daily message allowance** and a per-message work cap; Conversations are saved, listed, deletable and removed 90 days after their last message (spec §1, §2).

**Top-4 quality goals (1-liners; full scenarios in §10):**

1. **Write safety without guessing** — no Assistant draft carries a value from neither the request nor the editor defaults, the chat never creates a draft without the Freelancer's Create press, and no press or retry ever creates a second draft.
2. **Bounded, honest cost** — the Daily message allowance holds exactly under concurrency, one message can never consume a day's budget, and model cost stays within the spec's per-message p95.
3. **Trustworthy answers** — every figure equals the dashboard to the cent, one Freelancer's data never reaches another, and the topic boundary refuses off-topic requests without refusing in-scope ones.
4. **Responsiveness under a third-party dependency** — first visible words and full replies inside the spec's p95 budgets, and a model-provider outage shown within seconds while the rest of the app keeps working.

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Freelancer | Uses the AI section and chat, presses Create on draft cards, manages Conversations, creates keys with Draft permission and lifts their daily draft limit | No |
| Assistant | Either the in-app chat acting inside the Freelancer's signed-in session, or an external MCP client acting through a Personal key; reads, and with Draft permission creates Draft invoices | No |
| Visitor | Any caller without a session or valid key; must be sent to sign in or refused, with nothing processed or counted | No |
| Security Lead | First AI write path, new key capability, new processor of personal data, new store of financial conversation text (spec §6.1 "Security review: Required") | Yes |
| Tech Lead | SAD approval | Yes |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

**Technical.**
- TypeScript 5 (strict) on Node.js `>=22.18 <23`, pnpm 10.25.
- Next.js 16.3.8 App Router and React 19.2.3, both pinned exactly; route handlers on the Node.js runtime; next-auth 5.0.0-beta.32 (pinned beta, edge-safe `auth.config.ts`); zod 3.25 (a 4.x copy is also pulled in transitively).
- PostgreSQL via Prisma 7.10 + `@prisma/adapter-pg`; split schema `prisma/schema/{base,auth,invoice}.prisma`; migrations by `prisma migrate`.
- `@modelcontextprotocol/sdk` 1.32.0 (pinned); the MCP server registers its tools through `lib/mcp/server.ts`, read-only by construction today (`registerReadOnlyTool`).
- **No AI runtime is installed.** Every new AI package (SDK, provider, UI hook) is added with an exact version pin, like the other upgrade-sensitive dependencies, and must accept zod 3.25 schemas.
- Hosted on Vercel, region `fra1`, one daily cron (`/api/cron/purge-limits`, `vercel.json`).
- Business logic only through `lib/services/*`, every function taking an `ActingFreelancer` first (service-layer ADR-0001), behind `server-only` + lint rules (service-layer ADR-0006); aggregates are parameterized raw SQL (service-layer ADR-0004); lists return the shared page envelope (service-layer ADR-0005).
- PDF rendering is browser-only (editor-ux ADR-0001); this feature adds no server-side PDF (spec §3).
- Tests: vitest (unit / component / contract), an integration config on throwaway Postgres 16 containers, Playwright e2e run locally (not in CI).

**Organisational.**
- No external deadline; the motivation is product direction (spec §1).
- Size L (`.size`), route `full`; implementation follows the roadmap's three waves (`roadmap.md` §Execution path).
- Team: one developer (Dmytro Hopko) working with AI agents through the SDD pipeline.
- The product pays for every model token (no bring-your-own key, no paid plans — spec §3); the monthly budget per weekly active chat user is open until the 14-day review (spec §8).

**Conventions.**
- `docs/architecture-map.md` §Conventions and the feature ADRs it cites; the mcp-server SAD §2 for the Assistant-side conventions.
- Results: `ActionResult<T>` with typed codes `UNAUTHORIZED | NOT_FOUND | VALIDATION | CONFLICT | FAILED | RATE_LIMITED` (`types/result.ts`); plain-language messages, Prisma errors scrubbed by `redactError`; writes scoped by owner in the `WHERE` clause (service-layer ADR-0003).
- Actor factories only: `actingFreelancerFromSession()` (server actions), `actingFreelancerForRoute()` (route handlers), `actingFreelancerFromPersonalKey()` (MCP).
- Proxy deny-by-default including `/api`, public paths an explicit allowlist (architecture-hardening ADR-0001); a new page route goes into `protectedRoutesBase`.
- Limits: exact sliding windows over the Postgres `LimitEvent` log under an advisory lock (security-patch ADR-0002), purged daily (security-patch ADR-0007); Assistant calls fail closed when counting fails (mcp-server ADR-0007).
- Dates: invoice dates are calendar days (mcp-server ADR-0009); "today" comes from the Freelancer time zone saved on the account (mcp-server ADR-0006); overdue is computed at read time by one rule module (mcp-server ADR-0005).
- Invoice numbers allocated under a sender-profile row lock (architecture-hardening ADR-0005); account deletion in one explicit transaction (architecture-hardening ADR-0007).
- IDs: `cuid()` strings; every domain row carries `userId`.
- UI: shadcn/ui (base-vega) + Tailwind 4 tokens; reusable components registered in `docs/design-system.md`.

**Regulatory / external.**
- **New processor of personal data.** Message text and tool answers go to an external model provider; the Privacy page must name it (category, retention, no training on the data) before ship (spec §6.1, §8).
- **Retention.** Conversations are deleted within 24 h after 90 days from their last message, on Freelancer request (one or all), and with the account; they are included in the data export (spec §6.1, AC-37–AC-39).
- **Traces hold metadata only** — tools called, steps, duration, cost, outcome; never message text or tool answers, so deleting a Conversation deletes the only copy of its content (spec §1, §6.1).
- **Aggregates kept:** per-day message counts, per-key draft counts and lift times, and the origin of each Assistant draft (kept after issuing, never shown) — listed in the export and removed with the account or invoice (spec §6.1).
- Security review required before ship (`/security-review`, spec §6.1).

## 3. Context and scope

Invoice Forge is a web app where a Freelancer manages sender profiles, Customers, products and invoices. This feature adds an in-app Assistant (the chat) that answers questions about the Freelancer's own data and proposes Draft invoices, and extends the existing MCP endpoint with a draft action for external Assistants holding a key with Draft permission. The trust boundary gains one new outbound edge: the content of each chat turn, including Customer names and amounts from tool answers, leaves the system for an external model provider, and what comes back is untrusted text that may only propose, never write.

<!-- brownfield: docs/architecture-map.md (reflects 2064466; only docs changed since) — Next.js 16 monolith on Vercel, service layer with ActingFreelancer, read-only MCP server at /api/mcp behind Personal keys, Postgres via Prisma, no AI runtime installed. -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Freelancer | Person | Signs in, uses the AI section and chat, presses Create on draft cards, manages Conversations and Personal keys |
| Assistant (external MCP client) | Person (external program acting for one Freelancer) | Calls the seven read tools and, with Draft permission, the draft action over MCP with a Personal key |
| Visitor | Person | Reaches pages or endpoints without a session or key; sent to sign in or refused |
| AI model provider (new) | System (external) | Receives each chat turn's context and tool schemas, streams back text and tool calls; the concrete provider and access path are decided in §4 |
| Sentry | System (external, existing) | Receives errors and metadata-only traces and spans |
| Google OAuth / SMTP | System (external, existing, unchanged) | Sign-in provider and sign-in link email |

**C4 Context (L1):**

```mermaid
C4Context
    title ai-assistant - System Context

    Person(freelancer, "Freelancer", "Asks the in-app chat, presses Create on draft cards, manages Conversations and keys")
    Person_Ext(assistant, "Assistant (external MCP client)", "Acts for one Freelancer through a Personal key")
    Person_Ext(visitor, "Visitor", "No session and no valid key")

    System(app, "Invoice Forge", "Invoices, dashboard, in-app Assistant chat, MCP endpoint with read questions and the draft action")
    System_Ext(model, "AI model provider", "Produces chat replies and tool calls from each turn's context")
    System_Ext(sentry, "Sentry", "Errors and metadata-only traces")
    System_Ext(signin, "Google OAuth and SMTP", "Sign-in, unchanged")

    Rel(freelancer, app, "Chats, creates drafts, manages Conversations and keys", "HTTPS, session")
    Rel(assistant, app, "Reads and creates drafts", "HTTPS, MCP, Bearer Personal key")
    Rel(visitor, app, "Refused or sent to sign in", "HTTPS")
    Rel(app, model, "Sends turn context, receives streamed text and tool calls", "HTTPS")
    Rel(app, sentry, "Reports errors and metadata spans", "HTTPS")
    Rel(app, signin, "Authenticates the Freelancer", "OAuth, SMTP")
```

## 4. Solution strategy

**Target surfaces: `[backend-service, web-frontend]`** (ADR-0001). The backend service is the existing Next.js app, which gains:
- the chat route handler;
- the topic router and agent;
- the draft resolver and the Create server action;
- the MCP draft tool;
- the counters;
- the daily clean-up inside the existing cron route.

The web frontend gains the AI section, the Conversation with the inline Draft card, the delete dialog, "Create with AI", the Assistant-draft mark and the Draft-permission choice on the Connect your AI page (`ux-flows.md` SCR-01–SCR-13). There is no separate worker surface. Retention runs in the daily cron route that already exists.

**Top strategic choices (the seeds for ADRs):**

1. **Two surfaces in one deployable, with the chat as an RSC page plus a streaming client island** (ADR-0001, ADR-0002). The AI section and the Conversation list are server-rendered like the rest of the app. The chat itself is a client island driven by the AI SDK UI `useChat` hook, reading a UI-message stream from a new session-guarded route handler. Streaming meets the first-words budget (QG-4). A route handler, unlike a server action, does not serialize the page's other actions behind a long reply, so a Create press never waits for a stream to end.
2. **The model runs through the AI SDK and the Vercel AI Gateway, with a Mastra agent and Mastra observability on top** (ADR-0003, ADR-0004).
   - The model is a Google Gemini Flash-Lite model on a Google AI Studio **free-tier key**, registered with the gateway as bring-your-own-key. The model id is the setting `AI_CHAT_MODEL`, not a code constant. Model spend is zero while the free tier holds (QG-2).
   - Two consequences are recorded as a §1 override and §11 risks:
     - the free tier's terms let Google use the content to improve its products, which contradicts spec §6.1 / §8;
     - its project-wide request limits cap the whole chat at roughly 300–1,300 messages a day (ADR-0003).
   - The gateway keeps the provider a configuration choice and reports per-call usage.
   - There are no turn deadlines in code (§7). A rate-limited or failed provider call ends the turn as a system-side failure.
   - Mastra owns the agent definition, the evaluation runs and the debugging traces.
   - A metadata-only span processor strips message text and tool answers from every span before export. This keeps Mastra inside the spec's metadata-only rule rather than by convention.
3. **A topic router classifies every message before the tool agent runs** (ADR-0005). A short structured classification sees the new message plus the last few turns and returns `in_scope`, `mixed` or `off_topic`.
   - `off_topic` ends the run with the fixed one-sentence refusal, so no tools are loaded and none can be jailbroken.
   - `mixed` runs the agent with an instruction to refuse the rest in one sentence.
   - The verdict is recorded by code, so the Off-topic KPI and the ≥ 95 % / ≤ 5 % evaluation measure the router directly (QG-3).
4. **The model proposes, code decides** (ADR-0006, ADR-0007). The agent's only write-shaped tool, `propose_draft`, carries the request's own words as a strict structured request (Customer word or id, lines as stated, currency or symbol, dates, optional fields). It never carries resolved values.
   - One deterministic service, `resolveDraftRequest(actor, request)` in `lib/services/assistant-drafts/`, does all the work: name matching, currency-symbol rules, catalogue and custom prices, the editor's new-invoice defaults, and the no-guessing guard. It returns either questions or refusals, or a proposal whose every value names its source.
   - The chat stores that proposal as a server-side Draft card. Only the Freelancer's Create press, a server action that is never a model call and never a message, creates the invoice. It re-resolves the stored request against current data and creates only when the content matches what the Freelancer confirmed.
   - The MCP draft tool calls the same resolver and creates at once when the request is complete, so both channels share one guard (QG-1).
5. **Everything stays in the one Postgres, owned by Prisma, keeping only what the Freelancer saw** (ADR-0008, ADR-0009).
   - Conversations and their messages live in a new `prisma/schema/ai.prisma`. Each message holds the visible text, link targets as ids and a reference to its Draft card, never raw tool answers. Export, the 90-day clean-up and account deletion therefore stay in one transaction model, and history replayed to the model stays cheap.
   - The Daily message allowance and the per-key draft limit are per-local-day counter rows. Each message reserves a slot with a conditional increment and gets it back on a system-side failure, so concurrency never overshoots (QG-2).
   - Mastra's own trace store sits in a separate `mastra` schema of the same database and holds metadata only.

Each tactical decision in later sections traces to one of these seeds. A tactical decision that contradicts one is raised in §11.

**UI architecture (web-frontend):** hybrid. RSC pages for the AI section and the Conversation shell, and a `'use client'` chat island with `useChat`, composed from the existing shadcn/ui primitives and the `docs/design-system.md` inventory (ADR-0002). Client state stays inside `useChat` plus the existing modal registry for the delete dialog. No new global store.

**Resolved spec §8 open questions (due before design):**
- *Allowance after a time-zone change:* changing the Freelancer time zone never renews the allowance earlier than 24 hours after the first message of that day. The counter row keeps the time zone and first-message time it was opened with (ADR-0009).
- *Reply language:* the Assistant replies in the language of the Freelancer's message, Ukrainian and English included, refusals and follow-up questions too. Fixed app text, such as the allowance banner and card labels, stays English (§8).

## 5. Building block view

The feature keeps the repo's layering: thin adapters (pages, route handlers, server actions, MCP tools) resolve an `ActingFreelancer` from a trusted factory and call services in `lib/services/<domain>/`, which own every rule and every database access. Three things are new:

- **`lib/ai/`** — the Mastra agent layer: agent definition, topic router, tool adapters, metadata-only span processor. Its tools are adapters too: they call services with the actor bound to the request and never touch Prisma.
- **`lib/assistant-tools/`** — one registry of the seven read questions, moved out of `lib/mcp/tools/`. MCP and the chat both register from it, so the two channels cannot drift (ADR-0010).
- **Three service domains** — `assistant-drafts` (resolver, Draft cards, create-from-card), `conversations`, and `assistant-usage` (allowance and key-draft counters, per-turn metadata).

The invoice and personal-key services are extended in place, not wrapped. The web frontend is the existing Next.js page tree: a new `app/(protected)/ai/` segment with RSC pages and a `components/ai/` client island built from `components/ui/` and the `docs/design-system.md` inventory.

**Internal decomposition:**

```
app/
├── (protected)/ai/                     page.tsx (AI section: start + Conversation list), [conversationId]/page.tsx, loading.tsx  — RSC
├── (protected)/invoices/…              + "Create with AI" entry, Assistant-draft mark in the list
├── (invoice-editor)/…                  + Assistant-draft mark in the editor
├── (protected)/settings/assistants/    + Draft permission in the new-key dialog, per-key draft count, lift action
└── api/
    ├── chat/route.ts                   NEW  session-guarded; reserve allowance → router → agent stream → persist → release on failure
    ├── mcp/route.ts                    unchanged route; server registers the draft tool
    ├── user/export/route.ts            + Conversations, daily counts, key draft counts and lifts
    └── cron/purge-limits/route.ts      + Conversations past 90 days, MCP repeat keys past 24 h, Mastra traces past retention
components/ai/                          NEW  chat island (useChat), message list, Draft card (live / replaced / outdated / created), allowance banner, delete dialog container
lib/
├── ai/                                 NEW  Mastra instance + storage (schema `mastra`), chat agent, topic router (input processor), metadata-only span processor, instructions
│   └── tools/                          NEW  read-tool adapter (from assistant-tools), propose_draft, find_in_app
├── assistant-tools/                    NEW  (moved from lib/mcp/tools) seven read-question definitions: zod in/out + handler
├── mcp/
│   ├── server.ts                       registerReadOnlyTool (from the shared registry) + NEW registerDraftTool
│   └── tools/create-draft.ts           NEW  create_draft_invoice — permission check, key limit, repeat key, resolver, create
├── services/
│   ├── assistant-drafts/               NEW  resolveDraftRequest, request schema, Draft cards, createFromCard, createForKey
│   ├── conversations/                  NEW  list / open / append / trim to 40 / delete one or all / purge after 90 days / export
│   ├── assistant-usage/                NEW  message-allowance counter, key-draft counter + lift, per-turn metadata rows
│   ├── invoices/                       + Assistant origin on create; origin never copied by duplicateInvoice
│   ├── personal-keys/                  + Draft permission at creation only
│   └── account/                        + new tables in the account-deletion transaction
├── actions/assistant-actions.ts        NEW  createDraftFromCard, deleteConversation, deleteAllConversations, liftKeyDraftLimit
config/routes.config.ts, navigation-menu.config.ts   + AI section route and sidebar entry
prisma/schema/ai.prisma                 NEW  Conversation, ConversationMessage, DraftCard, MessageAllowanceDay, AssistantTurn
prisma/schema/auth.prisma               + PersonalKey.canCreateDrafts, PersonalKeyDraftDay, McpDraftRepeat
prisma/schema/invoice.prisma            + Invoice.assistantOrigin / assistantKeyName / assistantKeyId / issuedAt
```

Building-block decisions:

- **One read-tool registry for both channels** (ADR-0010). The seven definitions (name, description, zod input/output, handler taking the actor) move to `lib/assistant-tools/`. `lib/mcp/server.ts` registers them with `registerReadOnlyTool` as today, and `lib/ai/tools/` wraps the same handlers as Mastra tools. The chat's dashboard parity is the MCP parity by construction.
- **The draft tool is listed to every key and refused without Draft permission** (ADR-0011).
  - `PersonalKey.canCreateDrafts` is set only by the create-key service and has no update path.
  - `create_draft_invoice` is registered through a new `registerDraftTool`, which sets `readOnlyHint: false` and runs the permission check before anything else.
  - A key without the permission gets the AC-29 refusal. The tool's description says a key with Draft permission is needed.
- **MCP repeat marks live in their own table** (ADR-0012). The tool takes an optional `repeatKey`.
  - `McpDraftRepeat` (key id + repeat key unique, request fingerprint, invoice id, created at) is written in the same transaction as the invoice.
  - A repeat within 24 h returns the first draft, and the same key with different content is refused.
  - The daily cron deletes rows older than 24 h.
- **The Assistant origin sits on the invoice** (ADR-0013). `assistantOrigin` (`CHAT` | `PERSONAL_KEY`), `assistantKeyName` (the name at creation) and `assistantKeyId` (set to null if the key row is deleted) are written once at creation and never changed.
  - The mark is rendered only while the invoice is a draft.
  - Issued details and the PDF never read these columns, and `duplicateInvoice` never copies them.
  - `Invoice.issuedAt` is written once, when an invoice first leaves draft, so the north-star KPI can measure "issued within 14 days". The schema records no such time today.
- **"Where is this in the app" comes from a fixed map.** `find_in_app` answers from a static list of the app's real pages (route, title, what is set there) built from `config/routes.config.ts`, so the Assistant only ever links to pages that exist (AC-07). Inline: one module, no alternative worth recording.
- **`AssistantTurn` holds per-message metadata only**: kind, outcome, counted, steps, tool names, duration, tokens, cost — no text. It feeds the §7 KPIs and survives Conversation deletion (its Conversation reference is set to null), and it is removed with the account (ADR-0004).

**C4 Container (L2):**

```mermaid
C4Container
    title ai-assistant - Containers

    Person(freelancer, "Freelancer")
    Person_Ext(assistant, "Assistant (external MCP client)")

    Container_Boundary(app, "Invoice Forge (one Next.js deployable on Vercel)") {
        Container(web, "Web frontend", "Next.js 16 RSC pages + React 19 client islands, useChat", "AI section, Conversation with Draft cards, Create with AI, Assistant-draft mark, Draft permission and lift on Connect your AI")
        Container(chat, "Chat route", "app/api/chat route handler", "Session guard, allowance reservation, streams the agent reply, persists visible messages")
        Container(actions, "Server actions", "lib/actions, use server", "Create from card, delete Conversations, lift key draft limit")
        Container(mcp, "MCP server", "lib/mcp, MCP SDK 1.32", "Seven read tools and create_draft_invoice behind Personal key auth")
        Container(agent, "Assistant agent", "lib/ai, Mastra on the AI SDK", "Topic router, tool agent, read-tool adapters, propose_draft, find_in_app, metadata-only spans")
        Container(services, "Service layer", "lib/services", "assistant-drafts resolver and cards, conversations, assistant-usage counters, invoices, personal-keys")
        Container(cron, "Daily clean-up", "app/api/cron/purge-limits", "Deletes Conversations past 90 days, repeat keys past 24 h, old traces")
    }

    ContainerDb(db, "PostgreSQL", "Prisma 7 schemas public, plus Mastra schema mastra", "Conversations, Draft cards, counters, turn metadata, invoices with origin, keys with Draft permission; Mastra traces")
    System_Ext(gateway, "Vercel AI Gateway and Google Gemini", "Gemini Flash-Lite on a free-tier key (BYOK)")
    System_Ext(sentry, "Sentry", "Errors and metadata spans")

    Rel(freelancer, web, "Uses", "HTTPS")
    Rel(assistant, mcp, "Calls tools", "HTTPS, Bearer Personal key")
    Rel(web, chat, "Sends messages, reads the stream", "HTTPS, UI-message stream")
    Rel(web, actions, "Presses Create, deletes, lifts")
    Rel(chat, agent, "Runs one turn")
    Rel(chat, services, "Reserves allowance, saves messages")
    Rel(agent, services, "Read tools and draft resolver as the acting Freelancer")
    Rel(agent, gateway, "Router and agent calls", "HTTPS")
    Rel(actions, services, "Direct call")
    Rel(mcp, services, "Direct call")
    Rel(cron, services, "Daily purge")
    Rel(services, db, "Reads and writes", "Prisma client")
    Rel(agent, db, "Stores metadata-only traces", "Mastra storage")
    Rel(agent, sentry, "Reports spans and errors")
```

## 6. Runtime view

design seeds the three critical flows below; `sequences` covers every §5 acceptance criterion. Participants are the §5 containers.

**Critical flow 1: one chat message (read answer or draft card)**

```mermaid
sequenceDiagram
    actor F as Freelancer
    participant W as Web frontend
    participant C as Chat route
    participant S as Service layer
    participant A as Assistant agent
    participant G as AI Gateway and model
    F->>W: types a message and sends it
    W->>C: message text and Conversation id
    C->>S: resolve acting Freelancer and check message length
    C->>S: reserve one slot of today's allowance
    alt no slot left
        S-->>C: allowance used up, renewal time
        C-->>W: used-up notice, nothing processed
    else slot reserved
        C->>S: load the latest 40 visible messages
        C->>A: run the turn as the acting Freelancer
        A->>G: classify the message (topic router)
        alt off topic
            A-->>C: fixed one-sentence refusal
        else in scope or mixed
            loop at most 8 tool steps
                A->>G: next step with tool schemas
                G-->>A: text delta or tool call
                A->>S: read question or propose_draft as the Freelancer
                S-->>A: answer, or questions, or a stored Draft card
            end
            A-->>C: streamed text and card data parts
        end
        C-->>W: UI-message stream, first words first
        C->>S: save the visible messages and the turn metadata
        opt system-side failure before the reply completes
            C->>S: release the reserved slot
            C-->>W: could not complete, try again
        end
    end
```

**Critical flow 2: Create press on a Draft card (chat)**

```mermaid
sequenceDiagram
    actor F as Freelancer
    participant W as Web frontend
    participant X as Server actions
    participant S as Service layer
    participant D as PostgreSQL
    F->>W: presses Create on a card
    W->>X: create from card id
    X->>S: createFromCard as the acting Freelancer
    S->>D: lock the card row owned by the Freelancer
    alt card already created
        S-->>X: link to the draft created the first time
    else card replaced by a newer one
        S-->>X: replaced, points to the newer card
    else card live
        S->>S: re-resolve the stored request against current data
        alt content differs from the confirmed card
            S->>D: mark the card replaced and store an updated card
            S-->>X: updated card, confirm again
        else content matches
            S->>D: create the Draft invoice with origin chat and mark the card created, one transaction
            S-->>X: draft link
        end
    end
    X-->>W: result, never counted as a message
```

**Critical flow 3: external Assistant creates a draft over MCP**

```mermaid
sequenceDiagram
    actor E as External Assistant
    participant M as MCP server
    participant S as Service layer
    participant D as PostgreSQL
    E->>M: create_draft_invoice with request and optional repeat key
    M->>S: authenticate the Personal key, acting Freelancer
    alt key has no Draft permission
        S-->>M: refused, key can only read
    else permission present
        M->>S: check the repeat key
        alt repeat within 24 hours
            S-->>M: same content returns the first draft, different content is refused
        else new request
            M->>S: resolveDraftRequest
            alt ambiguous or missing values
                S-->>M: refused, names what is ambiguous or missing
            else complete
                S->>D: in one transaction take one of today's key drafts, create the Draft invoice with origin key name, write the repeat row
                alt key daily limit reached
                    D-->>S: no draft slot left, nothing created
                    S-->>M: refused, lift the limit on the keys page
                else created
                    S-->>M: draft link and every default used
                end
            end
        end
    end
    M-->>E: tool answer
```

## 7. Deployment view

The feature ships inside the existing Vercel deployable (region `fra1`). There is no new runtime unit.
- **Chat route.** `app/api/chat/route.ts` runs on the Node.js runtime with the platform's default function duration; no `maxDuration` is set and the turn has no deadlines of its own (owner decision, §11).
- **Daily clean-up.** The existing daily cron (`/api/cron/purge-limits`, 03:17 UTC) gains its steps. Each step runs and reports independently, so one failure never skips the others.
- **New settings in `lib/env/required-settings.ts`.** `AI_GATEWAY_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are required; the build fails without them. `AI_CHAT_MODEL` is optional and defaults to a Gemini Flash-Lite model.
- **Mastra.** Its packages are declared server-external in `next.config`. Its storage tables (schema `mastra`) are created by an explicit `pnpm mastra:migrate` step run beside `pnpm prisma migrate deploy`, never lazily on a user request.

**Monitoring:**
- **Metrics.** Per-turn metadata rows (`AssistantTurn`: kind, outcome, steps, tools, duration, tokens, cost) feed the spec §7 KPIs: off-topic share, turns per draft, weekly active chat users, allowance exhaustion, cost per weekly active chat user. The Assistant draft issue rate comes from `Invoice.assistantOrigin` + `issuedAt`.
- **Tracing.** One Mastra trace per turn (router, agent steps, tool calls) through the metadata-only span processor into the `mastra` schema and Sentry. Spans also cover the Create server action and the MCP draft tool (`inOutcomeSpan`).
- **Sentry alerts.**
  - System-side failures above 2 % of chat messages in a week.
  - Rate-limited (provider 429) turns above 5 % in a day — the early signal that the free-tier ceiling is near.
  - Model cost per message p95 above USD 0.02 — guards a later move to paid terms.
  - Any failed step of the daily clean-up.

**Retention (daily cron):**
- **Conversations** (with their messages and Draft cards): 90 days after the last message, deleted within 24 h of the mark (spec §6).
- **MCP repeat keys:** after 24 h (ADR-0012).
- **Mastra traces** (metadata only): after 30 days.
- **`AssistantTurn` rows and the daily counters** (`MessageAllowanceDay`, `PersonalKeyDraftDay`): after 400 days. They are listed in the export and removed with the account sooner.

**Scaling thresholds:**
- **Model capacity, the binding limit.** On the free tier one Google project allows roughly 300–1,300 chat messages a day and 3–10 a minute on Flash-Lite (ADR-0003; ranges to verify before ship). That is about 10–40 Freelancers using their full allowance.
  - When rate-limited turns exceed 5 % for three days running, move the key to paid terms (one setting change).
- **Storage** stays small at any realistic scale.
  - At most 30 messages per Freelancer per day, kept 90 days: at most ~5,400 message rows per Freelancer.
  - One allowance row per Freelancer per active day, one key-draft row per key per active day.
  - No partitioning is needed below about 10,000 active Freelancers.
- **Function concurrency** is bounded by the model's request limits long before Vercel's.

## 8. Crosscutting concepts

| Concept | Convention | Where defined |
|---|---|---|
| Authentication | Chat route: session via `actingFreelancerForRoute`; the proxy refuses anonymous `/api` with 401, and AI pages redirect a Visitor to sign-in, with nothing processed or counted (AC-42). MCP: Bearer Personal key, never a session. | `docs/architecture-map.md` §Conventions; architecture-hardening ADR-0001; mcp-server ADR-0003 |
| Authorization and tenancy | Every read and write goes through a service as the `ActingFreelancer`, scoped by owner in the `WHERE` clause. The agent's tools receive the actor bound by the route, never an id from the model. Another Freelancer's Customer, invoice or Conversation answers exactly as one that does not exist (AC-40, AC-41). Draft permission is checked inside `registerDraftTool` (ADR-0011). | service-layer ADR-0001, ADR-0003; here |
| Write safety | The model has no create tool in the chat. `propose_draft` only stores a Draft card, and a chat draft is created only by the Freelancer's Create server action on a card they own (ADR-0007). The MCP draft tool and the chat share `resolveDraftRequest`, the no-guessing guard (ADR-0006). No Assistant can issue, send, edit or delete an invoice; such requests get the AC-24 answer and a link. | here |
| Untrusted text (prompt injection) | Tool answers are data, never instructions. Every tool description carries the existing data-not-instructions suffix, and the agent's instructions say stored text (notes, addresses, product names) is never a request. `propose_draft` is offered only for the Freelancer's own message; injection fixtures prove that stored text never yields a card (AC-15). | `lib/mcp/server.ts` (`DATA_NOT_INSTRUCTIONS`); here |
| Links | The chat renders links only from structured data parts: an invoice id, a Customer form, or a page key from the `find_in_app` map. URLs written by the model are shown as plain text, so the Assistant only ever links to pages that exist (AC-07), and a stored invoice link shows its current state when opened (AC-36). | here |
| Money and figures | Amounts are exact decimal strings from the read questions and the resolver, never converted between currencies. The model never adds numbers up: a total exists only when a read question returns it and it covers every match (AC-04, AC-08). | mcp-server SAD §8; here |
| Time | "Today", day boundaries and allowance days use the Freelancer time zone saved on the account (UTC until saved); invoice dates are calendar days. | mcp-server ADR-0006, ADR-0009 |
| Error handling | Services return `ActionResult` with typed codes. The chat route turns them into stream outcomes: used-up allowance, message too long, could not complete, AI temporarily unavailable. A provider error or rate limit is a system-side failure: the slot is released and the message is not counted (AC-11). Counting fails closed: if the reservation cannot be written, nothing is processed. | `types/result.ts`; ADR-0009 |
| Limits | Daily message allowance and per-key draft limit are per-local-day counter rows with conditional increments (ADR-0009). The existing `LimitEvent` per-key MCP call limits still apply to every MCP call. The per-message work cap is at most 8 agent steps (`stopWhen`) and the latest 40 visible messages as history; a capped turn returns its partial answer and counts (AC-11b). Messages over 2,000 characters are refused before any reservation. | ADR-0009; security-patch ADR-0002 |
| Observability | Metadata-only traces: a Mastra span processor drops every text-bearing attribute (input, output, messages, tool arguments and results) before export, and a contract test fails on any exported text (ADR-0004). Per-turn KPIs are in `AssistantTurn`. Errors go to Sentry through `redactError`. | ADR-0004; here |
| Data lifecycle | Conversations keep only what the Freelancer saw (ADR-0008). Deleting a Conversation removes its messages and Draft cards but never the drafts they created (AC-37). The export lists Conversations, daily message counts, key draft counts and lift times (AC-39). Account deletion removes all of them in the existing transaction. Retention periods are in §7. | architecture-hardening ADR-0007; here |
| Internationalisation | The Assistant replies in the language of the Freelancer's message, Ukrainian and English included, refusals and follow-up questions too; the router's fixed refusal exists in both. App text (banners, card labels, buttons) stays English, as the rest of the app. | spec §8 (resolved in §4) |
| Cost control | A stable prompt prefix: frozen instructions and a deterministic tool order, so provider-side caching applies where offered. Tool answers are not replayed in history (ADR-0008). | here |
| IDs | `cuid()` strings on every new model; every new domain row carries `userId` (or a key id owned by one). | `docs/architecture-map.md` §Conventions |
| Events | N/A — direct calls only, as in the rest of the app; no queue or event bus. | — |
| UI | Composed from `components/ui/` and the `docs/design-system.md` inventory: `ConfirmationModal` for deletes, mounted in a new AI-section modal container, `LoadError`, live-region patterns for streaming text. New components (chat island, Draft card) are registered in the design canon by `implement`. | `docs/design-system.md` |

## 9. Architecture decisions

| # | Title | Status | Section |
|---|---|---|---|
| 0001 | Build the backend service and the web frontend as two surfaces of one deployable | Accepted | §4 |
| 0002 | Serve the chat from an RSC page with a useChat island streaming from a route handler | Accepted | §4 |
| 0003 | Run a Gemini model through the AI SDK and the Vercel AI Gateway on a free-tier key | Accepted | §4 |
| 0004 | Use Mastra for the agent and metadata-only tracing | Accepted | §4 |
| 0005 | Classify each message with a topic router before the tool agent | Accepted | §4 |
| 0006 | Resolve every Assistant draft in one deterministic service shared by chat and MCP | Accepted | §4 |
| 0007 | Store Draft cards server-side and create only from a Create server action | Accepted | §4 |
| 0008 | Store Conversations in Prisma tables keeping only what the Freelancer saw | Accepted | §4 |
| 0009 | Count daily allowances in per-local-day counter rows | Accepted | §4 |
| 0010 | Share one read-tool registry between MCP and the chat | Accepted | §5 |
| 0011 | List the MCP draft tool to every key and refuse it without Draft permission | Accepted | §5 |
| 0012 | Keep MCP repeat keys in their own table purged after 24 hours | Accepted | §5 |
| 0013 | Record the Assistant origin as write-once columns on the invoice | Accepted | §5 |

ADR files live under `docs/features/ai-assistant/adr/NNNN-<title>.md`.

## 10. Quality requirements

<!-- 🎯 Why: the QUALITY TREE — take a goal from §1 and break it into concrete leaves: tests,
     metrics, configs, drills. ⭐ Without §10, §1 is a manifesto. With §10 each declaration maps
     to something PROVABLE.
     📋 Write: per §1 goal — When / Then / How-verify. Numbers from spec §6 NFR VERBATIM (don't
     round ≤250ms to ≤300ms — that's a critic F6 hit).
     📌 e.g. «p95 ≤ 500 ms on a block update, verified by a 100 req/s load test». -->

Each top-3 goal from §1 expanded into a full scenario:

**QG-1. <quality attribute>**
- **When:** <trigger condition>
- **Then:** <expected behaviour with numbers from spec §6 NFR>
- **How verify:** <test / chaos drill / load test / metric>

**QG-2. <quality attribute>**
- **When:** <trigger>
- **Then:** <expected>
- **How verify:** <how>

**QG-3. <quality attribute>**
- **When:** <trigger>
- **Then:** <expected>
- **How verify:** <how>

## 11. Risks and technical debt

<!-- 🎯 Why: ⭐ collects EVERYTHING that can break — not only the technical. Without §11 risks get
     discussed at standups and lost; debt lives only in the head of whoever accepted it.
     📋 Write: a risk/debt table — severity — mitigation — owner. Accepted debt in its own block.
     📌 The first risk is often a product risk, not a technical one. That's normal. -->

<!-- Severity literals: Low / Medium / High for regular risks; "Open question" for rows created by
     a Save-as-OQ resolution during the Socratic walk (see references/socratic.md). -->

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| <e.g. Worker lag may reach hours during a downstream outage> | Medium | <alert >10 min, on-call playbook, retry backoff> | <DevOps> |
| <e.g. No event-schema versioning in v1> | Medium | <ADR-NNNN planned for v2, tolerate unknown fields> | <Backend> |
| Open architectural decision: <decision-headline> | Open question | Resolve before <stage trigger or YYYY-MM-DD>; <inline rationale from the Save-as-OQ> | <owner> |

**Accepted debt (acceptable in v1, plan to fix later):**
- <e.g. the entity is immutable / unversioned — OK for v1, may need audit versioning in v2>

## 12. Glossary

<!-- 🎯 Why: ⭐ the DOMAIN GLOSSARY that ends arguments a year later («checkpoint — weekly or
     biweekly? quarter — calendar or fiscal?»).
     📋 Write: a term / meaning table. Business + technical terms mixed.
     📌 e.g. «Lesson | a unit inside a course made of blocks (text, video)». -->

| Term | Meaning |
|---|---|
| <e.g. domain object A> | <its meaning in this domain> |
| <e.g. domain object B> | <its meaning> |
| <e.g. domain invariant name> | <the rule, in plain language> |
