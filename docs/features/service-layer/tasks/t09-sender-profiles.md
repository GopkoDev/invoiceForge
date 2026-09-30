---
id: T9
title: "Move sender profiles into lib/services/sender-profiles and route the convert-image logo lookup through it"
layer: "app"
deps: ["T3", "T4"]
blocks: ["T20"]
acs: ["AC-08", "AC-17"]
files_hint: ["lib/services/sender-profiles/", "lib/actions/sender-profile-actions.ts", "app/api/convert-image/route.ts", "tests/integration/services/sender-profiles/"]
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

# T9 — Move sender profiles into lib/services/sender-profiles and route the convert-image logo lookup through it

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper · **Blocks:** T20 — Close the move. **Wave:** 4 (DAG level), release wave 2 of sad.md §7 (sender profiles, bank accounts, profile, account, `convert-image`).
- **Lane:** own lane. Runs in parallel with T6–T8, T10–T12 and T17. T10 (bank accounts) reads the sender profile as its parent with its own Prisma lookup, so there is no shared file.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** creating, changing and deleting records to follow exactly the rules the web app follows (invoice numbering, amount checks, deletion guards)
> **So that** data changed through me is as trustworthy as data changed in the browser
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task moves sender-profile reads, writes and the has-invoices deletion guard into the layer, and makes the image route's owned-profile lookup go through it.

## Inlined context

> S->>D: counts its invoices where the id and the owner match · alt missing or foreign → NOT_FOUND, nothing deleted · else has invoices → CONFLICT saying how many invoices depend on it · else no invoices → deletes where the id and the owner match (removes Customer or SenderProfile) · alt an invoice was saved between the count and the delete → restrict violation, recounts the invoices, the same CONFLICT with the new count · else deleted → success
>
> — `sad.md §6, Flow 9, abridged` · full text: [sad.md](../sad.md)

> S->>S: validates the list query with the shared list schema · alt […] invalid → VALIDATION […] · else counts the owner's records matching the search on the list's name fields, in any letter case · […] reads one page where the owner matches, in today's order ending with the record id
>
> — `sad.md §6, Flow 4, abridged` · full text: [sad.md](../sad.md)

> app/api/convert-image/route.ts               ✎ owned-profile lookup through lib/services/sender-profiles
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** The owner filter lives in every write's own `where` clause (ADR-0003). […] A miss (Prisma `P2025`) maps to the same `NOT_FOUND`.
>
> — `sad.md §4, choice 3, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Wrappers keep today's `revalidatePath` lists verbatim.
>
> — `sad.md §11, risk row 1, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** 100% of business functions that take a record identifier have a foreign-record test (read, change, delete) proving AC-08
>
> — `spec.md §6, Tenant isolation, verbatim` · full text: [spec.md](../spec.md)

**Today's revalidations (keep verbatim):** create, update and delete → `protectedRoutes.senderProfiles`. — `lib/actions/sender-profile-actions.ts:64,130,197`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice:

| Entity | Aggregate root | Owner path (ADR-0003) | List search fields (ADR-0005) | List order today (id tiebreak added, spec §1 change 4) |
|---|---|---|---|---|
| `SenderProfile` | root | `userId = A` | `name`, `legalName` | as today, then `id` |

— `data-model.md §Entities, Aggregate roots table, row SenderProfile, verbatim` · full text: [data-model.md](../data-model.md)

> `Invoice` → `SenderProfile` / `Customer` / `BankAccount` stay `ON DELETE RESTRICT`. The race branch of SAD §6 flow 9 depends on it.
>
> — `data-model.md §Entities, write rules, verbatim` · full text: [data-model.md](../data-model.md)

## API contract

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listSenderProfiles(actor, query?: ListQuery)` ★ | `Page<SenderProfileWithRelations>` = | search on `name`, `legalName`. Order `isDefault desc, updatedAt desc, id` | `getSenderProfiles()` → `data.items` |
| `getSenderProfile(actor, id)` | `SenderProfileWithRelations` = | `NOT_FOUND` "Sender profile not found." | `getSenderProfile(id)` |
| `getSenderProfileLogo(actor, id)` ★ | `{ logo: string \| null }` | `NOT_FOUND` | `POST /api/convert-image` (it answers 404 on `NOT_FOUND` **or** `logo: null`, as today) |
| `createSenderProfile(actor, input: SenderProfileFormValues)` | `SenderProfile` = | `VALIDATION` | `createSenderProfile(data)` |
| `updateSenderProfile(actor, id, input: SenderProfileFormValues)` | `SenderProfile` = | `VALIDATION` → `NOT_FOUND` | `updateSenderProfile(id, data)` |
| `deleteSenderProfile(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` + `HAS_INVOICES`, also after the race recount (flow 9, AC-17) | `deleteSenderProfile(id)` |

— `contracts/public-api.md §2.4, Sender profiles, verbatim` · full text: [public-api.md](../contracts/public-api.md)

The HTTP contract of `POST /api/convert-image` is unchanged (`architecture-hardening/contracts/openapi.yaml`). Only the lookup at `app/api/convert-image/route.ts:64` moves. — `contracts/public-api.md, intro, abridged`

## Acceptance criteria

### AC-08 — authorization

> **Given** an Assistant acting for Freelancer A, and a record (invoice, customer, product, custom price, sender profile or bank account) that belongs to Freelancer B
> **When** it asks to read, change or delete that record by its identifier, or asks for a list that belongs to it (for example the custom prices of B's customer)
> **Then** the system answers exactly as it does for an identifier that never existed, and B's record stays unchanged, so A's side cannot even learn that the record exists
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — domain invariant

> **Given** one of A's customers or sender profiles has invoices
> **When** an Assistant acting for A, or A in the browser, tries to delete it on its own
> **Then** the system blocks the deletion and says how many invoices depend on it, as it does today
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: write `tests/integration/services/sender-profiles/sender-profiles.test.ts` (request-free). Cover the list (search on `name`/`legalName` in any case, full list in today's order), get, create, update, `getSenderProfileLogo`, the has-invoices `CONFLICT`, and the restrict-race recount.
- [ ] RED: write `tests/integration/services/sender-profiles/foreign-record.test.ts` for `getSenderProfile`, `getSenderProfileLogo`, `updateSenderProfile` and `deleteSenderProfile` with B's id → `NOT_FOUND`, B's row byte-identical.
- [ ] Create `lib/services/sender-profiles/sender-profiles.ts` (`import 'server-only'`). Move `countSenderProfileInvoices` and today's create/update rules (default-profile handling, HTTPS logo rule) from `lib/actions/sender-profile-actions.ts` unchanged. Order `[{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }]`.
- [ ] Owner-scoped writes `{ id, userId: actor.userId }`, with `P2025 → NOT_FOUND` via `lib/services/_shared/owner-scope.ts`. Delete: owner-scoped count → `hasInvoicesConflict('sender profile', n)`. On `isRestrictForeignKeyError`, recount → the same CONFLICT.
- [ ] Rewrite `lib/actions/sender-profile-actions.ts` as thin wrappers (same exports and signatures, today's revalidations, `getSenderProfiles()` → `data.items`).
- [ ] In `app/api/convert-image/route.ts`, replace the `prisma.senderProfile.findFirst` at line 64 with `getSenderProfileLogo(actor, senderProfileId)`. Return the existing 404 body on `NOT_FOUND` or `logo: null`, and keep every other response as it is. The route authenticates with `requireSession()` (`lib/helpers/route-auth.ts`), which returns its own 401 response, while T3 delivers `actingFreelancerFromSession()` for actions. Replace `requireSession()` with T3's `actingFreelancerForRoute()`, which returns the same 401 response on `ok: false`. Never cast `as ActingFreelancer` (lint-banned, sad.md §8).
- [ ] Run `tests/integration/actions/sender-profile-https-logo.test.ts`, `delete-blocked-by-invoices.test.ts`, the foreign-record parity test and `tests/integration/api/**` for convert-image unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| B's profile id on get/logo/update/delete | `NOT_FOUND` "Sender profile not found.", with B's row unchanged |
| Profile has invoices | `CONFLICT` + `details: { kind: 'HAS_INVOICES', invoiceCount }` |
| An invoice is saved between the count and the delete | restrict violation → recount → the same `CONFLICT`, never `FAILED` |
| convert-image for an owned profile without a logo | 404 body as today (the route treats `logo: null` like `NOT_FOUND`) |
| convert-image for B's profile | 404 body identical to a nonexistent id |
| Invalid list query | `VALIDATION`, no records |

## Definition of Done

- [ ] Request-free integration tests pass for all six functions, including AC-17 and the race
- [ ] Foreign-record tests pass for every id-taking function
- [ ] `lib/actions/sender-profile-actions.ts` and `app/api/convert-image/route.ts` have no `prisma` import. Existing tests pass with 0 changed expectations
- [ ] Every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
