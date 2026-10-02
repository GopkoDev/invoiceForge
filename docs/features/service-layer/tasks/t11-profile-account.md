---
id: T11
title: "Move profile, account deletion, data export and the dashboard setup check into the layer"
layer: "app"
deps: ["T3"]
blocks: ["T20"]
acs: ["AC-04", "AC-20"]
files_hint: ["lib/services/profile/", "lib/services/account/", "lib/actions/profile-actions.ts", "lib/actions/account-actions.ts", "lib/actions/dashboard-setup-check.ts", "app/api/user/export/route.ts", "tests/integration/services/account/"]
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

# T11 — Move profile, account deletion, data export and the dashboard setup check into the layer

## Place in the sequence

- **Blocked by:** T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution · **Blocks:** T20 — Close the move. **Wave:** 4 (DAG level), release wave 2 of sad.md §7 (profile, account deletion and export, dashboard setup check). It needs no list helper, so it does not wait for T4.
- **Lane:** own lane. Runs in parallel with T6–T10, T12 and T17.

## Why (user story)

> **As an** Assistant acting for a Freelancer
> **I want** creating, changing and deleting records to follow exactly the rules the web app follows (invoice numbering, amount checks, deletion guards)
> **So that** data changed through me is as trustworthy as data changed in the browser
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task moves the tenant-level functions (profile update, all-or-nothing account deletion, the data export and the setup check) into the layer. It also carries the tenant-gone rule that keeps today's sign-in behaviour.

## Inlined context

> Note over C,W: Precondition: only a wrapper that verified the session may call account deletion · W->>W: builds ActingFreelancer from the session · alt no session, or the account no longer exists → sent to sign in, nothing deleted · else W->>S: deletes the account for the ActingFreelancer · S->>D: in one transaction, deletes the invoices, the sign-in tokens and the account with everything it owns · alt any step fails → the whole transaction rolls back, S->>X: reports the cause once, S-->>W: FAILED, the account couldn't be deleted and nothing was removed · else committed → success, C signs out and lands on sign-in, as today · Postcondition: the account and all its data are either fully removed or fully intact
>
> — `sad.md §6, Flow 10, abridged` · full text: [sad.md](../sad.md)

> ├── account/                                   ★ deletion summary + all-or-nothing deletion (hardening ADR-0007), data export read
> └── profile/                                   ★ profile update, dashboard setup check
>
> — `sad.md §5, Internal decomposition, verbatim` · full text: [sad.md](../sad.md)

**Placement:** `contracts/public-api.md §2.7` lists `checkSetup` in the dashboard table for its caller, but the file lives in `lib/services/profile/` per sad.md §5. Follow sad.md §5.

> **Hard rule:** Account deletion called with the wrong identity: only a wrapper that verified the session may call it, and it stays all-or-nothing (AC-20).
>
> — `spec.md §6.1, Abuse cases, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** each unexpected failure reported exactly once
>
> — `spec.md §6, Error reporting, abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** A business function never returns `UNAUTHORIZED`, but the union still lists it. Only wrappers produce it.
>
> — `adr/0002 §Consequences, Negative, abridged` · full text: [0002](../adr/0002-return-the-existing-action-result-union-from-business-functions.md)

**Today's behaviour to preserve:** there are no `revalidatePath` calls in `profile-actions.ts` or `account-actions.ts`. `updateProfile` writes `User` and, on an email change, an `EmailHistory` row in one transaction (`profile-actions.ts:55-75`). `getAccountDeletionSummary` → `FAILED` "Something went wrong. Please try again." (`account-actions.ts`). `checkDashboardSetup` counts profiles, bank accounts, customers and products, and returns `isComplete = hasSenderProfiles && hasBankAccounts && hasCustomers` (`dashboard-setup-check.ts`).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. Read-only slice:

| Entity | Aggregate root | Owner path (ADR-0003) | List search fields (ADR-0005) | List order today (id tiebreak added, spec §1 change 4) |
|---|---|---|---|---|
| `User` | tenant | `id = A` | — | — |
| `VerificationToken` | — (keyed by the account's email) | `identifier = A's email`, deleted only in account deletion | — | — |

— `data-model.md §Entities, Aggregate roots table, rows User and VerificationToken, verbatim` · full text: [data-model.md](../data-model.md)

> `User` → `SenderProfile` / `Customer` / `Product` cascade, and account deletion deletes invoices first in the same transaction (hardening ADR-0007; flow 10).
>
> — `data-model.md §Entities, write rules, verbatim` · full text: [data-model.md](../data-model.md)

## API contract

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `updateProfile(actor, input: ProfileFormValues)` | `void` | `VALIDATION` → `NOT_FOUND` (tenant gone, §1.4) → `CONFLICT` "This email is already in use by another account." † | `updateProfile(data)`, mapping `NOT_FOUND` to `UNAUTHORIZED` |
| `getAccountDeletionSummary(actor)` | `{ invoiceCount: number }` = | `FAILED` | `getAccountDeletionSummary()` |
| `deleteAccount(actor)` | `void` | `NOT_FOUND` (tenant gone, §1.4) · `FAILED` "Your account couldn't be deleted. Nothing was removed." (all or nothing, reported once, flow 10, AC-20) | `deleteUserAccount()`, mapping `NOT_FOUND` to `UNAUTHORIZED`. **Only a session-verified wrapper may call it** (spec §6.1) |
| `getAccountExport(actor)` ★ | `AccountExport` = today's export object (`exportVersion: '2.0'`: user, accounts, emailHistory, senderProfiles, customers, products, invoices) | `NOT_FOUND` (tenant gone) · `FAILED` | `GET /api/user/export`. The route keeps the filename, headers and the 500 `EXPORT_FAILED` body, which it also uses for `NOT_FOUND` |

— `contracts/public-api.md §2.8, Profile and account, verbatim` · full text: [public-api.md](../contracts/public-api.md)

| `checkSetup(actor)` | `SetupCheckResult` = | 4 counts | `checkDashboardSetup()`. Lives in `lib/services/profile/` (sad.md §5), listed here for its caller |
|---|---|---|---|

— `contracts/public-api.md §2.7, Dashboard table, row checkSetup, verbatim` · full text: [public-api.md](../contracts/public-api.md)

> Today `updateProfile`, `deleteUserAccount` and the export route re-read the `User` row, and they answer `UNAUTHORIZED` (or the export's `FAILED` 500) if it vanished after the session check. In the layer, such a function returns **`NOT_FOUND` "Account not found."**, and the **web wrapper maps it to today's outcome** (`UNAUTHORIZED` "Not signed in." for the two actions, and the `EXPORT_FAILED` 500 body for the route). ADR-0002 stays as written.
>
> — `contracts/public-api.md §1.4, Tenant gone mid-call, verbatim` · full text: [public-api.md](../contracts/public-api.md)

† The email-in-use branch is preserved from today's code but drawn in no sad.md §6 flow (spec §8 OQ, owner `sequences`).

## Acceptance criteria

### AC-04 — error

> **Given** a signed-in Freelancer's request fails for an unexpected reason (for example the data store is unreachable)
> **When** the page or form reports the failure
> **Then** the Freelancer sees the same plain-language error and retry option as before, without internal details, and the failure is reported to error monitoring exactly once
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-20 — cross-context

> **Given** Freelancer A asks to delete their account, and the deletion fails partway through
> **When** the failure happens
> **Then** nothing is removed: A's account, sender profiles, customers, products and invoices all stay as they were, and A is told the deletion failed
>
> — `spec.md §5, AC-20, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: write `tests/integration/services/account/account.test.ts` (request-free). Cover `getAccountDeletionSummary`, `deleteAccount` success (every owned row and the VerificationToken rows are gone), `deleteAccount` with a step forced to fail (everything intact, `FAILED`, Sentry called once), the tenant-gone `NOT_FOUND`, `getAccountExport` (same object as the route today, B's data absent), `updateProfile` (email change writes `EmailHistory`, email in use → `CONFLICT`), and `checkSetup`.
- [ ] Create `lib/services/account/account.ts` (`import 'server-only'`) with `getAccountDeletionSummary`, `deleteAccount` (move the one-transaction body from `lib/actions/account-actions.ts` unchanged, hardening ADR-0007) and `getAccountExport` (move the parallel reads from `app/api/user/export/route.ts`, all scoped by `actor.userId`).
- [ ] Create `lib/services/profile/profile.ts` (`updateProfile`) and `lib/services/profile/setup-check.ts` (`checkSetup`, moved from `lib/actions/dashboard-setup-check.ts`, keeping `SetupCheckResult`). Both import `'server-only'`.
- [ ] A vanished `User` row → `fail('NOT_FOUND', 'Account not found.')` in `updateProfile`, `deleteAccount` and `getAccountExport`, never `UNAUTHORIZED`.
- [ ] Rewrite `lib/actions/profile-actions.ts`, `lib/actions/account-actions.ts` and `lib/actions/dashboard-setup-check.ts` as thin wrappers with the same exports and signatures. `updateProfile`/`deleteUserAccount` map `NOT_FOUND` → `fail('UNAUTHORIZED', 'Not signed in.')`.
- [ ] `app/api/user/export/route.ts`: replace `requireSession()` with T3's `actingFreelancerForRoute()`, which returns the same 401 response on `ok: false`, and never cast. Then call `getAccountExport`, and keep the filename, `Content-Disposition` and the 500 `EXPORT_FAILED` body, which it also returns on `NOT_FOUND`.
- [ ] Run `tests/integration/actions/account-deletion.test.ts`, `profile-actions-guard-first.test.ts` and the export route tests under `tests/integration/api/` unchanged.

## Edge cases

| Case | Behaviour |
|---|---|
| A step of the deletion transaction fails | full rollback, `FAILED` "Your account couldn't be deleted. Nothing was removed.", reported once |
| `User` row deleted between the session check and the call | the business function returns `NOT_FOUND` "Account not found.". The actions answer `UNAUTHORIZED` "Not signed in.", and the export route answers the 500 `EXPORT_FAILED` body |
| Profile email changed to another account's email | `CONFLICT` "This email is already in use by another account.", nothing written |
| Profile email unchanged | no `EmailHistory` row |
| Export for A | only A's rows. B's sender profiles, customers, products and invoices are absent |
| Data store unreachable on the summary | `FAILED` "Something went wrong. Please try again.", reported once |

## Definition of Done

- [ ] Request-free integration tests pass for all five functions, including the AC-20 rollback and the tenant-gone mapping
- [ ] No `prisma` import in the three action files or in `app/api/user/export/route.ts`. The export HTTP response is byte-identical for the same data
- [ ] Existing account, profile and export tests pass with 0 changed expectations
- [ ] Every Hard Rule inlined above still holds
- [ ] lint + `tsc --noEmit` clean
