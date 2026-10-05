---
status: draft
feature_size: "M"
tool: "code"
updated_at: "2026-10-05"
---

# Screens — mcp-server

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code, from `docs/design-system.md` (a code-only canon). This is the canon's tool, not a degradation.
- **File:** the wireframes are inline below.
- **Component inventory:** the canon registers `LoadError` and `ConfirmationModal`. Everything else is named from the code's de-facto inventory:
  - the `components/ui/*` primitives: `Alert`, `Badge`, `Button` / `buttonVariants`, `Card`, `Combobox`, `Empty`, `Field` / `FieldLabel` / `FieldDescription` / `FieldError`, `Input`, `InputGroup`, `Item`, `Skeleton`, `Spinner`, `Tabs`, `Tooltip`, `Sonner` toasts;
  - the app components `DashboardSetupAlert`, the dashboard section skeletons, `InvoiceStatusBadge`, `InvoiceRowActions`, `InvoicesDataTable`, `InvoicesEmptyState`, `InvoicesTableSkeleton`, `RelatedInvoicesList`, `InvoiceEditor`, `InvoiceEditorLoading`, `ProfileSettings`, `ProfileSettingsLoading`, `GdprSettings`, `LoginForm`, `ContentAreaNotFound`, and each route's existing `loading.tsx` / `error.tsx` / `not-found.tsx`.
  - The `components/assistants/` files named in sad.md §5 (key list, create form, one-time key reveal, setup steps, example prompts) are **compositions** of the primitives above, not new primitives. `implement` decides the file split.
- **Posture:** responsive-both (`ux-flows.md` §Platform decisions). Every state works at desktop and phone widths. The new Settings nav item joins the existing nav, which scrolls sideways on a phone.
- **Strings:** inline, because the app has no i18n layer. Where the contract fixes a message (`contracts/server-actions.md`: `KEY_NAME_MESSAGE`, `KEY_LIMIT_MESSAGE`, `TIME_ZONE_MESSAGE`, the `updateInvoiceStatus` refusal, `'Key not found.'`, `'Could not create the key. Try again.'`), the UI shows it **verbatim** from the result's `error` / `fieldErrors`. The other copy below is this manifest's, and `implement` uses it as written.
- **Dates:** every date and time shown is in the Freelancer time zone (UTC until one is saved), in the app's existing date format.
- **Error routing** (unchanged repo convention, architecture-hardening ADR-0009):
  - `UNAUTHORIZED` or a rejected call goes to sign-in (SCR-10) through `redirectIfUnauthorized` / `goToSignIn()`.
  - A failed page read goes through `unwrapPageResult` to the segment's existing `error.tsx` (`LoadError`).
  - `VALIDATION` with `fieldErrors` shows a `FieldError` next to its field.
  - `NOT_FOUND`, `CONFLICT` and `FAILED` on a form or action show as described per screen below.
- **Resolved here:** api-sync-report **OQ-A1**. The `get_invoice` link opens the existing editor `/invoices/{id}/edit` (SCR-07). Its header `Badge` already labels a draft or cancelled invoice (AC-19), and no read-only mode is added.
- **Copy owned here:** the overdue-rule notice (server-actions.md "Notice copy is owned by `screens`"), the entry point, the setup steps and the example prompts.

## Screens

### SCR-01 — Dashboard

Changed: two dismissable banners and the derived overdue status. The figures, Debtors, Expected payments, chart and recent invoices keep their layout.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing dashboard section skeletons (unchanged) | existing |
| default | Loaded. "Today", month boundaries and overdue use the Freelancer time zone (AC-22, AC-23, AC-23b). A pending invoice past its due date counts in the overdue figures, its Customer is a Debtor, it is left out of Expected payments, and recent invoices show it with the `Overdue` badge (AC-24; flow 13). Currency tabs cover bank-account and issued-invoice currencies (ADR-0008) | existing sections, `InvoiceStatusBadge` | wireframe below |
| period preset | A preset click sends `?preset=<name>` (`this-month`, `last-month`, `next-month`, `this-year`, `last-year`), and the server resolves its days in the account time zone (AC-22, AC-23). The pressed preset is derived from the applied period and "today", so it survives a reload; a period no preset matches shows as custom. Chart ticks and tooltips label each stored day by its calendar day (`formatStoredDay`), in any browser zone | existing date filter and chart (`dashboard-filters.tsx`, `dashboard-chart.tsx`) | existing |
| default + entry point | `hasUsedAnyPersonalKey` → `false` (AC-01; flow 3 `alt`). Gone for good once any key has passed a key check, even if every key is later revoked | `Alert`, `buttonVariants` link → SCR-03 | wireframe below |
| default + overdue-rule notice | `getDashboardNoticeState` → `showOverdueRuleNotice: true` (spec §8 default; server-actions "Overdue-rule notice") | `Alert`, `Button` ("Got it") | wireframe below |
| notice dismissed | "Got it" → `dismissOverdueRuleNotice` → `ok()`. The notice disappears and never returns, on any device | — | — |
| notice dismiss failed | `dismissOverdueRuleNotice` → `FAILED`: `toast.error` with the result's `error`, and the notice stays. `UNAUTHORIZED` → sign-in | `Sonner` | — |
| default (UTC) | No time zone saved and the browser reports none (AC-22; flow 12 `else`). Same layout, computed in UTC. There is no extra hint on the dashboard; Profile settings say "Not set yet" (SCR-02) | as default | — |
| empty | No invoices or bank accounts yet: the existing per-section empty states (unchanged). The entry point still shows under its own condition | existing | existing |
| error | A section, the entry-point read or the notice-state read fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`), as for every other dashboard read | `LoadError` | existing |

Order below the header: `DashboardSetupAlert` (when setup is incomplete) → overdue-rule notice → Connect your AI entry point → sections.

```text
+--------------------------------------------------------------+
| Dashboard            [USD | EUR]          [This month v]     |
|--------------------------------------------------------------|
| (i) Overdue is now automatic                        [Got it] |
|     Pending invoices past their due date now count as        |
|     overdue on their own: here, in your invoice list and in  |
|     your AI assistant's answers. The invoice itself doesn't  |
|     change, and you can still mark it paid.                  |
|--------------------------------------------------------------|
| (*) Connect your AI                                          |
|     Ask Claude or Cursor who owes you money and what's       |
|     coming in, straight from your invoiceFlow data.          |
|     Read-only.                         [Connect your AI ->]  |
|--------------------------------------------------------------|
| [Invoiced] [Paid] [Overdue 1 240.00] [Pending]               |
| ...chart...                                                  |
| Debtors                       | Expected payments            |
|  Acme GmbH   1 240.00  12 d   |  (Acme invoice left out)     |
| Recent invoices                                              |
|  INV-0042  Acme GmbH  1 240.00  [Overdue]                    |
+--------------------------------------------------------------+
  Phone: the two banners stack full-width; buttons go below the text.
```

### SCR-02 — Profile settings

Changed: a new "Time zone" card under the existing profile card. It has its own Save and calls `updateTimeZone`, separate from the profile form.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | `ProfileSettingsLoading` + one more `Skeleton` card | existing + wireframe below |
| default | `getProfile().timeZone` is set. The `Combobox` shows it and searches the zone list by name or city (AC-22) | `Card`, `Field`, `FieldLabel`, `FieldDescription`, `Combobox`, `Button` | wireframe below |
| not-set | `timeZone` is `null` (not saved yet; flow 12 "no zone saved and none reported"). The `Combobox` is empty, and the description says UTC is used | as default | wireframe below |
| saving | Save clicked: `Spinner` in Save; Save and the `Combobox` are disabled | `Spinner` | — |
| success | `updateTimeZone` → `ok()`: `toast.success` "Time zone saved." The card shows the new zone, and the next dashboard request and Assistant call use it (AC-22) | `Sonner` | — |
| validation | `updateTimeZone` → `VALIDATION` (flow 12 `alt` "not a known time zone"): `FieldError` with `TIME_ZONE_MESSAGE` verbatim. Nothing saved | `FieldError` | wireframe below |
| error | `FAILED` → `toast.error` with the result's `error`; `UNAUTHORIZED` → sign-in. Page load failure → existing `error.tsx` | `Sonner`, `LoadError` | existing |
| empty | N/A: a signed-in Freelancer always has a profile | — | — |

```text
+--------------------------------------------------------------+
| Settings                                                     |
| [Profile] [Privacy] [Connect your AI]                        |
|--------------------------------------------------------------|
| Profile information  (existing card, unchanged)              |
|--------------------------------------------------------------|
| Time zone                                                    |
| Used for "today", month boundaries and overdue on your       |
| dashboard and in your AI assistant's answers.                |
| [ Europe/Kyiv (UTC+03:00)                    v ]   [Save]    |
+--------------------------------------------------------------+
  not-set:    [ Choose a time zone               v ]   [Save]
              Not set yet. UTC is used until you choose one.
  validation: [ Mars/Olympus                     v ]   [Save]
              ! Choose a time zone from the list.
```

### SCR-03 — Connect your AI

New page at `/settings/assistants`, a Settings nav item "Connect your AI" next to Profile and Privacy (AC-01). Sections top to bottom: create form → one-time key reveal (only after a create) → setup steps → example prompts → active keys → revoked keys.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight: new `loading.tsx` with a form skeleton and three row skeletons | `Skeleton` | — |
| default | `listPersonalKeys` → at least one key (AC-05; flow 3). **Active keys** (`createdAt` DESC): name · "Created {date}" · `••••{lastFour}` · "Last used {date, time}" or "Never used" · Revoke. **Revoked keys** (`createdAt` DESC): name · `••••{lastFour}` · "Revoked {date}", with no action (AC-06). The setup steps and example prompts are always here (ux-flows §Platform decisions) | `Card`, `Field`, `Input`, `Button`, `Tabs`, `InputGroup`, `NEW: CopyButton`, `Item`, `Tooltip` | wireframe below |
| empty | No keys, active or revoked: the active list shows `Empty` "No keys yet. Create one above to connect your first assistant." The revoked section is hidden while it has no rows | `Empty` | wireframe below |
| creating | Create clicked: `Spinner` in Create; Create and the name `Input` are disabled | `Spinner` | — |
| key-created | `createPersonalKey` → `ok({ key, fullKey })` (AC-02; flow 4 happy path). A reveal `Alert` shows `fullKey` in a read-only `InputGroup` with a `CopyButton`, plus the warning. While the reveal is visible, the setup snippets fill in `fullKey` instead of `YOUR_KEY`. The new key heads the active list as "Never used". The name `Input` is cleared. The reveal stays until the Freelancer leaves the page; a second create replaces it with the newer key. After leaving, the key shows only as name, date and `••••lastFour` | `Alert`, `InputGroup`, `NEW: CopyButton`, `Item` | wireframe below |
| validation | `VALIDATION` with `fieldErrors.name` (empty, > 50 characters after trimming, or the same name as another active key ignoring case: AC-03; flow 4 both name branches). `FieldError` with `KEY_NAME_MESSAGE` verbatim, the typed name kept, nothing created. The client runs `personalKeyNameSchema` first and shows the same message | `FieldError` | wireframe below |
| limit | `CONFLICT` (10 active keys: AC-04; flow 4 limit branch). A destructive `Alert` above the form shows `KEY_LIMIT_MESSAGE` verbatim, nothing is created, and the revoke actions below stay available. The `Alert` clears on the next submit or after a revoke | `Alert` | wireframe below |
| create-failed | `FAILED`: `toast.error` "Could not create the key. Try again." (verbatim). The name is kept | `Sonner` | — |
| revoked | SCR-04 confirmed → `revokePersonalKey` → `ok()` (AC-06; critical flow 2). The row moves to Revoked keys with today's date, with no reactivate action, and `toast.success` "Key revoked." If that key's reveal is still visible, the reveal disappears too | `Item`, `Sonner` | — |
| revoke-not-found | `revokePersonalKey` → `NOT_FOUND` (already revoked in another tab, or unknown): `toast.error` "Key not found." verbatim, and the list refreshes | `Sonner` | — |
| copied | See `CopyButton` in §New components: icon → check and "Copied" for 2 s. If the clipboard is unavailable: `toast.error` "Couldn't copy. Select the text and copy it by hand." | `NEW: CopyButton` | — |
| error | `listPersonalKeys` fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`). An `UNAUTHORIZED` result from any action → sign-in | `LoadError` | existing |

**Setup steps** (one `Tabs` panel per launch client, sad.md §11; each snippet in a monospace block with a `CopyButton`; `{origin}` is the app origin, `YOUR_KEY` is replaced while the reveal is visible). Each panel's first line says the key is kept in a user-level, private setting and not in a project file (AC-02). The exact snippet text is checked against each client at `ship` (api-sync-report OQ-A2).

- **Claude Code:** run in a terminal:
  `claude mcp add --transport http --scope user invoiceflow {origin}/api/mcp --header "Authorization: Bearer YOUR_KEY"`
- **Cursor:** add to the global `~/.cursor/mcp.json` (not the project's `.cursor/mcp.json`):
  `{ "mcpServers": { "invoiceflow": { "url": "{origin}/api/mcp", "headers": { "Authorization": "Bearer YOUR_KEY" } } } }`
- **Claude Desktop:** needs Node.js. Add to `claude_desktop_config.json` (Settings → Developer → Edit config), then restart Claude Desktop:
  `{ "mcpServers": { "invoiceflow": { "command": "npx", "args": ["mcp-remote", "{origin}/api/mcp", "--header", "Authorization:${AUTH}"], "env": { "AUTH": "Bearer YOUR_KEY" } } } }`

**Example prompts** (three, each with a `CopyButton`; one per launch tool family: overdue/Debtors, Expected payments, summary figures):

1. "Who owes me money right now, and how many days overdue is each invoice?"
2. "Which payments am I expecting this month?"
3. "Give me this month's totals: invoiced, paid and overdue."

```text
+--------------------------------------------------------------+
| Settings                                                     |
| [Profile] [Privacy] [Connect your AI]                        |
|--------------------------------------------------------------|
| Connect your AI                                              |
| Let Claude or Cursor read your invoices and answer money     |
| questions. Keys are read-only: an assistant can't change or  |
| send anything.                                               |
|                                                              |
| Key name                                                     |
| [ Laptop assistant                     ]  [Create key]       |
| 1 to 50 characters, e.g. the device or assistant it's for.   |
|--------------------------------------------------------------|
| Set up your assistant                                        |
| [Claude Desktop | Claude Code | Cursor]                      |
|  Keep the key in your user settings, never in a project file.|
|  +--------------------------------------------------------+  |
|  | claude mcp add --transport http --scope user           |  |
|  |   invoiceflow https://.../api/mcp --header             |  |
|  |   "Authorization: Bearer YOUR_KEY"              [Copy] |  |
|  +--------------------------------------------------------+  |
|                                                              |
| Try asking                                                   |
|  "Who owes me money right now, and how many..."      [Copy]  |
|  "Which payments am I expecting this month?"         [Copy]  |
|  "Give me this month's totals: invoiced, paid..."    [Copy]  |
|--------------------------------------------------------------|
| Active keys (2 of 10)                                        |
|  Laptop assistant   Created 1 Oct 2026   ••••3f9K            |
|                     Last used 4 Oct 2026, 14:05   [Revoke]   |
|  Work Cursor        Created 2 Oct 2026   ••••a7Qm            |
|                     Never used                    [Revoke]   |
|                                                              |
| Revoked keys                                                 |
|  Old laptop         ••••Zx01   Revoked 3 Oct 2026            |
+--------------------------------------------------------------+
  Phone: each key row stacks name / meta lines / a full-width
  [Revoke]; the snippet block scrolls sideways inside itself.
```

```text
key-created (reveal above the setup steps)
+--------------------------------------------------------------+
| (!) Your new key "Laptop assistant"                          |
|     Copy it now. You won't be able to see it again.          |
|     [ ifk_8Hq2...........................................  ] |
|                                                    [Copy]    |
+--------------------------------------------------------------+
  Setup snippets below now read "Bearer ifk_8Hq2..." instead of
  "Bearer YOUR_KEY". The list shows: Laptop assistant ••••3f9K
  Never used [Revoke].

empty
| Active keys                                                  |
|   [key icon]  No keys yet                                    |
|   Create one above to connect your first assistant.          |
  (no "Revoked keys" section)

validation (AC-03)
| Key name                                                     |
| [ laptop ASSISTANT                     ]  [Create key]       |
| ! The name must be 1 to 50 characters and different from     |
|   your other active keys.                                    |

limit (AC-04)
| (x) At most 10 keys can be active at once. Revoke one to     |
|     make room.                                               |
| Key name                                                     |
| [ Tablet                               ]  [Create key]       |
```

### SCR-04 — Revoke key confirmation

The existing `ConfirmationModal`, opened by Revoke on an active key row of SCR-03.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Revoke clicked on a row (AC-06 "revokes and confirms"; flow US-02) | `ConfirmationModal` (destructive confirm) | wireframe below |
| cancelled | Cancel, Esc or a click outside: the dialog closes and the key stays active | `ConfirmationModal` | — |
| pending | Async `onConfirm` → `revokePersonalKey(id)` in flight: `Spinner` in Revoke, both buttons disabled, the dialog stays open | `ConfirmationModal`, `Spinner` | — |
| success | `ok()`: the caller closes the dialog → SCR-03 `revoked` | — | SCR-03 |
| not-found | `NOT_FOUND`: the caller closes the dialog → SCR-03 `revoke-not-found` | — | SCR-03 |
| rejected | The call rejects or returns `UNAUTHORIZED` → `goToSignIn()` (built into `ConfirmationModal`) | — | SCR-10 |
| empty | N/A: the dialog is always about one existing key | — | — |

```text
+----------------------------------------------+
| Revoke "Laptop assistant"?                   |
| Any assistant using this key stops working   |
| right away. This can't be undone: you'll     |
| need a new key to reconnect.                 |
|                       [Cancel]  [Revoke key] |
+----------------------------------------------+
```

### SCR-05 — Invoice list

Changed: derived status only (ADR-0005). Layout, filters and pagination are unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | `InvoicesTableSkeleton` (unchanged) | existing |
| default | Loaded. A pending invoice whose due date is before today in the Freelancer time zone shows `Overdue`. The status filter "Overdue" includes it and "Pending" leaves it out (AC-24; flow 13) | `InvoicesDataTable`, `InvoiceStatusBadge` | wireframe below |
| row menu (overdue) | Row actions for a derived or stored overdue invoice: View, Edit, Download, Print, **Mark as Paid**, Cancel Invoice. No "Mark as Overdue" and no "Mark as Pending" (AC-24). `InvoiceRowActions` already hides both when `status` is `OVERDUE`, so it needs the derived status, not a new rule | `InvoiceRowActions` | wireframe below |
| paid | Mark as Paid → `ok()`: `toast.success`, badge `Paid` (unchanged path; flow 13) | `Sonner`, `InvoiceStatusBadge` | existing |
| status-rejected | `updateInvoiceStatus` → `VALIDATION` "This invoice is overdue because its due date has passed. You can still mark it paid." (the page was loaded before the due date passed, and the Freelancer clicks Mark as Overdue). `toast.error` verbatim, and the row refreshes to `Overdue` (api-sync-report D-6) | `Sonner` | — |
| empty | No invoices: `InvoicesEmptyState` (unchanged) | `InvoicesEmptyState` | existing |
| error | Load fails → existing `error.tsx` (`LoadError`), unchanged | `LoadError` | existing |

```text
| No.       Customer    Due        Total     Status          |
| INV-0042  Acme GmbH   21.09      1 240.00  [Overdue] [...] |
                                              +-------------+
                                              | View        |
                                              | Edit        |
                                              | Download    |
                                              | Print       |
                                              |-------------|
                                              | Mark as Paid|
                                              | Cancel      |
                                              +-------------+
```

### SCR-06 — Customer page

Changed: derived status only. The UI is otherwise unchanged.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `customers/[id]/loading.tsx` | existing |
| default | The Customer's invoices show the derived status. A past-due pending invoice shows `Overdue` (AC-24; flow 13 postcondition) | `RelatedInvoicesList`, `InvoiceStatusBadge` | existing |
| empty | The Customer has no invoices: the existing empty list (unchanged) | existing | existing |
| not-found | Not the Freelancer's Customer, or deleted: existing `customers/[id]/not-found.tsx` (unchanged) | `ContentAreaNotFound` | existing |
| error | Load fails → existing `error.tsx` (`LoadError`), unchanged | `LoadError` | existing |

Wireframe: the existing page is unchanged apart from the badge.

### SCR-07 — Invoice page

The existing invoice editor `/invoices/{id}/edit`, also the target of the `get_invoice` link (OQ-A1, resolved above).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | `InvoiceEditorLoading` (unchanged) | existing |
| default | The header status `Badge` reads `Overdue` for a past-due pending invoice (AC-24). Unlike the other invoice reads, `getInvoiceEditorData` returns the **stored** status plus `derivedOverdue`, and the badge comes from the flag, so a save echoes the stored status back (server-actions "Editor status"). Issue and due dates show their calendar day; an unedited legacy date keeps its stored value on save: the editor sends the instants it loaded as `loadedIssueDate` / `loadedDueDate` and the server compares the submitted day against them (ADR-0009) | `InvoiceEditor` | existing |
| draft / cancelled | Opened from an Assistant link: the header `Badge` reads "Draft" or "Cancelled" (AC-19 "labelled as a draft or as cancelled"). The editor behaves as today; no read-only mode is added | `InvoiceEditor`, `Badge` | existing |
| no session | The link is opened without a session → SCR-10, then back here (AC-19; flow US-06) | — | SCR-10 |
| not-found | Deleted, or another Freelancer's invoice → existing `invoices/[id]/edit/not-found.tsx` = SCR-11, revealing nothing (AC-08 UI part) | — | SCR-11 |
| error | Load fails → existing `(invoice-editor)/error.tsx` (`LoadError`), unchanged | `LoadError` | existing |
| empty | N/A: the page always shows one existing invoice | — | — |

Wireframe: the existing editor is unchanged. Only the source of its status badge changes.

### SCR-08 — Privacy & data settings

The UI is unchanged. Only the export file's content changes.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Existing page | `GdprSettings` (unchanged) | existing |
| export downloaded | Existing download flow. The file is `exportVersion` `2.1` with `user.timeZone`, `user.overdueNoticeDismissedAt` and `personalKeys[]`: name, creation date, last use, revocation date and weekly usage. It never contains the key, its digest, its last four characters or its id (AC-25; flow 14) | `GdprSettings` | — |
| export error | Existing export error handling, including the existing per-Freelancer export limit (unchanged) | `GdprSettings`, `Sonner` | existing |
| loading | Existing `privacy/loading.tsx` (unchanged) | existing | existing |
| empty | N/A: the export always has the account itself | — | — |

### SCR-09 — Delete account confirmation

The UI is unchanged. Deleting the account now also deletes every Personal key and its usage in the same transaction (AC-26; flow 15).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Existing delete confirmation; `getAccountDeletionSummary` is unchanged | `ConfirmationModal` (unchanged) | existing |
| pending | Existing async confirm | `ConfirmationModal`, `Spinner` | existing |
| deleted | Committed → signed out → public landing. Every key fails from this moment like an unknown key (AC-26) | — | existing |
| error | The transaction rolls back (flow 15 `alt`): the existing "account not deleted, try again" handling, nothing removed | `Sonner` | existing |
| empty | N/A: a confirmation dialog | — | — |

### SCR-10 — Sign-in

Unchanged. This feature only adds one more way to arrive here.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Visitor opens sign-in | `LoginForm` (unchanged) | existing |
| redirected | The `get_invoice` link is opened without a session. After sign-in the Freelancer returns to SCR-07 (AC-19; flow US-06). A Personal key never signs anyone in (spec §6.1) | `LoginForm` | existing |
| error | N/A: existing sign-in errors are unchanged by this feature | — | — |
| empty | N/A: no Freelancer data on this page | — | — |

### SCR-11 — Not found

Unchanged. This feature only adds one more way to arrive here.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | The invoice link points to a deleted invoice or to another Freelancer's invoice. The existing not-found page reveals nothing about the record (AC-08 UI part; flow US-06) | existing `invoices/[id]/edit/not-found.tsx` (unchanged) | existing |
| error | N/A: a static page | — | — |
| empty | N/A: a static page | — | — |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `CopyButton` | The repo has no clipboard primitive (no clipboard code in `components/` or `lib/`), and SCR-03 needs one in three places: the one-time key, each setup snippet and each example prompt. Contract: an icon `Button` (`size="icon"`, `aria-label` "Copy {what}") that writes its `value` prop with `navigator.clipboard.writeText`. On success the icon swaps to a check and the label to "Copied" for 2 s, announced via `aria-live="polite"`. If the clipboard is unavailable or refused: `toast.error` "Couldn't copy. Select the text and copy it by hand." It never logs or sends `value` anywhere | pending |
