---
id: T11
title: "Keep exactly one default sender profile per Freelancer under the User row lock"
layer: "app"
deps: ["T02"]
blocks: ["T19"]
acs: ["AC-17", "AC-17b"]
files_hint: ["lib/services/sender-profiles/sender-profiles.ts", "lib/actions/sender-profile-actions.ts", "tests/integration/services/sender-profiles/single-default.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T11 — Keep exactly one default sender profile per Freelancer under the User row lock

## Place in the sequence

- **Blocked by:** T02 — Promote the four staged migrations, declare them in the Prisma schema and adapt the test factories · **Blocks:** T19 — Show default-checkbox states and currency-lock and price errors in the sender profile, bank account and product forms · **Wave:** 2 — needs the partial unique index `SenderProfile_userId_isDefault_key` from T02.
- **Lane:** own lane (parallel with T12, which applies the same pattern to bank accounts).

## Why (user story)

> **As a** Freelancer
> **I want** exactly one default sender profile and one default bank account per profile at all times
> **So that** a new invoice always starts from the profile and account I chose
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task delivers the sender-profile half: create, switch, delete and unset keep exactly one default per Freelancer.

## Inlined context

> The database guarantees "at most one" on every path, present and future; the service guarantees "at least one" under a lock on the parent (`User` row for profiles, `SenderProfile` row for accounts) that also serializes the 10 parallel requests. Make-default clears and sets inside that transaction, so a failure rolls back to the old default. Create sets `isDefault` when no sibling exists; delete of the default promotes the earliest-created remaining sibling in the same transaction; an update that tries to clear the flag without choosing another is refused.
>
> — `adr/0005-…, Decision outcome, abridged` · full text: [ADR-0005](../adr/0005-guard-single-defaults-with-partial-unique-indexes-and-a-parent-row-lock.md)

> Flow 10: begin, lock the parent row, a parallel request waits here → make B the default: unset the current default, set B, commit (a repeated request finds B already default) · create: default only if it is the first · delete the current default while others remain: delete it, make the earliest-created remaining one the default · unset without choosing another: refused · the write fails or hits the unique index: rolled back, retryable conflict, A stays the default.
>
> — `sad.md §6, Flow 10, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Exactly 1 default after 10 parallel "set as default" requests, for sender profiles and for bank accounts.
>
> — `spec.md §6, NFR Default uniqueness, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** every write scoped by owner in its own `WHERE`; a unique-constraint hit on a default index → retryable `CONFLICT`, never `FAILED`.
>
> — `sad.md §8, Authorization / Error handling, abridged` · full text: [sad.md](../sad.md)

Code today (commit 87862ef): `createSenderProfile` / `updateSenderProfile` in `lib/services/sender-profiles/sender-profiles.ts` clear siblings with a separate `updateMany` outside any transaction or lock; `deleteSenderProfile` does not promote.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `SenderProfile.isDefault` | BOOLEAN | NOT NULL DEFAULT false; partial UNIQUE (`userId`) WHERE `isDefault` = true (`SenderProfile_userId_isDefault_key`, created by T02) | written under the lock |

Access pattern, one transaction: `SELECT 1 FROM "User" WHERE "id" = $owner FOR UPDATE`; make-default = clear others (`… AND "id" <> $b`) then set B; create = `isDefault = NOT EXISTS (… WHERE "userId" = $owner)`; delete default = delete, then promote `ORDER BY "createdAt", "id" LIMIT 1`; unset = refused before any write. P2002 on the index means a path skipped the lock → retryable `CONFLICT` + SAD §7 alert.

— `data-model.md §SenderProfile, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`lib/actions/sender-profile-actions.ts` — signatures unchanged; under the **`User`** row lock:
- `createSenderProfile`: first profile → default whatever was sent; `isDefault = true` → switch.
- `updateSenderProfile`: `isDefault = false` on the current default → `VALIDATION`, `fieldErrors.isDefault = ["The default sender profile can't be switched off. Make another profile the default instead."]`; `isDefault = true` → switch (repeat → `success`).
- `deleteSenderProfile`: promotes the earliest-created remaining profile.
- P2002 on `SenderProfile_userId_isDefault_key` → `CONFLICT`, "Couldn't change the default sender profile. Please try again."
- Prefix conflict and every other outcome unchanged.

— `contracts/server-actions.md §Sender profiles, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-17 — happy path

> **Given** a Freelancer with two sender profiles, A being the default
> **When** they make B the default by double-clicking, or from two tabs at the same moment
> **Then** exactly one profile is the default afterwards. The same holds for bank accounts within one sender profile. If making B the default fails, A stays the default
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-17b — domain invariant

> **Given** a Freelancer managing sender profiles, or the bank accounts of one sender profile
> **When** they create the first one, delete the current default while others remain, or try to unset the default without choosing another
> **Then** the first one created becomes the default automatically; after the default is deleted, the earliest-created remaining one becomes the default; and the default cannot simply be unset, only replaced by making another one the default. At every moment exactly one is the default while any exist
>
> — `spec.md §5, AC-17b, verbatim` · full text: [spec.md](../spec.md)

(Bank-account half of both ACs is T12; the form states are T19.)

## Checklist

- [ ] `lib/services/sender-profiles/sender-profiles.ts` — a small helper that opens `prisma.$transaction`, locks `User` by `actor.userId` `FOR UPDATE`, and runs the write.
- [ ] `createSenderProfile`: `isDefault = (no sibling) || data.isDefault`; when true and siblings exist, clear first then insert.
- [ ] `updateSenderProfile`: refuse unset of the current default (`VALIDATION`, contract text); switch = clear others then set this one; already default → no-op success.
- [ ] `deleteSenderProfile`: inside the lock, delete, then promote the earliest-created remaining (`createdAt`, `id`) if the deleted one was default. Existing "used by invoices" refusal unchanged.
- [ ] Map P2002 on `SenderProfile_userId_isDefault_key` to the retryable `CONFLICT`.
- [ ] `lib/actions/sender-profile-actions.ts` — no rule; pass results through.
- [ ] `tests/integration/services/sender-profiles/single-default.test.ts` — first profile default; switch; failure keeps A (simulate failure after clear → rollback); delete promotes earliest; unset refused; 10 parallel `updateSenderProfile(isDefault: true)` → exactly 1 default.

## Edge cases

| Case | Behaviour |
|---|---|
| first profile created with `isDefault: false` | stored as default |
| make B default twice (double click) | second waits on the lock, finds B default, `success` |
| two tabs: make B and make C default at once | serialized; exactly one default (the later) |
| delete the only profile | allowed as today; no default needed (none exist) |
| delete a non-default profile | no promotion |
| unset request on a non-default profile | ordinary update, no error |
| foreign profile id | `NOT_FOUND` |

## Definition of Done

- [ ] Integration tests show the first profile becomes default, switching clears and sets in one transaction, deleting the default promotes the earliest-created remaining one, unsetting without a replacement is VALIDATION with the contract text, P2002 maps to the retryable CONFLICT, and 10 parallel set-default requests leave exactly 1 default.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
