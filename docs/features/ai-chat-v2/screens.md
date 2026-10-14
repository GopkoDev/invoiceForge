---
status: draft
feature_size: "L"
tool: "code"
updated_at: "2026-10-14"
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
- **Presentation revision (2026-10-13, ADR-0010).** Behaviour does not change: every state, AC, address, allowance notice, breakpoint, the 48 px follow and reduced motion stay exactly as specified in the rows below. What changes is the presentation, and the chat surface is now composed from our own chat elements in `components/ai-elements/`, ported from Vercel AI Elements onto Base UI (registered in `docs/design-system.md`, §New components):

  | Element (`components/ai-elements/`) | Replaces in the first build | Used by |
  |---|---|---|
  | `Conversation`, `ConversationContent`, `ConversationScrollButton` | the hand-made scroll area and the "Jump to latest" button in `ChatIsland` | SCR-03 (driven by `useFollowLatest`, 48 px) |
  | `ConversationEmptyState` | the centring wrapper of `StartPanel` | SCR-02 |
  | `Message` (`from="user" \| "assistant"`), `MessageContent`, `MessageAvatar`, `MessageResponse` | the bubble markup of `MessageList` | SCR-03, SCR-05 (links and cards sit inside the assistant `MessageContent`) |
  | `MessageActions`, `MessageAction` | the "Try again" button of the error card | SCR-03 `could-not-complete` |
  | `PromptInput`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSubmit` | the markup of `Composer` (its validation, counter and Enter rules stay) | SCR-02, SCR-03 |
  | `Suggestions`, `Suggestion` | the outline buttons of `StartPanel` | SCR-02 |
  | `Loader` | the "Thinking…" `Spinner` row | SCR-03 `waiting` |

  Visual rules that apply everywhere below:
  - **Workspace container.** At `≥ md` the AI section is one bordered, rounded container (`rounded-xl border bg-background`, `overflow-hidden`) inside the content area's padding (16 px), height `calc(100dvh - var(--header-height) - 2 × 16 px)`. The page still never scrolls (spec §6). Below `md` the container drops its border, radius and padding and fills the content area edge to edge. The panes are separated by one vertical border.
  - **Centred column.** In SCR-02 and SCR-03 the messages column and the docked composer are centred in the chat pane with `max-w-3xl` (768 px) and `px-4`; the scroll area itself stays full width, so the scrollbar sits at the pane edge.
  - **Messages.** A Freelancer message is a `MessageContent` bubble aligned right, `bg-secondary text-secondary-foreground`, `rounded-2xl`, `px-4 py-2.5`, max 80 % of the column; never full width and never `bg-primary`. An assistant message is not a bubble: `MessageAvatar` (a 24 px sparkles avatar) then a full-column-width `MessageContent` with `MessageResponse` text. `MessageResponse` renders the reply as safe Markdown (lists, tables, bold, code, in-app links; no headings, no HTML, no images; a single newline shows as a break; ADR-0012). A Freelancer's bubble is plain text with line breaks kept (`whitespace-pre-wrap`), never Markdown. The assistant `MessageContent` holds the Markdown text, then its `ChatLink`s and Draft cards, in part order. The Question form is not in the message: it is docked above the composer (SCR-04).
  - **Errors are messages.** Every failure tied to a turn (`could-not-complete`, `ai-unavailable`, `conversation-gone`, `choice unavailable` — a refused form send) renders as an assistant `Message` in the reply position: the avatar, an inline `Alert` (`destructive` for failures, default with an info icon for `choice unavailable`) holding the copy verbatim, and, where the row offers it, `MessageActions` with a `MessageAction` "Try again" (rotate icon, labelled, not icon-only). No bare full-width card.
  - **Composer.** `PromptInput` is a card on the `InputGroup` primitive (`rounded-2xl border bg-background shadow-xs`): an auto-growing `PromptInputTextarea` (1–8 rows), then a `PromptInputFooter` with `PromptInputTools` on the left (the `AllowanceNotice` counter, `text-xs text-muted-foreground`) and a round `PromptInputSubmit` (`size-8 rounded-full`, arrow-up icon, `aria-label` "Send") on the right. `status` maps `ready` → arrow, `submitted`/`streaming` → disabled with a decorative spinner (no status region of its own: the waiting row's "Thinking…" and the chat's status announce the wait once; the chat sends no stop request; behaviour unchanged), `error` → arrow. The too-long `FieldError` and "{n} / 2,000" sit inside the footer above the tools.
  - **Header.** The chat pane header (`h-12`, bottom border) shows only when there is something to show: the Conversation title (truncated) and the "Conversation actions" `⋯` menu for a saved Conversation; the list button below `md` and in the `md`–`xl` preview layout. On `/ai` before the first save the header is not rendered at `≥ md` (no empty header bar); below `md` it holds only the list button, as before.
- **Owner feedback revision (2026-10-13; spec §1 F10, F13; ADR-0012, ADR-0013).** These rules override the rows they touch below; references: `ref/feedback-2026-10-13-*.png`.
  - **Formatted replies (F10, AC-42–AC-44).** `MessageResponse` renders safe Markdown (ADR-0012), styled with the app tokens, `text-sm leading-6`: paragraphs `my-2` (first/last `0`); `**bold**` `font-semibold`; lists `pl-5 my-2 space-y-1` (`list-disc` / `list-decimal`); tables inside a `overflow-x-auto` wrapper with `rounded-md border`, `text-sm`, header `bg-muted/50 font-medium`, cells `px-3 py-1.5 border-b`, numbers right-aligned when the column is numeric (no auto-detection required; plain left is acceptable); inline code `rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]`; code blocks `rounded-md bg-muted p-3 overflow-x-auto font-mono text-xs`; blockquote `border-l-2 pl-3 text-muted-foreground`; links `text-primary underline underline-offset-4` through `next/link`; a disallowed link renders its text only (no underline, no `title` with the address). No heading larger than `text-base font-semibold` (`h1`–`h3` map to that). Raw HTML shows as literal text. While streaming, an unclosed `**`, `_` or `` ` `` tail renders as typed text (AC-44).
  - **Header line (F13, AC-50).** From `md` the list's top row and the chat header are both `h-12` (48 px) with `border-b`; the search `InputGroup` is `h-8` and the `⋯` button `size-8`, centred vertically with `px-2`. The chat header keeps `h-12`. Both borders sit at y = 48 px of the container.
  - **Persistent list (F13, AC-52; ADR-0013).** The list (SCR-01) is rendered by `ai/layout.tsx` and stays mounted while Conversations are switched; scroll position, search text and row identity are kept; the active row follows the URL at once. Picking a row shows the chat-pane loading state (SCR-03 `loading`) only. List rows change only on the list events (created, touched → moved to the top of Today, renamed, deleted).
  - **Skeletons at final size (F13, AC-51).** Every skeleton reuses the real component's box: list loading lives only on a hard load (top row `h-12`, group label `h-7` = `pt-4 pb-1` + `text-xs` line, rows `h-9` with the real `gap-0.5`, footer with the real button `h-9` and notice lines); the chat pane loading has the real `h-12` header, the real `max-w-3xl px-4` column with message placeholders whose avatar and bubble boxes equal the real ones, and the composer placeholder at the real composer's min height (`min-h-[7.25rem]` incl. footer) with the same bottom padding. `/ai` loading draws the SCR-02 centred greeting/composer at their final positions.
  - **Avatar on the first line (F13, AC-53).** An assistant `Message` is `flex items-start gap-3`; `MessageAvatar` sits in a `h-6` box (one `leading-6` line) with the 24 px avatar centred, so its middle is the first line's middle for one-line and multi-line replies; Markdown's first block has no top margin.
- **Layout and breakpoints** (spec §1, sad.md §5 "Full-height workspace"). `/ai/layout.tsx` drops the scrolling `ContentArea`. `AiWorkspace` (changed) owns the grid: the workspace is a grid of height `calc(100dvh - var(--header-height))` with `overflow-hidden`. Every pane is `min-h-0` with its own `overflow-y-auto` (`ScrollArea`). Breakpoints move from `lg` to `md` (768 px) and `xl` (1280 px):

  | Width | Preview closed | Preview open |
  |---|---|---|
  | `< md` (phone) | chat only; the list opens as a left `Sheet` from a header button | chat; the preview is a full-screen `Sheet` |
  | `md`–`xl` (768–1279) | list (18rem) \| chat | chat \| preview; the list is behind a header toggle that opens it as a left `Sheet` |
  | `≥ xl` (1280+) | list (18rem) \| chat | list (18rem) \| chat \| preview (`minmax(26rem, 40%)`) |

- **Addresses** (ADR-0005): a new Conversation is `/ai` (plus `?start=draft&from=…`). A saved one is `/ai/{id}`. An open preview adds `?preview={cardId}` with `history.pushState`, so Back closes it. Nothing inside the workspace is a route navigation. History writes keep the router in step with the address (no `__NA` keys), so once the first reply saved a Conversation the router knows `/ai/{id}`, and its first revalidating server action (normally Create draft) re-renders that address as the Conversation page, which mounts a new island once. The live chat is handed over to it (messages, a reply in flight, unsent composer text, an open alert), so nothing is lost or sent again, also when the router shows the Conversation page's loading state in between (the live chat waits up to 5 s at that address); only the list's search text and the scroll position reset, and the view follows the end (review 2026-10-13 R1-U2, R2-U1). When the `/ai` page is shown at `/ai/{id}` (a restored history entry), it shows that Conversation's live chat under its header if one is held, reading its cards, links and forms once and putting its row back in the list (R3-U3, R4-U1); otherwise, for example after "New chat" then Back, it shows a skeleton and refreshes once to load the saved Conversation (R2-U3). A Conversation page restored from the router cache that takes over an idle live chat with more saved messages than its props refreshes once; a failed, unsaved exchange does not count, and a reply still in flight or with its finish queued refreshes the page itself when it finishes (R5-U2, R6-U2, R6-U3, R7-1, R7-2). Below md, between the first send and the save (and after a failed first send), the chat pane shows a header row with only the list button (R5-U3).
- **Invoice states** (ADR-0008): the card, its links and the preview panel read one workspace store (`InvoiceStateProvider`). Page loads, `loadInvoicePreview`, `createDraftFromCard` and `issueFromPreview` results feed it. There is no push, so a change made in another tab shows on the next preview load, issue attempt or reopen (sad.md §11 accepted debt).
- **Motion:** two motions exist. The composer moves from the middle to the bottom on the first send (a `transform`/`translate` CSS transition, about 250 ms ease-out, with `motion-reduce:transition-none`, AC-18). Scrolling to the latest message uses `behavior: 'smooth'`, or `'auto'` under reduced motion. Nothing else animates beyond the primitives' defaults (`Sheet` slide, `Dialog` fade).
- **Copy:** where a contract fixes a message (`contracts/openapi.yaml` `/api/chat` 409, `contracts/server-actions.md` `loadInvoicePreview`, `issueFromPreview`), the UI shows the result's `error` **verbatim**. The rest of the copy below belongs to this manifest, and `implement` uses it as written.

## Screens

### SCR-01 — Conversation list (pane on a desktop, sheet on a phone)

`ConversationList` changes (sad.md §5). It reads `listConversationSummaries(actor)` (every summary plus `timeZone`, no paging, server-actions.md), groups the rows on the client by the last message's local day, and filters with the shared `foldName` (ADR-0004). Structure, top to bottom (per `ref/reference-empty-state.png`; pane width 16rem at `≥ md`): a top row with the search `InputGroup` (search icon, placeholder "Search conversations", `aria-label` "Search conversations", a clear `×` button while it has text) and, beside it, the "Conversation actions" `⋯` icon `DropdownMenu` (Delete all, as the parent); the heading "Conversations" stays in the DOM as a visually hidden `h2` (`sr-only`), so the landmark keeps its name. Then the scroll area with the groups, and a footer that is always visible, separated by a top border: a full-width "New chat" `Button` (default variant, plus icon, links to `/ai`) above the parent's retention notice in `text-xs text-muted-foreground`. The `?page=N` links and the `Pagination` are removed. Group headings are small muted labels (`text-xs font-normal text-muted-foreground`, `px-3 pt-4 pb-1`). Each row is a plain one-line link (`h-9 px-3 rounded-md text-sm`, title truncated with the full title and "Last message {d MMM yyyy}" in `title`; no visible date, no border, no card), hover `bg-accent/60`. The open Conversation's row carries `aria-current="page"`, `bg-accent` and `font-medium`. There is **no always-visible delete icon**: each row has a trailing `⋯` icon button (`aria-label` "Actions for {title}") that shows on row hover, on keyboard focus within the row, on the current row, and always on touch devices (`pointer: coarse`). It opens a `DropdownMenu` with "Delete" (destructive), which leads to the parent's delete `ConfirmationModal` unchanged. Opening, listing and searching write and count nothing (Flow 8).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | *(revised 2026-10-13)* Only on a hard load of the AI section (the layout's loading): the `h-12` top row, two group-label skeletons (`h-7` boxes) and six `h-9` row skeletons at the real gaps, and the real footer. Never shown when switching Conversations (AC-51, AC-52) | `Skeleton` | wireframe below |
| switching | *(2026-10-13)* Another row picked: the list keeps its scroll, search and rows; the picked row becomes current at once; only the chat pane loads (AC-52) | `ConversationList` | — |
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

**Greeting** (presentation only; nothing is counted or sent). Line 1, `text-3xl font-medium` (`text-2xl` below `md`): "Good morning, {first name}" from 05:00 to 11:59, "Good afternoon, {first name}" from 12:00 to 17:59, "Good evening, {first name}" otherwise, by the Freelancer time zone at render time, computed on the server (no hydration mismatch). `{first name}` is the first word of the account name; with no name the line is "Good morning" (etc.) with no comma. Line 2, same size: "How can I help with " followed by an accent span "your invoices today?". The accent uses the Terms page title highlight (`legal-hero.tsx`): `animate-gradient-shift bg-linear-to-r from-violet-600 via-fuchsia-500 to-pink-600 bg-clip-text text-transparent` (dark: `from-cyan-400 via-purple-400 to-pink-400`); the gradient stops moving under reduced motion. Until the first message the start composer sits in `NeonBorderWrapper variant="always"` (`rounded-2xl`, as the Terms page's content cards); the docked composer after the first message has no neon border. The line is one `h1` for screen readers. The first build's sub-line ("Ask about your invoices, Customers and payments, or describe an invoice to draft.") is dropped; the placeholder stays "Ask a question or describe an invoice". Nothing is saved until the first message (AC-18). The header shows only the list button (`< md`) and no title. The start point comes from the address (server-actions.md "Addresses and start points").

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

`/ai/{id}` (`[conversationId]/page.tsx` reads `getConversation`, which now returns `forms` (the Conversation's Question forms by id) and message `origin`). The right pane is a column: a header (`h-12`: title, the "Conversation actions" menu as the parent; `< md` and the `md`–`xl` preview layout add the list button on the left), the messages in a `Conversation` / `ConversationContent` scroll area (`flex-1 min-h-0`, full-width scroll, content centred at `max-w-3xl`; a Tab stop: `tabIndex=0`, `role="region"`, `aria-label` "Messages", with an inset `focus-visible` ring, so a Conversation of plain-text replies can be scrolled from the keyboard), and the `PromptInput` composer docked at the bottom, outside the scroll area, centred at the same `max-w-3xl`, with the counter in its footer. Freelancer messages are `Message from="user"`: a right-aligned `bg-secondary` rounded bubble, at most 80 % of the column. A sent Question form shows as the Freelancer's message of "<question> — <answer>" lines, and a pressed v1 choice shows its stored label, like any typed message. Assistant replies are `Message from="assistant"`: the `MessageAvatar` (24 px sparkles avatar) and a full-column `MessageContent` with Markdown `MessageResponse` text followed by its `ChatLink`s and Draft cards (SCR-05) in part order. The latest reply's open Question form is docked above the composer (SCR-04), never in the message.

**Following new text** (AC-16, spec §6). A small in-house hook watches the scroll area. While the end of the messages is within 48 px of view, each new delta scrolls to the bottom within 100 ms. Further up, nothing moves, and the `ConversationScrollButton` "Jump to latest" (round outline icon button with a visible-on-focus label, `aria-label` "Jump to latest", arrow-down icon, `shadow-sm`, centred 12 px above the composer) appears. The hook (`useFollowLatest`) drives the element; `use-stick-to-bottom` is not used (its threshold is fixed at 70 px, ADR-0010). Pressing it scrolls to the bottom and hides it; a keyboard press moves focus to the scroll area, since the button unmounts. It also hides when the Freelancer scrolls back within 48 px. Sending a message always scrolls to the bottom.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight: the existing `[conversationId]/loading.tsx` redrawn inside the grid: three alternating message skeletons and a composer skeleton docked at the bottom | `Skeleton` | — |
| default | `getConversation` → `ok` (AC-15; Flow 7). Saved replies are shown whole (AC-33). An open form of the latest reply docks again from `forms` (SCR-04); sent and older forms show nothing beyond their answer messages. Card and link states come from the store. Scrolled to the newest message on open. Only the messages scroll; the page never scrolls, and the composer stays visible at every height from 360 × 640 up (spec §6) | `ChatIsland`, `MessageList` → `Conversation`, `Message`, `MessageContent`, `MessageAvatar`, `MessageResponse`, `ChatLink`, `DraftCard`, `QuestionForm` (docked), `Composer` → `PromptInput`, `AllowanceNotice`, `ConversationHeader` | wireframe below |
| waiting | As the parent: the message appears at once, then an assistant `Message` with `Loader` "Thinking…", and the submit button and Enter are disabled (`PromptInputSubmit` `status="submitted"`) until the reply completes | `Message`, `Loader`, `PromptInputSubmit` | wireframe SCR-02 |
| streaming | Text deltas render word by word, about 20 ms apart, with the first word not held back (AC-33, spec §6). Never revealed as one block. While streaming, the reply's live region stays silent (parent rule) | `MessageResponse` | — |
| following | Streaming while the end is within 48 px: the view keeps the newest text in view (AC-16) | — | — |
| scrolled up | Streaming or idle while the end is more than 48 px out of view: the view stays put, and "Jump to latest" floats above the composer (AC-16) | `ConversationScrollButton` | wireframe below |
| answered — reads | Read answers (AC-01–AC-03): profiles with their accounts as "Monobank ••••4821 · USD (default)", prices "50.00 USD · 45.00 EUR, custom price for Acme Corp 40.00 USD", Customer names as saved. All are the Assistant's own plain text; the UI adds nothing. No full account number exists in any part (spec §6) | `MessageList` | wireframe below |
| answered — nothing matches | AC-05: the reply says nothing matches, with a page `ChatLink` "Add a Customer →" (`/customers/new`) or "Add a product →" (`/products/new`) from the fixed app map (SCR-15) | `ChatLink` | wireframe below |
| answered — own profile named | AC-05b: an explanation plus a question about which Customer to invoice. No card and no form. Text only | — | — |
| answered — too many | AC-14: more than 8 matches of a name the Freelancer wrote: the form's question offers no options, shows "{n} match. Type a more exact name." and the input only (SCR-04) | — | — |
| answered — only you can issue | AC-24: the parent answer. The invoice `ChatLink` opens the editor, and the card's Preview (SCR-05) stays the way to issue | `ChatLink` | — |
| choice unavailable | `/api/chat` `409` `CHOICE_UNAVAILABLE` after a form send (AC-12b, AC-13). The optimistic answer message is removed. In the reply position, an assistant `Message` holds a non-destructive inline `Alert` (info icon) with the contract sentence verbatim: "This form is no longer available. Answer the latest questions or type your request." No "Try again". The dock comes back with its picks (SCR-04), and the counter is unchanged (a refused send is not counted). Nothing is saved, so a reload drops the notice | `Message`, `Alert` | wireframe below |
| could-not-complete / ai-unavailable | As the parent (copy verbatim, live-region announcement unchanged), for a typed message and a form send alike, but rendered as an assistant `Message` in the reply position: the avatar, an inline destructive `Alert` (alert-circle icon, the parent's sentence, e.g. "The reply couldn't be completed. Try again."), and `MessageActions` with a `MessageAction` "Try again" (rotate icon + text). The Freelancer's message above it stays a normal user bubble. After a failed form send the form is released (ADR-0003, not counted), and the dock comes back with the picks kept (SCR-04). "Try again" re-sends the same thing: the text, or the same `{ formId, answers }`. A new message or another form send instead of Try again keeps the failed exchange discarded (review 2026-10-13 R7-4) | `Message`, `MessageAvatar`, `Alert` (destructive), `MessageActions`, `MessageAction` | wireframe below |
| too-long | As the parent (`FieldError`, count, Send disabled) | `Composer`, `FieldError` | parent |
| used-up | As the parent: `left = 0` on load, or `429` on a typed message **or a form send** (AC-11: a form send counts as exactly one message, like a typed one). On a refused form send, the optimistic answer message is removed, nothing is taken as answered, and the dock comes back with the picks kept (SCR-04). The composer is replaced by `AllowanceNotice` (used-up), docked at the bottom. Draft cards, Preview and Issue keep working (AC-27) | `AllowanceNotice` (used-up) | parent |
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
│▐Invoice Acme for 20 h    [⋯] │      ┊ ✦ Two Customers match "Acme". A few details first.  ┊ │ |
│  Who owes me money?          │      ┊   ( Which Customer is this invoice for? — Acme GmbH )┊ │ |
│ Yesterday                    │      ┊   ( Which bank account should be paid into? —      ) ┊ │ | messages
│  ...                         │      ┊   (   Monobank ••4821 · USD                        ) ┊ │ | scroll on
│                              │      ┊ ✦ Here is the draft for Acme GmbH.                  ┊ │ | their own
│                              │      ┊   ╭───────────────────────────────────────────╮     ┊ │ |
│                              │      ┊   │ Draft card (SCR-05)                       │     ┊ │ v
│                              │      ┊ (an open form of the latest reply docks here, SCR-04) ┊ │
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
| ...older messages in view...               |   | ✦ Which account should be paid into?           |
|                                            |   | ✦ ╭ (i) This form is no longer available.   ╮  |
|                   (↓)                      |   |   │     Answer the latest questions or type │  |
|                                            |   |   ╰     your request.                       ╯  |
| ╭ Ask a question or describe…           (↑) ╮ |   | ╭ question dock, picks kept (SCR-04)    ╮      |
                                                   | ╭ … 27 of 30 messages left today    (↑) ╮      |
                                                   (counter unchanged: a refused send is not counted)

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

### SCR-04 — Question form (docked above the composer in SCR-03)

`QuestionForm` (`components/ai/question-form.tsx`; ADR-0011 as amended 2026-10-14; spec F1–F9a, AC-37–AC-40, AC-54–AC-56; refs `ref/form-wanted-claude.png`, `ref/form-wanted-series.png`, `ref/form-wanted-pager.png`). `ChatIsland` docks the open form of the latest reply (its `data-offer` part; the `FormView` comes from `getConversation` `forms` or, for a new reply, `loadConversationCards`) in a question dock (`data-slot="question-dock"`, `pb-2`) directly above the composer, in the same docked `max-w-3xl px-4` column. It is never inside the message: the reply's text stays in the stream, and at most one form is docked.

- **Header row:** the current question's `prompt` (`text-sm font-medium`, plain text, never Markdown; the system's default English question when the chat gave none, e.g. "Which Customer is this invoice for?"; no field heading) on the left; on the right the pager `‹ {n} of {total} ›` (ghost chevron icon buttons "Previous question" / "Next question" around a muted `tabular-nums` counter; none for a one-question form) and a close × ("Close questions").
- **Body:** a `role="radiogroup"` labelled by the question, one numbered row per option: a number badge (1–8), the server's `label` verbatim and its muted `detail` line under it (Customer email, else country; product price in the app format; bank account "CUR ••last4"; AC-54). Hover, focus and the picked row are `bg-muted` with a → arrow; rows are divided by a border. The last row is a pencil badge with "Something else" (when the question takes a typed answer); it turns into the inline input in place. An optional question has **Skip** (secondary, `size="sm"`) at the right end of that row. A question with no options shows the input row directly, with "{n} match. Type a more exact name." above it when `matchCount` is set (AC-14). The body scrolls inside `max-h-[40dvh]` below `md` and `max-h-[50dvh]` from `md`.
- **Input kinds:** always a one-line `Input` (no `Textarea`) with a ↵ "Confirm answer" icon button. `AMOUNT` / `RATE` / `DISCOUNT` use `inputMode="decimal"`; a PRICE or DISCOUNT question shows the invoice currency (`FormView.currency`) as a suffix and a tax RATE question "%", both part of the input's accessible description; `DATE` adds a "Pick a date" calendar button (`Popover` + `Calendar`) beside the `YYYY-MM-DD` input. Placeholders: "Something else" (opened from the row), else "Type your answer" / "Type an amount" / "YYYY-MM-DD".
- **Picking:** a pick (an option, a confirmed typed answer, or Skip) is held in the component and moves to the next unanswered question; the pager moves freely and keeps earlier picks. When a pick leaves no later question unanswered and every required one answered, the form sends at once. There is no Send button.
- **Validation** (spec F6), on confirm and on blur, with `FieldError` under the row (`aria-describedby`, `aria-invalid`): "Enter a number greater than 0, with at most 2 decimals." · "Enter a rate from 0 to 100." · "Enter 0 or more, with at most 2 decimals." · "Pick a real day." · "The due date can't be before the issue date." · "Keep it under {n} characters.". An invalid answer is not taken; a send that would carry one opens that question instead.
- **Sending** posts `{ conversationId, message, form: { formId, answers } }` (openapi `ChatForm`). The server ignores the browser's text and composes the Freelancer's message from the stored labels: one line per answered question, "<question> — <answer>" (the option's label, the typed text on one line, or "Skipped"), e.g. "Which Customer is this invoice for? — Acme GmbH". A form send counts as exactly one message (AC-11).
- **Dates and amounts** in labels use the app formats ("Today · Oct 14, 2026", "Yesterday · Oct 13, 2026", "7 days after the issue date"); all form chrome is English (AC-56).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | A new reply's `data-offer` part arrived; its `FormView` loads with `loadConversationCards` after `finish`: an `h-40 rounded-xl` `Skeleton` in the dock (`aria-busy`) | `Skeleton` | — |
| load failed | `loadConversationCards` rejects or fails: an inline `Alert` "Couldn't load the question." with "Try again", which re-runs the load; the composer stays usable (T87) | `Alert`, `Button` | — |
| open | `state = OPEN`, the latest reply, not closed in this page view: question 1, nothing picked; the composer below keeps its placeholder (AC-37, AC-55) | `QuestionForm`, `Button`, `Input` | wireframe below |
| answering | Some questions picked: the pager shows the current one, earlier picks kept. Picks live only in the component: lost on reload, on leaving the Conversation and on a typed message (F8) | `QuestionForm` | wireframe below |
| Something else | The row opened: the inline input, focused; Enter or ↵ confirms; Escape closes it and clears its text and that question's pick (AC-38) | `Input`, date picker | wireframe below |
| field invalid | A typed answer fails its kind's check: the message under the row, nothing sent (AC-38) | `FieldError` | wireframe below |
| in flight | The last pick sent the form: the dock is hidden at once; only the answer message shows in the stream, then "Thinking…" and the reply (SCR-03 `waiting`). No "Sending…" state. Focus moves to the Message box when the reply ends (AC-55) | — | wireframe below |
| refused — invalid | `400` with `fieldErrors['form.answers.<id>']`: the dock comes back with the picks kept and opens the first named question with its message; nothing counted | `FieldError` | — |
| refused or failed | `409` (SCR-03 `choice unavailable`: a non-destructive notice, no "Try again"), `429` (SCR-03 `used-up`: the allowance notice), or a network error, could-not-complete or ai-unavailable (SCR-03 failure notice with "Try again"): the optimistic answer message is removed (after could-not-complete it stays, with the error message under it), and the dock comes back with the picks kept and the error shown. "Try again" (failure notice only) re-sends the same form. Focus moves to the Message box | `Alert`, `MessageAction` | SCR-03 |
| closed (×) | × hides the dock for this page view without sending; focus moves to the Message box. The form stays open on the server, so a reload or reopening the Conversation docks it again | — | — |
| reopened | Reload or reopen with the latest reply's form still `OPEN`: it docks again from `getConversation` `forms`, at question 1 with no picks (AC-13). Switching Conversations never carries a form over | `QuestionForm` | — |
| typed instead | A message typed and sent in the Message box closes the open form with no answer (AC-40); the dock goes away and the picks are not saved | — | — |
| legacy one-question | The latest reply holds an `OPEN` pre-revision offer (F9a): it docks as a one-question, options-only form (no pager, no "Something else") | `QuestionForm` | — |
| history | A sent, closed or older form renders nothing in the stream; the history shows only the answer message. A pressed v1 choice is a plain Freelancer bubble with its stored label (AC-12, F9) | — | — |
| empty | N/A: a form always has 1–6 questions (openapi `FormView`) | — | — |
| error | N/A beyond `load failed`: send outcomes route to SCR-03 | — | SCR-03 |

**Keyboard.** One row is the Tab stop (roving `tabindex`); ↑/↓ move between rows (wrapping), Enter or Space picks, 1–9 picks that numbered option (not while typing in an input); Escape closes the "Something else" input. After a pick, focus follows to the next question's row; the dock's first appearance leaves focus where it is.

**Accessibility.** The radiogroup is labelled by the question; the picked row is `aria-checked="true"`; the question line is `aria-live="polite"`, so the next question is announced; every icon button has a name ("Previous question", "Next question", "Close questions", "Confirm answer", "Pick a date"); the row and detail text meet contrast (T83).

**Phone** (`< md`). The same dock, full column width inside the 16 px gutter; its body scrolls within `40dvh`, so the reply above stays readable at 360 × 640.

```text
open, question 1 of 3 (AC-55, AC-56)
| ✦ Let's draft it. A few details first.                                |  <- the reply text stays in the stream
|                                                                       |
| ╭───────────────────────────────────────────────────────────────────╮ |  question dock
| │ Which Customer is this invoice for?               ‹  1 of 3  ›  × │ |
| │ [1] Acme GmbH                                                   → │ |  focused / picked row: bg-muted + →
| │     billing@acme.de                                               │ |  muted detail line
| │───────────────────────────────────────────────────────────────────│ |
| │ [2] Acme Corp                                                     │ |
| │     Germany                                                       │ |
| │───────────────────────────────────────────────────────────────────│ |
| │ [✎] Something else                                                │ |
| ╰───────────────────────────────────────────────────────────────────╯ |
| ╭ Ask a question or describe an invoice                          (↑) ╮ |
| ╰ 26 of 30 messages left today                                       ╯ |

question 2 of 3, input only, invalid (AC-38)  question 3 of 3
| What price for line 1?    ‹ 2 of 3 ›  × |   | What is the issue date?   ‹ 3 of 3 ›  × |
| [✎] [ forty                  ] USD  ↵   |   | [1] Today · Oct 14, 2026                 |
| ⚠ Enter a number greater than 0, with   |   | [2] Yesterday · Oct 13, 2026             |
|   at most 2 decimals.                   |   | [✎] Something else                       |
                                              an optional question adds [Skip] on the right of the last row

in flight (the dock is hidden), then the history
|               ( Which Customer is this invoice for? — Acme GmbH ) |
|               ( What price for line 1? — 40                     ) |
|               ( What is the issue date? — Today · Oct 14, 2026  ) |
| ✦ (◌) Thinking…                                                   |
| ╭ Ask a question or describe an invoice                      (↑) ╮ |   no dock
```

### SCR-05 — Draft card (inline in SCR-03, existing, extended)

`DraftCard` keeps every parent state (ai-assistant screens.md SCR-03: live, creating, replaced, outdated, needs-answers, not-found, create-failed, rejected). The changes:
- Once the card is created, it gets a **"Preview"** `Button` (outline, eye icon) beside the editor link. Preview pushes `?preview={cardId}` (ADR-0005).
- The created states read the invoice's status from the workspace store (ADR-0008) instead of only the page load.
- Presentation (ADR-0010): the card sits inside the assistant `MessageContent`, full column width (`max-w-3xl` column), `rounded-xl` with the container's border colour, so cards, links and text share one left edge. States and copy are unchanged.

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

### SCR-09 — Dashboard AI block (removed 2026-10-14)

Removed by the owner on 2026-10-14 (fix [2026-10-14-question-form-ux](_fixes/2026-10-14-question-form-ux.md), T80; ADR-0009 Superseded): the dashboard "Ask AI" card (prompt box, latest Conversations, "none yet", the allowance line) and the prompt hand-off to the AI section are gone. What stays on the dashboard is the `DashboardHeader`'s "Create invoice with AI" `buttonVariants({ variant: 'outline' })` link (sparkles icon), just before "Create Invoice", to `/ai?start=draft&from=dashboard`: it opens a new Conversation (SCR-02 `start=draft`, start point `DASHBOARD_CREATE`; with `left = 0` SCR-02 `used-up from Create with AI`) (AC-30). On a phone both buttons wrap under the filters. The Connect-AI banner is unchanged. Messages and Conversations stored earlier with origin `DASHBOARD` / start point `DASHBOARD_PROMPT` stay readable and exported for history; a chat request can no longer carry them (T85).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Signed in on the dashboard: "Create invoice with AI" beside "Create Invoice" | `DashboardHeader`, `buttonVariants` link | — |
| loading / error / empty | N/A: a static link in the existing header | — | — |

### SCR-10 — Invoice editor (existing)

The UI is unchanged. It is reached from "Open in editor" (SCR-05, SCR-06) and "Create it by hand →" (SCR-02). An invoice issued from the chat shows in the editor's `issued` mode, with no Assistant mark (AC-23, ai-assistant ADR-0013).

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
1. **What is stored:** Conversations with their messages and draft cards; the Question forms the chat showed (their questions and options) and the answers sent; whether each message was typed or a form's answers (messages from before the forms or the removed dashboard prompt may read pressed or sent from the dashboard); and where each Conversation was started.
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
| export downloaded | The existing download flow. The file is `exportVersion` `2.4`: every Conversation gains `startedFrom`; every message gains `origin` and its reply's `form` (state, questions with `prompt` and options `{ optionId, label }`, and the answers sent, an option answer with its `label`; no `heading`) plus, for a v1 Conversation, the legacy `offer` (labels, state, chosen option); invoices gain `issuedFromChat` | `GdprSettings` | existing |
| account deleted | The existing confirmation. Question forms (and legacy offers), origins and start points go with their Conversations (cascade) | `ConfirmationModal` | existing |
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
| `OfferedChoices` *(removed 2026-10-13)* | The first build's one-choice buttons under a reply; replaced by `QuestionForm` (ADR-0011). A legacy offer is shown by `QuestionForm` as a one-question, options-only form while it is open, and as nothing in history (SCR-04) | removed from the registry |
| `QuestionForm` *(2026-10-13; docked 2026-10-14)* | No primitive renders a server-built form of 1–6 questions one at a time with numbered single-select rows and a detail line, a "Something else" typed answer, Skip, per-kind validation and one structured submit `{ formId, answers }` sent by the last pick. `RadioGroup` + `Input` + `Field` give the parts, not the pager, keyboard picking or the send-on-last-answer flow. Contract: props `form: FormView \| undefined` (undefined → skeleton), `isLatest: boolean`, `onSend(formId, answers, composedText)`, `fieldErrors?` (a server 400's `form.answers.<id>` messages), `onClose?()` (the ×); editable only when `form.state = 'OPEN' && isLatest`, else it renders nothing; labels, details and prompts verbatim as plain text; the PRICE and DISCOUNT inputs' currency suffix from `form.currency`; SCR-04 states. `ChatIsland` docks it above the composer and owns hiding, × and load failure | registered (docs/design-system.md) |
| `ConversationListProvider` *(2026-10-13)* | Non-visual (ADR-0013). `NewConversationProvider` carries only the unsaved new row; the list now lives in the layout and must take events from the chat pane. Contract: seeded with `{ items, timeZone }`; `conversationCreated`, `conversationTouched`, `conversationRenamed`, `conversationsDeleted`; `useConversationList()` | to register by the implementing task |
| `MessageResponse` *(changed 2026-10-13)* | Renders safe Markdown (ADR-0012) instead of plain text; contract `children: string`, `streaming?: boolean` (enables the unfinished-tail rule) | update the registry row |
| `InvoicePreviewPanel` | The existing `InvoicePdfPreviewModal` is a modal `Dialog` from the global modal store. It would cover the messages (AC-20 needs them visible) and has Download/Print instead of Open in editor / Issue, plus none of the unavailable / not-found / outdated / blocked states. `PDFPreviewPanel` (the document) is reused inside. Contract: props `cardId`, `variant?: 'column' \| 'sheet'` (closing goes through the address, `closePreview`); loads with `loadInvoicePreview`, renders as a grid column at `≥ md` and a full-screen `Sheet` below, feeds the invoice-state store, opens SCR-07, and renders every SCR-06 state | registered (docs/design-system.md) |
| `IssueConfirmation` | `ConfirmationModal` takes a `body` slot. This is that body: Customer, total and currency from the loaded preview plus the fixed "can no longer change" sentence, so every issue path shows the same figures (AC-23, AC-26b). Contract: props `customerName`, `total`, `currency` | registered (docs/design-system.md) |
| `InvoiceStateProvider` | Non-visual (ADR-0008). The card, the chat links and the panel are siblings in the island and must show one invoice status fed by loads and action results. `NewConversationProvider` carries Conversation rows only. Contract: `useInvoiceState(invoiceId)` → `LinkedInvoiceState \| undefined`; `apply(invoiceId, state)` from loads, `createDraftFromCard`, `loadInvoicePreview` and `issueFromPreview` results | registered (docs/design-system.md) |

**Presentation revision (2026-10-13, ADR-0010): the chat elements.** Ported from Vercel AI Elements (`vercel/ai-elements` `packages/elements/src` @ `6a9d5b1`, Apache-2.0) onto `@base-ui/react` through `components/ui/*`, in `components/ai-elements/` with `LICENSE` + `NOTICE` and a per-file attribution header. Feature components (`ChatIsland`, `MessageList`, `Composer`, `StartPanel`, `ConversationList`, `QuestionForm`, `DraftCard`, `InvoicePreviewPanel`) keep their contracts and compose these. Registered in `docs/design-system.md` (T40); where the code as reviewed differs from a row here (the follow context's names, `MessageAvatar`), the row was fixed in the same commit.

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `Conversation` / `ConversationContent` / `ConversationEmptyState` / `ConversationScrollButton` (`conversation.tsx`) | `ScrollArea` is a generic scroll box: it has no follow-latest state, no jump control and no centred-column content slot. Upstream builds on `use-stick-to-bottom` (fixed 70 px threshold), so ours wraps `useFollowLatest` (48 px, reduced motion). Contract: `Conversation` provides the follow context (`isAtBottom`, `scrollToBottom`, from `useFollowLatest`, or the caller's `follow`); `ConversationContent` is the centred `max-w-3xl` column; `ConversationScrollButton` renders only while not at the bottom; `ConversationEmptyState` centres its children both ways | registered (docs/design-system.md) |
| `Message` / `MessageContent` / `MessageAvatar` / `MessageResponse` (`message.tsx`) | `Card` and `Item` carry no sender role or alignment. Contract: `Message` `from: 'user' \| 'assistant'` sets alignment and the `data-role` attribute the tests read; `MessageContent` is the user bubble or the assistant column; `MessageAvatar` is a decorative 24 px `Avatar` with a sparkles mark (`AssistantMark` is the invoices' "AI" badge, not an avatar); `MessageResponse` renders a string as plain text with line breaks kept (no Markdown, HTML or links; AC-07) | registered (docs/design-system.md) |
| `MessageActions` / `MessageAction` (`message.tsx`) | A plain `Button` row has no tooltip-label convention. Contract: `MessageAction` = ghost `Button` `size="sm"` with an icon and a visible label, optional Base UI `Tooltip`; used for "Try again" | registered (docs/design-system.md) |
| `PromptInput` / `PromptInputBody` / `PromptInputTextarea` / `PromptInputFooter` / `PromptInputTools` / `PromptInputSubmit` (`prompt-input.tsx`) | `InputGroup` + `Textarea` give the parts but not the card layout, the Enter / Shift+Enter submit rule or a submit button that reflects the chat `status`. Contract: `PromptInput` is a `form` with `onSubmit(text)`; `PromptInputSubmit` takes `status: 'ready' \| 'submitted' \| 'streaming' \| 'error'` and `disabled`; no attachments. `Composer` keeps its validation and composes it | registered (docs/design-system.md) |
| `Suggestions` / `Suggestion` (`suggestion.tsx`) | An outline `Button` has no "fill, don't send" contract or chip shape. Contract: `Suggestion` `suggestion: string`, `onClick(suggestion)`, `rounded-full` outline `size="sm"`; `Suggestions` is a wrapping row | registered (docs/design-system.md) |
| `Loader` (`loader.tsx`) | `Spinner` alone has no label; upstream `Shimmer` needs `motion`. Contract: `Loader` = `Spinner` + optional visible label ("Thinking…"), `role="status"`, static under reduced motion | registered (docs/design-system.md) |
