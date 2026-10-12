---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
---

# Server actions and business layer — ai-assistant

This is the typed RPC surface of the `backend-service` container that the `web-frontend` surface uses:
- the `'use server'` actions the Browser UI calls;
- the RSC read functions the pages call;
- the business functions in `lib/services` (`ActingFreelancer` in, `ActionResult` out) that the chat route, the agent tools and the MCP adapter share.

The chat stream and the MCP draft tool are in [`openapi.yaml`](./openapi.yaml). Only actions and functions whose contract this feature adds or changes are listed. Every other action keeps its signature.

Derived from:
- `data-model.md` (`Conversation`, `ConversationMessage`, `DraftCard`, `MessageAllowanceDay`, `AssistantTurn`, `PersonalKey.canCreateDrafts`, `PersonalKeyDraftDay`, `McpDraftRepeat`, and the `Invoice` origin columns plus `issuedAt`);
- sad.md §5 and §6 (critical flows 1–3, flows 4–12);
- spec §5 AC-01, AC-13, AC-14, AC-14b, AC-18, AC-11c, AC-23, AC-25, AC-26, AC-28, AC-33–AC-39 and AC-41.

Field origins are in [`api-sync-report.md`](./api-sync-report.md). Shared shapes (`DraftProposal`, `DraftIssue`, `AppLink`, `AllowanceState`, `AllowanceUsedUpDetails`, `DraftIssuesDetails`, `DraftLimitReachedDetails`) are defined once in `openapi.yaml` `components.schemas`. The TypeScript types below mirror them.

## ActionResult changes — `types/result.ts`

```ts
export type ActionErrorCode =
  | 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED' | 'RATE_LIMITED'
  | 'FORBIDDEN';                                                                        // ★ known caller, no right (AC-29)

type ActionErrorDetails =
  | /* … existing kinds … */
  | { kind: 'ALLOWANCE_USED_UP'; limit: 30; renewsAt: string; timeZone: string }        // ★ AC-10, AC-34
  | { kind: 'DRAFT_ISSUES'; issues: DraftIssue[] }                                       // ★ AC-31, AC-17
  | { kind: 'DRAFT_LIMIT_REACHED'; created: number; allowance: number; renewsAt: string }; // ★ AC-27
```

Every exhaustive `switch` over `ActionErrorCode` or `details.kind` must handle the new members. `tasks` adds one task to find them. The web UI receives `ALLOWANCE_USED_UP` only. `FORBIDDEN`, `DRAFT_ISSUES` and `DRAFT_LIMIT_REACHED` reach only the MCP tool and the agent.

## Shared types — `types/assistant/types.ts` ★

```ts
type DraftCardState = 'LIVE' | 'REPLACED' | 'OUTDATED' | 'CREATED';  // DraftCard.state

type LinkedInvoiceState =                       // read when rendered, never stored (AC-36)
  | { state: 'DRAFT'; invoiceId: string; invoiceNumber: string }
  | { state: 'ISSUED'; invoiceId: string; invoiceNumber: string; status: InvoiceDisplayStatus }
  | { state: 'UNAVAILABLE' };                   // deleted, or not this Freelancer's

type DraftCardView = {
  id: string;
  state: DraftCardState;
  proposal: DraftProposal;                      // DraftCard.proposal
  replacedById: string | null;                  // REPLACED / OUTDATED → the newer card (AC-14b, AC-18)
  invoice: LinkedInvoiceState | null;           // CREATED only; UNAVAILABLE when invoiceId is NULL
};

type ConversationSummary = {
  id: string;
  title: string;                                // Conversation.title, ≤ 80 characters
  lastMessageAt: string;                        // ISO UTC; the list shows the date (AC-35)
};

type ConversationMessageView = {                // the AI SDK UIMessage the useChat island renders
  id: string;
  role: 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'data-link'; data: AppLink }
    | { type: 'data-draft-card'; id: string; data: { cardId: string } }
  >;
  createdAt: string;
};
```

## AI section and Conversations — RSC reads, `lib/services/conversations/` and `lib/services/assistant-usage/` ★

Pages call these with the session `ActingFreelancer`. The proxy has already refused a Visitor and sent them to sign in (AC-42).

### `getAllowanceState(actor): Promise<ActionResult<AllowanceState>>` (flow 4; AC-01, AC-09, AC-34)

Reads today's `MessageAllowanceDay`, applying the time-zone rule (data-model). With no row today, the result is `used: 0`. It writes nothing.

### `listConversations(actor, page?: number): Promise<ActionResult<Page<ConversationSummary>>>` (flow 4; AC-35, AC-38)

- Ordered by newest `lastMessageAt` first, 20 per page.
- Uses page numbers through the repo's `Page<T>` (service-layer ADR-0005), not cursors.
- A page past the last one is handled by the shared `paginate` helper, like the other web lists. Only the Assistant's paged reads refuse it with `PAGE_OUT_OF_RANGE`.
- The page renders the 90-day retention notice as fixed copy (owned by `screens`).

### `getConversation(actor, id): Promise<ActionResult<{ conversation: ConversationSummary; messages: ConversationMessageView[]; cards: Record<string, DraftCardView> }>>` (flow 7; AC-35, AC-36, AC-41)

| Outcome | Result |
|---|---|
| found | `ok(…)`: messages in `position` order. Every `data-draft-card` part has its `DraftCardView` in `cards`. Every invoice link and card invoice is resolved to its current `LinkedInvoiceState` in one owner-scoped read (AC-36) |
| unknown id, or another Freelancer's | `fail('NOT_FOUND', "This conversation can't be found.")`. The page renders the existing not-found screen (SCR-12), with the same wording for both cases (AC-41) |

"Create with AI" (AC-33) is the route `/ai?start=draft`. It needs no server call beyond `getAllowanceState`. When `left = 0` the page shows the used-up state with a link to the hand-made editor (AC-34).

## Draft cards — `lib/actions/assistant-actions.ts` ★, over `lib/services/assistant-drafts/`

### `createDraftFromCard(cardId: string)` (critical flow 2; AC-13, AC-14, AC-14b, AC-18, AC-11c)

Returns `ActionResult<CreateFromCardResult>`.

```ts
type CreateFromCardResult =
  | { kind: 'CREATED'; invoiceId: string; invoiceNumber: string }          // AC-13
  | { kind: 'ALREADY_CREATED'; invoice: LinkedInvoiceState }               // AC-14 (UNAVAILABLE if deleted since)
  | { kind: 'REPLACED'; newerCardId: string }                              // AC-14b
  | { kind: 'OUTDATED'; card: DraftCardView }                              // AC-18: the updated LIVE card, confirm again
  | { kind: 'NEEDS_ANSWERS'; issues: DraftIssue[] };                       // ★ api 2026-10-11: re-resolve yields issues
```

| Outcome | Result | Notes |
|---|---|---|
| live, content matches | `ok({ kind: 'CREATED', … })` | In one transaction: lock the card by id and owner, re-resolve the stored `request` with today's data, create the Draft invoice with the card's content, set `assistantOrigin = CHAT`, a system-assigned number, and mark the card `CREATED` with `invoiceId`. Nothing is issued or sent. ≤ 2 s p95 (spec §6) |
| already `CREATED` | `ok({ kind: 'ALREADY_CREATED', … })` | A second press, or a reconnect repeating the press, creates nothing (AC-14). The row lock makes concurrent presses wait and see `CREATED` |
| `REPLACED` | `ok({ kind: 'REPLACED', … })` | Only the newer card can create (AC-14b) |
| live, content differs (price, Customer renamed, profile, account, or "today") | `ok({ kind: 'OUTDATED', card })` | Marks this card `OUTDATED`, stores the updated `LIVE` card in the same Conversation, and returns it. Nothing is created (AC-18). Time alone never outdates a card |
| live, re-resolve yields issues (Customer, profile, account or product gone; or a rule now fails, e.g. the request's due date is before the new day's issue date → `FIELD_INVALID`) | `ok({ kind: 'NEEDS_ANSWERS', issues })` | Marks the card `OUTDATED` with no successor and creates nothing. The chat shows the issues as it would for a new request. **Sequence gap:** sad.md §6 flow 2 has no such branch (OQ-A1) |
| unknown card, or another Freelancer's | `fail('NOT_FOUND', 'This draft card is no longer available.')` | |
| unexpected failure | `fail('FAILED', "The draft couldn't be created. Try again.")` | Nothing is created (one transaction) |

The action never touches the Daily message allowance and never calls the model. It works with the allowance used up (AC-11c). It does not append a message: the card's state carries the outcome when the Conversation is reopened.

## Conversations — `lib/actions/assistant-actions.ts` ★ (flow 8; AC-37)

### `deleteConversation(id: string)` → `ActionResult<void>`

| Outcome | Result |
|---|---|
| deleted | `ok()`. Messages and Draft cards go with it, and turn metadata keeps no reference. Drafts it created are unchanged. Revalidates `/ai` |
| unknown id, or another Freelancer's | `fail('NOT_FOUND', "This conversation can't be found.")` |

### `deleteAllConversations()` → `ActionResult<{ deleted: number }>`

`ok({ deleted: 0 })` when there were none. One transaction. The confirm dialog (SCR-04) is UI-only.

## Personal keys — `lib/actions/personal-key-actions.ts` ✎, `lib/services/personal-keys/` (flow 10; ADR-0011)

### `createPersonalKey(input: { name: string; canCreateDrafts: boolean })` ✎ (AC-25)

- The input gains `canCreateDrafts`, which defaults to `false` when absent.
- The result is unchanged (`{ key, fullKey }`), and `key` gains the fields below.
- This is the **only** writer of `PersonalKey.canCreateDrafts`. No update action exists (AC-26).
- The existing outcomes (AC-03, AC-04) are unchanged.

### `PersonalKeySummary` ✎

```ts
type PersonalKeySummary = {
  /* … existing: id, name, createdAt, lastFour, lastUsedAt … */
  canCreateDrafts: boolean;                                           // ★ the list mark (AC-25)
  draftsToday: { created: number; allowance: number; lastLiftedAt: string | null } | null; // ★ null for read-only keys
};
```

`listPersonalKeys` reads today's `PersonalKeyDraftDay` per key, in the owner's time zone. With no row the result is `{ created: 0, allowance: 50, lastLiftedAt: <the latest earlier lift or null> }`.

### `liftKeyDraftLimit(keyId: string)` ★ (AC-28)

Returns `ActionResult<{ created: number; allowance: number; lastLiftedAt: string }>`.

| Outcome | Result |
|---|---|
| lifted | `ok(…)`: `allowance + 50` for today only. `lastLiftedAt` = now. Revalidates the keys page |
| the limit is not reached yet (`created < allowance`) | `fail('CONFLICT', 'The limit can be lifted once the key has reached it.')`. A double click lifts once |
| unknown key, another Freelancer's, revoked, or read-only | `fail('NOT_FOUND', 'Key not found.')` |

## MCP adapter — `lib/mcp/tools/create-draft.ts` ★, `lib/services/assistant-drafts/`

Called only by the adapter. These are listed here because they are business functions.

```ts
resolveDraftRequest(actor: ActingFreelancer, request: DraftRequest, today: LocalDate):
  Promise<ActionResult<{ kind: 'PROPOSAL'; proposal: DraftProposal } | { kind: 'ISSUES'; issues: DraftIssue[] }>>;

createDraftForKey(actor: ActingFreelancer, key: { id: string; name: string; canCreateDrafts: boolean },
  input: CreateDraftInvoiceInput, now: Date): Promise<ActionResult<DraftCreatedAnswer>>;
```

- `resolveDraftRequest` is pure apart from reads, and is shared by `propose_draft` and Create (ADR-0006).
- It never yields a proposal `createInvoice` would refuse (review-2026-10-12 R-08): before returning `PROPOSAL` it runs the invoice domain's own rules (`invoiceShapeSchema`, `checkDraftAmountRules`, `checkDueDate` from `lib/validations/invoice.ts`) on `toInvoiceFormInput(proposal)` and returns each failure as a `FIELD_INVALID` issue (`field` = editor field path, `message` = editor message). The default due date is the issue date + 30 days (the request's issue date when it names one).
- Every field spec.md §1 lets a request set (bank account, tax rate, discount, shipping, PO number, payment terms, notes, terms, a line's `productId`) is carried request → proposal (source `REQUEST`) → `toInvoiceFormInput(proposal)` → the invoice, in both channels; absent → the editor's default (R-06, R-09).
- `createDraftForKey` checks Draft permission first (`FORBIDDEN`), then the repeat mark, then resolves. In one transaction it then takes a key draft slot, creates the invoice with `assistantOrigin = PERSONAL_KEY`, `assistantKeyName` and `assistantKeyId`, and writes the repeat row.
- The tool maps the `ActionResult` failure to `DraftToolError` (openapi.yaml).
- `authenticatePersonalKey` ✎ also returns `canCreateDrafts` and `name` from the same row.

## Chat route internals — `app/api/chat/route.ts` ★ (critical flow 1)

```ts
reserveMessageSlot(actor, now): Promise<{ ok: true; state: AllowanceState; release: () => Promise<AllowanceState> }
  | { ok: false; usedUp: AllowanceUsedUpDetails } | { ok: false; unavailable: true }>;
saveTurn(actor, input: { conversationId: string | null; userText: string; assistantParts: ConversationMessageView['parts']; turn: AssistantTurnMetadata }):
  Promise<ActionResult<{ conversationId: string; title: string }>>;
```

- `saveTurn` creates the Conversation when `conversationId` is null (decided at `api`, 2026-10-11).
- It appends the two messages at the next positions under the Conversation row lock and moves `lastMessageAt`, all in one transaction.
- `AssistantTurnMetadata` is the `AssistantTurn` row without ids.
- A failed or unavailable turn saves only the metadata.

## Invoices — `lib/services/invoices/` ✎ (flow 11; AC-23; ADR-0013)

- **Every invoice read DTO** (invoice list rows, recent invoices, `getInvoice`, `getInvoiceEditorData`) gains:

  ```ts
  assistantMark: { origin: 'CHAT' } | { origin: 'PERSONAL_KEY'; keyName: string } | null;
  ```

  The value is non-null only while the stored status is `DRAFT`. `keyName` is `assistantKeyName`, the name at creation. Issued details, the PDF and the email never carry it.
- **`createInvoice` / `updateInvoice` / `updateInvoiceStatus`** set `issuedAt = now` where it is null, when the invoice leaves `DRAFT` (data-model). The signatures are unchanged.
- **`updateInvoice` / the editor save** never accept or write the origin columns. **`duplicateInvoice`** never copies them.

## Data export — `getAccountExport` / `GET /api/user/export` ✎ (flow 12; AC-39)

`exportVersion` goes from `'2.1'` to `'2.2'` (additive only). Added:

```ts
conversations: Array<{
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messages: Array<{ role: 'user' | 'assistant'; createdAt: string; text: string; links: AppLink[]; draftCardIds: string[] }>;
  draftCards: Array<{ id: string; state: DraftCardState; createdAt: string; proposal: DraftProposal; invoiceId: string | null }>;
}>;
messageAllowanceDays: Array<{ day: string /* yyyy-MM-dd */; used: number }>;
personalKeys: Array</* existing */ & {
  canCreateDrafts: boolean;
  draftDays: Array<{ day: string; created: number; allowance: number; lastLiftedAt: string | null }>;
}>;
```

- `AssistantTurn` rows and repeat marks are not exported. Spec §6.1 lists Conversations, daily counts and key counts only.
- The invoice rows in the export are read with every column (`include: { items: true }`), so they gain `assistantOrigin`, `assistantKeyName` and `issuedAt` automatically. **`assistantKeyId` must be omitted** (`omit: { assistantKeyId: true }`): a Personal key's id never leaves the database in the export (mcp-server AC-25).

## Account deletion — `deleteAccount` (unchanged signature; flow 12; AC-39)

The existing transaction removes every new row through the cascades (data-model, verified). No new statement is needed.

## Daily clean-up — `GET /api/cron/purge-limits` (internal; flow 9; AC-38)

The route keeps its auth (the cron secret) and response. It gains four independent steps:
- Conversations whose last message is more than 90 days old;
- repeat marks older than 24 h;
- Mastra traces older than 30 days;
- `AssistantTurn` rows and daily counters older than 400 days.

Each step reports its count and outcome. A failed step is reported to Sentry and never skips the others. This is not a public contract.
