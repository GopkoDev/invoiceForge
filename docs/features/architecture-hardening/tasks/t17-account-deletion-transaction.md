---
id: T17
title: "Add the deletion summary and delete the account in one explicit transaction"
layer: "app"
deps: ["T00", "T08"]
blocks: ["T18", "T28"]
acs: ["AC-20"]
files_hint: ["lib/actions/account-actions.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T17 — Add the deletion summary and delete the account in one explicit transaction

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them · **Blocks:** T18 — Show the invoice count and export offer in the delete-account dialog, T28 — Check the session before parsing input in profile and account settings actions · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/account-actions.ts`), T28 (`lib/actions/account-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task makes account deletion succeed for Freelancers with invoices and remove everything, or nothing.

## Inlined context

> It needs no migration, the order of deletion is visible in one function, and AC-22 stays enforced by the database itself, because the Restrict keys are untouched. The warning count ("N invoices will be permanently lost") is read before the confirmation dialog, and the delete runs only after confirmation.
>
> — `adr/0007, Decision outcome, verbatim` · full text: [ADR-0007](../adr/0007-delete-account-in-one-explicit-transaction-keeping-restrict-fks.md)

> ### ★ `getAccountDeletionSummary(): Promise<ActionResult<{ invoiceCount: number }>>`
>
> Flow 3 "asks how many invoices will be lost" (AC-20). `invoiceCount` = `count(Invoice WHERE senderProfile.userId = me)`. Outcomes: `UNAUTHORIZED`, `FAILED`.
>
> ### `deleteUserAccount(): Promise<ActionResult<void>>` ✎
>
> Was `{ success, message }` (F3). One transaction (ADR-0007): delete the Freelancer's invoices (their items cascade), then `User`, which cascades Account, Session, EmailHistory, SenderProfile → BankAccount, Customer → CustomPrice, Product and LogoFetchWindow. All or nothing. Outcomes: `UNAUTHORIZED`; `FAILED` ("Your account couldn't be deleted. Nothing was removed."); `success` → the client signs out and lands on SCR-01. Other devices become Visitors on their next request (AC-21).
>
> — `contracts/server-actions.md §Account and profile, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> `VerificationToken` has no FK to User; it is keyed by email identifier and expires on its own. <!-- TBD: confirm with design whether AC-20's "sign-in links" means VerificationToken rows for the account's email must be deleted explicitly in the transaction (`DELETE FROM "VerificationToken" WHERE identifier = $email`). -->
>
> — `data-model.md §Entities, Account deletion, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** | Destructive operations | Deleting a Customer or sender profile counts its invoices and refuses with the count (the `Restrict` FKs stay as the database backstop). **Account deletion is one explicit transaction**; any new entity that references Freelancer-owned data with `Restrict` must join that transaction |
>
> — `sad.md §8, row Destructive operations, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Data access lives in `lib/actions/<domain>-actions.ts`. `getAuthenticatedUser()` runs first, then queries are scoped by `userId` (`lib/helpers/auth-helpers.ts:10`). Actions return `ActionResult<T>` (`types/actions.ts:5`) and never throw to the client.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

Breakdown decision (open OQ-2, flagged in the handoff): also delete `VerificationToken WHERE identifier = <email>` inside the same transaction. It is harmless (tokens are single-use and expire) and makes "its sign-in links" true under either reading. Drop this step if the owner rules otherwise.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table | Access | Change |
|---|---|---|
| `Invoice` (+ `InvoiceItem` cascade) | `DELETE WHERE "senderProfileId" IN (user's profiles)` | first in the transaction |
| `VerificationToken` | `DELETE WHERE identifier = email` | breakdown decision (OQ-2) |
| `User` (cascades Account, Session, EmailHistory, SenderProfile → BankAccount, Customer → CustomPrice, Product, LogoFetchWindow) | `DELETE WHERE id = me` | last |

— `data-model.md §Entities, Account deletion (AC-20, ADR-0007), abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getAccountDeletionSummary(): ActionResult<{ invoiceCount: number }>` ★
- `deleteUserAccount(): ActionResult<void>` ✎ (`FAILED` "Your account couldn't be deleted. Nothing was removed.")

— `contracts/server-actions.md §Account and profile, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-20 — happy

> **Given** a Freelancer who has invoices
> **When** the Freelancer chooses to delete their account
> **Then** the system warns how many invoices will be permanently lost and offers an export first, and after confirmation removes all of the Freelancer's data in full (either everything is removed or nothing is): the account, its sign-in links, every session on every device, its email history, sender profiles with their bank accounts, Customers, products, custom prices, and invoices with their lines
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `getAccountDeletionSummary()` — guard first, count invoices via `senderProfile.userId` — `lib/actions/account-actions.ts`
- [ ] Rewrite `deleteUserAccount()` onto `ActionResult`: guard first; `prisma.$transaction([deleteMany invoices, deleteMany verificationTokens, delete user])`; catch → `FAILED` with the contract text + `console.error` + Sentry
- [ ] Manual check on the dev DB with a throwaway account that has profiles, customers, custom prices, products, invoices: delete → every table has 0 rows for that user
- [ ] Force a failure (e.g. temporarily throw between steps in a scratch branch) → nothing deleted

## Edge cases

| Case | Behaviour |
|---|---|
| Freelancer with 0 invoices | Summary returns 0; deletion succeeds |
| Any statement fails | Transaction rolls back; `FAILED` "…Nothing was removed." |
| Invoice saved on another device during deletion | Either included in the delete or the transaction fails and nothing is removed — never partial |
| Customer/profile Restrict FKs | Untouched — invoices are deleted first, so the cascade from User succeeds |

## Definition of Done

- [ ] on a throwaway dev account with invoices: `deleteUserAccount` succeeds and a SQL sweep finds 0 rows for that user in every AC-20 category (AC-20)
- [ ] a forced mid-transaction failure leaves every row in place
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
