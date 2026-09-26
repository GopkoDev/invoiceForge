---
id: T19
title: "Refuse deleting a Customer or sender profile that has invoices, with the count"
layer: "app"
deps: ["T00", "T08", "T15"]
blocks: []
acs: ["AC-22"]
files_hint: ["lib/actions/customer-actions.ts", "lib/actions/sender-profile-actions.ts", "components/customers/customer-card-actions.tsx", "components/sender-profiles/sender-profile-card-actions.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T19 — Refuse deleting a Customer or sender profile that has invoices, with the count

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them, T15 — Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button · **Blocks:** — · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/customer-actions.ts`), T20 (`lib/actions/sender-profile-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task keeps the invariant that deleting one Customer or sender profile never removes an invoice, and tells the Freelancer how many invoices depend on it.

## Inlined context

> | Outcome | Result |
> |---|---|
> | not found / not owned | `NOT_FOUND` |
> | N ≥ 1 invoices reference it | `CONFLICT`, `details: { kind: 'HAS_INVOICES', invoiceCount: N }`, `error: "N invoices depend on this customer, so it can't be deleted."` (or "…this sender profile…") |
> | an invoice was saved between the count and the delete (FK `Restrict` violation, P2003) | the same `CONFLICT`, with `invoiceCount` recounted. Never `FAILED` (sad §6 flag) |
> | none | `success` |
>
> — `contracts/server-actions.md §deleteSenderProfile / deleteCustomer, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> | default | "Delete {name}?" with Cancel and Delete (destructive) | `ConfirmationModal` (✎ extended) | wireframe below |
> | deleting | Confirmed: Delete shows a `Spinner`, and the dialog **stays open** until the result arrives | `ConfirmationModal` ✎, `Spinner` | — |
> | blocked | `CONFLICT` with `details.kind = 'HAS_INVOICES'`: `Alert` (destructive) with the result's `error`, e.g. "3 invoices depend on this customer, so it can't be deleted." The Delete button is hidden and only "Close" remains. Nothing is removed. The race case (an invoice saved between the count and the delete) looks the same (AC-22; flow 10) | `Alert`, `Button` | wireframe below |
> | not-found | `NOT_FOUND` (already gone): the dialog closes, `toast.error` shows, and the list refreshes | `Sonner` | — |
> | deleted | Success: the dialog closes and `toast.success` shows. From a list (SCR-12/13) the row is gone. From a detail page (SCR-09/19) the Freelancer goes to its list | `Sonner` | — |
> | failed | `FAILED`: the dialog closes and `toast.error` shows | `Sonner` | — |
>
> — `screens.md §SCR-14 Delete-record confirmation, states, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** | Destructive operations | Deleting a Customer or sender profile counts its invoices and refuses with the count (the `Restrict` FKs stay as the database backstop). **Account deletion is one explicit transaction**; any new entity that references Freelancer-owned data with `Restrict` must join that transaction |
>
> — `sad.md §8, row Destructive operations, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** The sharpest failure mode the adversarial pass found is this: if the account-deletion fix makes deletes cascade through the schema, deleting a single customer would silently destroy that customer's invoices. The invariant "a customer or sender profile that has invoices can never be deleted on its own" is kept explicitly (AC-22).
>
> — `spec.md §1, Committed approach, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table | Access | Change |
|---|---|---|
| `Invoice` | `count WHERE "customerId" = $1` / `WHERE "senderProfileId" = $1` (existing indexes) | read |
| `Customer` / `SenderProfile` | `DELETE` after a zero count; `Restrict` FK from `Invoice` untouched | delete |

— `data-model.md §Entities, SenderProfile + Customer, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `deleteCustomer(id)`, `deleteSenderProfile(id)`: `ActionResult<void>` with `CONFLICT` + `details: { kind: 'HAS_INVOICES', invoiceCount }`.

— `contracts/server-actions.md §deleteSenderProfile / deleteCustomer, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-22 — cross-context

> **Given** a Freelancer deleting one Customer or one sender profile that has invoices
> **When** the Freelancer confirms the deletion
> **Then** the system blocks it, says how many invoices depend on it, and no invoice is removed
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `deleteCustomer`: guard → scoped load → count invoices → `CONFLICT` with details, else delete; catch P2003 → recount → same `CONFLICT` — `lib/actions/customer-actions.ts`
- [ ] Same for `deleteSenderProfile` with the "sender profile" wording — `lib/actions/sender-profile-actions.ts`
- [ ] Delete dialogs use the extended modal: async confirm; on `HAS_INVOICES` show the destructive `Alert` in `body` and `hideConfirm`; other outcomes per SCR-14 — `components/customers/customer-card-actions.tsx`, `components/sender-profiles/sender-profile-card-actions.tsx`
- [ ] Detail pages' delete: on success navigate to the list

## Edge cases

| Case | Behaviour |
|---|---|
| 3 invoices reference the Customer | Blocked: "3 invoices depend on this customer, so it can't be deleted."; nothing removed |
| Invoice saved between count and delete | P2003 mapped to the same CONFLICT with a recount, never FAILED |
| Record already deleted in another tab | `NOT_FOUND` → toast + list refresh |

## Definition of Done

- [ ] in `pnpm dev`: deleting a Customer and a sender profile with invoices shows the SCR-14 blocked state with the count and removes nothing; without invoices they are deleted (AC-22)
- [ ] a DB check confirms the invoice count for that Customer is unchanged after the blocked attempt
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
