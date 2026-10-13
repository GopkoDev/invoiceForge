---
status: draft
feature_size: "L"
tool: "code"
updated_at: "2026-10-13"
---

# Screens — ai-chat-v2

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code, from `docs/design-system.md` (a code-only canon). This is the canon's tool, not a degradation.
- **File:** the wireframes are inline below.
- **Inventory:** `ux-flows.md` §Screen inventory, SCR-01 to SCR-15. Every row has a section below. SCR-10 to SCR-12, SCR-14 and SCR-15 are existing screens whose UI does not change. Their sections only record what this feature touches.
- **Extends:** [`ai-assistant/screens.md`](../ai-assistant/screens.md). Its rules for reply rendering (plain text, `whitespace-pre-wrap`, links only from structured parts), strings, dates, error routing and live regions stay in force and are not repeated. Where a state below says "as the parent", the parent manifest's row applies unchanged. That includes copy taken verbatim from the contract.
- **Component inventory:** the canon (`docs/design-system.md`) registers `LoadError`, `ConfirmationModal`, `CopyButton`, `IssuedDetailsCard`, `AmountInput`, `PdfPreparingStatus`, `ConversationList`, `AssistantMark`, `AllowanceNotice`, `StartPanel`, `ChatIsland`, `Composer`, `ChatLink` (with `MessageList`, `ConversationHeader`), `DraftCard`, `AiWorkspace` and `NewConversationProvider`. Everything else is named from the code's de-facto inventory:
  - the `components/ui/*` primitives: `Alert`, `Badge`, `Button` / `buttonVariants`, `Card`, `DropdownMenu`, `Empty`, `Field` / `FieldError`, `InputGroup`, `Item`, `ScrollArea`, `Separator`, `Sheet`, `Sidebar`, `Skeleton`, `Spinner`, `Textarea`, `Tooltip`, `Sonner` toasts;
  - the app components `AppSidebar` (driven by `config/navigation-menu.config.ts`), `DashboardHeader`, `DashboardBanners`, `InvoiceStatusBadge`, `PDFPreviewPanel` (`components/invoice-editor/pdf-preview-panel.tsx`, the editor's and the list modal's preview), `InvoiceEditor`, `GdprSettings`, `LoginForm`, and each route's existing `loading.tsx` / `error.tsx` / `not-found.tsx`.
- **Visual reference:** [`ref/reference-empty-state.png`](ref/reference-empty-state.png) (the owner's target, the shadcn UI Kit "AI Chat V2" empty state) and [`ref/current-as-built-bad.png`](ref/current-as-built-bad.png) (the first build, rejected 2026-10-13). The section fills the height and never scrolls the page. Our app shell (sidebar, header) stays; only the AI section's content area follows the reference. The rejected build is what this revision fixes: a full-width black user pill, the could-not-complete state as a bare full-width red card, a cramped list with a trash icon on every row, and an empty header. The wireframes follow the reference with this app's primitives. No kit code is imported.
- **Presentation revision (2026-10-13, ADR-0010).** Behaviour does not change: every state, AC, address, hand-off, allowance notice, breakpoint, the 48 px follow and reduced motion stay exactly as specified in the rows below. What changes is the presentation, and the chat surface is now composed from our own chat elements in `components/ai-elements/`, ported from Vercel AI Elements onto Base UI (registered in `docs/design-system.md`, §New components):

  | Element (`components/ai-elements/`) | Replaces in the first build | Used by |
  |---|---|---|
  | `Conversation`, `ConversationContent`, `ConversationScrollButton` | the hand-made scroll area and the "Jump to latest" button in `ChatIsland` | SCR-03 (driven by `useFollowLatest`, 48 px) |
  | `ConversationEmptyState` | the centring wrapper of `StartPanel` | SCR-02 |
  | `Message` (`from="user" \| "assistant"`), `MessageContent`, `MessageAvatar`, `MessageResponse` | the bubble markup of `MessageList` | SCR-03, SCR-04, SCR-05 (cards and choices sit inside the assistant `MessageContent`) |
  | `MessageActions`, `MessageAction` | the "Try again" button of the error card | SCR-03 `could-not-complete` |
  | `PromptInput`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSubmit` | the markup of `Composer` (its validation, counter and Enter rules stay) | SCR-02, SCR-03, SCR-09 |
  | `Suggestions`, `Suggestion` | the outline buttons of `StartPanel` | SCR-02 |
  | `Loader` | the "Thinking…" `Spinner` row | SCR-03 `waiting` |

  Visual rules that apply everywhere below:
  - **Workspace container.** At `≥ md` the AI section is one bordered, rounded container (`rounded-xl border bg-background`, `overflow-hidden`) inside the content area's padding (16 px), height `calc(100dvh - var(--header-height) - 2 × 16 px)`. The page still never scrolls (spec §6). Below `md` the container drops its border, radius and padding and fills the content area edge to edge. The panes are separated by one vertical border.
  - **Centred column.** In SCR-02 and SCR-03 the messages column and the docked composer are centred in the chat pane with `max-w-3xl` (768 px) and `px-4`; the scroll area itself stays full width, so the scrollbar sits at the pane edge.
  - **Messages.** A Freelancer message is a `MessageContent` bubble aligned right, `bg-secondary text-secondary-foreground`, `rounded-2xl`, `px-4 py-2.5`, max 80 % of the column; never full width and never `bg-primary`. An assistant message is not a bubble: `MessageAvatar` (a 24 px sparkles avatar) then a full-column-width `MessageContent` with `MessageResponse` text. `MessageResponse` renders plain text with line breaks kept (no Markdown, no HTML, no model-written link, ai-assistant AC-07; ADR-0010). `ChatLink`s, Offered choices and Draft cards follow the text inside the same `MessageContent`, in part order.
  - **Errors are messages.** Every failure tied to a turn (`could-not-complete`, `ai-unavailable`, `conversation-gone`, `choice unavailable`) renders as an assistant `Message` in the reply position: the avatar, an inline `Alert` (`destructive` for failures, default with an info icon for `choice unavailable`) holding the copy verbatim, and, where the row offers it, `MessageActions` with a `MessageAction` "Try again" (rotate icon, labelled, not icon-only). No bare full-width card.
  - **Composer.** `PromptInput` is a card on the `InputGroup` primitive (`rounded-2xl border bg-background shadow-xs`): an auto-growing `PromptInputTextarea` (1–8 rows), then a `PromptInputFooter` with `PromptInputTools` on the left (the `AllowanceNotice` counter, `text-xs text-muted-foreground`) and a round `PromptInputSubmit` (`size-8 rounded-full`, arrow-up icon, `aria-label` "Send") on the right. `status` maps `ready` → arrow, `submitted`/`streaming` → disabled with a decorative spinner (no status region of its own: the waiting row's "Thinking…" and the chat's status announce the wait once; the chat sends no stop request; behaviour unchanged), `error` → arrow. The too-long `FieldError` and "{n} / 2,000" sit inside the footer above the tools.
  - **Header.** The chat pane header (`h-12`, bottom border) shows only when there is something to show: the Conversation title (truncated) and the "Conversation actions" `⋯` menu for a saved Conversation; the list button below `md` and in the `md`–`xl` preview layout. On `/ai` before the first save the header is not rendered at `≥ md` (no empty header bar); below `md` it holds only the list button, as before.
- **Layout and breakpoints** (spec §1, sad.md §5 "Full-height workspace"). `/ai/layout.tsx` drops the scrolling `ContentArea`. `AiWorkspace` (changed) owns the grid: the workspace is a grid of height `calc(100dvh - var(--header-height))` with `overflow-hidden`. Every pane is `min-h-0` with its own `overflow-y-auto` (`ScrollArea`). Breakpoints move from `lg` to `md` (768 px) and `xl` (1280 px):

  | Width | Preview closed | Preview open |
  |---|---|---|
  | `< md` (phone) | chat only; the list opens as a left `Sheet` from a header button | chat; the preview is a full-screen `Sheet` |
  | `md`–`xl` (768–1279) | list (18rem) \| chat | chat \| preview; the list is behind a header toggle that opens it as a left `Sheet` |
  | `≥ xl` (1280+) | list (18rem) \| chat | list (18rem) \| chat \| preview (`minmax(26rem, 40%)`) |

- **Addresses** (ADR-0005): a new Conversation is `/ai` (plus `?start=draft&from=…` or `?handoff={id}`). A saved one is `/ai/{id}`. An open preview adds `?preview={cardId}` with `history.pushState`, so Back closes it. Nothing inside the workspace is a route navigation. History writes keep the router in step with the address (no `__NA` keys), so once the first reply saved a Conversation the router knows `/ai/{id}`, and its first revalidating server action (normally Create draft) re-renders that address as the Conversation page, which mounts a new island once. The live chat is handed over to it (messages, a reply in flight, unsent composer text, an open alert), so nothing is lost or sent again, also when the router shows the Conversation page's loading state in between (the live chat waits up to 5 s at that address); only the list's search text and the scroll position reset, and the view follows the end (review 2026-10-13 R1-U2, R2-U1). When the `/ai` page is shown at `/ai/{id}` (a restored history entry), it shows that Conversation's live chat under its header if one is held, reading its cards, links and choices once and putting its row back in the list (R3-U3, R4-U1); otherwise, for example after "New chat" then Back, it shows a skeleton and refreshes once to load the saved Conversation (R2-U3). A Conversation page restored from the router cache that takes over an idle live chat with more saved messages than its props refreshes once; a failed, unsaved exchange does not count, and a reply still in flight or with its finish queued refreshes the page itself when it finishes (R5-U2, R6-U2, R6-U3, R7-1, R7-2). Below md, between the first send and the save (and after a failed first send), the chat pane shows a header row with only the list button (R5-U3).
- **Invoice states** (ADR-0008): the card, its links and the preview panel read one workspace store (`InvoiceStateProvider`). Page loads, `loadInvoicePreview`, `createDraftFromCard` and `issueFromPreview` results feed it. There is no push, so a change made in another tab shows on the next preview load, issue attempt or reopen (sad.md §11 accepted debt).
- **Motion:** two motions exist. The composer moves from the middle to the bottom on the first send (a `transform`/`translate` CSS transition, about 250 ms ease-out, with `motion-reduce:transition-none`, AC-18). Scrolling to the latest message uses `behavior: 'smooth'`, or `'auto'` under reduced motion. Nothing else animates beyond the primitives' defaults (`Sheet` slide, `Dialog` fade).
- **Copy:** where a contract fixes a message (`contracts/openapi.yaml` `/api/chat` 409, `contracts/server-actions.md` `loadInvoicePreview`, `issueFromPreview`, dashboard prompt validation), the UI shows the result's `error` **verbatim**. The rest of the copy below belongs to this manifest, and `implement` uses it as written.

## Screens

### SCR-01 — Conversation list (pane on a desktop, sheet on a phone)

`ConversationList` changes (sad.md §5). It reads `listConversationSummaries(actor)` (every summary plus `timeZone`, no paging, server-actions.md), groups the rows on the client by the last message's local day, and filters with the shared `foldName` (ADR-0004). Structure, top to bottom (per `ref/reference-empty-state.png`; pane width 16rem at `≥ md`): a top row with the search `InputGroup` (search icon, placeholder "Search conversations", `aria-label` "Search conversations", a clear `×` button while it has text) and, beside it, the "Conversation actions" `⋯` icon `DropdownMenu` (Delete all, as the parent); the heading "Conversations" stays in the DOM as a visually hidden `h2` (`sr-only`), so the landmark keeps its name. Then the scroll area with the groups, and a footer that is always visible, separated by a top border: a full-width "New chat" `Button` (default variant, plus icon, links to `/ai`) above the parent's retention notice in `text-xs text-muted-foreground`. The `?page=N` links and the `Pagination` are removed. Group headings are small muted labels (`text-xs font-normal text-muted-foreground`, `px-3 pt-4 pb-1`). Each row is a plain one-line link (`h-9 px-3 rounded-md text-sm`, title truncated with the full title and "Last message {d MMM yyyy}" in `title`; no visible date, no border, no card), hover `bg-accent/60`. The open Conversation's row carries `aria-current="page"`, `bg-accent` and `font-medium`. There is **no always-visible delete icon**: each row has a trailing `⋯` icon button (`aria-label` "Actions for {title}") that shows on row hover, on keyboard focus within the row, on the current row, and always on touch devices (`pointer: coarse`). It opens a `DropdownMenu` with "Delete" (destructive), which leads to the parent's delete `ConfirmationModal` unchanged. Opening, listing and searching write and count nothing (Flow 8).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | The page request is in flight: the existing `ai/loading.tsx` is redrawn as the full-height grid, with a search skeleton, two group-heading skeletons and six row skeletons in the list pane | `Skeleton` | wireframe below |
| default | Signed in with at least one Conversation (AC-15, AC-17; Flow 8). Rows sit under the headings "Today", "Yesterday", "Previous 7 days" (2–7 days before today) and "Older" (8+), in the Freelancer time zone, newest first inside each group (labels per spec §1, unchanged). A group with no rows is not rendered. Only the list scrolls; the search row and the footer stay put | `ConversationList` (changed), `InputGroup`, `ScrollArea`, `DropdownMenu`, `Button` | wireframe below |
| searching | The search has text: the rows whose folded title contains the folded query (case, extra spaces and look-alike letters ignored, AC-17). The grouping is kept and empty groups are hidden. Filtering is instant (client-side), with no debounce and no request | `InputGroup`, `Item` | wireframe below |
| search no match | No title matches: `Empty` (compact, no icon) "No conversation matches "{query}"." with a "Clear search" link button. The footer stays (AC-17) | `Empty`, `Button` (link) | wireframe below |
| empty | The Freelancer has no Conversations: the parent's `Empty` "No conversations yet" / "Ask a question to start one." The search is disabled. "Delete all" is hidden. New chat and the retention notice stay | `Empty`, `Button` | wireframe below |
| new row | The first reply of a new Conversation is saved: `NewConversationProvider` merges `{ id, title }` at the head of "Today" until the server list includes it (Flow 9). The row becomes the current one | `NewConversationProvider` | — |
| phone sheet | `< md`: the same list inside a left `Sheet` (`side="left"`, full height, width `min(20rem, 85vw)`), titled "Conversations". It opens from the list button in the SCR-03 / SCR-02 header. Picking a row or New chat closes it; so do `×`, Escape and the overlay (AC-19; Flow US-06) | `Sheet`, `ConversationList` | wireframe below |
| behind toggle | `md`–`xl` with the preview open: the list pane is not rendered, and the same left `Sheet` opens from the header toggle (spec §1). Picking a row closes the sheet and the preview, because the address changes | `Sheet`, `Button` (icon) | SCR-06 wireframe |
| row actions | Hover, focus within, the current row or a touch device: the row's `⋯` shows; it opens a `DropdownMenu` with "Delete". Keyboard: Tab reaches the row link, then its `⋯` | `DropdownMenu`, `Button` (icon, ghost) | wireframe below |
| deleted | As the parent ("Delete" from the row menu or "Delete all" → the parent's dialog → toast → refresh). Deleting the open Conversation also navigates to `/ai` (SCR-02) | `ConfirmationModal`, `Sonner` | — |
| error | `listConversationSummaries` or `getAllowanceState` fails → `unwrapPageResult` → the existing `(protected)/error.tsx` (`LoadError`) | `LoadError` | existing |
| signed out | A Visitor → proxy → SCR-12; nothing processed or counted (AC-36) | — | SCR-12 |

```text
default (md and wider: the left pane of the bordered container; only the middle scrolls)
+------------------------------+
| [🔍 Search conversations][⋯] |   ⋯ = Conversation actions: Delete all
|------------------------------|   (sr-only h2 "Conversations")
| Today                        | ^  small muted group label
|▐Invoice Acme for 20 h    [⋯] | |  current row: bg-accent, font-medium, aria-current; its ⋯ shows
|  Who owes me money?          | |  plain one-line rows, truncated, no date, no icon
| Yesterday                    | |  ScrollArea (own scroll)
|  Bank accounts in EUR        | |
| Previous 7 days              | |
|  Logo on invoices        [⋯] | |  <- hovered row: its ⋯ appears
| Older                        | |
|  Overdue in September        | v
|------------------------------|
| [       + New chat         ] |   footer, always visible, full width
| Kept for 90 days after the   |   text-xs muted
| last message.                |
+------------------------------+

row actions (⋯ pressed)
|  Logo on invoices        [⋯] |
|              +-----------+   |
|              | 🗑 Delete |   |  -> the parent's delete ConfirmationModal
|              +-----------+   |
```

```text
searching ("inv")                   search no match ("zzz")            empty
| [🔍 inv             ×] [⋯]  |      | [🔍 zzz             ×] [⋯]  |     | [🔍 Search (disabled)]      |
| Today                       |      |                             |     |      [chat icon]            |
|  Invoice Acme for 20 h      |      | No conversation matches     |     |  No conversations yet       |
| Older                       |      | "zzz".                      |     |  Ask a question to start    |
|  Invoices due in Sept       |      | Clear search                |     |  one.                       |
|-----------------------------|      |-----------------------------|     |-----------------------------|
| [+ New chat              ]  |      | [+ New chat              ]  |     | [+ New chat              ]  |

loading (list pane)                 phone sheet (< md)
| [▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭] |      +------------------------------+--------+
| ▭▭▭▭                        |      | Conversations            [×] |░░░░░░░░|
| [▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭     ] |      | [🔍 Search conversations   ] |░ chat ░|
| [▭▭▭▭▭▭▭▭▭▭▭▭▭▭        ] |      | Today ...rows as default...  |░overlay|
| ▭▭▭▭▭▭                      |      |------------------------------|░░░░░░░░|
| [▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭     ] |      | [+ New chat               ]  |░░░░░░░░|
                                    +------------------------------+--------+
```

### SCR-02 — New Conversation (empty state)

`/ai` (`app/(protected)/ai/page.tsx`), rendered by `ChatIsland` until the first send. `StartPanel` is the reference's empty state (`ref/reference-empty-state.png`), built on `ConversationEmptyState`: the right pane centres, vertically and horizontally, a large two-line greeting, a big `PromptInput` card (max `3xl`) with the `AllowanceNotice` counter in its footer, and the suggested requests as `Suggestion` chips under it.

**Greeting** (presentation only; nothing is counted or sent). Line 1, `text-3xl font-medium` (`text-2xl` below `md`): "Good morning, {first name}" from 05:00 to 11:59, "Good afternoon, {first name}" from 12:00 to 17:59, "Good evening, {first name}" otherwise, by the Freelancer time zone at render time, computed on the server (no hydration mismatch). `{first name}` is the first word of the account name; with no name the line is "Good morning" (etc.) with no comma. Line 2, same size: "How can I help with " followed by an accent span "your invoices today?". The accent is a text gradient from `--chart-3` to `--chart-5` (dark theme: `--chart-1` to `--chart-2`) with a solid `text-primary` fallback under `forced-colors`; it keeps at least 3:1 contrast as large text. The line is one `h1` for screen readers. The first build's sub-line ("Ask about your invoices, Customers and payments, or describe an invoice to draft.") is dropped; the placeholder stays "Ask a question or describe an invoice". Nothing is saved until the first message (AC-18). The header shows only the list button (`< md`) and no title. The start point comes from the address (server-actions.md "Addresses and start points").

Suggested requests (spec §1: at least three, fixed, including drafting and who owes money), as `Suggestion` chips (outline, `rounded-full`, `size="sm"`, a small leading icon each) in a wrapping `Suggestions` row left-aligned under the composer:
1. "Invoice Acme for 20 hours of consulting at $50"
2. "Who owes me money right now?"
3. "What's overdue today?"
4. "Which bank accounts do I have?"

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | The page request is in flight: the grid loading skeleton (SCR-01 `loading`) with a centred greeting line and a composer-sized skeleton in the right pane | `Skeleton` | — |
| default | `/ai` with messages left (AC-18; Flow 9). The two-line greeting above ("Good morning, Dmytro" / "How can I help with *your invoices today?*"). Centred `PromptInput` (placeholder "Ask a question or describe an invoice", unchanged), the round send button, the counter "{left} of 30 messages left today" in the footer, and the four suggestion chips | `StartPanel` (changed), `ConversationEmptyState`, `Composer` → `PromptInput`, `AllowanceNotice` (counter), `Suggestions` / `Suggestion` | wireframe below |
| suggestion picked | Pressing a suggestion puts its text in the composer and focuses it. Nothing is sent, saved or counted (AC-18) | `Suggestion`, `PromptInput` | — |
| start=draft | `/ai?start=draft&from=invoices` or `&from=dashboard` with messages left (ai-assistant AC-33, spec AC-30). Greeting line 1 as `default`; line 2 "Let's draft *an invoice.*" (accent on "an invoice."), and under it in `text-sm text-muted-foreground` "Describe it in one sentence. You'll see a card to check before anything is created." Placeholder `e.g. "Invoice Acme for 20 hours of consulting at $50"`. Suggestion 1 only. The first message is sent with `startedFrom` from the address | `StartPanel`, `PromptInput`, `Suggestion` | wireframe below |
| too-long | As the parent: a `FieldError` with the contract message verbatim and "{n} / 2,000". Send is disabled and the text is kept | `Composer`, `FieldError` | — |
| sending (composer moves) | The first message is sent (AC-18; Flow 9). At once, the greeting and suggestions fade out, the composer moves to the bottom with the translate transition, and the message appears above it in SCR-03 `waiting`. Under `prefers-reduced-motion` the composer jumps to the bottom with no transition. Sending does not remount the island (the later one-time swap to the Conversation page hands the live chat over, §Addresses). The address stays `/ai` until `data-conversation`, then `history.replaceState` → `/ai/{id}` | `ChatIsland` (changed), `Composer` | wireframe below |
| handoff | `/ai?handoff={id}` with a matching `sessionStorage` entry (ADR-0009; critical flow 3). The island takes and deletes the entry, drops `handoff` from the address with `replaceState`, and sends the prompt with `origin: 'DASHBOARD'`, `startedFrom: 'DASHBOARD_PROMPT'`. The default layout never shows: the island opens directly in `sending` (no animation, since nothing moved), with the reply being written (AC-29) | `ChatIsland` | SCR-03 `waiting` |
| handoff missing | `?handoff={id}` with no entry (reload, Back, another tab, storage blocked): `handoff` is dropped from the address and `default` shows. Nothing is sent or counted (sad.md §11) | `StartPanel` | — |
| used-up | `left = 0` on `/ai` (parent AC-10): the composer and the suggestions are replaced by `AllowanceNotice` (used-up mode), still centred under the greeting. The list stays usable | `AllowanceNotice` (used-up) | wireframe below |
| used-up from Create with AI | `?start=draft…` with `left = 0` (ai-assistant AC-34, spec AC-32 path): `AllowanceNotice` (used-up) with `handMadeLink` "Create it by hand →" to `/invoices/new` (SCR-10) | `AllowanceNotice`, `buttonVariants` link | wireframe below |
| used-up on send | `429` on the first message: the composer returns to the middle without animation, the optimistic message is removed, and `used-up` shows with the result's `error` verbatim. No Conversation is saved | `AllowanceNotice` | — |
| could-not-complete / ai-unavailable on first send | As the parent's SCR-02 rows, shown in the Conversation layout (the composer stays at the bottom) as the SCR-03 error message (assistant `Message` with an inline `Alert` and "Try again"). No Conversation exists until a reply is saved, so the address stays `/ai` | `Message`, `Alert`, `MessageAction` | SCR-03 |
| left without sending | Picking another Conversation or leaving the page saves nothing, and the list is unchanged (AC-18) | — | — |
| error | `getAllowanceState` or the list read fails → `LoadError` (existing `error.tsx`) | `LoadError` | existing |
| signed out | A Visitor → SCR-12 (AC-36) | — | SCR-12 |
| empty | N/A: this screen *is* the empty state of a Conversation | — | — |

```text
default (≥ xl shown; md–xl identical; < md has no list pane). App sidebar + header stay outside.
  ╭──────────────────────────────┬──────────────────────────────────────────────────────╮
  │ [🔍 Search conversations][⋯] │                                                      │
  │──────────────────────────────│                (no header bar here)                  │
  │ Today                        │                                                      │
  │  Who owes me money?          │                                                      │
  │  Invoices due this week      │               Good morning, Dmytro                   │
  │ Yesterday                    │     How can I help with ░your invoices today?░       │
  │  Bank accounts in EUR        │                      (░ = accent gradient)           │
  │ Previous 7 days              │  ╭────────────────────────────────────────────────╮  │
  │  Logo on invoices            │  │ Ask about your invoices, Customers and         │  │
  │                              │  │ payments, or describe one to draft             │  │
  │                              │  │                                                │  │
  │                              │  │ 29 of 30 messages left today              (↑)  │  │
  │                              │  ╰────────────────────────────────────────────────╯  │
  │                              │  (✎ Invoice Acme for 20 hours of consulting at $50)  │
  │                              │  (¤ Who owes me money right now?) (⏱ What's overdue  │
  │──────────────────────────────│   today?) (🏦 Which bank accounts do I have?)        │
  │ [        + New chat        ] │                                                      │
  │ Kept for 90 days after the   │                                                      │
  │ last message.                │                                                      │
  ╰──────────────────────────────┴──────────────────────────────────────────────────────╯
  rounded-xl bordered container, 16 px inside the content area; (↑) = round PromptInputSubmit;
  ( … ) = Suggestion chips. Greeting + card + chips are one block, centred both ways, max-w-3xl.

phone (< md): no container border; header row [☰] (list button opens SCR-01 sheet),
              then the same centred block, full width with a 16 px gutter, greeting text-2xl.
```

```text
start=draft (right pane)                         used-up / used-up from Create with AI
|       Good morning, Dmytro                 |   |          Good morning, Dmytro                     |
|       Let's draft ░an invoice.░            |   |   How can I help with ░your invoices today?░      |
|  Describe it in one sentence. You'll see a |   |  (i) You've used today's 30 messages              |
|  card to check before anything is created. |   |      They renew at 00:00 your time. An AI client  |
|  ╭ e.g. "Invoice Acme for 20 hours..."   ╮ |   |      connected with a Personal key isn't          |
|  ╰ 29 of 30 messages left today     (↑)  ╯ |   |      affected, and your conversations stay        |
|  (✎ Invoice Acme for 20 hours of           |   |      readable.                                    |
|     consulting at $50)                     |   |      Connect your own AI client →                 |
|                                            |   |      [Create it by hand →]   <- start=draft only  |

sending: the composer moves from the middle to the bottom (≈250 ms, none under reduced motion)
|                                            |        |            ( Who owes me money? )          |
|  ╭ Who owes me money?              (↑) ╮   |  ===>  | ✦ (◌) Thinking…              <- Loader     |
|                                            |        |                                            |
|                                            |        |  ╭ composer, disabled            (◌) ╮     |
```

### SCR-03 — Conversation

`/ai/{id}` (`[conversationId]/page.tsx` reads `getConversation`, which now returns `offers` and message `origin`). The right pane is a column: a header (`h-12`: title, the "Conversation actions" menu as the parent; `< md` and the `md`–`xl` preview layout add the list button on the left), the messages in a `Conversation` / `ConversationContent` scroll area (`flex-1 min-h-0`, full-width scroll, content centred at `max-w-3xl`), and the `PromptInput` composer docked at the bottom, outside the scroll area, centred at the same `max-w-3xl`, with the counter in its footer. Freelancer messages are `Message from="user"`: a right-aligned `bg-secondary` rounded bubble, at most 80 % of the column. A pressed choice shows its stored label like any typed message. Assistant replies are `Message from="assistant"`: the `MessageAvatar` (24 px sparkles avatar) and a full-column `MessageContent` with plain `MessageResponse` text followed by its `ChatLink`s, Draft cards (SCR-05) and Offered choices (SCR-04) in part order.

**Following new text** (AC-16, spec §6). A small in-house hook watches the scroll area. While the end of the messages is within 48 px of view, each new delta scrolls to the bottom within 100 ms. Further up, nothing moves, and the `ConversationScrollButton` "Jump to latest" (round outline icon button with a visible-on-focus label, `aria-label` "Jump to latest", arrow-down icon, `shadow-sm`, centred 12 px above the composer) appears. The hook (`useFollowLatest`) drives the element; `use-stick-to-bottom` is not used (its threshold is fixed at 70 px, ADR-0010). Pressing it scrolls to the bottom and hides it. It also hides when the Freelancer scrolls back within 48 px. Sending a message always scrolls to the bottom.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight: the existing `[conversationId]/loading.tsx` redrawn inside the grid: three alternating message skeletons and a composer skeleton docked at the bottom | `Skeleton` | — |
| default | `getConversation` → `ok` (AC-15; Flow 7). Saved replies are shown whole (AC-33). Offers are restored from `offers` (SCR-04). Card and link states come from the store. Scrolled to the newest message on open. Only the messages scroll; the page never scrolls, and the composer stays visible at every height from 360 × 640 up (spec §6) | `ChatIsland`, `MessageList` → `Conversation`, `Message`, `MessageContent`, `MessageAvatar`, `MessageResponse`, `ChatLink`, `DraftCard`, `NEW: OfferedChoices`, `Composer` → `PromptInput`, `AllowanceNotice`, `ConversationHeader` | wireframe below |
| waiting | As the parent: the message appears at once, then an assistant `Message` with `Loader` "Thinking…", and the submit button and Enter are disabled (`PromptInputSubmit` `status="submitted"`) until the reply completes | `Message`, `Loader`, `PromptInputSubmit` | wireframe SCR-02 |
| streaming | Text deltas render word by word, about 20 ms apart, with the first word not held back (AC-33, spec §6). Never revealed as one block. While streaming, the reply's live region stays silent (parent rule) | `MessageResponse` | — |
| following | Streaming while the end is within 48 px: the view keeps the newest text in view (AC-16) | — | — |
| scrolled up | Streaming or idle while the end is more than 48 px out of view: the view stays put, and "Jump to latest" floats above the composer (AC-16) | `ConversationScrollButton` | wireframe below |
| answered — reads | Read answers (AC-01–AC-03): profiles with their accounts as "Monobank ••••4821 · USD (default)", prices "50.00 USD · 45.00 EUR, custom price for Acme Corp 40.00 USD", Customer names as saved. All are the Assistant's own plain text; the UI adds nothing. No full account number exists in any part (spec §6) | `MessageList` | wireframe below |
| answered — nothing matches | AC-05: the reply says nothing matches, with a page `ChatLink` "Add a Customer →" (`/customers/new`) or "Add a product →" (`/products/new`) from the fixed app map (SCR-15) | `ChatLink` | wireframe below |
| answered — own profile named | AC-05b: an explanation plus a question about which Customer to invoice. No card and no buttons. Text only | — | — |
| answered — too many | AC-14: "12 Customers match "Studio". Type a more exact name." No buttons | — | — |
| answered — only you can issue | AC-24: the parent answer. The invoice `ChatLink` opens the editor, and the card's Preview (SCR-05) stays the way to issue | `ChatLink` | — |
| choice unavailable | `/api/chat` `409` `CHOICE_UNAVAILABLE` after a press (AC-12b, AC-13). The optimistic pressed message is removed. In the reply position, an assistant `Message` holds a non-destructive inline `Alert` (info icon) with the contract sentence verbatim: "This option is no longer available. Choose again or type your request." No "Try again". The buttons stay exactly as they were, and the counter is unchanged (not counted). Nothing is saved, so a reload drops the notice | `Message`, `Alert` | wireframe below |
| could-not-complete / ai-unavailable | As the parent (copy verbatim, live-region announcement unchanged), for a typed message and a press alike, but rendered as an assistant `Message` in the reply position: the avatar, an inline destructive `Alert` (alert-circle icon, the parent's sentence, e.g. "The reply couldn't be completed. Try again."), and `MessageActions` with a `MessageAction` "Try again" (rotate icon + text). The Freelancer's message above it stays a normal user bubble. After a failed press, the offer is released (ADR-0003), so its buttons are pressable again with nothing marked. "Try again" re-sends the same thing: the text, or the same `{ offerId, optionId }`. A new message or a press instead of Try again keeps the failed exchange discarded (review 2026-10-13 R7-4) | `Message`, `MessageAvatar`, `Alert` (destructive), `MessageActions`, `MessageAction` | wireframe below |
| too-long | As the parent (`FieldError`, count, Send disabled) | `Composer`, `FieldError` | parent |
| used-up | As the parent: `left = 0` on load, or `429` on a typed message **or a press** (AC-11). On a refused press, the optimistic message is removed and nothing is marked chosen (SCR-04 stays `pressable`). The composer is replaced by `AllowanceNotice` (used-up), docked at the bottom. Draft cards, Preview and Issue keep working (AC-27) | `AllowanceNotice` (used-up) | parent |
| preview open | `?preview={cardId}`: SCR-06 opens beside the messages (`≥ md`) or as a sheet (`< md`). At `md`–`xl` the list pane is hidden and the header gains the list toggle. The messages stay visible and scrollable on a desktop (AC-20) | `NEW: InvoicePreviewPanel`, `Sheet` | SCR-06 |
| conversation-gone | As the parent (`404` mid-session; copy and link unchanged), rendered as an assistant `Message` with an inline `Alert` and the parent's link | `Message`, `Alert`, `buttonVariants` link | parent |
| not-found | As the parent → existing not-found screen (ai-assistant AC-41) | — | parent |
| deleted | As the parent | `DropdownMenu`, `Sonner` | parent |
| error | `getConversation` fails → `LoadError` | `LoadError` | existing |
| signed out | A Visitor → SCR-12. `401` on send → `goToSignIn()` (AC-36) | — | SCR-12 |
| empty | N/A: a Conversation exists only from its first saved exchange (AC-18) | — | — |

```text
default (≥ xl, preview closed; the pane is wider than the centred max-w-3xl column)
╭──────────────────────────────┬─────────────────────────────────────────────────────────────╮
│ [🔍 Search conversations][⋯] │ Invoice Acme for 20 h                                  [⋯]  │
│──────────────────────────────│─────────────────────────────────────────────────────────────│
│ Today                        │      ┊                     ( invoice Acme for 20 h at $50 ) ┊ │ ^
│▐Invoice Acme for 20 h    [⋯] │      ┊ ✦ Two Customers match "Acme". Which one?            ┊ │ |
│  Who owes me money?          │      ┊   [Acme Corp] [Acme GmbH]        <- SCR-04          ┊ │ |
│ Yesterday                    │      ┊                                     ( Acme GmbH )   ┊ │ | messages
│  ...                         │      ┊ ✦ Acme GmbH has two USD accounts. Which one?        ┊ │ | scroll on
│                              │      ┊   [Monobank ••4821 · USD] [Wise ••7710 · USD]       ┊ │ | their own
│                              │      ┊                          ( Monobank ••4821 · USD )  ┊ │ |
│                              │      ┊ ✦ Here is the draft for Acme GmbH.                  ┊ │ |
│                              │      ┊   ╭───────────────────────────────────────────╮     ┊ │ |
│                              │      ┊   │ Draft card (SCR-05)                       │     ┊ │ v
│──────────────────────────────│      ┊ ╭ Ask a question or describe…                     ╮    ┊ │ docked,
│ [        + New chat        ] │      ┊ ╰ 26 of 30 messages left today             (↑) ╯    ┊ │ never scrolls
│ Kept for 90 days after ...   │      ┊<────────────── max-w-3xl, centred ─────────────>┊   │
╰──────────────────────────────┴─────────────────────────────────────────────────────────────╯
  ( … ) = user bubble, bg-secondary, right-aligned, ≤ 80 % of the column
  ✦ = MessageAvatar (sparkles avatar); assistant text is not a bubble

phone (< md): [☰] Invoice Acme for 20 h [⋯] header; column full width with a 16 px gutter; composer docked.
```

```text
scrolled up (AC-16)                              choice unavailable (AC-12b, AC-13)
| ...older messages in view...               |   | ✦ Which account? [Monobank ••4821 · USD]       |
|                                            |   |                  [Wise ••7710 · USD]           |
|                   (↓)                      |   | ✦ ╭ (i) This option is no longer available. ╮  |
|                                            |   |   ╰     Choose again or type your request.  ╯  |
| ╭ Ask a question or describe…           (↑) ╮ |   | ╭ … 27 of 30 messages left today    (↑) ╮      |
                                                   (counter unchanged)

could-not-complete (replaces the bare full-width red card of ref/current-as-built-bad.png)
|                       ( створи мені інвойс на послуги веб дев … ) |
| ✦ ╭───────────────────────────────────────────────────────────╮  |
|   │ (!) The reply couldn't be completed. Try again.            │  |  inline destructive Alert
|   ╰───────────────────────────────────────────────────────────╯  |
|   [↻ Try again]                                                  |  MessageActions / MessageAction
| ╭ Ask a question or describe…                               (↑) ╮   |

answered — reads (AC-01)                         answered — nothing matches (AC-05)
| You have two sender profiles:              |   | No Customer matches "Globex". I never use a    |
| - Studio (default)                         |   | Customer that isn't saved.                     |
|   Monobank ••••4821 · USD (default)        |   | Add a Customer →                               |
| - Consulting FOP                           |   |                                                |
|   PrivatBank ••••0915 · UAH                |   |                                                |
```

### SCR-04 — Offered choices (inline under a reply in SCR-03)

`NEW: OfferedChoices` (`components/ai/offered-choices.tsx`, sad.md §5). It renders one `OfferView` (`contracts/server-actions.md`) for each `data-offer` part, directly under the reply's text and before any card. The buttons are a wrapping row (`flex-wrap gap-2`) of outline `Button`s, `size="sm"`, inside a `role="group"` with an `aria-label` by kind: "Choose a Customer", "Choose a bank account", "Choose a product", "Choose a sender profile" or "Choose a currency". There are 1 to 8 buttons, each with the server's stored `label` verbatim (spec §1 "What a button shows"). Look-alike Customers carry their email in the label ("Acme Corp (billing@acme.com)" or "Аcme Corp (no email)", openapi.yaml `OfferOptionLabel`, AC-10). The UI never builds or edits a label. A press sends `{ conversationId, message: label, choice: { offerId, optionId } }` with no `origin` (openapi.yaml `ChatRequest`). On a phone the buttons wrap. A label longer than the row truncates with its full text in `title`. Presentation (ADR-0010): the group sits inside the assistant `MessageContent`, under the `MessageResponse` text with an 8 px gap, aligned with the text (not under the avatar). Buttons are `rounded-full` outline chips, the same shape as the SCR-02 `Suggestion` chips, so a choice reads as part of the reply; states, labels, ARIA and the press contract are unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| labels loading | A `data-offer` part streamed with only `offerId`. Its `OfferView` arrives through `loadConversationCards` after `finish` (ADR-0001 Neutral). Until then, a row of three button-sized `Skeleton`s | `Skeleton` | — |
| pressable | `state = OPEN` and the reply is the latest one (AC-08, AC-08b, AC-13). Every button is enabled and keyboard-reachable in order. This also applies with no allowance left (AC-11: the press is refused by the server, not disabled) | `NEW: OfferedChoices`, `Button` (outline) | wireframe below |
| pressing | A button pressed: its label appears at once as the Freelancer's message (optimistic). The pressed button shows a `Spinner`, and the whole group plus the composer are disabled until the turn resolves. The state is not yet chosen; the mark comes from the server | `Spinner` | wireframe below |
| chosen | `state = CHOSEN` from `loadConversationCards` or on reopen (AC-08, AC-12, AC-13). The chosen button is `variant="secondary"` with a check icon, sr-only "(chosen)" and a `border-border` edge, at full strength: it is the most prominent button of the group (secondary alone equals the reply bubble's colour). All buttons are disabled through `aria-disabled` (Base UI `focusableWhenDisabled`: focusable, still readable in the a11y tree, a click does nothing); only the unchosen ones take the muted opacity (review 2026-10-13 R1-U1) | `Button` (secondary + check), `Button` (outline, disabled) | wireframe below |
| inactive | `state = CLOSED` (any newer message, AC-12; a press closes only an offer another tab stored), or the reply is not the latest. All buttons are disabled, none marked, at the muted opacity. They stay visible on reopen (AC-13) | `Button` (disabled) | wireframe below |
| refused — unavailable | `409` (AC-12b, AC-13): back to `pressable`, nothing marked. SCR-03 `choice unavailable` shows the sentence | `Alert` | SCR-03 |
| refused — used up | `429` (AC-11): back to `pressable`, nothing marked. SCR-03 `used-up` | `AllowanceNotice` | SCR-03 |
| failed | `COULD_NOT_COMPLETE` / `AI_UNAVAILABLE` after the claim: released, so back to `pressable` (SCR-03 row) | — | SCR-03 |
| no offer | More than 8 options (AC-14), a value to type, or a non-offer issue: no group is rendered (text only, SCR-03) | — | — |
| empty | N/A: an offer always has 1..8 options (openapi.yaml `OfferView`) | — | — |
| error | N/A: the component makes no request of its own. Press outcomes route to the SCR-03 states above | — | — |

```text
pressable (AC-08)                                pressable, look-alike Customers (AC-10)
| Two Customers match "Acme". Which one?     |   | Two Customers look alike. Which one?           |
| [Acme Corp] [Acme GmbH]                    |   | [Acme Corp (billing@acme.com)]                 |
                                                 | [Аcme Corp (no email)]                         |
pressing                                         chosen (after the press, and on reopen)
|                                  Acme GmbH |   | [Acme Corp] [✓ Acme GmbH]      (all disabled)  |
| [Acme Corp] [(◌) Acme GmbH]   (disabled)  |
                                                 inactive (a newer typed message)
labels by kind (stored, verbatim):               | [Acme Corp] [Acme GmbH]   (disabled, muted,    |
| Bank account: [Monobank ••4821 · USD]    |   |                            none marked)        |
| Product:      [Consulting · hours · 50.00 USD]
| Sender prof.: [Consulting FOP]             |
| Currency:     [USD] [UAH]                  |
```

### SCR-05 — Draft card (inline in SCR-03, existing, extended)

`DraftCard` keeps every parent state (ai-assistant screens.md SCR-03: live, creating, replaced, outdated, needs-answers, not-found, create-failed, rejected). The changes:
- Once the card is created, it gets a **"Preview"** `Button` (outline, eye icon) beside the editor link. Preview pushes `?preview={cardId}` (ADR-0005).
- The created states read the invoice's status from the workspace store (ADR-0008) instead of only the page load.
- Presentation (ADR-0010): the card sits inside the assistant `MessageContent`, full column width (`max-w-3xl` column), `rounded-xl` with the container's border colour, so cards, choices and text share one left edge. States and copy are unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| live / creating / replaced / outdated / needs-answers / create-failed / not-found / rejected | As the parent. No Preview: no invoice exists yet | `DraftCard` | parent |
| created (draft) | Store state `DRAFT` (AC-20). "Draft {number} created." with `ChatLink` "Open in editor →" (the parent's "Open draft →" is renamed, to match the panel) and "Preview" | `DraftCard`, `ChatLink`, `Button` (outline) | wireframe below |
| preview open | This card's preview is the open one: Preview is `aria-expanded="true"` and `variant="secondary"`. Pressing it again closes the panel | `Button` | — |
| created, issued | Store state issued: from the page load, an `issueFromPreview` success, or `ALREADY_ISSUED` (AC-23, AC-26). "Invoice {number}" with `InvoiceStatusBadge`. "Open in editor →" and "Preview" stay (the preview shows the issued invoice with no Issue). The Assistant mark shows nowhere in the card | `ChatLink`, `InvoiceStatusBadge`, `Button` | wireframe below |
| created, no longer available | Store state `UNAVAILABLE`: from the load, or a `loadInvoicePreview` → `UNAVAILABLE` / `issueFromPreview` → `NOT_FOUND` (AC-21). "This draft is no longer available." No link and no Preview | `ChatLink` | wireframe below |
| at zero allowance | Create and Preview work as normal (AC-27, parent AC-11c) | — | — |
| loading | As the parent (card `Skeleton` until the `DraftCardView` arrives) | `Skeleton` | parent |
| empty | N/A (as the parent) | — | — |

```text
created (draft) (AC-20)
| Draft invoice                                  [Created] |
| ...content as the parent's live card...                  |
| Draft INV-0043 created.     Open in editor →  [👁 Preview]|

created, issued (AC-23, AC-26)                   created, no longer available (AC-21)
| Draft invoice                     [Created]  |   | Draft invoice                     [Created]  |
| Invoice INV-0043 [Pending]                   |   | This draft is no longer available.           |
|              Open in editor →  [👁 Preview]  |   |                                              |
```

### SCR-06 — Invoice preview panel (side panel on a desktop, full-screen sheet on a phone)

`NEW: InvoicePreviewPanel` (`components/ai/invoice-preview-panel.tsx`). It opens from `?preview={cardId}` and calls `loadInvoicePreview(cardId, conversationId)` with the open Conversation from the address (ADR-0006; at `/ai`, with no Conversation, it shows not found without a call, review 2026-10-13 R9-2/R10-1) on open, on a reload with the parameter, and after `CHANGED_ELSEWHERE`. At `≥ md` it is a grid column (not a modal) with a left border, its own header and its own scroll. At `< md` it renders inside a `Sheet` (`side="bottom"`, `h-dvh`, full width). Back closes it (pushState), and so do `×` and Escape. Inside:
- a header: "{invoiceNumber}" (or "Invoice preview" before load), the status (`Badge` "Draft" or `InvoiceStatusBadge`), and a close `×` button (`aria-label` "Close preview");
- the body: `PDFPreviewPanel` with `source = { kind: 'issued', invoice }` and the invoice's sender profile, the same as the list's preview modal, with zoom controls (spec AC-20 "the same invoice preview the editor shows");
- a footer, always visible: "Open in editor" (outline link to `/invoices/{id}/edit`) and, only while the invoice is a draft, "Issue invoice" (primary).

Opening the preview and issuing are never messages and never count (AC-27). The panel moves focus to its heading on open and returns focus to the card's Preview button on close.

Presentation (ADR-0010): at `≥ md` the panel is the right-most pane of the bordered workspace container, separated by one vertical border (no own outer border, shadow or radius); its header is `h-12` like the chat header so the two header rows line up. The phone sheet is unchanged. States, copy, addresses and focus rules are unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | The `loadInvoicePreview` call is in flight: header "Invoice preview", an A4-ratio page `Skeleton`, and the footer buttons disabled. Rendered within 1.5 s p95 (spec §6) | `Skeleton` (plus an sr-only `role="status"` "Loading preview…") | wireframe below |
| draft | `AVAILABLE` + `DRAFT` (AC-20). Header "INV-0043" `Badge` "Draft". The document. Footer: "Open in editor" and "Issue invoice" | `NEW: InvoicePreviewPanel`, `PDFPreviewPanel`, `Badge`, `Button`, `buttonVariants` link | wireframe below |
| issued | `AVAILABLE` + an issued status (opened after issuing, or issued elsewhere): `InvoiceStatusBadge`, the document, and only "Open in editor". No Issue | `InvoiceStatusBadge`, `PDFPreviewPanel` | wireframe below |
| issuing | Confirm pressed in SCR-07: handled by the dialog (spinner, buttons locked). The panel's Issue is disabled | `ConfirmationModal` | SCR-07 |
| issued now | `issueFromPreview` → `ok` (AC-23): the dialog closes, `toast.success` "Invoice {number} issued.", and the store updates the card and links (SCR-05 `created, issued`). The panel calls `loadInvoicePreview` again, so the document and badge show the issued invoice, with the number kept. Issue disappears | `Sonner`, `InvoiceStatusBadge` | — |
| already issued | `CONFLICT` + `ALREADY_ISSUED` (AC-26): the dialog closes. An info `Alert` at the top of the body shows the contract text verbatim "This invoice has already been issued." The store applies `details.invoice`, the panel switches to `issued`, and nothing is issued again | `Alert`, `InvoiceStatusBadge` | wireframe below |
| reloaded (outdated) | `CONFLICT` + `CHANGED_ELSEWHERE` (AC-26b): the dialog closes, the panel shows `loading`, then calls `loadInvoicePreview` again and renders the current draft. A warning `Alert` above the document shows the contract text verbatim "This draft was changed after you opened the preview. Check it and issue again." Nothing was issued. The Freelancer must press Issue again, and SCR-07 then names the current figures. The alert clears on the next Issue press | `Alert`, `PDFPreviewPanel` | wireframe below |
| blocked | `VALIDATION` (AC-25): the dialog closes, and a destructive `Alert` "Can't issue this invoice" shows the result's `error` verbatim (the editor's message) and lists `fieldErrors` messages, if any, as a list. It stays a draft. "Open in editor" becomes the primary footer button and Issue becomes outline | `Alert`, `Button` | wireframe below |
| issue failed | `FAILED`: the dialog closes, `toast.error` "The invoice couldn't be issued. Try again." verbatim, and the panel stays `draft`, so Issue is available again | `Sonner` | — |
| no longer available | `loadInvoicePreview` → `UNAVAILABLE`, or `issueFromPreview` → `NOT_FOUND` (AC-21): `Empty` (file-x icon) "This invoice is no longer available." with no document, no Issue and no editor link. Only `×`. The store marks the card the same (SCR-05) | `Empty` | wireframe below |
| not found | `loadInvoicePreview` → `NOT_FOUND` (AC-22; another Freelancer's card, an unknown id, a card not created, or a card of another Conversation): `Empty` "This invoice can't be found." verbatim, the same for every cause. Only `×`. The card is not changed (it may not be this Conversation's) | `Empty` | wireframe below |
| load failed | `loadInvoicePreview` → `FAILED`: a destructive `Alert` "The preview couldn't be loaded. Try again." verbatim with "Try again" (re-calls the action; `Spinner` while pending) | `Alert`, `Button`, `Spinner` | — |
| logo warning | `PDFPreviewPanel`'s own logo-warning alert (existing behaviour) | `PDFPreviewPanel` | existing |
| rejected | `UNAUTHORIZED` or a rejected call → `goToSignIn()` | — | SCR-12 |
| phone sheet | `< md` (AC-19): the same header, body and footer inside a full-screen `Sheet`. The footer buttons are full width and stacked, Issue on top | `Sheet` | wireframe below |
| md–xl layout | `md`–`xl`: the grid is chat \| preview. The list pane is hidden, and the SCR-03 header gains the "Show conversations" toggle (`☰`), which opens SCR-01 as a left `Sheet` (spec §1) | `Sheet`, `Button` (icon) | wireframe below |
| empty | N/A: an available invoice always has a document. The no-invoice cases are `no longer available` / `not found` | — | — |

```text
draft, ≥ xl (three panes; AC-20)
+----------------------+-------------------------------------+-------------------------------+
| Conversations   [⋯]  | Invoice Acme for 20 h          [⋯]  | INV-0043  [Draft]         [×] |
| [🔍 Search        ]  |-------------------------------------|-------------------------------|
| Today                | ...messages, own scroll...          |  [-] [+] [fit]                |
| ▌Invoice Acme   [🗑] |                                     |  +-------------------------+  |
|  Who owes me    [🗑] | | Draft INV-0043 created.         | |  |  INVOICE INV-0043       |  |
| ...                  | |  Open in editor → [👁 Preview]* | |  |  Studio → Acme GmbH     |  |
|                      |                                     |  |  Consulting 20 h ...    |  |
|----------------------|-------------------------------------|  |  Total 1,000.00 USD     |  |
| [+ New chat       ]  | [ Ask a question...        ] [Send] |  +-------------------------+  |
| Kept for 90 days...  | 26 of 30 messages left today        |-------------------------------|
+----------------------+-------------------------------------+ [Open in editor] [Issue invoice]
                                                              +-------------------------------+
  * Preview pressed state (secondary, aria-expanded)

md–xl (768–1279): the list pane is hidden; the header gets a toggle
+---------------------------------------+-------------------------------+
| [☰] Invoice Acme for 20 h       [⋯]   | INV-0043  [Draft]         [×] |
| ...messages...                        | ...document...                |
| [ Ask a question...          ] [Send] | [Open in editor] [Issue invoice]
+---------------------------------------+-------------------------------+
  [☰] opens SCR-01 as a left Sheet over both panes.
```

```text
loading                     issued                       reloaded (AC-26b)
| Invoice preview     [×] | | INV-0043 [Pending]  [×] | | INV-0043  [Draft]          [×] |
| ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭ |  | ...document...          | | (!) This draft was changed     |
| ▭  page skeleton    ▭ |  |                         | |     after you opened the       |
| ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭ |  |                         | |     preview. Check it and      |
| [Open in editor][Issue]| | [Open in editor]        | |     issue again.               |
   (disabled)                                         | ...current document...         |
                                                      | [Open in editor] [Issue invoice]

already issued (AC-26)              blocked (AC-25)
| INV-0043 [Pending]          [×] | | INV-0043  [Draft]                     [×] |
| (i) This invoice has already    | | (x) Can't issue this invoice              |
|     been issued.                | |     <the editor's message, verbatim,      |
| ...document...                  | |      e.g. a currency-mismatch rule>       |
| [Open in editor]                | | ...document...                            |
                                    | [Issue invoice]  [Open in editor]  <- primary

no longer available (AC-21)        not found (AC-22)                phone sheet (< md, AC-19)
| Invoice preview         [×] |    | Invoice preview         [×] |  +-----------------------------+
|      [file-x icon]          |    |      [file-x icon]          |  | INV-0043  [Draft]       [×] |
|  This invoice is no longer  |    |  This invoice can't be      |  | ...document, own scroll...  |
|  available.                 |    |  found.                     |  |-----------------------------|
                                                                    | [      Issue invoice      ] |
                                                                    | [     Open in editor      ] |
                                                                    +-----------------------------+
```

### SCR-07 — Issue confirmation dialog

The existing `ConfirmationModal` (canon) opened from SCR-06's "Issue invoice", with a `NEW: IssueConfirmation` body. Title "Issue invoice {number}?". The body names, from the preview the panel shows (the loaded `invoice`, never a cached card):
- "Customer: {Customer name}"
- "Total: {total} {currency}"
- the sentence "Once it's issued, its lines and amounts can no longer change."

Confirm is "Issue invoice" and Cancel is "Cancel". `onConfirm` returns the `issueFromPreview(invoiceId, version)` promise. The modal locks both buttons while it is pending and never closes itself. The caller closes it once the promise settles, for every outcome (canon note, F-40), and routes the outcome to SCR-06.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Issue pressed on a draft (AC-23). The figures are the ones loaded with this preview's `version` | `ConfirmationModal`, `NEW: IssueConfirmation` | wireframe below |
| issuing | Confirm pressed: `Spinner` in Confirm, both buttons disabled (canon behaviour). Two quick presses issue once (row lock + the modal's busy state) | `ConfirmationModal`, `Spinner` | — |
| cancelled | Cancel, Escape or the overlay: closes. Nothing is called, and the panel stays `draft` | — | SCR-06 |
| settled | Every result closes the dialog and goes to SCR-06: `issued now`, `already issued`, `reloaded (outdated)`, `blocked`, `issue failed`, `no longer available`. A rejected promise → `goToSignIn()` (canon behaviour) | — | SCR-06 |
| at zero allowance | Same as `default`. Issuing is never a message (AC-27) | — | — |
| validation | N/A: the dialog has no input | — | — |
| empty | N/A: it opens only for a loaded draft | — | — |

```text
default (AC-23)
+------------------------------------------------+
| Issue invoice INV-0043?                        |
|                                                |
| Customer   Acme Corp                           |
| Total      1,000.00 USD                        |
|                                                |
| Once it's issued, its lines and amounts can no |
| longer change.                                 |
|                                                |
|                      [Cancel] [Issue invoice]  |
+------------------------------------------------+
  issuing: [Cancel](disabled) [(◌) Issue invoice](disabled)
```

### SCR-08 — Navigation "AI" group

`config/navigation-menu.config.ts`: the single main item "AI" is removed. A new `type: 'group'` section with `label: 'AI'` is placed between the main section and "Management", rendered by the existing `AppSidebar` group (the same style as "Management"). Its items are "AI chat" (`/ai`, icon `ai`) and "Connect your AI" (`/settings/assistants`, a plug icon; `implement` adds the icon key if the icon map has none).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Signed in (AC-28). The group label "AI" with the two items | `AppSidebar`, `Sidebar` group | wireframe below |
| active | The current path is under `/ai` → "AI chat" is active. Under `/settings/assistants` → "Connect your AI" is active (`isActive`, existing matching) | `Sidebar` menu button | — |
| collapsed | The sidebar is collapsed to icons: the existing icon-only rendering with a `Tooltip` per item; the group label is hidden as for "Management" | `Sidebar`, `Tooltip` | existing |
| phone | The existing mobile sidebar `Sheet` holds the same group | `Sidebar` | existing |
| empty / error / loading | N/A: static config, rendered with the app shell | — | — |

```text
| ▣ Dashboard            |
| ▣ Invoices             |
|                        |
| AI                     |   <- group label, styled like "Management"
| ✦ AI chat         ◀ active on /ai and /ai/{id}
| ⌁ Connect your AI      |
|                        |
| Management             |
| ▣ Customers            |
| ...                    |
```

### SCR-09 — Dashboard AI block (existing dashboard, extended)

Two additions to the existing dashboard:
1. **`DashboardHeader`:** a "Create invoice with AI" `buttonVariants({ variant: 'outline' })` link (sparkles icon) placed just before the existing "Create Invoice" button, linking to `/ai?start=draft&from=dashboard` (AC-30). On a phone both buttons wrap under the filters.
2. **`NEW: DashboardAiBlock`** (`components/dashboard/ai-block.tsx`): an RSC section in its own `Suspense`, placed after `DashboardBanners` and before the stats. It reads `getAllowanceState` and `listLatestConversations(actor, 3)`. It is a `Card` titled "Ask AI" with two columns at `lg` (stacked below):
   - **left:** a client prompt box built on the same `PromptInput` element as the chat (ADR-0010): a 2-row auto-growing `PromptInputTextarea` (placeholder "Ask about your invoices or describe one to draft", `aria-label` "Message to AI") and a round `PromptInputSubmit` (`aria-label` "Send to AI"), with the `AllowanceNotice` counter in its footer. Enter sends and Shift+Enter is a newline, as in `Composer`. Validation, hand-off and every state below are unchanged;
   - **right:** "Recent conversations", up to 3 `Item` links (title, last-message day) to `/ai/{id}`, and "All conversations →" to `/ai`.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | The Suspense fallback: a card with a textarea skeleton and three row skeletons | `Skeleton`, `Card` | — |
| default | Messages left and ≥ 1 Conversation (AC-30): up to 3 latest by last message, the prompt box, the counter, "All conversations →", and "Create invoice with AI" in the header | `NEW: DashboardAiBlock`, `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit`, `AllowanceNotice`, `Item`, `buttonVariants` link | wireframe below |
| none yet | No Conversations (AC-30): the right column reads "No conversations yet. Your chats with AI will show here." and keeps "All conversations →" (it opens SCR-02 with SCR-01) | `Item` / muted text | wireframe below |
| validation — empty | Send with an empty or whitespace prompt (AC-31): `FieldError` "Type a message first." verbatim. Nothing is stored, sent or created. Focus stays in the box | `Field`, `FieldError` | wireframe below |
| validation — too long | Over 2,000 characters after trimming (AC-31): `FieldError` "Messages can be at most 2,000 characters. Shorten it and send again." verbatim plus "{n} / 2,000". Send is refused. Nothing is created | `Field`, `FieldError` | wireframe below |
| sending | A valid prompt: the send button shows a `Spinner` and the box is read-only while the hand-off entry is written and the router navigates to `/ai?handoff={id}` (same tab, ADR-0009). Continues in SCR-02 `handoff` → SCR-03 (AC-29) | `Spinner` | — |
| used-up | `left = 0` (AC-32): the prompt box is replaced by `AllowanceNotice` (used-up mode) with `handMadeLink` "Create it by hand →" to `/invoices/new` (SCR-10). Nothing can be sent. The latest links and "All conversations →" stay usable. "Create invoice with AI" stays and leads to SCR-02 `used-up from Create with AI` | `AllowanceNotice` (used-up) | wireframe below |
| error | A failed read → `unwrapPageResult`, as every other dashboard section (the segment's `error.tsx`, `LoadError`) | `LoadError` | existing |
| signed out | N/A: the dashboard is signed-in only. A Visitor is sent to SCR-12 by the proxy before the block renders (AC-36) | — | SCR-12 |

```text
default (lg and wider)
+------------------------------------------------------------------------------------+
| ✦ Ask AI                                                                           |
| ╭────────────────────────────────────────────╮  Recent conversations                |
| │ Ask about your invoices or describe one to │  Invoice Acme for 20 h    12 Oct 2026|
| │ draft                                      │  Who owes me money?       12 Oct 2026|
| │ 29 of 30 messages left today          (↑)  │  Bank accounts in EUR     11 Oct 2026|
| ╰────────────────────────────────────────────╯  All conversations →                 |
+------------------------------------------------------------------------------------+
  header row: [filters]                  [USD|EUR]  [✦ Create invoice with AI] [+ Create Invoice]
  below lg: the recent list stacks under the prompt box.
```

```text
none yet (right column)                          validation (AC-31)
| Recent conversations                       |   | [                                    ] [➤]  |
| No conversations yet. Your chats with AI   |   | ! Type a message first.                     |
| will show here.                            |   |
| All conversations →                        |   | [ ...2,140 characters...             ] [➤]  |
                                                 | ! Messages can be at most 2,000 characters. |
used-up (AC-32; replaces the prompt box)         |   Shorten it and send again.   2,140 / 2,000|
| (i) You've used today's 30 messages                                   |
|     They renew at 00:00 your time. ...                                |
|     Connect your own AI client →    [Create it by hand →]             |
```

### SCR-10 — Invoice editor (existing)

The UI is unchanged. It is reached from "Open in editor" (SCR-05, SCR-06) and "Create it by hand →" (SCR-02, SCR-09). An invoice issued from the chat shows in the editor's `issued` mode, with no Assistant mark (AC-23, ai-assistant ADR-0013).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / loading / error / not-found | Existing editor states, unchanged | `InvoiceEditor` | existing |
| empty | N/A: no change in this feature | — | — |

### SCR-11 — Connect your AI page (existing)

The UI is unchanged (ai-assistant SCR-07). Only the entry moves into the SCR-08 group, which marks "Connect your AI" active here. The three new read questions need no new key setting (spec §1).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / loading / empty / error | Existing states, unchanged | existing | existing |

### SCR-12 — Sign-in (existing)

The UI is unchanged. A Visitor reaching `/ai`, `/ai/{id}` or the dashboard is redirected by the proxy, and nothing is processed or counted (AC-36).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / error | Existing states, unchanged | `LoginForm` | existing |
| empty | N/A: no change in this feature | — | — |

### SCR-13 — Privacy page (existing, public, AI section updated)

`app/(public)/privacy/` keeps its layout. Only the text of its AI section changes (AC-35). The section must state, in the page's existing heading and paragraph style:
1. **What is stored:** Conversations with their messages and draft cards; the options the chat offered as buttons and the one chosen; prompts sent from the dashboard (stored as the first message of the Conversation they start); whether each message was typed, pressed or sent from the dashboard; and where each Conversation was started.
2. **How long:** 90 days after the last message of a Conversation, or until the Freelancer deletes it or the account.
3. **Who processes message text:** the model provider through its gateway, as already named on the page. There is no new processor.
4. **What the reads share with an AI client connected through a Personal key:** sender profile names and defaults; bank name, last four digits and currency of each account, never a full account number; products with their prices and Custom prices; and Customers found by name.

The final legal wording is `implement`'s, reviewed by the owner before ship. The terms page changes only if it contradicts the chat (spec §8).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | A Visitor or a Freelancer opens `/privacy`: the updated AI section among the existing sections | existing page markup | — |
| loading / empty / error | N/A: a static public page | — | — |

### SCR-14 — Privacy settings (existing)

The UI is unchanged. Only the export file and the deletion scope change (Flow 11, AC-34).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| export downloaded | The existing download flow. The file is `exportVersion` `2.3`: every Conversation gains `startedFrom`, every message gains `origin` and its reply's `offer` (labels, state, chosen option), and invoices gain `issuedFromChat` | `GdprSettings` | existing |
| account deleted | The existing confirmation. Offers, origins and start points go with their Conversations (cascade) | `ConfirmationModal` | existing |
| default / loading / export error / account-delete error | Existing states, unchanged | `GdprSettings`, `Sonner` | existing |
| empty | N/A: the export always holds the account itself | — | — |

### SCR-15 — Add Customer / Add product pages (existing)

The UI is unchanged. They are reached from the "Add a Customer →" / "Add a product →" page links in a "nothing matches" reply (SCR-03, AC-05), which the app map routes to `/customers/new` and `/products/new`.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / validation / error | Existing form states, unchanged | existing forms | existing |
| empty | N/A: no change in this feature | — | — |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `OfferedChoices` | No component renders a server-built set of 1..8 options with a server-owned state (pressable / chosen / inactive), an optimistic pressing state and a structured press `{ offerId, optionId }` rather than text. A `ButtonGroup` or plain `Button`s carry no offer state, chosen mark or kind-based group label. Contract: props `offer: OfferView \| undefined` (undefined → skeleton), `isLatest: boolean`, `pendingOptionId: number \| null`, `onPress(offerId, optionId, label)`; pressable only when `offer.state = 'OPEN' && isLatest`; labels verbatim; `role="group"` with a kind-based `aria-label`; the chosen button secondary + check + sr-only "(chosen)" (SCR-04) | registered (docs/design-system.md) |
| `InvoicePreviewPanel` | The existing `InvoicePdfPreviewModal` is a modal `Dialog` from the global modal store. It would cover the messages (AC-20 needs them visible) and has Download/Print instead of Open in editor / Issue, plus none of the unavailable / not-found / outdated / blocked states. `PDFPreviewPanel` (the document) is reused inside. Contract: props `cardId`, `variant?: 'column' \| 'sheet'` (closing goes through the address, `closePreview`); loads with `loadInvoicePreview`, renders as a grid column at `≥ md` and a full-screen `Sheet` below, feeds the invoice-state store, opens SCR-07, and renders every SCR-06 state | registered (docs/design-system.md) |
| `IssueConfirmation` | `ConfirmationModal` takes a `body` slot. This is that body: Customer, total and currency from the loaded preview plus the fixed "can no longer change" sentence, so every issue path shows the same figures (AC-23, AC-26b). Contract: props `customerName`, `total`, `currency` | registered (docs/design-system.md) |
| `InvoiceStateProvider` | Non-visual (ADR-0008). The card, the chat links and the panel are siblings in the island and must show one invoice status fed by loads and action results. `NewConversationProvider` carries Conversation rows only. Contract: `useInvoiceState(invoiceId)` → `LinkedInvoiceState \| undefined`; `apply(invoiceId, state)` from loads, `createDraftFromCard`, `loadInvoicePreview` and `issueFromPreview` results | registered (docs/design-system.md) |
| `DashboardAiBlock` | The dashboard has no chat entry. `StartPanel` is the AI section's centred empty state and sends through the chat island. The dashboard box must validate, write the one-time hand-off and navigate (ADR-0009), with the latest 3 Conversations beside it. Contract: RSC `DashboardAiBlock({ allowance, latest: ConversationSummary[], timeZone })` with a client prompt box that validates with the chat message rule and hands off; renders every SCR-09 state | registered (docs/design-system.md) |

**Presentation revision (2026-10-13, ADR-0010): the chat elements.** Ported from Vercel AI Elements (`vercel/ai-elements` `packages/elements/src` @ `6a9d5b1`, Apache-2.0) onto `@base-ui/react` through `components/ui/*`, in `components/ai-elements/` with `LICENSE` + `NOTICE` and a per-file attribution header. Feature components (`ChatIsland`, `MessageList`, `Composer`, `StartPanel`, `ConversationList`, `OfferedChoices`, `DraftCard`, `InvoicePreviewPanel`, `DashboardAiBlock`) keep their contracts and compose these. Registered in `docs/design-system.md` (T40); where the code as reviewed differs from a row here (the follow context's names, `MessageAvatar`), the row was fixed in the same commit.

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `Conversation` / `ConversationContent` / `ConversationEmptyState` / `ConversationScrollButton` (`conversation.tsx`) | `ScrollArea` is a generic scroll box: it has no follow-latest state, no jump control and no centred-column content slot. Upstream builds on `use-stick-to-bottom` (fixed 70 px threshold), so ours wraps `useFollowLatest` (48 px, reduced motion). Contract: `Conversation` provides the follow context (`isAtBottom`, `scrollToBottom`, from `useFollowLatest`, or the caller's `follow`); `ConversationContent` is the centred `max-w-3xl` column; `ConversationScrollButton` renders only while not at the bottom; `ConversationEmptyState` centres its children both ways | registered (docs/design-system.md) |
| `Message` / `MessageContent` / `MessageAvatar` / `MessageResponse` (`message.tsx`) | `Card` and `Item` carry no sender role or alignment. Contract: `Message` `from: 'user' \| 'assistant'` sets alignment and the `data-role` attribute the tests read; `MessageContent` is the user bubble or the assistant column; `MessageAvatar` is a decorative 24 px `Avatar` with a sparkles mark (`AssistantMark` is the invoices' "AI" badge, not an avatar); `MessageResponse` renders a string as plain text with line breaks kept (no Markdown, HTML or links; AC-07) | registered (docs/design-system.md) |
| `MessageActions` / `MessageAction` (`message.tsx`) | A plain `Button` row has no tooltip-label convention. Contract: `MessageAction` = ghost `Button` `size="sm"` with an icon and a visible label, optional Base UI `Tooltip`; used for "Try again" | registered (docs/design-system.md) |
| `PromptInput` / `PromptInputBody` / `PromptInputTextarea` / `PromptInputFooter` / `PromptInputTools` / `PromptInputSubmit` (`prompt-input.tsx`) | `InputGroup` + `Textarea` give the parts but not the card layout, the Enter / Shift+Enter submit rule or a submit button that reflects the chat `status`. Contract: `PromptInput` is a `form` with `onSubmit(text)`; `PromptInputSubmit` takes `status: 'ready' \| 'submitted' \| 'streaming' \| 'error'` and `disabled`; no attachments. `Composer` and the dashboard prompt box keep their validation and compose it | registered (docs/design-system.md) |
| `Suggestions` / `Suggestion` (`suggestion.tsx`) | An outline `Button` has no "fill, don't send" contract or chip shape. Contract: `Suggestion` `suggestion: string`, `onClick(suggestion)`, `rounded-full` outline `size="sm"`; `Suggestions` is a wrapping row | registered (docs/design-system.md) |
| `Loader` (`loader.tsx`) | `Spinner` alone has no label; upstream `Shimmer` needs `motion`. Contract: `Loader` = `Spinner` + optional visible label ("Thinking…"), `role="status"`, static under reduced motion | registered (docs/design-system.md) |
