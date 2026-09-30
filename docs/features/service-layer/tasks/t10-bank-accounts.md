---
id: T10
title: "Move bank accounts into lib/services/bank-accounts with a parent-scoped list"
layer: "app"
deps: ["T3", "T4"]
blocks: ["T20"]
acs: ["AC-03", "AC-08"]
files_hint: ["lib/services/bank-accounts/", "lib/actions/bank-account-actions.ts", "tests/integration/services/bank-accounts/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- The governing rule of this file: **inline the slice the task actually needs, name where it came
from, and keep the link as the fallback for when the slice turns out not to be enough.** A task is
self-contained: it carries its own context instead of sending the executing agent off to reconstruct it.

Every inlined chunk ends with a one-line **provenance signature**:
`<file> §<section>, <identifier>, verbatim|abridged` — e.g. `spec.md §5, AC-02, verbatim`,
`data-model.md §Entities, table order, abridged`. Never «see the spec».

**Inline budget.** Exactly what THIS task needs: only its own acceptance criteria, only the
data-model fields and endpoints it touches. Cut a long chunk to the essential, mark it `abridged`,
and link the full text. `context_budget` in the frontmatter carries the measured number, and an `L`
either gets split or gets its `# justified:` reason on that line — the `tasks` skill checks both.

**Divergence risk.** An inline is a snapshot taken at breakdown time; upstream can move after it.
The source always wins — which is exactly why every chunk carries a signature pointing at where the
truth lives.

**To the executing agent:** work from what is inlined here. If a slice is insufficient, ambiguous,
or contradicts the code in front of you, open the named file for the full text and follow that.
Do not invent the missing part. -->

# T10 — Move bank accounts into lib/services/bank-accounts with a parent-scoped list

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper · **Blocks:** T20 — Close the move. **Wave:** 4 (DAG level), release wave 2 of sad.md §7.
- **Lane:** own lane. Runs in parallel with T6–T9, T11, T12 and T17.

## Why (user story)

> **As a** Freelancer
> **I want** every page, form, picker and the dashboard to behave exactly as before
> **So that** the internal change costs me nothing and I don't have to relearn anything
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

AC-03's own example is a bank account. This task moves bank accounts into the layer while the wrappers keep refreshing exactly the pages they refresh today.

## Inlined context

> opt the list belongs to a parent record […] · S->>D: looks up the parent where the id and the owner match · alt parent missing or foreign → NOT_FOUND, exactly as for an id that never existed · else parent owned → counts the owner's records matching the search on the list's name fields, in any letter case · no page given means the full list as page 1, a page without a size uses 10, a page past the last one falls back to page 1 · reads one page where the owner matches, in today's order ending with the record id
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> BL validates input with the […] schema · alt input invalid → VALIDATION with field errors · else update where id and owner match · alt no row for this id and owner (missing or foreign) → NOT_FOUND · else row updated → success · WA->>WA: revalidates the […] list and detail pages
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Search is case-insensitive `ILIKE` on the name fields of spec §1 (never on account number or IBAN) and is at most 100 characters.
>
> — `sad.md §8, Lists, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Only web adapters call `revalidatePath` and `unstable_cache`, after a successful result, with the same paths and tags as today (AC-03).
>
> — `sad.md §8, Cache invalidation, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Prisma rejects a relation filter inside a unique `where` for some model […] Fallback per ADR-0003: `updateMany`/`deleteMany` with the owner filter and `count === 0 → NOT_FOUND`
>
> — `sad.md §11, risk row 3, abridged` · full text: [sad.md](../sad.md)

**Today's revalidations (keep verbatim):** create, update and delete each → `protectedRoutes.senderProfiles`, `protectedRoutes.senderProfileEdit(<senderProfileId>)`, `protectedRoutes.senderProfileEditBankAccounts(<senderProfileId>)`. For update and delete, the id is the **existing account's** `senderProfileId`. — `lib/actions/bank-account-actions.ts:52-56,108-116,161-165`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice:

| Entity | Aggregate root | Owner path (ADR-0003) | List search fields (ADR-0005) | List order today (id tiebreak added, spec §1 change 4) |
|---|---|---|---|---|
| `BankAccount` | `SenderProfile` | `senderProfile.userId = A` | `bankName`, `accountName` (never `accountNumber` or `iban`) | as today, then `id`. Dashboard sender accounts: by `bankName`, then `accountName` (spec §1 change 3) |

— `data-model.md §Entities, Aggregate roots table, row BankAccount, verbatim` · full text: [data-model.md](../data-model.md)

> — `Invoice(bankAccountId)` | **deferred gap** | FK without an index (pre-existing, not introduced here). A bank-account delete makes the `RESTRICT` check scan `Invoice`.
>
> — `data-model.md §Indexes, deferred row, abridged` · full text: [data-model.md](../data-model.md)

## API contract

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listBankAccounts(actor, senderProfileId, query?: ListQuery)` ★ | `Page<BankAccountWithRelations>` = | parent `NOT_FOUND` "Sender profile not found.". Search on `bankName`, `accountName` (**never** `accountNumber` or `iban`). Order `isDefault desc, createdAt desc, id` | `getBankAccounts(id, limit?)` → `limit` becomes `{ page: 1, pageSize: limit }`, then `data.items` |
| `createBankAccount(actor, senderProfileId, input: BankAccountFormValues)` | `BankAccount` = | `VALIDATION` → `NOT_FOUND` (profile) | `createBankAccount(senderProfileId, data)` |
| `updateBankAccount(actor, id, input: BankAccountFormValues)` | `BankAccount` = | `VALIDATION` → `NOT_FOUND` | `updateBankAccount(id, data)` |
| `deleteBankAccount(actor, id)` ✎ | `{ senderProfileId: string }` (for the wrapper's revalidation) | `NOT_FOUND` · `CONFLICT` "Cannot delete bank account with existing invoices. Please delete or reassign invoices first." (=, no `details`) † | `deleteBankAccount(id)` |

— `contracts/public-api.md §2.5, Bank accounts, verbatim` · full text: [public-api.md](../contracts/public-api.md)

† The has-invoices branch is preserved from today's code but drawn in no sad.md §6 flow (spec §8 OQ, owner `sequences`).

The update and delete wrappers revalidate by the account's `senderProfileId`. `updateBankAccount` returns the `BankAccount`, which carries it. `deleteBankAccount` returns `{ senderProfileId }` (contract updated 2026-10-01), so the wrapper never re-reads with Prisma.

## Acceptance criteria

### AC-03 — happy

> **Given** a signed-in Freelancer creates, changes or deletes a record, for example a bank account on one of their sender profiles
> **When** the change succeeds
> **Then** every page that showed that record before the change is refreshed as it is today (lists, detail pages, the sender profile and the dashboard), so the Freelancer sees the change without reloading
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — authorization

> **Given** an Assistant acting for Freelancer A, and a record (invoice, customer, product, custom price, sender profile or bank account) that belongs to Freelancer B
> **When** it asks to read, change or delete that record by its identifier, or asks for a list that belongs to it (for example the custom prices of B's customer)
> **Then** the system answers exactly as it does for an identifier that never existed, and B's record stays unchanged, so A's side cannot even learn that the record exists
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: write `tests/integration/services/bank-accounts/bank-accounts.test.ts` (request-free). Cover the list (full list in today's order, search on `bankName`/`accountName` in any case, a search matching only an `accountNumber` or `iban` returns nothing, `{ page: 1, pageSize: limit }` preview), create, update, and the has-invoices `CONFLICT`.
- [ ] RED: write `tests/integration/services/bank-accounts/foreign-record.test.ts`. Cover `listBankAccounts` and `createBankAccount` with B's profile → `NOT_FOUND`, nothing stored, and `updateBankAccount`/`deleteBankAccount` with B's account → `NOT_FOUND`, B's row byte-identical.
- [ ] RED: add a wrapper test that asserts the three `revalidatePath` calls per mutation with a mocked `next/cache` (AC-03), next to the existing action tests.
- [ ] Create `lib/services/bank-accounts/bank-accounts.ts` (`import 'server-only'`). Move today's default-account handling (`isDefault` reset) and the owner lookups unchanged, with writes owner-scoped through `senderProfile: { userId }` or the `updateMany`/`deleteMany` fallback.
- [ ] Rewrite `lib/actions/bank-account-actions.ts` as thin wrappers (same exports and signatures, today's revalidation lists verbatim, `getBankAccounts(id, limit?)` → `data.items`).
- [ ] Run existing bank-account and foreign-record parity tests unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| List or create for B's sender profile | `NOT_FOUND` "Sender profile not found.", nothing stored |
| Update/delete of B's account | `NOT_FOUND` "Bank account not found.", with B's row unchanged |
| Account used by invoices | `CONFLICT` "Cannot delete bank account with existing invoices. Please delete or reassign invoices first." |
| Search text equal to an IBAN | no match (IBAN is not a search field) |
| `getBankAccounts(id)` without `limit` | full list as page 1 |
| Invalid list query | `VALIDATION`, no records |

## Definition of Done

- [ ] Request-free and foreign-record integration tests pass for all four functions
- [ ] The wrapper test shows the same three `revalidatePath` calls per mutation as today (AC-03)
- [ ] `lib/actions/bank-account-actions.ts` has no `prisma` import. Existing tests pass with 0 changed expectations
- [ ] Every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
