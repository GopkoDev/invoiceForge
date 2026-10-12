---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
---

# Server actions and business layer — ai-chat-v2 (delta)

This extends [`ai-assistant/contracts/server-actions.md`](../../ai-assistant/contracts/server-actions.md), which stays in force. Only what ai-chat-v2 adds (★) or changes (✎) is listed; every other action and function keeps its parent contract.

The chat request, the `data-offer` stream part, the read questions and the shared draft-shape changes are in [`openapi.yaml`](./openapi.yaml). Shared shapes (`OfferView`, `ChoiceOfferKind`, `ChoiceOfferState`, `MessageOrigin`, `ConversationStartPoint`, `StoredOfferOption`, `ChoiceUnavailableDetails`) are defined once there; the TypeScript below mirrors them.

Derived from:
- `data-model.md` (`ChoiceOffer`, `ConversationMessage.origin`, `Conversation.startedFrom`, `Invoice.issuedFromChat`, existing `Invoice.version`);
- sad.md §5 and §6 (critical flows 1–3, flows 4–11), ADR-0001–ADR-0009;
- spec §5 AC-08–AC-13, AC-17, AC-20–AC-27, AC-29–AC-34.

Field origins are in [`api-sync-report.md`](./api-sync-report.md).

## ActionResult changes — `types/result.ts` ✎

`ActionErrorCode` is unchanged. `ActionErrorDetails` gains two kinds:

```ts
type ActionErrorDetails =
  | /* … existing kinds, incl. CHANGED_ELSEWHERE { currentVersion } and STATUS_NOT_ALLOWED … */
  | { kind: 'CHOICE_UNAVAILABLE' }                                   // ★ 409 on /api/chat (AC-12b, AC-13)
  | { kind: 'ALREADY_ISSUED'; invoice: LinkedInvoiceState };         // ★ issueFromPreview (AC-26)
```

`CHANGED_ELSEWHERE` (invoice-integrity) is reused as is for the outdated preview (AC-26b); no new kind. Every exhaustive `switch` over `details.kind` must handle the new members (`tasks` adds one task to find them).

## Shared types — `types/assistant/types.ts` ✎

```ts
type ChoiceOfferKind = 'CUSTOMER' | 'SENDER_PROFILE' | 'CURRENCY' | 'BANK_ACCOUNT' | 'PRODUCT';
type ChoiceOfferState = 'OPEN' | 'CHOSEN' | 'CLOSED';
type MessageOrigin = 'TYPED' | 'PRESSED' | 'DASHBOARD';
type ConversationStartPoint = 'AI_SECTION' | 'INVOICE_LIST' | 'DASHBOARD_PROMPT' | 'DASHBOARD_CREATE';

type OfferView = {                               // ★ openapi.yaml OfferView — no record refs, no stored request
  offerId: string;
  kind: ChoiceOfferKind;
  state: ChoiceOfferState;                       // pressable ⇔ OPEN
  chosenOptionId: number | null;                 // set only with CHOSEN
  options: Array<{ optionId: number; label: string }>; // 1..8
};

type ConversationMessageView = {                 // ✎
  /* … parent: id, role, parts, createdAt … */
  origin: MessageOrigin | null;                  // ★ USER rows; a NULL USER row reads TYPED; null on ASSISTANT
  parts: Array</* parent parts */ | { type: 'data-offer'; id: string; data: { offerId: string } }>; // ★
};
```

## AI section, Conversations — RSC reads, `lib/services/conversations/` ✎

### `getConversation(actor, id)` ✎ (flow 7; AC-12, AC-13, AC-33)

The result gains `offers: Record<string, OfferView>` keyed by `offerId`: one per `data-offer` part, read owner-scoped by `conversationId` (`ChoiceOffer_conversationId_idx`). Messages gain `origin`. Everything else (cards, invoice links, `NOT_FOUND` wording) is the parent's. Reopening writes and counts nothing.

### `listConversationSummaries(actor)` ★ — replaces the paged `listConversations(actor, page?)` (flow 8; AC-15, AC-17)

```ts
listConversationSummaries(actor): Promise<ActionResult<{ items: ConversationSummary[]; timeZone: string }>>;
```

- Every Conversation of the Freelancer, newest `lastMessageAt` first, `ConversationSummary` unchanged (`id`, `title`, `lastMessageAt`). No paging: bounded at about 2,700 rows by the allowance and the 90-day retention (sad.md §5, §7 threshold 3,000).
- `timeZone` is the Freelancer time zone; the client groups by the last message's local day: Today, Yesterday, Previous 7 days (2–7 days before today), Older (8+). The title search folds the query and the titles with the shared `foldName` in the browser.
- Empty Conversations never exist (a Conversation is created with its first message), so none is listed (AC-18).
- The `?page=N` links of the first iteration are removed (sad.md §11 accepted debt).

### `listLatestConversations(actor, limit = 3)` ★ (flow 10; AC-30)

`Promise<ActionResult<ConversationSummary[]>>` — at most 3, newest `lastMessageAt` first (`Conversation_userId_lastMessageAt_idx`). `[]` → the dashboard says there are none yet. Read with the existing `getAllowanceState` for the dashboard AI block (SCR-09); the links stay usable with the allowance used up (AC-32). Writes nothing.

## Assistant actions — `lib/actions/assistant-actions.ts` ✎

### `loadConversationCards(id)` ✎ (AC-12, AC-13)

The result gains `offers: Record<string, OfferView>`, exactly as `getConversation` returns them. The island calls it after each finished reply (parent rule), which is how a freshly streamed `data-offer` gets its labels (ADR-0001 Neutral), and how a press's claimed offer shows as chosen. `NOT_FOUND` as in the parent.

### `loadInvoicePreview(cardId: string)` ★ (critical flow 2; ADR-0006; AC-20, AC-21, AC-22)

```ts
type InvoicePreview =
  | { kind: 'AVAILABLE'; invoice: SerializedInvoice; version: number; state: LinkedInvoiceState } // DRAFT or ISSUED
  | { kind: 'UNAVAILABLE' };                                                                        // deleted since
loadInvoicePreview(cardId: string): Promise<ActionResult<InvoicePreview>>;
```

| Outcome | Result |
|---|---|
| a `CREATED` Draft card of this Freelancer whose invoice exists | `ok({ kind: 'AVAILABLE', invoice, version, state })`. `invoice` is the owner-scoped `getInvoice` serialization the list's preview modal already renders with `PDFPreviewPanel` (with its sender profile, for the logo); `version` = `Invoice.version` as read, sent back by `issueFromPreview`; `state` feeds the workspace invoice-state store (ADR-0008). Issue is shown only while `state.state = 'DRAFT'` |
| a `CREATED` card whose `invoiceId` was cleared (the invoice was deleted) | `ok({ kind: 'UNAVAILABLE' })`. The panel says "This invoice is no longer available." with no Issue; the card shows the same (AC-21) |
| no card with this id for this Freelancer, another Freelancer's card, or a card that is not `CREATED` | `fail('NOT_FOUND', "This invoice can't be found.")` — the same words for every case (AC-22) |
| unexpected failure | `fail('FAILED', "The preview couldn't be loaded. Try again.")` |

Read-only, never a message, never counted (AC-27). The preview address is `?preview={cardId}` (ADR-0005); reopening with it calls this action again. The reload after `CHANGED_ELSEWHERE` is a second call. ≤ 1.5 s p95 from the press to a rendered preview (spec §6).

### `issueFromPreview(invoiceId: string, expectedVersion: number)` ★ (critical flow 2; ADR-0007; AC-23, AC-25, AC-26, AC-26b, AC-27)

```ts
issueFromPreview(invoiceId: string, expectedVersion: number):
  Promise<ActionResult<{ status: InvoiceStatus; version: number; invoice: LinkedInvoiceState }>>;
```

Input: `invoiceId` is a `RecordId`; `expectedVersion` an integer ≥ 0, the `version` the preview showed (zod; else `fail('VALIDATION', …)`). The confirmation dialog (SCR-07) is UI-only and comes first. Calls `updateInvoiceStatus(actor, invoiceId, 'PENDING', { expectedVersion })` and, on success, sets `Invoice.issuedFromChat = true` in the same locked write.

| Outcome (decided in one transaction on the locked row, in this order) | Result |
|---|---|
| unknown invoice or another Freelancer's (including deleted since the preview loaded) | `fail('NOT_FOUND', "This invoice is no longer available.")` |
| no longer `DRAFT` | `fail('CONFLICT', 'This invoice has already been issued.', { details: { kind: 'ALREADY_ISSUED', invoice } })` — nothing issued again; `invoice` is its current `LinkedInvoiceState` for the panel, card and links (AC-26) |
| `version` ≠ `expectedVersion` (any saved change) | `fail('CONFLICT', 'This draft was changed after you opened the preview. Check it and issue again.', { details: { kind: 'CHANGED_ELSEWHERE', currentVersion } })` — nothing issued; the panel reloads through `loadInvoicePreview` and the Freelancer must press Issue and confirm again (AC-26b) |
| a draft rule or an amount bound fails (the editor's / list's `checkDraftRules` + `amountBoundErrors`), e.g. lines and bank account in different currencies | `fail('VALIDATION', <the editor's message, verbatim>, { fieldErrors })` — stays a draft; the panel offers "Open in editor" (AC-25) |
| passes | `ok({ status, version, invoice })`: the existing issue path — status `PENDING` (stored per `statusToStoreOnSave`), `issuedAt` set once, `version + 1`, the number kept (AC-23), `issuedFromChat = true`. The Assistant-draft mark disappears because `assistantMark` is non-null only while `DRAFT` (ai-assistant ADR-0013) |
| unexpected failure | `fail('FAILED', "The invoice couldn't be issued. Try again.")` — nothing changed |

- Never a message, never counted, works with the allowance used up (AC-27). The model has no tool that reaches it (AC-24).
- Two concurrent confirms issue exactly once (the row lock; the second sees `ALREADY_ISSUED`).
- Every result except `FAILED` updates the workspace invoice-state store (ADR-0008). Revalidates the invoice list and dashboard paths.
- Span `invoices.issue-from-preview`, ≤ 2 s p95 server-side (spec §6). Metadata only.

## Invoices — `lib/services/invoices/invoices.ts` ✎ (ADR-0007)

```ts
updateInvoiceStatus(actor, id: string, status: string, opts?: { expectedVersion?: number }):
  Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>>;
```

- Without `opts` (every existing caller, e.g. the list's row menu): unchanged.
- With `expectedVersion`, under the existing row lock and before `decideStatusChange`: not `DRAFT` → `CONFLICT` + `ALREADY_ISSUED`; `version` differs → `CONFLICT` + `CHANGED_ELSEWHERE { currentVersion }`; then the existing decision, draft rules and bounds.
- `issuedFromChat` is written only by `issueFromPreview`'s call (an internal flag on the same update; not a public parameter). It is never cleared; `duplicateInvoice` never copies it; `updateInvoice` never writes it.

## Chat route internals — `app/api/chat/route.ts` ✎, `lib/services/assistant-drafts/` ★

```ts
// offers.ts ★
offerFromIssues(issues: DraftIssue[], ctx: { invoiceCurrency: Currency | null }):
  | { kind: 'OFFER'; offerKind: ChoiceOfferKind; lineIndex: number | null; options: StoredOfferOption[] } // 1..8
  | { kind: 'TOO_MANY'; count: number }   // > 8: no offer, the reply states the count (AC-14)
  | { kind: 'NONE' };                     // no offer-able issue (value to type, link, mismatch)

checkChoice(actor, input: { conversationId: string; offerId: string; optionId: number }):
  Promise<{ ok: true; offer: { id: string; kind: ChoiceOfferKind; lineIndex: number | null; request: DraftRequest };
            option: StoredOfferOption } | { ok: false }>;              // { ok: false } ⇒ 409 CHOICE_UNAVAILABLE

claimOffer(tx, actor, offerId: string, optionId: number): Promise<boolean>;    // OPEN → CHOSEN; false = lost the race
releaseOffer(tx, offerId: string): Promise<void>;                              // CHOSEN → OPEN, chosenOptionId = NULL

// pin.ts ★
pinChoice(request: DraftRequest, kind: ChoiceOfferKind, lineIndex: number | null, ref: OfferOptionRef): DraftRequest;
```

- **Offer mapping** (ADR-0002, sad.md §5 table): first offer-able issue in the order Customer → sender profile → currency → bank account → product. `CUSTOMER_AMBIGUOUS` / `CUSTOMER_NEAR_MISS` → `CUSTOMER`; `SENDER_PROFILE_NOT_FOUND` (`profiles`), `DEFAULT_PROFILE_WITHOUT_ACCOUNT` (`otherProfiles`), `NO_ACCOUNT_IN_CURRENCY` with a non-empty `otherProfiles` → `SENDER_PROFILE`; `CURRENCY_UNCLEAR` (its `options` that are `Currency` codes) → `CURRENCY`; `SEVERAL_ACCOUNTS_IN_CURRENCY` / `BANK_ACCOUNT_NOT_FOUND` / `BANK_ACCOUNT_AMBIGUOUS` → `BANK_ACCOUNT`; `PRODUCT_AMBIGUOUS` → `PRODUCT` with its `lineIndex`. Labels per openapi.yaml `OfferOptionLabel`.
- **`checkChoice`** reads `WHERE id = $offerId AND "userId" = $actor AND state = 'OPEN'`, requires `conversationId` to match and the option to exist, then re-reads the option's record owner-scoped and checks it still fits: the Customer, sender profile or product exists (product still active, in the invoice currency); a bank account still belongs to the request's sender profile and is in the request's currency, if one is set; a currency is always valid. Writes nothing. Span `chat.choice-check` (metadata only: outcome, never the cause's data).
- **Pins** (ADR-0003): `CUSTOMER` → `customerId` (drops `customer`); `SENDER_PROFILE` → `senderProfileId` (drops `senderProfile`); `CURRENCY` → `currency`; `BANK_ACCOUNT` → `bankAccount` = the account id; `PRODUCT` → `lines[lineIndex].productId`. The turn's `propose_draft` adapter applies the same pins if the model calls it again.

### `saveTurn(actor, input)` ✎

```ts
saveTurn(actor, input: {
  conversationId: string | null;
  startedFrom?: ConversationStartPoint;          // ★ only when conversationId is null; default AI_SECTION
  userText: string;                              // a press: the stored label, never the client's text
  userOrigin: MessageOrigin;                     // ★ TYPED | PRESSED | DASHBOARD
  assistantMessageId: string;                    // ★ pre-generated cuid, so the offer can reference the reply
  assistantParts: ConversationMessageView['parts'];
  offer: { kind: ChoiceOfferKind; lineIndex: number | null; request: DraftRequest; options: StoredOfferOption[] } | null; // ★
  turn: AssistantTurnMetadata;
}): Promise<ActionResult<{ conversationId: string; title: string }>>;
```

One transaction under the Conversation row lock, in this order: create the Conversation (with `startedFrom`) when `conversationId` is null; when `userOrigin` is not `PRESSED`, close the Conversation's `OPEN` offer (`CLOSED`, no choice; AC-12); append the two messages (`origin` on the USER row, `NULL` on the ASSISTANT row); insert the turn's offer `OPEN` tied to the reply; move `lastMessageAt`. A failed or unavailable turn saves only the metadata, as in the parent, and so closes nothing.

### Route order for a press (critical flow 1)

session → body (`chatRequestSchema`) → Conversation owner check → `checkChoice` → reserve the slot and `claimOffer` in one transaction (claim `false` → release the slot, 409) → pin + resolve → agent turn → `saveTurn` with `userOrigin = 'PRESSED'`. `COULD_NOT_COMPLETE` / `AI_UNAVAILABLE` → release the slot and `releaseOffer` together.

## Addresses and start points — `app/(protected)/ai/page.tsx` ✎ (ADR-0005, ADR-0009)

| Address | What the island sends with the first message |
|---|---|
| `/ai` (New chat, the "AI chat" navigation item) | `startedFrom` absent → `AI_SECTION` |
| `/ai?start=draft&from=invoices` (the invoice list's "Create with AI"; the existing `/ai?start=draft` link gains `from=invoices`) | `startedFrom: 'INVOICE_LIST'` |
| `/ai?start=draft&from=dashboard` (the dashboard's "Create invoice with AI") | `startedFrom: 'DASHBOARD_CREATE'` |
| `/ai?handoff={id}` (the dashboard prompt; the entry is taken once from `sessionStorage` and `handoff` dropped with `replaceState`) | `origin: 'DASHBOARD'`, `startedFrom: 'DASHBOARD_PROMPT'` |
| `/ai/{id}` / `/ai/{id}?preview={cardId}` | an existing Conversation; never `origin` / `startedFrom` |

An unknown `from` value, or `start=draft` with no `from`, sends `AI_SECTION` / `INVOICE_LIST` respectively and is never an error. With the allowance used up, the `start=draft` entries show the used-up state with the hand-made editor link (ai-assistant AC-34). A missing or already-taken hand-off entry shows a plain new Conversation; nothing is sent (sad.md §11). Prompt text never appears in an address.

## Dashboard prompt box — client validation (critical flow 3; AC-31, AC-32)

The prompt box validates with the chat's own message rule (`chatRequestSchema`'s text part: trimmed, 1..2,000 characters) before the hand-off: empty → "Type a message first."; too long → "Messages can be at most 2,000 characters. Shorten it and send again." (the parent's wording). Nothing is stored, sent or created on a refusal. With `left = 0` from `getAllowanceState`, the box shows the used-up state and the hand-made editor link instead of sending.

## Data export — `getAccountExport` / `GET /api/user/export` ✎ (flow 11; AC-34)

`exportVersion` goes from `'2.2'` to `'2.3'` (additive only):

```ts
conversations: Array</* parent */ & {
  startedFrom: ConversationStartPoint;                                   // ★
  messages: Array</* parent */ & {
    origin: MessageOrigin | null;                                        // ★ null on assistant messages
    offer: {                                                             // ★ the reply's Offered choices, or null
      kind: ChoiceOfferKind;
      options: Array<{ optionId: number; label: string }>;
      state: ChoiceOfferState;
      chosenOptionId: number | null;
      createdAt: string;
    } | null;
  }>;
}>;
```

- Offers export their labels and the chosen option, not their record references or stored draft request (the request's words are the visible messages already exported).
- Invoice rows gain `issuedFromChat` automatically (they are read with every column; `assistantKeyId` stays omitted).

## Account deletion, Conversation deletion, 90-day purge (unchanged signatures; flow 11)

`ChoiceOffer` rows cascade with their Conversation, message and user (data-model), so `deleteAccount`, `deleteConversation`, `deleteAllConversations` and the purge step need no new statement.

## Read questions — `lib/assistant-tools/` (shared registry; openapi.yaml `x-mcp-tools`)

`sender-profiles.ts` ★ (`list_sender_profiles`), `products.ts` ★ (`list_products`) and `customers.ts` ✎ (`list_customers`) are registered by both MCP and the chat (`lib/ai/tools/read-tools.ts`). Their services: `listSenderProfilesForAssistant(actor, input)` ★ and `listProductsForAssistant(actor, input)` ★ in the owning domains; `listCustomersForAssistant` ✎ folds the name and caps the page at 20. Each returns `ActionResult` and is wrapped in its `inOutcomeSpan` (`assistant-tools.<name>`). A contract test walks every read question's output against a fixture with known full account numbers (spec §6 "Bank account exposure").
