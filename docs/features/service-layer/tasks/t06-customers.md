---
id: T6
title: "Move customers into lib/services/customers with search, paging and owner-scoped writes"
layer: "app"
deps: ["T3", "T4"]
blocks: ["T20"]
acs: ["AC-01", "AC-02", "AC-03", "AC-08", "AC-09", "AC-11", "AC-17"]
files_hint: ["lib/services/customers/", "lib/actions/customer-actions.ts", "tests/integration/services/customers/"]
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

# T6 — Move customers into lib/services/customers with search, paging and owner-scoped writes

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper · **Blocks:** T20 — Close the move: zero data-store calls in lib/actions, inventory checks. **Wave:** 4 (DAG level), release wave 1 of sad.md §7 (customers, products, custom prices). It is the first domain moved, so it also confirms the owner filter inside a unique `where` (sad.md §11 risk).
- **Lane:** own lane (no `files_hint` overlap). Runs in parallel with T7–T12 and T17.

## Why (user story)

> **As a** Freelancer
> **I want** every page, form, picker and the dashboard to behave exactly as before
> **So that** the internal change costs me nothing and I don't have to relearn anything
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** every read and change made on my behalf, from a page or an Assistant, limited to my own records
> **So that** nobody else's data mixes into mine and nobody can reach mine
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task moves every customer read, write and list into request-free business functions that the customer pages keep calling through unchanged wrappers.

## Inlined context

> **Web adapters** (RSC pages, `'use server'` actions, route handlers) own everything tied to a request: session, cookies, `revalidatePath`, `unstable_cache`, redirects. **Business functions** in `lib/services/` own every rule and every data access, take an `ActingFreelancer` (ADR-0001) and return `ActionResult<T>` (ADR-0002). […] business functions call the Prisma client directly, as actions do today, which keeps the move mechanical and the parity diff small.
>
> — `sad.md §5, intro, abridged` · full text: [sad.md](../sad.md)

> WA->>WA: builds ActingFreelancer from session and tz cookie · alt no session → UNAUTHORIZED, sent to sign in · else WA->>BL: updateCustomer(actor, id, input) · BL validates input with the customer schema · alt input invalid → VALIDATION with field errors · else BL->>DB: update where id and owner match · alt no row for this id and owner (missing or foreign) → NOT_FOUND · else row updated → success, WA revalidates the customer list and detail pages
>
> — `sad.md §6, Critical flow 1, abridged` · full text: [sad.md](../sad.md)

> S->>S: validates the list query with the shared list schema · alt page or page size not a whole number of at least 1, or search longer than 100 characters → VALIDATION naming the invalid value and what is allowed, no records · else S->>D: counts the owner's records matching the search on the list's name fields, in any letter case · no page given means the full list as page 1, a page without a size uses 10, a page past the last one falls back to page 1 · reads one page where the owner matches, in today's order ending with the record id
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> S->>D: counts its invoices where the id and the owner match · alt missing or foreign → NOT_FOUND, nothing deleted · else has invoices → CONFLICT saying how many invoices depend on it · else no invoices → deletes where the id and the owner match · alt an invoice was saved between the count and the delete → restrict violation, recounts the invoices, the same CONFLICT with the new count · else deleted → success
>
> — `sad.md §6, Flow 9, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. It is explicit at every call site and needs no infrastructure. It works the same way for nested writes, the numbering row lock and transactions, where a query extension is fragile given owners at four different depths.
>
> — `adr/0003 §Decision outcome, verbatim` · full text: [0003](../adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md)

> **Hard rule:** Prisma rejects a relation filter inside a unique `where` for some model […] | Medium | Confirm in wave 1 with the first owner-scoped writes. Fallback per ADR-0003: `updateMany`/`deleteMany` with the owner filter and `count === 0 → NOT_FOUND`
>
> — `sad.md §11, risk row 3, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Move domain by domain (§7), with the existing suite as an oracle (0 changed expectations, reviewed in `review`). Wrappers keep today's `revalidatePath` lists verbatim.
>
> — `sad.md §11, risk row 1, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** 100% of business functions that take a record identifier have a foreign-record test (read, change, delete) proving AC-08
>
> — `spec.md §6, Tenant isolation, verbatim` · full text: [spec.md](../spec.md)

**Today's revalidations (keep verbatim in the wrapper):** `createCustomer` → `protectedRoutes.customers`; `updateCustomer` → `protectedRoutes.customers`, `protectedRoutes.customerEdit(id)`; `deleteCustomer` → `protectedRoutes.customers`. — `lib/actions/customer-actions.ts:111,151-152,208`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice of the entity this task queries:

| Entity | Aggregate root | Owner path (ADR-0003) | List search fields (ADR-0005) | List order today (id tiebreak added, spec §1 change 4) |
|---|---|---|---|---|
| `Customer` | root | `userId = A` | `name`, `companyName`, `email` | as today, then `id` |

— `data-model.md §Entities, Aggregate roots table, row Customer, verbatim` · full text: [data-model.md](../data-model.md)

Today's order is `createdAt desc` (`lib/actions/customer-actions.ts:45`). `Customer_userId_idx` serves the list and count, and `Invoice_customerId_idx` serves the delete-guard count.

## API contract

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listCustomers(actor, query?: ListQuery)` ★ | `Page<CustomerWithRelations>` = | search on `name`, `companyName`, `email`. Order `createdAt desc, id` | `getCustomers()` → `data.items` |
| `getCustomer(actor, id)` | `CustomerWithRelations` = | `NOT_FOUND` "Customer not found." | `getCustomer(id)` |
| `createCustomer(actor, input: CustomerFormValues)` | `{ id: string }` | `VALIDATION` | `createCustomer(data)` + today's revalidations |
| `updateCustomer(actor, id, input: CustomerFormValues)` | `void` | `VALIDATION` → `NOT_FOUND` (flow 1) | `updateCustomer(id, data)` |
| `deleteCustomer(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` + `details: { kind: 'HAS_INVOICES', invoiceCount }`, also after the restrict-race recount (flow 9, AC-17) | `deleteCustomer(id)` |

— `contracts/public-api.md §2.1, Customers, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> 1. `actingFreelancerFromSession()` first. On `UNAUTHORIZED`, return it (actions) or redirect to sign-in (pages), and never call a business function.
> 2. Call the business function, then return its result **untouched**. The only exceptions are the documented shape mappings: `data.items` for today's array-returning actions […]
> 3. On `success` only, call today's `revalidatePath(protectedRoutes.*)` list, verbatim.
> 4. Never report to Sentry. The business function already has.
>
> — `contracts/public-api.md §3, Web-wrapper obligations 1–4, abridged` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-01 — happy

> **Given** a signed-in Freelancer with existing sender profiles, customers, products, custom prices, bank accounts and invoices
> **When** the Freelancer opens any list, detail page, the invoice editor, a picker or the dashboard, or saves any form
> **Then** they see the same records, values, order, messages and confirmations as before the change (except the deliberate dashboard naming and tie order in AC-06), and every existing automated check passes with its expected values unchanged (the only removed check is the one for the unused list-all-invoices function)
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — error

> **Given** a signed-in Freelancer fills in a form with invalid values, for example a negative quantity or an unknown invoice status
> **When** they save it
> **Then** the system blocks the save and shows the same plain-language messages next to the same fields as before the change
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

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

### AC-09 — authorization

> **Given** a signed-in Freelancer A who opens or submits a link or form carrying the identifier of Freelancer B's record
> **When** the page loads or the form is saved
> **Then** A gets the same "not found" outcome as today and B's record is neither shown nor changed
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — happy

> **Given** Freelancer A has 23 customers, of which 5 have "acme" in their name or email in any letter case
> **When** an Assistant acting for A asks for customers matching "ACME", page 1, 2 per page
> **Then** it receives 2 of those 5 customers in the usual order, together with total 5, page 1, 3 pages in all and "more results exist"
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — domain invariant

> **Given** one of A's customers or sender profiles has invoices
> **When** an Assistant acting for A, or A in the browser, tries to delete it on its own
> **Then** the system blocks the deletion and says how many invoices depend on it, as it does today
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: write request-free integration tests in `tests/integration/services/customers/customers.test.ts` using `actingFreelancerForTest(userId)` (no `@/auth` mock). Cover list (AC-11 fixture: 23 customers, 5 matching "acme" in name or email in any case → 2 items, total 5, page 1, 3 pages, `hasMore`), the full list with no query in today's order, get, create, update, the delete guard and its race recount.
- [ ] RED: write `tests/integration/services/customers/foreign-record.test.ts`. Seed Freelancers A and B, then call `getCustomer`, `updateCustomer` and `deleteCustomer` as A with B's id. Assert `NOT_FOUND` with the same message as a nonexistent id, and assert B's row is byte-identical afterwards.
- [ ] Create `lib/services/customers/customers.ts` (`import 'server-only'`) with the five functions of `public-api.md §2.1`. Parse input with `lib/validations/customer.ts`. List through `paginate()` from `lib/services/_shared/list-query.ts`, searching `name`, `companyName`, `email` with `mode: 'insensitive'`, ordered `[{ createdAt: 'desc' }, { id: 'asc' }]`.
- [ ] Owner-scoped writes: `update`/`delete` with `where: { id, userId: actor.userId }`, mapping `P2025` → `NOT_FOUND` via `lib/services/_shared/owner-scope.ts`. If Prisma rejects the owner in a unique `where`, use `updateMany`/`deleteMany` with `count === 0 → NOT_FOUND`, and record which shape worked in the PR (sad.md §11).
- [ ] Delete guard: count invoices where the id and the owner match → `hasInvoicesConflict('customer', n)`. Catch `isRestrictForeignKeyError` on delete → recount → the same CONFLICT (flow 9).
- [ ] Wrap unexpected errors with `failed()` inside the business function, using today's log contexts and messages from `lib/actions/customer-actions.ts`.
- [ ] Rewrite `lib/actions/customer-actions.ts` as thin wrappers: `actingFreelancerFromSession()` → business function → today's `revalidatePath` list on success only. `getCustomers()` returns `data.items`. Keep the export names and signatures.
- [ ] Run the existing customer tests (`tests/integration/actions/foreign-record-not-found-parity.test.ts`, `delete-blocked-by-invoices.test.ts`, `stale-session-create-customer.test.ts`) unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| No session, or the account no longer exists | the wrapper returns `UNAUTHORIZED` before parsing input, and no business function is called |
| B's customer id on get/update/delete | `NOT_FOUND` "Customer not found.", with B's row unchanged |
| Invalid form values | `VALIDATION` with today's `fieldErrors` messages, byte for byte |
| Customer has invoices | `CONFLICT` + `details: { kind: 'HAS_INVOICES', invoiceCount }` |
| An invoice is saved between the count and the delete | restrict violation → recount → the same `CONFLICT` with the new count, never `FAILED` |
| `listCustomers` with page 0 / −5 / 2.5, or a 101-character search | `VALIDATION`, no records |
| Page past the last one | page 1, reported as `page: 1` |
| Search "ACME" vs stored "acme" | matched in any letter case |
| Data store unreachable | `FAILED` with today's plain message, reported once, never again by the wrapper |

## Definition of Done

- [ ] Request-free integration tests for all five functions pass, including AC-11 and the AC-17 race
- [ ] A foreign-record test for `getCustomer`, `updateCustomer` and `deleteCustomer` passes (NOT_FOUND, B's row unchanged)
- [ ] `lib/actions/customer-actions.ts` contains no `prisma` import. Existing customer tests pass with 0 changed expectations
- [ ] Every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
