---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-13"
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

> **Removed 2026-10-14** (fix 2026-10-14-question-form-ux, review R8): its only caller, the dashboard AI block, was removed by the owner.

`Promise<ActionResult<ConversationSummary[]>>` — at most 3, newest `lastMessageAt` first (`Conversation_userId_lastMessageAt_idx`). `[]` → the dashboard says there are none yet. Read with the existing `getAllowanceState` for the dashboard AI block (SCR-09); the links stay usable with the allowance used up (AC-32). Writes nothing.

## Assistant actions — `lib/actions/assistant-actions.ts` ✎

### `loadConversationCards(id)` ✎ (AC-12, AC-13)

The result gains `offers: Record<string, OfferView>`, exactly as `getConversation` returns them. The island calls it after each finished reply (parent rule), which is how a freshly streamed `data-offer` gets its labels (ADR-0001 Neutral), and how a press's claimed offer shows as chosen. `NOT_FOUND` as in the parent.

### `loadInvoicePreview(cardId: string, conversationId: string)` ★ (critical flow 2; ADR-0006; AC-20, AC-21, AC-22)

```ts
type InvoicePreview =
  | { kind: 'AVAILABLE'; invoice: SerializedInvoice; version: number; state: LinkedInvoiceState } // DRAFT or ISSUED
  | { kind: 'UNAVAILABLE' };                                                                        // deleted since
loadInvoicePreview(cardId: string, conversationId: string): Promise<ActionResult<InvoicePreview>>;
// conversationId: the open Conversation (the panel passes it from /ai/{id}; at /ai it calls nothing and shows not
// found). A card of another Conversation, or a missing or invalid conversationId, is NOT_FOUND in the same words
// as AC-22 (review 2026-10-13 R9-2, R10-1).
```

| Outcome | Result |
|---|---|
| a `CREATED` Draft card of this Freelancer whose invoice exists | `ok({ kind: 'AVAILABLE', invoice, version, state })`. `invoice` is the owner-scoped `getInvoice` serialization the list's preview modal already renders with `PDFPreviewPanel` (with its sender profile, for the logo); `version` = `Invoice.version` as read, sent back by `issueFromPreview`; `state` feeds the workspace invoice-state store (ADR-0008). Issue is shown only while `state.state = 'DRAFT'` |
| a `CREATED` card whose `invoiceId` was cleared (the invoice was deleted) | `ok({ kind: 'UNAVAILABLE' })`. The panel says "This invoice is no longer available." with no Issue; the card shows the same (AC-21) |
| no card with this id for this Freelancer, another Freelancer's card, a card that is not `CREATED`, or a card of another Conversation than `conversationId` (missing or invalid `conversationId` included; R9-2, R10-1) | `fail('NOT_FOUND', "This invoice can't be found.")` — the same words for every case (AC-22) |
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
  | { kind: 'TOO_MANY'; count: number }   // > 8: no offer, the reply states the count (AC-14). propose_draft's ISSUES answer drops every list longer than 8 in any issue and then carries `listCounts` and a `say` directive worded per issue kind; `matchCount` only for this TOO_MANY case; the fallback words say each count (review 2026-10-13 R2-B2, R3-B3, R4-B1, R4-B2). Since T72 it also carries `askFields: Array<{ field: FormField; lineIndex: number | null }>`, one per question the form will hold (composeForm order, F1, at most 6; T76), also on the pinned form-Send ISSUES answer and its propose_draft re-call, so the chat writes each one-line prompt through ask_user (F2; review R20-11)
  | { kind: 'NONE' };                     // no offer-able issue (value to type, link, mismatch)

checkChoice(actor, input: { conversationId: string; offerId: string; optionId: number }):
  Promise<{ ok: true; offer: { id: string; kind: ChoiceOfferKind; lineIndex: number | null; request: DraftRequest };
            option: StoredOfferOption } | { ok: false }>;              // { ok: false } ⇒ 409 CHOICE_UNAVAILABLE

claimOffer(tx, actor, offerId: string, optionId: number): Promise<boolean>;    // OPEN → CHOSEN; false = lost the race
releaseOffer(tx, offerId: string): Promise<void>;                              // CHOSEN → OPEN (CLOSED when a newer message exists), chosenOptionId = NULL

// pin.ts ★
pinChoice(request: DraftRequest, kind: ChoiceOfferKind, lineIndex: number | null, ref: OfferOptionRef): DraftRequest;
```

- **Offer mapping** (ADR-0002, sad.md §5 table): first offer-able issue in the order Customer → sender profile → currency → bank account → product. `CUSTOMER_AMBIGUOUS` / `CUSTOMER_NEAR_MISS` → `CUSTOMER`; `SENDER_PROFILE_NOT_FOUND` (`profiles`), `DEFAULT_PROFILE_WITHOUT_ACCOUNT` (`otherProfiles`), `NO_ACCOUNT_IN_CURRENCY` with a non-empty `otherProfiles` → `SENDER_PROFILE`; `CURRENCY_UNCLEAR` (its `options` that are `Currency` codes) → `CURRENCY`; `SEVERAL_ACCOUNTS_IN_CURRENCY` / `BANK_ACCOUNT_NOT_FOUND` / `BANK_ACCOUNT_AMBIGUOUS` → `BANK_ACCOUNT`; `PRODUCT_AMBIGUOUS` → `PRODUCT` with its `lineIndex`. Labels per openapi.yaml `OfferOptionLabel`.
- **T70 (FORM rows, review R20-1):** a picked record passes when it still exists, is the actor's, is of the asked kind and is unchanged per its ref (a bank account's `accountCurrency` when stored, else the stored request's currency; a product still active); fit between answers (account vs profile, product vs currency) is left to the resolver after `pinAnswers` (F6). The request-based rule below stays for legacy F9a rows only.
- **`checkChoice`** reads `WHERE id = $offerId AND "userId" = $actor AND state = 'OPEN'`, requires `conversationId` to match and the option to exist, then re-reads the option's record owner-scoped and checks it still fits: the Customer, sender profile or product exists (product still active, in the invoice currency); a bank account still belongs to the sender profile the request drafts under now (its `senderProfileId`, the profile it names by folded name, or the current default, as the resolver picks it; review 2026-10-13 R12-1) and is in the request's currency, if one is set; a currency is always valid. The stored request keeps the currency as written ("$", "€"), so it is read as the resolver reads it before comparing. A system failure while checking is not a refusal: the route answers `503 FAILED`, not `409` (review 2026-10-13 R1-S3). Writes nothing. Span `chat.choice-check` (metadata only: outcome `ok` / `unavailable` / `failed`, never the cause's data).
- **Pins** (ADR-0003): `CUSTOMER` → `customerId` (drops `customer`); `SENDER_PROFILE` → `senderProfileId` (drops `senderProfile`); `CURRENCY` → `currency`; `BANK_ACCOUNT` → `bankAccount` = the account id; `PRODUCT` → `lines[lineIndex].productId`. If the model calls `propose_draft` again in the pressed turn, it gets the pinned result back and the card and offer stay as code resolved them (review 2026-10-13 R1-S1).

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

One transaction under the Conversation row lock, in this order: create the Conversation (with `startedFrom`) when `conversationId` is null; close the Conversation's `OPEN` offer (`CLOSED`, no choice; AC-12; for a press this is only an offer another tab stored meanwhile, its own is `CHOSEN`); append the two messages (`origin` on the USER row, `NULL` on the ASSISTANT row); insert the turn's offer `OPEN` tied to the reply; move `lastMessageAt`. A failed or unavailable turn saves only the metadata, as in the parent, and so closes nothing.

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

`exportVersion` goes from `'2.2'` to `'2.3'` (additive only). Revision 2026-10-13 (T61) bumps it to `'2.4'`: each message also carries `form` (null, or `{ state, questions[{questionId, field, lineIndex, prompt, options[{optionId,label}], input, required, skippable}], answers }`), origin may be `FORM`, and a FORM row exports `offer: null`:

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

## Revision 2026-10-13 (owner feedback; ADR-0011, ADR-0013)

- **Types ✎.** `MessageOrigin` adds `'FORM'` (`PRESSED` is read-only history). `OfferView` is superseded by `FormView` (openapi.yaml `FormView`): `{ formId, state, questions: FormQuestionView[], answers: FormAnswer[] | null, currency?: string | null }` (`currency`: the invoice currency the form's stored request resolved to, null or absent when unknown; T74); a pre-revision offer row reads as a one-question `FormView` (data-model 08). `ConversationMessageView.parts` keeps `{ type: 'data-offer'; data: { offerId } }`, now resolved to a `FormView`.
- **Form request text (T74).** For a `form` request `message.parts[0].text` is ignored (the server composes the saved text), so it is not held to 1..2,000 characters: empty and long text are accepted, capped at 8,000 (`too_big` at `message.parts.0.text`). A typed message keeps 1..2,000.
- **`getConversation(actor, id)` ✎ / `loadConversationCards(id)` ✎** return `forms: Record<string, FormView>` instead of `offers`. Sent answers (typed text included) are part of the view, so a reopened form shows them read-only (AC-12, AC-13).
- **`ActionErrorDetails` ✎.** `CHOICE_UNAVAILABLE` is unchanged as a kind; its sentence on `/api/chat` becomes "This form is no longer available. Answer the latest questions or type your request." (one sentence for every cause, AC-12b). Typed-answer format errors are `VALIDATION` with `fieldErrors['form.answers.<questionId>']`, the sentence per kind from the screens manifest.
- **Chat route internals ✎ (`lib/services/assistant-drafts/forms.ts` ★, `form-pin.ts` ★):**

```ts
formFromIssues(issues: DraftIssue[], ctx: { invoiceCurrency: Currency | null; today: string; timeZone: string }): FormQuestionDraft[]; // every issue → a question; > 8 candidates → input-only + matchCount
checkAskUser(actor, input: AskUserInput, ctx): Promise<{ ok: true; questions: FormQuestionDraft[]; draft: DraftRequestPartial | null } | { ok: false; error: 'OPTIONS_UNAVAILABLE' }>;
composeForm(resolver: FormQuestionDraft[], chat: FormQuestionDraft[], fallback: boolean): StoredFormQuestion[]; // ≤ 6, spec F1 order, dedupe by field+lineIndex
checkForm(actor, input: { conversationId: string; form: ChatForm }):
  Promise<{ ok: true; form: { id: string; request: DraftRequestPartial | null; questions: StoredFormQuestion[] }; answers: ResolvedAnswer[] }
        | { ok: false; kind: 'UNAVAILABLE' } | { ok: false; kind: 'INVALID'; fieldErrors: Record<string, string[]> }>;
claimForm(actor, formId: string, answers: FormAnswer[], tx): Promise<boolean>; // OPEN → CHOSEN, with the allowance slot
releaseForm(actor, formId: string): Promise<void>;                             // CHOSEN → OPEN (or CLOSED), answers cleared
composeAnswerMessage(questions: StoredFormQuestion[], answers: ResolvedAnswer[]): string; // "<question> — <answer>" lines
pinAnswers(request: DraftRequestPartial, answers: ResolvedAnswer[]): DraftRequestPartial;  // ids for picks, names for "Other…", dates, values, skips
```

- **`search_invoices` ✎** (`lib/services/invoices/assistant-search.ts`): `createdFrom`, `createdTo`, `sort`; rows add `createdAt` (local day) and `path` (`protectedRoutes.invoiceEdit(id)`). Same owner scope, both channels.
- **Conversation list (ADR-0013) — client contract, no server action change.** `ConversationListProvider` (client) is seeded by `ai/layout.tsx` with `listConversationSummaries(actor)` and updated by `conversationCreated(summary)`, `conversationTouched(id, lastMessageAt, title?)`, `conversationRenamed(id, title)`, `conversationsDeleted(ids)`. The existing delete and rename actions keep their results; their callers raise the events. No action revalidates the `/ai` layout.
