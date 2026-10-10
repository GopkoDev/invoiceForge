---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-10"
feature_size: "M"
ticket: "editor-ux"
---

# 0003 — Create one editor store per mounted editor from the server's data

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`store/invoice-editor-store/use-invoice-editor-store.ts` creates the editor store with `create()` at module level: one instance for the whole browser tab, starting from `createInitialFormData()` (a blank invoice). `components/invoice-editor/invoice-editor.tsx` fills it in a `useEffect` after the first render, so the server's HTML and the browser's first paint show a blank invoice that the real one then replaces (AC-06). A module-level instance also outlives the invoice and the signed-in Freelancer it was filled for, held back only by a `sessionToken` counter; nothing ties it to the account, so a later visit in the same tab can briefly show an earlier one's state (AC-07). On the server, a module-level store would be shared by every concurrent request, so it cannot simply be filled before rendering.

## Decision drivers

- AC-06: the opened invoice (or a new invoice's defaults) from the very first display, unchanged once interactive.
- AC-07 and spec §6.1: nothing from one signed-in visit may show in another, not even for a moment; moving between two invoices never mixes their data.
- Spec §6 NFR "Server/browser date agreement": 0 render-mismatch warnings on the editor.
- Spec §3: no new editor features and no visual redesign.

## Considered options

1. **A store per mounted editor** — a `createInvoiceEditorStore(initialData)` factory, provided through React context by an `InvoiceEditorProvider` that creates the store once per mount from the RSC page's data and is keyed by invoice id and Freelancer id.
2. **Form data in react-hook-form, zustand only for UI flags** — the form starts from server `defaultValues`; a large rewrite of lines, defaults, totals, versions and issued details, with high regression risk to `invoice-integrity`'s acceptance tests, and AC-07 still needs its own answer for the UI store.

## Decision outcome

**Chosen:** Option 1. The store holds the same state and actions as today, but each editor mount gets its own instance, already filled when the first render runs, on the server and in the browser alike. The provider's `key` (`${freelancerId}:${invoiceId ?? 'new'}`) makes React discard the store when the invoice or the account changes. The one exception is the hand-over of a just-created invoice (Amendment 2026-10-10). The existing selector hooks (`useFormData`, `useSummary`, …) read the store from context; direct `useInvoiceEditorStore.getState()` calls from hooks and components become context reads. The `sessionToken` guard stays inside each store for saves that return after a reset. `initialize` in an effect and `reset` on unmount are removed.

## Consequences

**Positive**
- No blank first display and no flash of another invoice; the server HTML already contains the invoice.
- State cannot cross invoices or accounts: a new key is a new store.
- Each test creates its own store, so store tests no longer leak state between cases.

**Negative**
- Every consumer of the module-level store must move to the context hooks; code outside the editor tree can no longer reach the store.
- The editor's initial data is serialized into the page (it already is, as the `InvoiceEditor` prop).

**Neutral**
- The browser's back/forward cache can still restore a page from memory; that is handled at the page level (sad.md §8), not by the store.

## Amendment 2026-10-10

A create moves the editor from `/invoices/new` to `/invoices/<id>/edit`. These are different route segments, so the edit page mounts a second provider. Building its store from the server row would drop what the Freelancer typed after pressing Save (AC-05c, AC-03). So a store is no longer always discarded when the invoice changes: a new invoice's live store is handed over once. The rest of this ADR holds.

- **Key.** `${ownerId}:${invoiceId}`, in a module-level `Map` in `invoice-editor-provider.tsx`. An entry is `{ store, claimed, focus }`.
- **Who offers.** Only a provider that started as new (no initial invoice id) and has an `ownerId`, once its store has an id. It adds the entry and calls `router.replace(invoiceEdit(id), { scroll: false })`, once per store, but only if `window.location.pathname` is `invoicesNew` or `invoiceEdit(id)` when the queued call runs (checked inside the microtask, so the order of the store's `set()` and `history.replaceState` does not matter). Any other address means the Freelancer went Back or elsewhere: the router does not move; the unclaimed entry lives only until the offering editor unmounts, where the existing cleanup deletes it and the store is disposed. A provider adopts only an unclaimed entry. `save-command.ts` still rewrites the address with `history.replaceState` at once, so a reload works before the router has moved.
- **Who claims.** The provider whose `useState` initializer finds an entry for exactly that owner and invoice, and whose store's invoice id equals it. It marks the entry claimed in a layout effect, which runs before the old provider's passive cleanups. An entry is claimed at most once.
- **Focus.** The old provider's layout cleanup records the focused field (matched by the editor's stable `data-field` key, else `aria-label`, `name` or `placeholder`, never a `useId()` id, plus its selection). The adopter restores it after its own DOM is in place, unless the Freelancer has focused something else.
- **Disposal.** An unclaimed offer is deleted in the old provider's cleanup and its store is disposed. A claimed store is not disposed by the old provider. The adopter deletes the entry and disposes the store when it unmounts.
- **StrictMode.** Its extra mount, cleanup, mount runs the dispose cleanup without leaving. The second mount calls `resume()`, which undoes the last `dispose()` only if no `initialize()` or `dispose()` ran in between. A save in flight then still lands.
- **Why this is safe for AC-07.** Adoption needs the same Freelancer and the same invoice id in the key and in the store's state. An offer ends when the offering editor leaves, so a later visit cannot adopt it. An entry is claimed once. Another Freelancer, or another invoice, finds no entry and gets a fresh store from the server's data. Covered by `tests/component/invoice-editor-strict-mode-handoff-t44.test.tsx` and the "AC-07 (T38 handoff)" case in `tests/e2e/session-isolation.spec.ts`. The Security Lead reviews this under spec §6.1.

## Links

- Spec: [[../spec.md]] US-03, AC-06, AC-07
- SAD: [[../sad.md]] §4
- Related ADR: [[0005-route-every-save-and-retry-through-one-store-save-command]]
