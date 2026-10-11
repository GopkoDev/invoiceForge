---
id: T30
title: "Mount the AI-section modal container and confirm deleting one or all Conversations from the list and the Conversation header"
layer: "ui"
deps: ["T18", "T23", "T25"]
blocks: []
acs: ["AC-37"]
files_hint: ["components/modals/ai/", "components/modals/modal-types-registry.ts", "components/ai/conversation-list.tsx", "components/ai/conversation-header.tsx", "tests/component/ai-delete-conversations.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T30 — Mount the AI-section modal container and confirm deleting one or all Conversations from the list and the Conversation header

## Place in the sequence

- **Blocked by:** T18 — Add the AI section route and sidebar entry and render the Conversation list with paging, empty state and the retention notice, T23 — Render a saved Conversation with ChatLink invoice states, the not-found page and the loading skeleton, T25 — Save each turn under the Conversation row lock with its card and metadata, and delete one or all Conversations · **Blocks:** nothing — a leaf of the graph · **Wave:** 6 — needs the delete actions and both pages.
- **Lane:** shares `components/ai/conversation-header.tsx` with T23; shares `components/ai/conversation-list.tsx` with T18 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task lets the Freelancer delete one Conversation or all of them after a clear confirmation that their drafts stay.

## Inlined context

**SCR-04 — Delete Conversations dialog.** The existing `ConfirmationModal`, mounted through a new AI-section modal container (sad.md §8 UI). Opened by a row's delete button or "Delete all" (SCR-01), or "Delete conversation" (SCR-02). Flow 8.

| State | Trigger / condition | Components |
|---|---|---|
| default (one) | Title "Delete this conversation?"; body "“{title}” will be deleted for good. Drafts it created stay in your invoices."; destructive confirm "Delete" | `ConfirmationModal` |
| default (all) | Title "Delete all conversations?"; body "All {n} conversations will be deleted for good. Drafts they created stay in your invoices."; destructive confirm "Delete all" | `ConfirmationModal` |
| cancelled | Cancel, Esc or a click outside: closes, nothing deleted | `ConfirmationModal` |
| pending | Async `onConfirm` → `deleteConversation(id)` / `deleteAllConversations()` in flight: `Spinner` in confirm, both buttons disabled, the dialog stays open | `ConfirmationModal`, `Spinner` |
| success | `ok()` / `ok({ deleted })`: the caller closes the dialog → SCR-01 `deleted` (`toast.success` "Conversation deleted." / "All conversations deleted.", list refreshes; zero left → `empty`), or from SCR-02 → `router.push('/ai')` + "Conversation deleted." | `Sonner` |
| not-found | `deleteConversation` → `NOT_FOUND` (already gone): the caller closes the dialog, `toast.error` "This conversation can't be found." verbatim, and the list refreshes | `Sonner` |
| rejected | The call rejects or returns `UNAUTHORIZED` → `goToSignIn()` (built into `ConfirmationModal`) | — |
| empty | N/A: "Delete all" is hidden while the list is empty | — |

— `screens.md §SCR-04 + §SCR-01 deleted + §SCR-02 deleted, abridged` · full text: [screens.md](../screens.md)

> | UI | Composed from `components/ui/` and the `docs/design-system.md` inventory: `ConfirmationModal` for deletes, mounted in a new AI-section modal container … |
>
> — `sad.md §8, UI, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) · `components/modals/modal-types-registry.ts` for the existing container pattern) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `deleteConversation(id)` → `ok()` · `fail('NOT_FOUND', "This conversation can't be found.")`.
- `deleteAllConversations()` → `ok({ deleted: number })`.

— `contracts/server-actions.md §Conversations, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-37 — happy path

> **Given** a Freelancer with several Conversations
> **When** they delete one Conversation, or delete all of them, and confirm
> **Then** the deleted Conversations disappear from the list and can no longer be opened. Every draft those Conversations created stays exactly as it was.
>
> — `spec.md §5, AC-37, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] AI-section modal container + two modal types (one, all) following the existing registry pattern — `components/modals/ai/`, `components/modals/modal-types-registry.ts`
- [ ] Wire the row delete buttons and "Delete all" — `components/ai/conversation-list.tsx`
- [ ] Wire "Delete conversation" in the header (push to `/ai` on success) — `components/ai/conversation-header.tsx`
- [ ] Component tests for every state — `tests/component/ai-delete-conversations.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Deleted in another tab | `NOT_FOUND` toast verbatim, list refreshes |
| Delete all with 0 | action hidden |
| Session ended | `goToSignIn()` |
| Conversation had created drafts | drafts unchanged (copy says so; AC-37) |

## Definition of Done

- [ ] Component tests render SCR-04 one and all, cancelled, pending, success (toast and refresh, or push to /ai from SCR-02), not-found (toast verbatim and refresh) and rejected (goToSignIn), and "Delete all" is hidden for an empty list.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
