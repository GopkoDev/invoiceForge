---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-09"
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

**Chosen:** Option 1. The store holds the same state and actions as today, but each editor mount gets its own instance, already filled when the first render runs, on the server and in the browser alike. The provider's `key` (`${freelancerId}:${invoiceId ?? 'new'}`) makes React discard the store when the invoice or the account changes. The existing selector hooks (`useFormData`, `useSummary`, …) read the store from context; direct `useInvoiceEditorStore.getState()` calls from hooks and components become context reads. The `sessionToken` guard stays inside each store for saves that return after a reset. `initialize` in an effect and `reset` on unmount are removed.

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

## Links

- Spec: [[../spec.md]] US-03, AC-06, AC-07
- SAD: [[../sad.md]] §4
- Related ADR: [[0005-route-every-save-and-retry-through-one-store-save-command]]
