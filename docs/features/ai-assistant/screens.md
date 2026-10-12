---
status: draft
feature_size: "L"
tool: "code"
updated_at: "2026-10-11"
---

# Screens — ai-assistant

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code, from `docs/design-system.md` (a code-only canon). This is the canon's tool, not a degradation.
- **File:** the wireframes are inline below.
- **Inventory:** `ux-flows.md` §Screen inventory, SCR-01 to SCR-13. Every row has a section below.
- **Component inventory:** the canon registers `LoadError`, `ConfirmationModal`, `CopyButton`, `IssuedDetailsCard`, `AmountInput` and `PdfPreparingStatus`. Everything else is named from the code's de-facto inventory:
  - the `components/ui/*` primitives: `Alert`, `Badge`, `Button` / `buttonVariants`, `Card`, `Checkbox`, `DropdownMenu`, `Empty`, `Field` / `FieldLabel` / `FieldDescription` / `FieldError`, `Item`, `Pagination`, `ScrollArea`, `Separator`, `Skeleton`, `Spinner`, `Textarea`, `Tooltip`, `Sonner` toasts;
  - the app components `AppSidebar` (driven by `config/navigation-menu.config.ts`), `ContentArea` / `ContentAreaHeader`, `ContentAreaNotFound`, `InvoiceStatusBadge`, `InvoicesDataTable`, `InvoicesTableSkeleton`, `InvoicesEmptyState`, `InvoiceEditor`, `InvoiceEditorHeader`, `InvoiceEditorLoading`, `KeyCreateForm`, `KeyList`, `KeyReveal`, `SetupSteps`, `ExamplePrompts`, `GdprSettings`, `LoginForm`, and each route's existing `loading.tsx` / `error.tsx` / `not-found.tsx`.
  - The chat island and the Conversation list (sad.md §5 `components/ai/`) are **compositions** of the primitives above and the four new components in §New components. `implement` decides the file split.
- **Posture:** responsive-both (`ux-flows.md` §Platform decisions). At `lg` (1024 px) and wider, the AI section is two panes inside the content area: the Conversation list in a 288 px column on the left, and the start panel or the open Conversation on the right. Below `lg`, `/ai` stacks the start panel above the list, and `/ai/{id}` shows only the Conversation with a "← All conversations" link. The flows are the same on both.
- **Navigation:** a new main-section entry **"AI"** after "Invoices" in `config/navigation-menu.config.ts` (route `/ai`, `ux-flows.md` §Platform decisions).
- **Reply rendering:** Assistant text renders as **plain text** with line breaks kept (`whitespace-pre-wrap`), never as Markdown or HTML. Links come only from `data-link` and `data-draft-card` parts; a URL the model writes stays plain text (sad.md §8 Links, AC-07). The agent instructions ask for plain sentences and `- ` lists so a reply reads well without a renderer.
- **Strings:** inline, because the app has no i18n layer. App text stays English (sad.md §8 Internationalisation); the Assistant's own words follow the language of the message. Where the contract fixes a message (`contracts/openapi.yaml` `/api/chat` 400 / 404 / 429 / 503, `contracts/server-actions.md` `createDraftFromCard`, `deleteConversation`, `liftKeyDraftLimit`), the UI shows the result's `error` **verbatim**. Other copy below is this manifest's, and `implement` uses it as written.
- **Dates:** every date and time is shown in the Freelancer time zone (UTC until one is saved), in the app's existing format. `renewsAt` shows as "at 00:00" when it is the next local midnight, otherwise as "tomorrow at {HH:mm}" or "at {HH:mm}" (the 24-hour mark after a time-zone change, ADR-0009).
- **Error routing** (unchanged repo convention, architecture-hardening ADR-0009):
  - A Visitor reaching `/ai` or `/ai/{id}` is redirected by the proxy to sign-in (SCR-11, AC-42). `/api/chat` `401`, an `UNAUTHORIZED` action result or a rejected call → `goToSignIn()`.
  - A failed page read goes through `unwrapPageResult` to the segment's `error.tsx` (`LoadError`).
  - Action failures show as described per screen below.
- **Live regions:** streamed text is not announced token by token. The finished reply is announced once through an `aria-live="polite"` region; the waiting state is an sr-only `role="status"` "Assistant is replying…" (sad.md §8 UI).
- **Contract gaps found here** (each is a `tasks` input, not decided here):
  - **OQ-A1** (api-sync-report, owner `sequences`): the `NEEDS_ANSWERS` result of `createDraftFromCard` has no sad.md §6 branch. SCR-03 `needs-answers` renders the contract as it stands.
  - **OQ-S1** (owner `api`, Dmytro Hopko; due before `tasks`): `getConversation` resolves every invoice link to a `LinkedInvoiceState` (AC-36), but its return type has no field that carries the link states, and a streamed `data-draft-card` part carries only `cardId` with no read that returns one `DraftCardView` mid-session. **Decided here (UI side):** after each `finish` the island calls `router.refresh()`, so `cards` and link states come from `getConversation`; a fresh card shows SCR-03 `loading` until then. **Asked of `api`:** add `invoiceLinks: Record<string, LinkedInvoiceState>` (keyed by invoice id) to the `getConversation` result. No new read function.

## Screens

### SCR-01 — AI section

New route `/ai` (`app/(protected)/ai/page.tsx`, RSC). Reads `getAllowanceState` and `listConversations` (sad.md §6 flow 4). "Create with AI" opens `/ai?start=draft` (server-actions.md, AC-33). Opening the section writes and counts nothing.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight: new `ai/loading.tsx` with a start-panel skeleton and five list-row skeletons | `Skeleton` | — |
| default | Signed in, messages left, opened from the navigation (AC-01; flow 4 `else` navigation). Start panel: heading "Ask about your invoices", four example questions, the composer, "{left} of 30 messages left today", and the link "Connect your own AI client →" to SCR-07. List: past Conversations, newest `lastMessageAt` first, each "{title}" · "{date of last message}", with a delete icon button per row, a "New conversation" button, a "Delete all" action, and the fixed retention notice "Conversations are kept for 90 days after their last message." (AC-35, AC-38) | `Card`, `Button` (outline, one per example), `Textarea`, `Button`, `NEW: AllowanceNotice` (counter mode), `ScrollArea`, `Item`, `DropdownMenu`, `Pagination` | wireframe below |
| example picked | Clicking an example fills the composer with its text and focuses it. Nothing is sent until Send, so an example never spends a message by accident | `Textarea` | — |
| empty | No Conversations yet: the list shows `Empty` "No conversations yet" / "Ask a question to start one." The retention notice and "New conversation" stay; "Delete all" is hidden | `Empty` | wireframe below |
| paged | More than 20 Conversations: `Pagination` under the list, 20 per page by page number (`listConversations` page; a page past the last is handled by `paginate`) | `Pagination` | — |
| start=draft | `?start=draft` with messages left (AC-33; flow 4 Create with AI). Heading "Draft an invoice", the composer placeholder `e.g. "Invoice Acme for 20 hours of consulting at $50"`, and one example chip with that text in place of the four questions. The list is unchanged | `Card`, `Button` (outline), `Textarea` | wireframe below |
| used-up | `left = 0` from the navigation (AC-10). The composer and the example questions are replaced by `AllowanceNotice` (used-up mode). The list stays readable and every past Conversation opens | `NEW: AllowanceNotice` (used-up mode) | wireframe below |
| used-up from Create with AI | `?start=draft` with `left = 0` (AC-34). Before anything is typed: `AllowanceNotice` (used-up mode) plus "Create it by hand →" to `/invoices/new` (SCR-06) | `NEW: AllowanceNotice`, `buttonVariants` link | wireframe below |
| sending first message | Send on the start panel: the panel turns into the Conversation layout of SCR-02 `waiting` at once. The `data-conversation` part gives the new id; the URL becomes `/ai/{id}` without remounting the island (`history.replaceState`), and the new row heads the list once the turn is saved (`data-conversation` arrives just before `data-outcome`, after the reply streamed) | — | SCR-02 |
| deleted | SCR-04 confirmed → `ok()`: the dialog closes, `toast.success` "Conversation deleted." (one) or "All conversations deleted." (all), the list refreshes; zero left → `empty` (AC-37) | `Sonner` | — |
| error | `getAllowanceState` or `listConversations` fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`) | `LoadError` | existing |
| signed out | Visitor → proxy → SCR-11; nothing processed or counted (AC-42) | — | SCR-11 |

```text
default (lg and wider)
+---------------------------+--------------------------------------------+
| [+ New conversation]  [⋯] |  Ask about your invoices                   |
| Kept for 90 days after    |  Answers come from your own invoices,      |
| the last message.         |  Customers and figures.                    |
|---------------------------|                                            |
| Who owes me money?    [🗑]|  [Who owes me money right now?]            |
|   10 Oct 2026             |  [What's overdue today?]                   |
| invoice Acme for 20 h [🗑]|  [How much did I invoice this month?]      |
|   8 Oct 2026              |  [Where do I change the logo on my         |
| Where is the logo set [🗑]|   invoices?]                               |
|   2 Oct 2026              |                                            |
|                           |  +--------------------------------------+  |
|      [< 1 2 >]            |  | Ask a question or describe an invoice |  |
|                           |  |                                [Send] |  |
|  ⋯ menu: Delete all       |  +--------------------------------------+  |
|                           |  29 of 30 messages left today              |
|                           |  Connect your own AI client →              |
+---------------------------+--------------------------------------------+
  Below lg: the start panel first, full width; then "Recent
  conversations" with the same rows; the ⋯ menu sits in that heading.
```

```text
empty (list column)                start=draft (right pane)
| [+ New conversation]  [⋯] |      |  Draft an invoice                         |
| Kept for 90 days after    |      |  Describe it in one sentence. You'll see  |
| the last message.         |      |  a card to check before anything is       |
|   [chat icon]             |      |  created.                                 |
|   No conversations yet    |      |  [Invoice Acme for 20 hours of consulting |
|   Ask a question to       |      |   at $50]                                 |
|   start one.              |      |  [ e.g. "Invoice Acme for 20 hours..." ]  |
                                   |                                   [Send]  |
                                   |  29 of 30 messages left today             |

used-up / used-up from Create with AI (replaces the composer and examples)
|  (i) You've used today's 30 messages                                     |
|      They renew at 00:00 your time. An AI client connected with a       |
|      Personal key isn't affected, and your conversations stay readable. |
|      Connect your own AI client →                                       |
|      [Create it by hand →]        <- only from Create with AI (AC-34)   |
```

### SCR-02 — Conversation

New route `/ai/{id}` (`[conversationId]/page.tsx` RSC shell reading `getConversation`; `components/ai/` client island on `useChat` posting to `/api/chat`, critical flow 1, flows 5–7). The island sends only the new message; the server loads history (`ChatRequest`).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight: new `[conversationId]/loading.tsx` with three alternating message skeletons and a composer skeleton | `Skeleton` | — |
| default | `getConversation` → `ok` (AC-35; flow 7 found). Header: the title, "New conversation" (→ `/ai`) and a `⋯` menu with "Delete conversation". The whole exchange in order: Freelancer messages right-aligned, Assistant messages left-aligned as plain text with their `ChatLink`s and Draft cards (SCR-03) in part order. Composer and `AllowanceNotice` (counter) at the bottom. Scrolled to the newest message | `ScrollArea`, `NEW: ChatLink`, `NEW: DraftCard`, `Textarea`, `Button`, `NEW: AllowanceNotice`, `DropdownMenu` | wireframe below |
| links | Invoice links show their current state (AC-36; flow 7): a draft → "INV-0043 · Draft", opens the editor; issued since → "INV-0042" + `InvoiceStatusBadge`, opens the editor; deleted since → "INV-0043 · No longer available", not a link. Page links → "{page title} →" to the route from the fixed app map (AC-07; SCR-09, SCR-10, SCR-07) | `NEW: ChatLink` | wireframe below |
| waiting | Send pressed: the message appears at once; an Assistant row shows a `Spinner` and "Thinking…" until the first words; Send and Enter are disabled while a reply is in flight (one message at a time). `data-allowance` updates the counter as soon as the slot is reserved | `Spinner` | wireframe below |
| streaming | Text deltas render progressively in the Assistant row (first words ≤ 3 s p95, spec §6). A streamed card or link renders as it arrives; after `finish` the island calls `router.refresh()` so `cards` and link states come from `getConversation` (OQ-S1). Until then a card shows SCR-03 `loading` | `NEW: DraftCard`, `NEW: ChatLink` | — |
| answered | `data-outcome` `ANSWERED`: the reply stays; the counter reads one less (AC-09). Covers answers with figures and links (AC-02, AC-03, AC-05, AC-08), a partial list with its total count (AC-04), the one-sentence refusal (AC-06), a mixed answer with a card plus a one-sentence refusal (AC-06b), a follow-up question instead of a card (AC-17, AC-19–AC-22), "only you can issue" with a link (AC-24) and the not-found answer for another account's Customer (AC-40). All are the Assistant's own text; the UI adds nothing | — | wireframe below |
| partial | `data-outcome` `PARTIAL` (AC-11b): the part found, ending with the route's saved "too broad, ask a narrower question" sentence. Counted; the UI adds nothing | — | — |
| could-not-complete | `data-outcome` `COULD_NOT_COMPLETE`, or `503 FAILED` before the stream (AC-11): any text already streamed is discarded; the Assistant row becomes a destructive inline `Alert` "The reply couldn't be completed. Try again." with "Try again", which sends the same text as a new message. The counter returns to its earlier value (`data-allowance` after the release); not counted | `Alert`, `Button` | wireframe below |
| ai-unavailable | `data-outcome` `AI_UNAVAILABLE` (spec §6 outage, ADR-0003), shown within 10 s: inline `Alert` "AI is temporarily unavailable. Try again in a few minutes. The rest of Invoice Forge works as usual." with "Try again". Not counted | `Alert`, `Button` | wireframe below |
| too-long | The composer text is over 2,000 characters after trimming (spec §6). The client checks first: `FieldError` under the composer with the contract message verbatim "Messages can be at most 2,000 characters. Shorten it and send again." and the count "{n} / 2,000"; Send disabled; the text is kept. A `400 VALIDATION` from the route shows the same message. Not counted | `Field`, `FieldError` | wireframe below |
| used-up | `left = 0` on load, or `429 RATE_LIMITED` `ALLOWANCE_USED_UP` on send, including the losing tab of AC-10b (AC-10, AC-10b). The unsent message is removed; the composer is replaced by `AllowanceNotice` (used-up mode) with the result's `error` verbatim. The exchange stays readable, links open and a live card can still be created (AC-11c) | `NEW: AllowanceNotice` (used-up mode) | wireframe below |
| conversation-gone | `/api/chat` `404 NOT_FOUND` mid-session (deleted in another tab): inline `Alert` "This conversation can't be found." verbatim with "Start a new conversation →" (`/ai`); the composer is disabled | `Alert`, `buttonVariants` link | — |
| not-found | `getConversation` → `NOT_FOUND`: unknown id or another Freelancer's → SCR-12, the same for both (AC-41) | — | SCR-12 |
| deleted | `⋯` → "Delete conversation" → SCR-04 (one) → `ok()` → `router.push('/ai')` + `toast.success` "Conversation deleted." | `DropdownMenu`, `Sonner` | SCR-04 |
| error | `getConversation` fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`) | `LoadError` | existing |
| signed out | Visitor → proxy → SCR-11; `401` on send → `goToSignIn()`; nothing processed or counted (AC-42) | — | SCR-11 |
| empty | N/A: a Conversation is created only when its first turn is saved (`saveTurn`), so an existing one always has at least one exchange | — | — |

```text
default + answered (lg and wider: right pane; list column as SCR-01)
+--------------------------------------------------------------+
| Who owes me money?                [+ New conversation]  [⋯]  |
|--------------------------------------------------------------|
|                                 Who owes me money right now? |
| Two Customers owe you money:                                 |
| - Acme GmbH: 1,240.00 EUR, 12 days overdue                   |
| - Globex Ltd: 600.00 USD, 3 days overdue                     |
| INV-0042 [Overdue]   INV-0039 [Overdue]                      |
|                                                              |
|                                 make a draft for Acme GmbH   |
|                                 for 10 hours at 90 EUR       |
| Here is the draft for Acme GmbH.                             |
| +----------------------------------------------------------+ |
| | Draft card (SCR-03)                                      | |
| +----------------------------------------------------------+ |
|--------------------------------------------------------------|
| +----------------------------------------------------------+ |
| | Ask a question or describe an invoice             [Send] | |
| +----------------------------------------------------------+ |
| 27 of 30 messages left today                                 |
+--------------------------------------------------------------+
  Below lg: "← All conversations" above the title; the ⋯ menu holds
  "New conversation" and "Delete conversation".
```

```text
links (AC-36, AC-07)
| INV-0043 · Draft        -> /invoices/{id}/edit                 |
| INV-0042 [Issued]       -> /invoices/{id}/edit                 |
| INV-0040 · No longer available      (plain text, not a link)   |
| Sender profiles →       -> fixed app map route                 |

waiting
|                                 What's overdue today?        |
| (◌) Thinking…                                                |
| [ composer disabled                                  ] [Send]|

could-not-complete / ai-unavailable
|                                 What's overdue today?        |
| (x) The reply couldn't be completed. Try again.  [Try again] |
| 28 of 30 messages left today       <- restored, not counted  |

| (x) AI is temporarily unavailable. Try again in a few        |
|     minutes. The rest of Invoice Forge works as usual.       |
|                                                 [Try again]  |

too-long
| [ ...2,134 characters of text...                     ] [Send]|  <- disabled
| ! Messages can be at most 2,000 characters. Shorten it and   |
|   send again.                                  2,134 / 2,000 |

used-up (replaces the composer; AC-10, AC-10b)
| (i) You've used today's 30 messages. They renew at 00:00     |
|     your time. An AI client connected with a Personal key    |
|     isn't affected.                                          |
|     Connect your own AI client →                             |
```

### SCR-03 — Draft card (inline in SCR-02)

Rendered for every `data-draft-card` part from its `DraftCardView` (server-actions.md). Create calls `createDraftFromCard(cardId)` (critical flow 2): never a message, never counted, works with the allowance used up (AC-11c).

**Card content** (AC-12, AC-16, AC-16b, AC-19), from `DraftProposal`:
- **Customer:** `customer.name`.
- **From:** `senderProfile.name`, with "(default)" when `source = DEFAULT`, or "(you named it)" when `REQUEST` (AC-17).
- **Bank account:** `bankAccount.label` · `currency`, with "(default)" or "(matches the currency you asked for)" when `source = REQUEST` (AC-19).
- **Issue date / Due date:** the day, with "(today, default)" / "(in 30 days, default)" when `source = DEFAULT`.
- **Lines:** "{name}  {quantity} {unit} × {rate} = {amount} {currency}". Under each line, the price source: `REQUEST` → "Price you named"; `CUSTOM_PRICE` → "Custom price agreed with {Customer}"; `CATALOGUE` → "Price from your product {name}". With `agreedCustomPrice` → also "Agreed custom price: {value} {currency}" (AC-16b). `productId = null` → "Not linked to a product". `quantitySource` / `unitSource` `DEFAULT` → "(default)" after the quantity or unit (AC-19).
- **Total:** `total` {currency}, then "No tax, discount or shipping. The invoice number is assigned when the draft is created." (AC-12).
- **Defaults used:** "Defaults used: {list}" from `defaultsUsed`, in plain words (sender profile, bank account, issue date, due date, quantity, unit). Hidden when empty.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | A card just streamed whose `DraftCardView` has not arrived yet (OQ-S1): a card-sized `Skeleton` | `Skeleton` | — |
| live | `state = LIVE` (AC-12; flow 6 request complete). Full content and "Create draft". No draft exists yet | `NEW: DraftCard`, `Card`, `Separator`, `Badge`, `Button` | wireframe below |
| creating | Create pressed: `Spinner` in the button, the button disabled; a second press cannot fire (the row lock covers other tabs) | `Spinner` | — |
| created | `CREATED`, or `ALREADY_CREATED` with a `DRAFT` invoice (AC-13, AC-14), or `state = CREATED` on load. `Badge` "Created"; the button becomes the line "Draft {invoiceNumber} created." with `ChatLink` "Open draft →" to the editor; nothing is issued or sent. A repeated press or a reconnect shows the same link and creates nothing | `Badge`, `NEW: ChatLink` | wireframe below |
| created, issued since | `ALREADY_CREATED` or load with an `ISSUED` invoice (AC-36): "Invoice {invoiceNumber}" + `InvoiceStatusBadge`, opens the editor | `NEW: ChatLink`, `InvoiceStatusBadge` | — |
| created, deleted since | `ALREADY_CREATED` or load with `UNAVAILABLE` (AC-36): "This draft is no longer available." No link | `NEW: ChatLink` | — |
| replaced | `REPLACED` result, or `state = REPLACED` on load (AC-14b; flow 6 earlier card replaced). The body collapses to the Customer and total, dimmed; `Badge` "Replaced"; "A newer card replaced this one." with "Go to the newer card ↓", which scrolls to `replacedById` / `newerCardId`. No Create | `Badge`, `Button` (link) | wireframe below |
| outdated | `OUTDATED` result (AC-18), or `state = OUTDATED` with a `replacedById` on load. The old card collapses like `replaced` with `Badge` "Outdated" and "Something changed since this card was made: a price, the Customer, the sender profile, the bank account or the date. Check the updated card below." The updated `LIVE` card renders directly under it in the same message, and only it can be created. On load the successor comes from the stored chain (`cards[replacedById]`, in whatever state it has reached: live, created with its invoice, or unavailable), and "Go to the newer card ↓" scrolls to it | `Badge`, `NEW: DraftCard` | wireframe below |
| needs-answers | `NEEDS_ANSWERS` result (server-actions.md; OQ-A1). The card collapses with `Badge` "Outdated" and one line per `DraftIssue` in fixed copy (e.g. `CUSTOMER_NOT_FOUND` → "{written} is no longer among your Customers."; `NO_SENDER_PROFILE_WITH_ACCOUNT` → "You need a sender profile with a bank account."), then "Nothing was created. Ask again in the chat." On load (`OUTDATED`, no `replacedById`) the issues are not stored, so only "This card is out of date and can't be created. Ask again in the chat." shows | `Badge`, `Alert` | wireframe below |
| at zero allowance | Messages used up with a live card on screen (AC-11c): exactly `live`; Create works | — | — |
| not-found | `NOT_FOUND` (the Conversation was deleted in another tab): `toast.error` "This draft card is no longer available." verbatim; the card shows `replaced`-style dimming without a link | `Sonner` | — |
| create-failed | `FAILED`: `toast.error` "The draft couldn't be created. Try again." verbatim; the card stays `live` | `Sonner` | — |
| rejected | `UNAUTHORIZED` or a rejected call → `goToSignIn()` | — | SCR-11 |
| empty | N/A: a proposal always has at least one line (`DraftProposal.lines` `minItems: 1`) | — | — |

```text
live (AC-12, AC-16)
+----------------------------------------------------------+
| Draft invoice                                 [Proposed] |
| Customer      Acme Corp                                  |
| From          Main profile (default)                     |
| Bank account  Monobank ••••1234 · USD (default)          |
| Issue date    11 Oct 2026 (today, default)               |
| Due date      10 Nov 2026 (in 30 days, default)          |
|----------------------------------------------------------|
| Consulting     20 hours × 45.00 = 900.00 USD             |
|   Custom price agreed with Acme Corp                     |
|----------------------------------------------------------|
| Total                                         900.00 USD |
| No tax, discount or shipping. The invoice number is      |
| assigned when the draft is created.                      |
| Defaults used: sender profile, bank account, issue date, |
| due date.                                                |
|                                         [Create draft]   |
+----------------------------------------------------------+
  AC-16b first case, the line reads:
  | Consulting     20 hours × 60.00 = 1,200.00 USD           |
  |   Price you named · Agreed custom price: 45.00 USD       |
  AC-19, the line reads:
  | Logo design    1 item (default) × 600.00 = 600.00 EUR    |
  |   Price you named · Not linked to a product              |
  Phone: label/value pairs stack; the button is full width.
```

```text
created (AC-13, AC-14)
| Draft invoice                                  [Created] |
| ...content as live...                                    |
| Draft INV-0043 created.                  Open draft →    |

replaced (AC-14b)
| Draft invoice · Acme Corp · 1,000.00 USD      [Replaced] |
| A newer card replaced this one.  Go to the newer card ↓  |

outdated (AC-18) - updated card right below
| Draft invoice · Acme Corp · 900.00 USD        [Outdated] |
| Something changed since this card was made: a price, the |
| Customer, the sender profile, the bank account or the    |
| date. Check the updated card below.                      |
+----------------------------------------------------------+
| Draft invoice                                 [Proposed] |
| ...Consulting 20 hours × 40.00 = 800.00 USD...           |
|                                         [Create draft]   |
+----------------------------------------------------------+

needs-answers (OQ-A1)
| Draft invoice · Acme Corp · 900.00 USD        [Outdated] |
| (!) Acme Corp is no longer among your Customers.         |
|     Nothing was created. Ask again in the chat.          |
```

### SCR-04 — Delete Conversations dialog

The existing `ConfirmationModal`, mounted through a new AI-section modal container (sad.md §8 UI). Opened by a row's delete button or "Delete all" (SCR-01), or "Delete conversation" (SCR-02). Flow 8.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default (one) | Delete on one Conversation (AC-37). Title "Delete this conversation?"; body "“{title}” will be deleted for good. Drafts it created stay in your invoices."; destructive confirm "Delete" | `ConfirmationModal` | wireframe below |
| default (all) | "Delete all" (AC-37). Title "Delete all conversations?"; body "All {n} conversations will be deleted for good. Drafts they created stay in your invoices."; destructive confirm "Delete all" | `ConfirmationModal` | wireframe below |
| cancelled | Cancel, Esc or a click outside: closes, nothing deleted (flow 8 `alt` cancel) | `ConfirmationModal` | — |
| pending | Async `onConfirm` → `deleteConversation(id)` / `deleteAllConversations()` in flight: `Spinner` in confirm, both buttons disabled, the dialog stays open | `ConfirmationModal`, `Spinner` | — |
| success | `ok()` / `ok({ deleted })`: the caller closes the dialog → SCR-01 `deleted`, or from SCR-02 → `/ai` | — | SCR-01 |
| not-found | `deleteConversation` → `NOT_FOUND` (already gone, flow 8): the caller closes the dialog, `toast.error` "This conversation can't be found." verbatim, and the list refreshes | `Sonner` | — |
| rejected | The call rejects or returns `UNAUTHORIZED` → `goToSignIn()` (built into `ConfirmationModal`) | — | SCR-11 |
| empty | N/A: "Delete all" is hidden while the list is empty (SCR-01 `empty`), and one-delete is always about an existing row | — | — |

```text
+----------------------------------------------+
| Delete this conversation?                    |
| “Who owes me money?” will be deleted for     |
| good. Drafts it created stay in your         |
| invoices.                                    |
|                           [Cancel]  [Delete] |
+----------------------------------------------+

+----------------------------------------------+
| Delete all conversations?                    |
| All 12 conversations will be deleted for     |
| good. Drafts they created stay in your       |
| invoices.                                    |
|                       [Cancel]  [Delete all] |
+----------------------------------------------+
```

### SCR-05 — Invoice list (existing)

Changed: "Create with AI" in the header and the Assistant mark on draft rows. Table, filters and pagination are unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | `InvoicesTableSkeleton` (unchanged) | existing |
| default | `ContentAreaHeader` `rightContent` gains an outline "Create with AI" link (sparkles icon) before "New Invoice", to `/ai?start=draft` (AC-33). The allowance is checked on arrival at SCR-01, so the button is always shown (AC-34) | `ContentAreaHeader`, `buttonVariants` | wireframe below |
| Assistant draft | A row whose `assistantMark` is non-null (only while the stored status is `DRAFT`): `AssistantMark` next to the status badge — "AI" with the tooltip "Created by the in-app chat" or "Created by {keyName}", the key name as it was at creation (AC-23; flow 11). Renaming or revoking the key changes nothing | `NEW: AssistantMark`, `InvoiceStatusBadge` | wireframe below |
| issued or hand-made | `assistantMark = null`: the row is exactly as today; an issued Assistant draft shows no mark (AC-23) | `InvoicesDataTable` | existing |
| empty | No invoices: `InvoicesEmptyState` (unchanged); "Create with AI" stays in the header | `InvoicesEmptyState` | existing |
| error | Load fails → existing `error.tsx` (`LoadError`), unchanged | `LoadError` | existing |

```text
+--------------------------------------------------------------+
| Invoices                       [✦ Create with AI] [+ New Invoice] |
| Manage and track all your invoices                           |
|--------------------------------------------------------------|
| No.       Customer    Due        Total     Status            |
| —         Acme Corp   10.11      900.00    [Draft] [AI]      |
|                                    tooltip: Created by the in-app chat
| —         Globex Ltd  12.11      450.00    [Draft] [AI]      |
|                                    tooltip: Created by Claude Desktop
| INV-0042  Acme GmbH   21.09    1 240.00    [Overdue]         |
+--------------------------------------------------------------+
  Phone: the two header buttons wrap under the title; the mark
  stays beside the status badge in each row.
```

### SCR-06 — Invoice editor (existing)

Changed: the Assistant mark in the header while the invoice is a draft. Also the target of "Create it by hand →" (`/invoices/new`, SCR-01 `used-up from Create with AI`) and of every invoice `ChatLink`.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | `InvoiceEditorLoading` (unchanged) | existing |
| Assistant draft | `getInvoiceEditorData` → `assistantMark` non-null: `AssistantMark` beside the header status `Badge`, with the same tooltip as SCR-05 (AC-23). The editor otherwise behaves as for any draft: edit, save, delete, issue | `InvoiceEditorHeader`, `NEW: AssistantMark` | wireframe below |
| issued | After issuing, or opened issued: no mark (`assistantMark = null`); the issued details, the PDF and the email say nothing about AI (AC-23; flow 11 issue) | `InvoiceEditor`, `IssuedDetailsCard` | existing |
| new by hand | `/invoices/new` from the used-up link (AC-34): the existing new-invoice editor, unchanged | `InvoiceEditor` | existing |
| not-found | Deleted, or another Freelancer's invoice → existing `invoices/[id]/edit/not-found.tsx` | `ContentAreaNotFound` | existing |
| error | Load fails → existing `(invoice-editor)/error.tsx` (`LoadError`), unchanged | `LoadError` | existing |
| empty | N/A: the page always shows one invoice or the new-invoice form | — | — |

```text
| ← Invoices   Draft invoice  [Draft] [AI]        [Save] [Issue] |
|                             tooltip: Created by the in-app chat |
```

### SCR-07 — Connect your AI page (existing, settings)

`/settings/assistants`. Changed: Draft permission marks and the daily draft count with its lift action in the key list, the read-only explanation, and the intro copy (keys are no longer always read-only, ADR-0011). Setup steps, example prompts and revoke are unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Existing `loading.tsx` (unchanged) | `Skeleton` | existing |
| default | `listPersonalKeys` (flow 10). Intro copy becomes: "Let Claude or Cursor read your invoices and answer money questions. A key can also create draft invoices if you allow it when you create the key. An assistant can never issue, send, edit or delete an invoice." Each active key row gains a `Badge`: "Can create drafts" or "Read-only" (AC-25). A draft key also shows "Drafts today: {created} of {allowance}" and, when set, "Limit last lifted {date, time}" (AC-28). Revoked keys show neither | `KeyList`, `Item`, `Badge` | wireframe below |
| read-only explanation | At least one active key is read-only, including every key from before this release (AC-26; flow 10 `else` read-only). An info `Alert` above the active keys: "Read-only keys can't be given Draft permission. To let an assistant create drafts, create a new key with Draft permission, then revoke the old one." No row offers a way to add the permission | `Alert` | wireframe below |
| limit reached | A draft key with `created ≥ allowance` today: the count reads "Drafts today: 50 of 50 · limit reached" and a "Lift limit" `Button` appears on that row (AC-28). The button exists only while the limit is reached | `Button`, `Badge` | wireframe below |
| lifting | "Lift limit" pressed: `Spinner` in the button, the button disabled (a double click lifts once) | `Spinner` | — |
| lifted | `liftKeyDraftLimit` → `ok`: `toast.success` "Limit lifted: 50 more drafts until midnight your time."; the row reads "Drafts today: 50 of 100" and "Limit last lifted {now}"; "Lift limit" disappears until the limit is reached again (AC-28) | `Sonner` | — |
| lift-conflict | `CONFLICT`: `toast.error` "The limit can be lifted once the key has reached it." verbatim; the list refreshes | `Sonner` | — |
| lift-not-found | `NOT_FOUND` (revoked in another tab, or read-only): `toast.error` "Key not found." verbatim; the list refreshes | `Sonner` | — |
| empty | No keys: the existing `Empty` (unchanged); no read-only explanation | `Empty` | existing |
| error | `listPersonalKeys` fails → existing `(protected)/error.tsx` (`LoadError`); an `UNAUTHORIZED` action → sign-in | `LoadError` | existing |

```text
| Connect your AI                                              |
| Let Claude or Cursor read your invoices and answer money     |
| questions. A key can also create draft invoices if you allow |
| it when you create the key. An assistant can never issue,    |
| send, edit or delete an invoice.                             |
|  ...create form (SCR-08), setup steps, example prompts...    |
|--------------------------------------------------------------|
| Active keys (3 of 10)                                        |
| (i) Read-only keys can't be given Draft permission. To let   |
|     an assistant create drafts, create a new key with Draft  |
|     permission, then revoke the old one.                     |
|  Claude Desktop  [Can create drafts]  Created 9 Oct 2026     |
|    ••••3f9K · Last used 11 Oct 2026, 14:05                   |
|    Drafts today: 50 of 50 · limit reached                    |
|    Limit last lifted 10 Oct 2026, 16:20                      |
|                                   [Lift limit]  [Revoke]     |
|  Work Cursor     [Can create drafts]  Created 9 Oct 2026     |
|    ••••a7Qm · Never used · Drafts today: 0 of 50  [Revoke]   |
|  Laptop          [Read-only]          Created 1 Oct 2026     |
|    ••••Zx01 · Last used 4 Oct 2026, 09:12         [Revoke]   |
+--------------------------------------------------------------+
  Phone: each row stacks name + badge / meta lines / full-width
  buttons, as today.
```

### SCR-08 — New key dialog (existing, extended)

`ux-flows.md` calls this a dialog; in the code it is the inline `KeyCreateForm` at the top of SCR-07, followed by `KeyReveal`. This manifest extends that form and adds no dialog. Changed: the Draft permission choice — the only place it can be set (AC-25, AC-26; ADR-0011).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | The form gains a `Checkbox` "Allow this key to create draft invoices", unchecked by default, with `FieldDescription` "The assistant can create drafts for you to review. It can never issue or send them. You can't change this later." `createPersonalKey` receives `canCreateDrafts` | `KeyCreateForm`, `Field`, `Checkbox`, `FieldDescription` | wireframe below |
| creating | Existing: `Spinner` in Create; the name `Input` and the `Checkbox` are disabled | `Spinner` | existing |
| key-created | Existing reveal (shown once, AC-25). The new key heads the list with "Can create drafts" or "Read-only" as chosen; the form clears and the `Checkbox` resets to unchecked | `KeyReveal`, `Badge` | existing |
| validation | Existing name validation (unchanged); the `Checkbox` keeps its value | `FieldError` | existing |
| limit | Existing 10-active-keys `Alert` (unchanged) | `Alert` | existing |
| create-failed | Existing `toast.error` (unchanged); name and `Checkbox` kept | `Sonner` | existing |
| empty | N/A: a form | — | — |

```text
| Key name                                                     |
| [ Claude Desktop                       ]  [Create key]       |
| 1 to 50 characters, e.g. the device or assistant it's for.   |
| [ ] Allow this key to create draft invoices                  |
|     The assistant can create drafts for you to review. It    |
|     can never issue or send them. You can't change this      |
|     later.                                                   |
```

### SCR-09 — Sender profiles (existing)

Unchanged. Reached from a `ChatLink` (AC-07 logo, AC-17 no profile or account, AC-19 no account in the currency): page key `sender-profiles`, `new-sender-profile`, or `sender-profile-bank-accounts` with its `senderProfileId` (the profile's page).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Existing list or profile page (unchanged) | existing | existing |
| not-found | The linked profile was deleted since: existing `sender-profiles/[id]/not-found.tsx` (unchanged) | `ContentAreaNotFound` | existing |
| empty | Existing empty list (unchanged), the AC-17 "no profile" case | existing | existing |
| error | Existing `error.tsx` (`LoadError`), unchanged | `LoadError` | existing |

### SCR-10 — Customer form (existing)

Unchanged. Reached from the `new-customer` `ChatLink` when no Customer matches (AC-21). The form opens empty; the link carries no name.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Existing new-Customer form (unchanged) | existing | existing |
| error | Existing form validation and save errors (unchanged) | existing | existing |
| empty | N/A: a form | — | — |

### SCR-11 — Sign-in (existing)

Unchanged. One more way to arrive.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Existing sign-in | `LoginForm` (unchanged) | existing |
| redirected | A Visitor reaches `/ai` or `/ai/{id}`, or a session ends during a chat (`401`, `goToSignIn()`). After sign-in they return to the AI page they came from (AC-42) | `LoginForm` | existing |
| error | N/A: existing sign-in errors are unchanged by this feature | — | — |
| empty | N/A: no Freelancer data on this page | — | — |

### SCR-12 — Not found (existing)

New `app/(protected)/ai/[conversationId]/not-found.tsx`, composed from the existing not-found component. The same page for an unknown Conversation and another Freelancer's (AC-41; flow 7).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | `getConversation` → `NOT_FOUND`: "This conversation can't be found." with "Back to AI →" (`/ai`). Nothing about the record is revealed | `ContentAreaNotFound` | wireframe below |
| error | N/A: a static page | — | — |
| empty | N/A: a static page | — | — |

```text
|            [search icon]                          |
|      This conversation can't be found.            |
|      It may have been deleted.                    |
|              [Back to AI →]                       |
```

### SCR-13 — Privacy settings (existing)

The UI is unchanged. Only the export file and the deletion scope change (flow 12).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Existing page | `GdprSettings` (unchanged) | existing |
| export downloaded | Existing download flow. The file is `exportVersion` `2.2` with `conversations[]`, `messageAllowanceDays[]` and each key's `canCreateDrafts` and `draftDays[]` (AC-39) | `GdprSettings` | existing |
| export error | Existing export error and rate-limit handling (unchanged) | `GdprSettings`, `Sonner` | existing |
| account deleted | Existing delete confirmation; the existing transaction also removes every Conversation, Draft card, counter and turn row (AC-39) | `ConfirmationModal` (unchanged) | existing |
| account-delete error | The transaction rolls back: the existing "account not deleted, try again" handling | `Sonner` | existing |
| loading | Existing `privacy/loading.tsx` (unchanged) | existing | existing |
| empty | N/A: the export always has the account itself | — | — |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `DraftCard` | No component shows a proposed invoice with a source per value and four lifecycle states (live / replaced / outdated / created) plus a guarded Create. `IssuedDetailsCard` is read-only text for an issued invoice and has no lines, sources or action. Contract: props `card: DraftCardView`, `onCreate(cardId)`; optional `cards` (the page's loaded set, so an `OUTDATED` card finds its stored successor after a reload); renders the content rules and states of SCR-03; an `OUTDATED` card renders its successor below it; Create shows a `Spinner` while pending and never fires twice | registered |
| `ChatLink` | Links in the chat must come from structured parts and show an invoice's current state (draft / issued / no longer available), or a page from the fixed app map. A plain `Link` cannot express the unavailable state or the status badge. Used in SCR-02 messages and SCR-03 created cards. Contract: props `link: AppLink`, `state?: LinkedInvoiceState`; `UNAVAILABLE` renders plain text, never an anchor | registered |
| `AiWorkspace` | SCR-01 and SCR-02 share one two-pane layout (list column + chat) whose DOM order must match the visual order at each breakpoint, which a single `ConversationList` plus CSS reordering cannot do. Contract: props `conversations`, `timeZone`, `phoneList?`, `children`; renders the list in a `hidden lg:block` slot before the chat and, on /ai only, in a `lg:hidden` slot after it; /ai/{id} shows only the Conversation below lg | registered |
| `NewConversationProvider` | The island learns the new Conversation's id and title mid-session, and the list (a sibling) must show its row once the turn is saved. Contract: `announce({ id, title })` from the island, `created` read by the list client | registered |
| `AllowanceNotice` | The Daily message allowance shows in three places (SCR-01 start, SCR-01 Create with AI, SCR-02 composer) in two modes: the counter "{left} of 30 messages left today", and the used-up notice that replaces the composer with the renewal time and the Personal-key note. Neither `Alert` nor `FieldDescription` alone covers both modes with the `renewsAt` formatting rule. Contract: props `state: AllowanceState`, `usedUpMessage?: string` (the `429` `error`), `handMadeLink?: boolean` (AC-34) | registered |
| `AssistantMark` | The mark appears in the invoice list rows and the editor header (SCR-05, SCR-06) with one rule for its tooltip text. `InvoiceStatusBadge` is bound to the invoice status enum and must not carry origin. Contract: props `mark: { origin: 'CHAT' } \| { origin: 'PERSONAL_KEY'; keyName: string }`; a small outline `Badge` "AI" with a `Tooltip` "Created by the in-app chat" / "Created by {keyName}"; renders nothing for `null` | registered |
