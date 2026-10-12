---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
---

# API sync report — ai-assistant

**Inputs:**
- `data-model.md` ✓. It covers a schema change: 7 new tables, `PersonalKey.canCreateDrafts`, the 4 `Invoice` columns and 5 enums.
- `sad.md` §5, §6 (critical flows 1–3, flows 4–12), §7, §8 ✓
- `spec.md` §4 US-01..US-13 / §5 AC-01..AC-42 (48 ACs) ✓
- ADR-0001..0013 ✓
- `ux-flows.md` (SCR ids, near-miss branch) ✓
- The existing sources:
  - the mcp-server contract (transport, `ToolError`, shared value types);
  - `types/result.ts`;
  - `lib/services/account/account.ts` (export);
  - `lib/services/invoices/editor-data.ts` (`newInvoiceDefaults`);
  - `config/routes.config.ts` and `app/**/page.tsx` (the app map);
  - `proxy.ts` (anonymous `/api` → `401`).

**Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md. The backend exposes:
- `POST /api/chat`, a UI-message stream over SSE, and the new MCP tool `create_draft_invoice` → [`openapi.yaml`](./openapi.yaml);
- server actions, RSC reads and business functions → [`server-actions.md`](./server-actions.md).

`web-frontend` consumes both.

**No `events.md`.** No §6 flow has a message bus or an async consumer. The only async flow, the daily clean-up (flow 9), is an internal scheduled call with no public contract. The stream is a response, not an event channel.

**Size / route:** L / full (from `.size` / `.route`).

**Decisions taken at `api` (2026-10-11, with the owner):**
- **D-1.** `ActionErrorCode` gains `FORBIDDEN` ("known caller, no right"), first used by AC-29. `tasks` adds a task to update every exhaustive switch over the codes.
- **D-2.** A new Conversation gets its id from the server. The first `POST /api/chat` carries `conversationId: null`. The server creates the Conversation with the saved turn and announces it (`data-conversation`) only once that turn is saved, right before `data-outcome` (review R-02). The client never chooses a primary key.
- **D-3.** A Create press whose re-resolve yields issues (Customer, profile or account gone) returns `ok({ kind: 'NEEDS_ANSWERS', issues })` and marks the card `OUTDATED` with no successor. sad.md §6 flow 2 gets the branch later, through OQ-A1.

## A. Field origins

### `POST /api/chat` (sendChatMessage)

| schema_path | origin | confidence |
|---|---|---|
| session cookie auth; anonymous → 401 `UNAUTHORIZED` | sad.md §8 Authentication; `proxy.ts` (anonymous `/api` → 401 JSON); AC-42 | high |
| ChatRequest.conversationId (RecordId \| null) | data-model → `Conversation.id` (cuid); D-2 | high |
| ChatRequest.message (one text part) | ADR-0002 (`useChat` transport); ADR-0008 (history loaded server-side) | high |
| ChatUserMessage.id ≤ 64 | the AI SDK UI-message id. The bound is the contract's proposal | medium |
| text 1..2,000 after trim; 400 `VALIDATION`, not counted | spec §6 "Chat message length"; sad.md §8 Limits | high |
| 404 `NOT_FOUND` for an unknown or foreign Conversation | AC-41; sad.md §6 flow 7 (same rule on the write path) | high |
| 429 `RATE_LIMITED` + `ALLOWANCE_USED_UP` | AC-10, AC-10b; sad.md critical flow 1 "no slot left"; data-model `MessageAllowanceDay` conditional increment | high |
| AllowanceUsedUpDetails.renewsAt / timeZone | AC-10 "when it renews in their own local time"; spec §8 rule (ADR-0009); data-model `timeZone`, `firstMessageAt` | high |
| 503 `FAILED`, fail closed | ADR-0009 Neutral; sad.md §8 Error handling | high |
| 200 stream, `x-vercel-ai-ui-message-stream: v1` | ADR-0002; AI SDK UI-message stream protocol | high |
| ConversationPart (conversationId, title ≤ 80) | D-2; data-model → `Conversation.title` (80) | high |
| AllowancePart / AllowanceState (limit 30, used, left, renewsAt) | AC-01, AC-09; spec §6 (30); data-model `MessageAllowanceDay.used` | high |
| DraftCardPart (cardId by reference) | data-model → `DraftCard.id`; ADR-0007; sad.md §6 flow 6 | high |
| LinkPart / AppLink.invoice (invoiceId, label) | AC-03, AC-24, AC-36; sad.md §8 Links (link targets as ids) | high |
| AppLink.page / AppPageKey enum | sad.md §5 `find_in_app` fixed map; every key resolves to a real route in `config/routes.config.ts` or `app/**/page.tsx`. `ai` is the new section | medium (the enum is the contract's proposal; implement may add keys) |
| AppLink.page.senderProfileId | AC-17, AC-19 (link to adding an account to that profile) | high |
| OutcomePart / ChatOutcome | AC-09, AC-11, AC-11b; spec §6 provider outage; sad.md §8 Error handling (four stream outcomes) | high |
| ChatOutcome ↔ `AssistantTurn.outcome` | data-model `AssistantTurnOutcome` (`ALLOWANCE_USED_UP` is never streamed: it is the 429) | high |

### Shared draft shapes (chat `propose_draft` = MCP input)

| schema_path | origin | confidence |
|---|---|---|
| DraftRequest (words, never resolved values) | ADR-0006; data-model → `DraftCard.request` (JSONB) | high |
| DraftRequest.customer / customerId (exactly one) | ADR-0006 "Customer word or id" | high |
| DraftRequest.senderProfile | AC-17 "if the Freelancer names it" | high |
| DraftRequest.currency (code or symbol, ≤ 8) | ADR-0006 "currency or symbol"; AC-19; ux-flows US-06 dollar-sign branch | high |
| DraftRequest.lines 1..50 | ADR-0006 "lines as stated". The 50 cap is the contract's proposal (bounds the resolver and the card) | medium |
| line.description ≤ 200, unit ≤ 20, notes ≤ 2,000 | existing `InvoiceItem.name` / `unit`, `Invoice.notes` (TEXT; bounds are zod proposals, as the repo keeps lengths in zod) | medium |
| QuantityInput / PriceInput `^\d{1,8}(\.\d{1,2})?$` | existing `InvoiceItem.quantity` / `rate` `Decimal(10,2)` | high |
| DraftRequest.issueDate / dueDate (LocalDate) | existing `Invoice.issueDate`/`dueDate` calendar days (mcp-server ADR-0009) | high |
| DraftProposal (every value with its source) | data-model → `DraftCard.proposal`; AC-12, AC-16, AC-19, AC-30 | high |
| sources `REQUEST` / `CUSTOM_PRICE` / `CATALOGUE` / `DEFAULT` | AC-12 ("named as the default used"), AC-16 (custom price as the source), AC-19 (quantity 1, unit "item" as defaults) | high |
| issueDate today, dueDate +30, no tax/discount/shipping | existing `newInvoiceDefaults` (editor-data.ts); AC-12 | high |
| invoiceNumber null on a card | AC-12 "to be assigned on creation" | high |
| bankAccount.label | existing `BankAccount.bankName` + `accountNumber` (last four) | high |
| line.unit default "item" | AC-19. Note: `Product.unit` defaults to `pcs`, so "item" applies to free-text lines only | high |
| line.agreedCustomPrice | AC-16b "shows the agreed custom price of 45.00 USD beside it" | high |
| DraftIssue kinds | AC-17 (two kinds), AC-19 (two kinds), AC-20, AC-21, AC-22, AC-16b; ux-flows US-06 (near miss, currency unclear). `SENDER_PROFILE_NOT_FOUND` comes from the AC-17 "names it" path | high, except `CUSTOMER_NEAR_MISS` (ux-flows only, medium) |

### MCP `create_draft_invoice`

| schema_path | origin | confidence |
|---|---|---|
| listed to every key, `readOnlyHint: false` | ADR-0011; sad.md §5 `registerDraftTool` | high |
| description incl. the data-not-instructions suffix | sad.md §8 Untrusted text (`DATA_NOT_INSTRUCTIONS`) | high |
| CreateDraftInvoiceInput.repeatKey ≤ 200 | data-model → `McpDraftRepeat.repeatKey` (≤ 200, zod) | high |
| DraftCreatedAnswer.invoiceId / invoiceNumber / status DRAFT | existing `Invoice`; AC-30 | high |
| DraftCreatedAnswer.link `/invoices/{id}/edit` | mcp-server D-7; `app/(invoice-editor)/invoices/[id]/edit` | high |
| DraftCreatedAnswer.repeated | AC-32; ADR-0012 | high |
| DraftToolError `FORBIDDEN` | AC-29; D-1 | high |
| `VALIDATION` + `DRAFT_ISSUES` | AC-31, AC-17 (external) | high |
| `RATE_LIMITED` + `DRAFT_LIMIT_REACHED` (created, allowance, renewsAt) | AC-27; data-model → `PersonalKeyDraftDay.created` / `allowance` | high |
| `CONFLICT` (same mark, other content) | AC-32; data-model `McpDraftRepeat.fingerprint` | high |
| `NOT_FOUND` (first draft deleted since) | ADR-0012 Neutral; data-model `McpDraftRepeat.invoiceId` SET NULL | high |
| weekly-usage counting of the new errors | mcp-server data-model `PersonalKeyUsageWeek.assistantErrors` | medium (the classification of `FORBIDDEN` / `RATE_LIMITED` as Assistant errors is the contract's proposal) |

### Server actions and reads

| schema_path | origin | confidence |
|---|---|---|
| CreateFromCardResult `CREATED` / `ALREADY_CREATED` / `REPLACED` / `OUTDATED` | AC-13, AC-14, AC-14b, AC-18; sad.md critical flow 2; data-model `DraftCard.state` | high |
| CreateFromCardResult `NEEDS_ANSWERS` | AC-18 "the Customer (renamed or gone)"; D-3. **No §6 branch** (OQ-A1) | medium |
| createDraftFromCard never counted | AC-11c; flow 2 "never counted as a message" | high |
| DraftCardView.invoice / LinkedInvoiceState | AC-14, AC-36; data-model `DraftCard.invoiceId` SET NULL | high |
| ConversationSummary (id, title, lastMessageAt) | data-model → `Conversation`; AC-35 | high |
| listConversations page numbers | service-layer ADR-0005 (`Page<T>`) | high |
| getConversation NOT_FOUND alike | AC-41; flow 7 | high |
| ConversationMessageView.parts | data-model → `ConversationMessage.parts`; ADR-0008 | high |
| deleteConversation / deleteAllConversations | AC-37; flow 8 | high |
| createPersonalKey.canCreateDrafts | data-model → `PersonalKey.canCreateDrafts`; AC-25, AC-26 | high |
| PersonalKeySummary.draftsToday | data-model → `PersonalKeyDraftDay`; AC-28 "shows when the limit was last lifted" | high |
| liftKeyDraftLimit CONFLICT "not reached" | AC-28 "only once it is reached"; flow 10 | high |
| invoice DTO `assistantMark` | data-model → `Invoice.assistantOrigin` / `assistantKeyName`; AC-23 | high |
| `issuedAt` writers | data-model `Invoice.issuedAt` write rules | high |
| export 2.2 additions | spec §6.1; AC-39; data-model access patterns "Export" | high |
| export omits `assistantKeyId` | mcp-server AC-25 (a key id never leaves in the export) | high |

## B. Drift findings (4-point checklist)

1. **Endpoint ↔ data-model** *(core)* ✓
   - `sendChatMessage` writes `MessageAllowanceDay`, `Conversation`, `ConversationMessage`, `DraftCard` and `AssistantTurn`.
   - `create_draft_invoice` writes `Invoice`, `PersonalKeyDraftDay` and `McpDraftRepeat`.
   - Every server action reads or writes at least one data-model entity.
   - Every data-model entity is reached: `AssistantTurn` only internally, accepted (metadata, never exposed).
2. **Error code ↔ repo error definition** *(core)* ✓ with D-1.
   - The codes are checked against `types/result.ts` `ActionErrorCode`. `FORBIDDEN` is new (owner, D-1).
   - The new `details` kinds `ALLOWANCE_USED_UP`, `DRAFT_ISSUES` and `DRAFT_LIMIT_REACHED` are the contract's additions to `ActionErrorDetails`. They are listed in server-actions.md so `implement` adds them with the code.
3. **Validation ↔ constraint** *(core)* ✓
   - 2,000 characters (spec §6) and `title` 80 (data-model) match.
   - `repeatKey` 200 (data-model) matches.
   - Quantity and price patterns match `Decimal(10,2)`.
   - Limits 30 and 50 (spec §6, data-model defaults) match.
   - Every enum equals its data-model or Prisma enum: `DraftCardState`, `Currency`, `AssistantOrigin`. `ChatOutcome` is a documented mapping of `AssistantTurnOutcome`.
   - There were no conflicts to resolve.
4. **OpenAPI ↔ sequence** *(supporting)* ✗, 3 notes:
   - **OQ-A1 (sequence gap, D-3).** Flow 2 has no branch for "re-resolve yields issues". The contract returns `NEEDS_ANSWERS`.
   - **B4-1.** Flows 1 and 5 draw the length check and the reservation, but not "the Conversation is not this Freelancer's" on the **write** path (flow 7 draws it for reading). The contract answers `404` with the same rule. Accepted as a direct reuse of flow 7, with no source change needed.
   - **B4-2.** Flow 1 does not draw "the reservation cannot be written" (fail closed). sad.md §8 and ADR-0009 state it, and the contract answers `503`. Accepted.

**Back-feed coverage:**
- **ACs:** every §5 AC maps to an operation or response:
  - `sendChatMessage`: AC-02..AC-12, AC-15..AC-22, AC-24 and AC-40 through its outcomes and the shared draft shapes; AC-41 and AC-42 through the 404 and 401.
  - `createDraftFromCard`: AC-13, AC-14, AC-14b, AC-18 and AC-11c.
  - The AI section reads: AC-01, AC-33..AC-36 and AC-38 (notice).
  - The delete actions: AC-37.
  - The invoice DTO: AC-23.
  - The key actions: AC-25, AC-26 and AC-28.
  - `create_draft_invoice`: AC-27 and AC-29..AC-32.
  - The export and account deletion: AC-39.
  - AC-38's deletion itself is the internal clean-up.
- **Operations:** every operation maps to a §4 user story and at least one AC.
- **Branches:** every §6 `alt` branch in flows 1–12 has a response or result variant.

Result: 0 core ✗, 3 supporting notes (≥ 3 flags). The run paused on them, and the owner resolved D-3 and the OQ (2026-10-11). B4-1 and B4-2 were accepted as reuses of rules already in the sources.

## C. Deviations from the api-skill defaults (all follow the repo)

| Default | Here | Why |
|---|---|---|
| `/api/v1/…` URL versioning | `/api/chat`, `/api/mcp` | the repo's route-handler convention; MCP clients use a fixed URL (mcp-server ADR-0003); the stream protocol is versioned by its header |
| BearerAuth global | session cookie for `/api/chat`; Personal key for MCP | sad.md §8 Authentication; architecture-hardening ADR-0001 proxy |
| `{code, message, details?}`, `module.error_name` | `ActionFailure` `{success:false, code, error, fieldErrors?, details?}` with UPPER_SNAKE `ActionErrorCode`; MCP keeps `ToolError` | architecture-hardening ADR-0009; same as `/api/user/export` and the mcp-server contract |
| cursor pagination | `Page<T>` page numbers (`listConversations`) | service-layer ADR-0005 |
| — | camelCase field names | the repo's TypeScript DTOs and the data export |

## D. Open questions

| # | Question | Owner | Due |
|---|---|---|---|
| OQ-A1 | Add the branch "re-resolve yields issues → card `OUTDATED` without successor, issues shown, nothing created" to sad.md §6 critical flow 2 (D-3) | `sequences` (Dmytro Hopko) | before the contract is finalized (before `tasks`) |

## E. Lint

`npx @redocly/cli@1.34.5 lint docs/features/ai-assistant/contracts/openapi.yaml`: **valid**, with 5 warnings, all expected:
- no `license`;
- a `localhost` server;
- 3 "unused" schemas referenced only from the `x-mcp-tools` and `x-chunk-schema` extensions, as in the mcp-server contract.

The `$ref`s into `../../mcp-server/contracts/openapi.yaml` resolve. The repo has no lint target for contracts yet. Suggested: `pnpm dlx @redocly/cli lint docs/features/*/contracts/openapi.yaml`.
