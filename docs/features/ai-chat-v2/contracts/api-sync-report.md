---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-14"
feature_size: "L"
---

# API sync report — ai-chat-v2

Run autonomously (owner unavailable). Every decision is logged in "Decisions" below and is open to owner veto.

**Inputs:**
- `data-model.md` ✓. It covers a schema change: the new `ChoiceOffer` table, `ConversationMessage.origin`, `Conversation.startedFrom`, `Invoice.issuedFromChat`, and 4 enums. `Invoice.version` already exists and is relied on.
- `sad.md` ✓: §5, §6 (critical flows 1–3, flows 4–11), §7 and §8.
- `spec.md` ✓: §1 decisions, §4 US-01..US-12 and §5 AC-01..AC-36 (40 ACs).
- ADR-0001..0009 ✓.
- `ux-flows.md` ✓ (SCR ids).
- The parent contracts, extended and not rewritten:
  - `ai-assistant/contracts/{openapi.yaml, server-actions.md}`;
  - `mcp-server/contracts/openapi.yaml`.
- The existing code:
  - `lib/validations/assistant-chat.ts` (`chatRequestSchema`);
  - `lib/services/assistant-drafts/schema.ts` (`DraftRequest`, `DraftIssue`);
  - `lib/assistant-tools/{customers,shared,index}.ts`;
  - `types/result.ts`;
  - `lib/services/invoices/invoices.ts` (`updateInvoiceStatus`);
  - `types/invoice/types.ts` (`SerializedInvoice`);
  - `components/modals/invoice/invoice-pdf-preview-modal.tsx`;
  - `prisma/schema/invoice.prisma` (`SenderProfile`, `BankAccount`, `Product`, `CustomPrice`).

**Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md. The backend exposes:
- the extended `POST /api/chat`, the two new MCP read tools, and the changed `list_customers` and `create_draft_invoice` → [`openapi.yaml`](./openapi.yaml);
- the server actions, RSC reads and business functions → [`server-actions.md`](./server-actions.md).

`web-frontend` consumes both.

**Delta form:** each schema in `openapi.yaml` is one of three kinds:
- new;
- `x-supersedes` a parent schema of the same purpose (the full new shape);
- `x-extends` a parent schema additively (only the added fields).

The parent files are not edited.

**No `events.md`.** sad.md §6 Flags and §8 *Events* say there is no async flow.

**Size / route:** L / full (from `.size` / `.route`).

## Decisions (autonomous, 2026-10-12)

| # | Question | Choice | Why |
|---|---|---|---|
| D-1 | How is an invalid press answered? A JSON refusal before the stream, or a stream outcome? | `409 CONFLICT` + `details.kind = CHOICE_UNAVAILABLE`, before the stream. Nothing is written, not even an `AssistantTurn` row | Critical flow 1 decides it before the reservation and the model call. The parent puts every pre-stream refusal in JSON (400/404/429/503). data-model says "nothing written". CONFLICT is the closest existing `ActionErrorCode`, so no new code is needed. The details carry no cause, so the answer is uniform (AC-12b) |
| D-2 | Which client origins are accepted, and when? | `origin` ∈ {`TYPED`, `DASHBOARD`}, never `PRESSED`. `origin` and `startedFrom` only with `conversationId = null`. `DASHBOARD` ⇔ `DASHBOARD_PROMPT`. `choice` needs a `conversationId` and excludes `origin`. Each violation → `400 VALIDATION` *Amended 2026-10-14 (T85): `origin` ∈ {`TYPED`} only; `DASHBOARD` and `DASHBOARD_PROMPT` are refused, stored rows stay readable.* | SAD §5: "PRESSED only from a valid choice; DASHBOARD and the start point … accepted only on a Conversation's first message". Strict 400 follows the repo's `.strict()` zod convention and is testable. Silently coercing a value would hide client bugs |
| D-3 | Press text: required, absent, or trusted? | The parent `message` shape is kept and still required. With `choice`, its text is ignored; the stored label is saved | The schema shape stays the same, and the optimistic UI shows the label. sad.md §8: "The press label shown … is the stored label, never client text" |
| D-4 | `optionId` base | 0-based integer 0..7 | data-model: "the option's position". This matches the repo's 0-based `lineIndex` |
| D-5 | Does the browser get option record refs? | No. `OfferView` = `offerId`, `kind`, `state`, `chosenOptionId` and `options[{optionId,label}]`. `ref` and `request` stay server-side and are not exported | ADR-0003: the press names an option, never a record. Data minimisation |
| D-6 | How does the browser get an offer's labels after streaming? | `data-offer` carries only `offerId`. `loadConversationCards` and `getConversation` gain `offers` | ADR-0001 Neutral: "The UI gets labels and state from the row view, as it does for cards" |
| D-7 | When are the user message saved and the open offer closed? | At the end of the turn, in `saveTurn`, as the parent contract does. Only the **claim** is committed together with the slot reservation. A failed turn saves only metadata and closes nothing. The claim is released | This keeps the parent rule ("a failed turn saves only its metadata row"), so no orphan user message is left. The claim needs the reservation transaction for the race (data-model). See F-1 |
| D-8 | How many options make an offer? | 1..8 | Spec §1 lists the near-miss "did you mean…" and "another sender profile that has an account in the wanted currency", and both can have one candidate. See F-3 |
| D-9 | Issue-from-preview results | Success → `ok({status, version, invoice})`. Already issued → `CONFLICT` + new `ALREADY_ISSUED {invoice}`. Outdated → `CONFLICT` + the existing `CHANGED_ELSEWHERE {currentVersion}`. Rules → `VALIDATION` with the editor's message and `fieldErrors`. Gone or foreign → `NOT_FOUND` | Reuses the invoice-integrity details kind instead of adding a duplicate. The draft rules keep the editor's verbatim messages (AC-25, SAD §8) |
| D-10 | `issueFromPreview` key | `(invoiceId, expectedVersion)`, as ADR-0007 decides | Follows the Accepted ADR. The KPI caveat is noted in F-8 |
| D-11 | Preview of a card that is not `CREATED` | `NOT_FOUND`, worded like a foreign card | Preview exists only on created cards (SCR-05). One wording leaks nothing (AC-22) |
| D-12 | New tool names | `list_sender_profiles`, `list_products` | The repo's `list_*` tool convention and the stage brief. sad.md §5's `sender_profiles` / `products` are file and registry labels |
| D-13 | Sender-profile read paging | Page-number input, default and cap 20, plus `pageInfo`. Accounts are unpaged inside each profile | The SAD flow 4/5 note says "at most 20 rows and the total match count" for every read. Accounts are bounded by their profile |
| D-14 | Product rows | One row per `Product` (one price, one currency), plus `customPrice` for an optional `customerId`. A foreign `customerId` → `NOT_FOUND` "Customer not found." | Existing schema. See F-2. Flow 5: "answers as for a Customer that does not exist" |
| D-15 | `list_customers` change | Same shapes. Folded name. `pageSize` cap 20 (was 50); `rows` ≤ 20 | spec §1 and SAD §11 risk row: a compatible behavioural change |
| D-16 | Start points in addresses | `/ai` → `AI_SECTION`; `?start=draft&from=invoices` → `INVOICE_LIST`; `?start=draft&from=dashboard` → `DASHBOARD_CREATE`; `?handoff=` → `DASHBOARD_PROMPT` + origin `DASHBOARD` *Amended 2026-10-14 (T80): `?handoff=` removed with the dashboard prompt.* | ADR-0005 names `?start=draft&from=…`. The invoice list's existing link gains `from=invoices`. An unknown `from` is never an error |
| D-17 | Export | `exportVersion` 2.2 → 2.3. Adds `startedFrom`, `messages[].origin` and `messages[].offer {kind, options[{optionId,label}], state, chosenOptionId, createdAt}`. Invoice rows gain `issuedFromChat` automatically *Amended: export is 2.4 since 2026-10-13 (forms; no question `heading`, T89).* | AC-34 asks for the offered choices and the chosen one, origins and start points. Refs and the stored request are excluded (D-5) |
| D-18 | Conversation list | `listConversationSummaries(actor)` → every summary + `timeZone`. It replaces the paged `listConversations`. `listLatestConversations(actor, 3)` serves the dashboard | SAD §5 "loads every summary" and the dashboard block |
| D-19 | Label bound | `maxLength` 600 | Customer name ≤ 255 (`lib/validations/customer.ts`) + " (" + email + ")" stays well under the 2,000-character message limit. The bound is the contract's proposal |

## A. Field origins

### `POST /api/chat` (sendChatMessage, superseding the parent operation)

| schema_path | origin | confidence |
|---|---|---|
| ChatRequest.conversationId, .message | parent contract (unchanged) | high |
| ChatRequest.choice.offerId | data-model → `ChoiceOffer.id` (cuid); ADR-0003 | high |
| ChatRequest.choice.optionId 0..7 | data-model → `ChoiceOffer.options[].optionId` (position), `chosenOptionId` INTEGER; spec §1 ≤ 8; D-4 | high |
| ChatRequest.origin {TYPED} | data-model → `MessageOrigin` minus the server-set `PRESSED` / `FORM` and the history-only `DASHBOARD` (T85); SAD §5; D-2 | high |
| ChatRequest.startedFrom {AI_SECTION, INVOICE_LIST, DASHBOARD_CREATE} | data-model → `ConversationStartPoint` minus the history-only `DASHBOARD_PROMPT` (T85); ADR-0005 | high |
| combination rules → 400 | SAD §5 "accepted only on a Conversation's first message"; ADR-0003 "a client cannot claim PRESSED"; D-2 | medium (the 400 is the contract's choice) |
| 409 CONFLICT + ChoiceUnavailableDetails | critical flow 1 alt "offer not found, not latest, not open, option missing, or record gone"; data-model press check and claim "0 rows"; SAD §8 `CHOICE_UNAVAILABLE`; AC-12b, AC-13; D-1 | high |
| 409 error text | spec §1 "this option is no longer available and asks the Freelancer to choose again or type the request" | high |
| 429 for a valid press, nothing claimed | critical flow 1 alt "no slot left"; AC-11 | high |
| release of claim on COULD_NOT_COMPLETE / AI_UNAVAILABLE | critical flow 1 opt "system-side failure"; data-model Release | high |
| OfferPart (`data-offer`, offerId by reference) | ADR-0001 Neutral; data-model `ChoiceOffer.messageId` unique | high |
| ChatDataPart + data-offer | the parent ChatDataPart; sad.md §5 `chat/route.ts` "data-offer part" | high |

### Stored offer and its view

| schema_path | origin | confidence |
|---|---|---|
| ChoiceOfferKind / ChoiceOfferState | data-model enums | high |
| StoredOfferOption {optionId, label, ref} | data-model → `ChoiceOffer.options` JSONB | high |
| OfferOptionRef (one key per kind) | data-model `ref` = "customerId / senderProfileId / bankAccountId / productId / currency code" | high |
| StoredOfferOptions 1..8 | data-model 2..8, spec §1 near-miss / single other profile → 1..8 (F-3) | medium |
| OfferOptionLabel per kind | spec §1 "What a button shows"; AC-10 | high |
| OfferOptionLabel maxLength 600 | `lib/validations/customer.ts` name ≤ 255 + email; D-19 | medium |
| OfferView (no ref, no request) | data-model columns `kind`, `state`, `chosenOptionId`, `options`; ADR-0003; D-5 | high |

### Shared draft shapes (additive)

| schema_path | origin | confidence |
|---|---|---|
| DraftRequestDelta.senderProfileId | ADR-0003 Negative; SAD §5 `schema.ts` "request: senderProfileId"; existing `SenderProfile.id` | high |
| CustomerCandidate.email | ADR-0002 Negative; existing `Customer.email` (nullable) | high |
| BankAccountCandidate.bankName / lastFour / currency | ADR-0002 Negative; existing `BankAccount.bankName`, `accountNumber` (last four only), `currency` | high |
| ProductCandidate.unit / price / currency | ADR-0002 Negative; existing `Product.unit`, `Product.price` / `CustomPrice.price` (Decimal(10,2)), `Product.currency` | high |
| SENDER_PROFILE_NOT_FOUND.profiles | ADR-0002 Negative "profile ids beside the names"; mcp-server `SenderProfileRef` | high |

### MCP / chat read questions

| schema_path | origin | confidence |
|---|---|---|
| list_sender_profiles rows: senderProfileId, name, isDefault | existing `SenderProfile.id`, `name`, `isDefault`; spec §1 "returns each profile's name, which one is the default" | high |
| BankAccountSummary: bankAccountId, bankName, lastFour, currency, isDefault | existing `BankAccount`; spec §1, §6.1 (no full number, no other bank detail) | high |
| AccountLastFour `^[0-9A-Za-z]{1,4}$` | `BankAccount.accountNumber` TEXT. The pattern is the contract's proposal (spaces removed) | medium |
| ListSenderProfilesInput page / pageSize cap 20 | sad.md flow 4/5 "at most 20 rows and the total match count"; D-13 | medium |
| list_products input name ≤ 100 (folded) | spec §1 "the product read take a name"; ADR-0004; length mirrors `list_customers.name` | high |
| list_products input customerId; foreign → NOT_FOUND | spec §1 "named by its id from a Customer search answer"; flow 5 alt; AC-07 | high |
| ProductSummary productId, name, unit, price, currency | existing `Product` (one price per currency row; F-2) | high |
| ProductSummary.customPrice | existing `CustomPrice.price` for (productId, customerId), as `resolve-lines.ts` picks it | high |
| ProductsAnswer.customer | mcp-server `CustomerRef`; AC-02 "custom price agreed with Acme Corp" | medium |
| active products only | existing `Product.isActive`; the parent's "active products" rule (PRODUCT_NOT_FOUND) | high |
| ListCustomersInputV2 / CustomersAnswerV2 (cap 20, folded) | spec §1; SAD §5, §11; D-15 | high |
| PageInfo reuse (pageSize ≤ 20 here, schema allows ≤ 50) | mcp-server `PageInfo` | high |

### Server actions (server-actions.md)

| schema_path | origin | confidence |
|---|---|---|
| loadInvoicePreview(cardId, conversationId) | ADR-0006; critical flow 2 | high |
| InvoicePreview AVAILABLE {invoice, version, state} | ADR-0006 "serialized invoice with its status and version"; existing `SerializedInvoice` (includes the sender profile for the logo), `Invoice.version` | high |
| UNAVAILABLE (card `invoiceId` NULL) | ADR-0006; critical flow 2 alt "invoice was deleted since"; AC-21 | high |
| NOT_FOUND (foreign, unknown, not CREATED, a card of another Conversation, or a missing or invalid conversationId; R9-2, R10-1) | critical flow 2 alt; AC-22; D-11 | high |
| issueFromPreview(invoiceId, expectedVersion) | ADR-0007; SAD §5 | high |
| ALREADY_ISSUED / CHANGED_ELSEWHERE / VALIDATION / issued | critical flow 2 alts; AC-23, AC-25, AC-26, AC-26b; existing `CHANGED_ELSEWHERE {currentVersion}`; D-9 | high |
| NOT_FOUND when the invoice is gone at issue time | contract addition; existing `lockInvoiceRow` NOT_FOUND (F-6) | medium |
| issuedFromChat = true | data-model `Invoice.issuedFromChat` | high |
| updateInvoiceStatus opts.expectedVersion | ADR-0007; existing `Invoice.version` | high |
| getConversation / loadConversationCards `.offers` | data-model access "Reopen"; flow 7; D-6 | high |
| ConversationMessageView.origin | data-model `ConversationMessage.origin` (NULL USER row reads TYPED) | high |
| listConversationSummaries {items, timeZone} | SAD §5 "loads every summary"; flow 8; AC-17 grouping in the Freelancer time zone | high |
| saveTurn ✎ (startedFrom, userOrigin, assistantMessageId, offer) | data-model `ChoiceOffer.messageId` "service pre-generates the reply's cuid"; Close / Store access patterns; D-7 | high |
| offerFromIssues / checkChoice / claimOffer / releaseOffer / pinChoice | ADR-0002 table; ADR-0003; data-model access patterns | high |
| export 2.4 additions (`startedFrom`, `origin`, `offer`, `form` without `heading`) | AC-34; flow 11; D-17 | high |
| address → startedFrom map | ADR-0005; D-16 | medium |

## B. Drift findings (4-point checklist)

1. **Endpoint ↔ data-model** *(core)* ✓
   - `sendChatMessage` writes `ChoiceOffer` (claim, release, close, insert), `ConversationMessage.origin` and `Conversation.startedFrom`.
   - `issueFromPreview` writes `Invoice.status`, `version`, `issuedAt` and `issuedFromChat`.
   - `loadInvoicePreview` reads `DraftCard` and `Invoice`.
   - The read tools read the existing `SenderProfile`, `BankAccount`, `Product`, `CustomPrice` and `Customer`.
   - The export reads every new column.
   - Every new data-model entity and column is reached.
2. **Error code ↔ repo error definition** *(core)* ✓
   - The registry is `types/result.ts` `ActionErrorCode` / `ActionErrorDetails`.
   - No new code. Every code used (`VALIDATION`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `FAILED`) exists.
   - The details kinds `CHOICE_UNAVAILABLE` and `ALREADY_ISSUED` are the contract's additions. server-actions.md lists them so `implement` adds them.
   - `CHANGED_ELSEWHERE`, `ALLOWANCE_USED_UP` and `PAGE_OUT_OF_RANGE` already exist and are reused.
   - MCP tool errors keep `ToolError` with existing codes.
3. **Validation ↔ constraint** *(core)* ✗ → resolved (F-2, F-3).
   - These match their sources:
     - every enum equals its data-model enum;
     - `optionId` 0..7 and the 8-option cap (spec §1);
     - 2,000 characters (parent);
     - `Decimal(10,2)` amounts via `DecimalString`;
     - name filters ≤ 100 (the existing `list_customers`).
   - **F-3** (data-model, ux-flows and SAD flow 6 say "2 to 8 options", against spec §1):
     - Spec §1 makes the near-miss Customer and "another sender profile with an account in the wanted currency" into buttons. Each can have exactly one candidate.
     - The usual rule is to take the stricter value (2). Here that would silently drop buttons the spec requires.
     - Resolved as **Fix the contract** (1..8) **+ Save-as-OQ** (OQ-B1, owner `data-model`) to align the prose bound.
     - No DDL impact: the bound is zod-only.
   - **F-2** (spec §1 / AC-02 "prices per currency" against the existing schema):
     - `Product` holds one price and one currency.
     - **Accepted:** a product sold in several currencies is several `Product` rows, and `list_products` returns one row each. AC-02's "50 USD and 45 EUR" are two rows named "Consulting".
     - The resolver already works this way (`LINE_PRICE_MISSING_IN_CURRENCY.products[]`). No schema change.
4. **OpenAPI ↔ sequence** *(supporting)* ✗. These are notes; none blocks:
   - **F-1 (D-7).** Critical flow 1, flow 4 and flow 9 draw "save the message" together with the reservation, and data-model's Claim says "same transaction as the pressed message".
     - The parent contract (`saveTurn`) saves both messages at the end, and a failed turn saves only metadata.
     - The contract keeps the parent rule and commits only the **claim** with the slot. The observable outcomes (counted or not, marked or not) are identical.
     - **Save-as-OQ** OQ-B2 (owner `sequences` / `data-model`): align the wording.
   - **F-5.** Critical flow 1 does not draw "the claim loses a race (0 rows)". data-model's Claim pattern states it. The contract answers 409 and releases the slot. Accepted.
   - **F-6.** Critical flow 2 does not draw "the invoice was deleted after the preview loaded, then Issue". The contract answers `NOT_FOUND` "no longer available" (the existing lock read). Accepted as a reuse.
   - **F-7.** The request-combination 400s (D-2) are body validation, which the sequences show only as "session and body". Accepted.
   - **F-8 (D-10).** Keying `issueFromPreview` by `invoiceId` (ADR-0007) lets the action issue any of the Freelancer's own drafts. It is still owner-scoped and runs the same rules, so it is safe. But `issuedFromChat` could be set on a hand-made draft by a crafted call, which would overcount the spec §7 KPI slightly.
     - Accepted: the KPI query also filters `assistantOrigin = 'CHAT'` (SAD §7).

**Back-feed coverage:**
- **ACs → operations:**
  - `sendChatMessage`, with the read questions and draft shapes reached through the agent, covers:
    - US-01 and US-03: AC-01, AC-02, AC-03, AC-04, AC-05, AC-05b, AC-08, AC-08b, AC-09, AC-10, AC-11, AC-12, AC-12b, AC-13, AC-14 and AC-24;
    - US-10: AC-30, through `startedFrom` (`DASHBOARD_CREATE`);
    - AC-36, through the 401.
  - The MCP tools cover AC-06 and AC-07.
  - `getConversation` / `loadConversationCards` cover AC-12, AC-13 and AC-33 (saved replies whole).
  - `listConversationSummaries` covers AC-17.
  - `loadInvoicePreview` covers AC-20, AC-21 and AC-22.
  - `issueFromPreview` covers AC-23, AC-25, AC-26, AC-26b and AC-27.
  - The addresses cover AC-30. AC-29, AC-31 and AC-32 were removed with the dashboard AI block (2026-10-14).
  - The export covers AC-34.
  - **No operation, by design** (layout, motion, static text or navigation; they are owned by `screens` and verified by e2e and page tests): AC-15, AC-16, AC-18, AC-19, AC-28, AC-35. AC-33's streaming pace is the parent stream, unchanged. This matches sad.md §6 coverage, which marks AC-28 and AC-35 non-runtime and AC-15 as a layout rule.
- **Operations → stories:** every operation maps to a §4 user story and at least one AC. No orphan.
- **Branches → responses:** every `alt` branch in critical flows 1–3 and flows 4–11 has a response or result variant:
  - flow 4 and flow 5's "nothing matches" is `rows: []`, total 0;
  - flow 5's "foreign Customer id" is `NOT_FOUND`;
  - flow 11's "deletion fails" is the existing `deleteAccount` failure.
- **Sequence gaps found:** none that needs a new branch. F-5 and F-6 are drawn implicitly by data-model and the existing lock path.

Result: 1 core ✗ (point 3), resolved in the contract with an upstream OQ, plus 5 supporting notes. The total is ≥ 3 flags, so the run would normally pause. Here every flag was resolved autonomously (decision log above) and stays open to owner veto.

## B2. Changes after the api stage

| Date | Stage | Change | Kind |
|---|---|---|---|
| 2026-10-13 | tasks (D-1) → implement T09 | `DraftIssueDelta`: `CUSTOMER_NOT_FOUND` gains optional `ownSenderProfile` (new schema `OwnSenderProfileHint` = `{ senderProfileId, name }`), set when the folded written name equals one of the acting Freelancer's sender profile names. Same for the chat, the Create press and MCP `DRAFT_ISSUES`. Makes AC-05b deterministic instead of model-only (sad.md §6 flag) | additive, compatible |
| 2026-10-14 | fix 2026-10-14-question-form-ux (T80, T81), consistency pass (T85, T89) | The dashboard AI block and the `?handoff=` address are removed (ADR-0009 Superseded), and `listLatestConversations` with them (D-16, D-18). A chat request refuses `origin: DASHBOARD` and `startedFrom: DASHBOARD_PROMPT` with `400 VALIDATION` on the field (D-2); stored rows stay readable and exported. Export 2.4: each message's `form` carries its questions (`prompt`, options `{optionId, label}`) and answers (a picked option with its `label`), no `heading`; 2.4 never shipped, so no bump (D-17). `FormQuestionView` options gain an optional `detail` | breaking within the unshipped feature |

## C. Deviations from the api-skill defaults (all inherited from the parent contracts)

| Default | Here | Why |
|---|---|---|
| `/api/v1/…` | `/api/chat`, `/api/mcp` | the parent contract and mcp-server ADR-0003 |
| BearerAuth global | session cookie for `/api/chat`; Personal key for MCP | sad.md §8 (unchanged) |
| `{code, message, details?}`, `module.error_name` | `ActionFailure` with UPPER_SNAKE `ActionErrorCode`; MCP `ToolError` | architecture-hardening ADR-0009 |
| cursor pagination | page numbers (`PageInfo`) on the MCP reads. `listConversationSummaries` is unpaged and bounded (SAD §7) | service-layer ADR-0005; SAD §5 |
| full contract | a delta with `x-supersedes` / `x-extends` against the parent files | spec §3: "the ai-assistant contracts stay as written" |

## C2. Changes after review (2026-10-13)

| Change | Where | Source |
|---|---|---|
| `AppPageKey` gains `new-product` (`/products/new`, titled "Add a product"); `new-customer` is titled "Add a Customer". An empty named `list_customers` / `list_products` read carries the add page in a read answer | ai-assistant openapi.yaml `AppPageKey`; `lib/validations/assistant-chat.ts`; `lib/ai/app-map.ts` | review R1-B3/U5, R2-B3 |
| A press that cannot be checked (system failure) is `503 FAILED`, not `409 CHOICE_UNAVAILABLE`; span `chat.choice-check` outcome `failed` | openapi.yaml `/api/chat` 503; server-actions.md `checkChoice` | review R1-S3 |
| A released press ends `CLOSED` when a newer message exists | openapi.yaml `/api/chat`; data-model.md Release | review R1-B2, R2-B1 |
| The `propose_draft` ISSUES answer drops every list longer than 8, in any issue, and then carries `listCounts` and a `say` directive worded per issue kind; `matchCount` only when the reply's offer itself was dropped (above 8 options, no buttons) | server-actions.md `offerFromIssues` | review R2-B2, R4-B1, R4-B2 |

## D. Open questions

| # | Question | Owner | Due | Status |
|---|---|---|---|---|
| OQ-B1 | Align the "2…8 options" bound in data-model.md (`ChoiceOffer.options`), ux-flows.md (US-03 flow) and sad.md §6 flow 6 to the contract's 1..8 (spec §1 near-miss and single other sender profile). No DDL impact. Or veto: the owner may keep 2..8 and drop single-option offers from spec §1 | `data-model` (Dmytro Hopko) | before `tasks` | **Resolved 2026-10-12**: 1..8 adopted (no veto). data-model.md, ux-flows.md (US-03) and sad.md flow 6 + AC-08 coverage now say 1..8. Migrations had no bound (zod-only), unchanged |
| OQ-B2 | Reword the persist notes in sad.md critical flow 1, flows 4 and 9, and data-model's Claim access pattern: the claim (and nothing else) commits with the slot; the user message and the close of the open offer are written by `saveTurn` at the end (F-1, D-7) | `sequences` (Dmytro Hopko) | before `tasks` | **Resolved 2026-10-12**: parent rule kept. sad.md (§4 choice 2, §5 offer + press order, critical flow 1, flows 4, 6, 9, §6 flags) and data-model's Claim/Close patterns now commit only the claim with the slot. Messages, close and next offer are written by `saveTurn` at the end |

## E. Lint

`npx @redocly/cli@1.34.5 lint docs/features/ai-chat-v2/contracts/openapi.yaml`: **valid**, with 17 warnings, all expected:
- no `license`;
- a `localhost` server;
- 15 "unused" schemas, referenced only from `x-mcp-tools`, `x-chunk-schema`, `x-extends` and server-actions.md (as in the parent contracts).

The `$ref`s into `../../ai-assistant/` and `../../mcp-server/` resolve.

## Reconcile 2026-10-13 (owner feedback; ADR-0011–0013)

Inputs re-read: spec §1 F1–F13 and AC-08–AC-14, AC-34, AC-37–AC-53; data-model "Revision 2026-10-13" (06–08); sad.md §5 "Revision 2026-10-13", Critical flows 4–5, Flow 12. `info.version` 0.2.0 → 0.3.0 (breaking within the unshipped feature: `choice` removed).

| path | origin | confidence |
|---|---|---|
| ChatRequest.form.formId | ChoiceOffer.id | high |
| FormAnswer.questionId / optionId | ChoiceOffer.questions[].questionId / options[].optionId (positions, frozen) | high |
| FormAnswer.text | spec F6 per-kind checks; draftRequestSchema amountInput / localDate / lengths | high |
| FormAnswer.skipped | spec F4 optional fields | high |
| StoredFormQuestion.* | data-model ChoiceOffer.questions (zod-owned shape) | high |
| FormView.answers | ChoiceOffer.answers | high |
| MessageOrigin.FORM | data-model 06 | high |
| AskUserInput.* | ADR-0011 + spec F2–F4 (6 questions, 8 ids, prompt 140) | high |
| SearchInvoicesInputDelta.createdFrom/To, sort | Invoice.createdAt (existing column) + spec F12 | high |
| SearchInvoicesRowDelta.path | config/routes.config.ts invoiceEdit | high |
| 409 sentence | spec F7 (verbatim) | high |

**Drift checklist.** Endpoint ↔ model ✓ (no new endpoint; `/api/chat` request field maps to the row). Error codes ↔ repo ✓ (`CONFLICT` + `CHOICE_UNAVAILABLE`, `VALIDATION` exist in `types/result.ts`). Validation ↔ constraints ✓ (6 questions, 8 options, lengths). OpenAPI ↔ sequences ✓: Critical flow 4 branches (unavailable → 409, bad format → 400, used up → 429, failure → 503 / stream outcome, valid → 200) all present.

**Back-feed.** AC-42–AC-44 and AC-50–AC-53 have no contract surface (browser rendering and layout) — expected, screens own them. AC-45–AC-49 map to the turn's date note, `ask_user`, `search_invoices` delta. No sequence gap.

**Stale (kept, marked):** `ChatChoice` (deprecated, removed), `OfferView` (superseded by `FormView`), the `press` example. Since 2026-10-14 (T85) the `dashboardPrompt` example is gone and the request refuses `origin: DASHBOARD` / `startedFrom: DASHBOARD_PROMPT`; both values stay in `MessageOrigin` / `ConversationStartPoint` so stored rows remain readable and exported for history.
