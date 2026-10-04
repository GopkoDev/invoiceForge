---
id: T11
title: "Authenticate a presented Personal key and record its last use and weekly usage"
layer: "app"
deps: ["T01", "T03", "T04"]
blocks: ["T12"]
acs: ["AC-05", "AC-06", "AC-07", "AC-26"]
files_hint: ["lib/services/personal-keys/authenticate.ts", "lib/services/personal-keys/usage.ts", "tests/integration/services/personal-keys/authenticate.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T11 — Authenticate a presented Personal key and record its last use and weekly usage

## Place in the sequence

- **Blocked by:** T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone, T03 — Generate, checksum and digest ifk_ Personal keys, T04 — Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings (provides `actingFreelancerFromPersonalKey`) · **Blocks:** T12 — Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline · **Wave:** 3.
- **Lane:** own lane (new files `authenticate.ts`, `usage.ts`).

## Why (user story)

> **As a** Freelancer
> **I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
> **So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see each Personal key with its name and last use, and revoke any of them
> **So that** I stay in control of which Assistants can read my data
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my Personal keys listed in my data export and removed when I delete my account
> **So that** nothing keeps access to my data after I leave
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task delivers the key check itself (the one place that turns a presented key into an `ActingFreelancer`) and the last-use and weekly-usage writes.

## Inlined context

> - `authenticatePersonalKey` checks format and checksum before any query, then looks up the digest among active keys (data-model "Authenticate"), records last use (≤ once a minute), and builds the `ActingFreelancer` through `actingFreelancerFromPersonalKey` with the account time zone, or `UTC`. `{ ok: false }` carries **no reason**: the caller cannot tell unknown from revoked from malformed (AC-07).
> - `recordPersonalKeyUsage` runs the weekly upsert (`attempts + 1`, plus `successes` or `assistantErrors`), and sets `firstSuccessAt` on the first success.
>
> — `contracts/server-actions.md §Adapter-only functions, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> - **Authenticate:** `SELECT pk."id", pk."userId", pk."firstSuccessAt", u."timeZone" FROM "PersonalKey" pk JOIN "User" u ON u."id" = pk."userId" WHERE pk."digest" = $digest AND pk."revokedAt" IS NULL` → `PersonalKey_digest_key`. No cache, so revocation takes effect on the next call (AC-06). A key of a deleted account is gone through the cascade, so "orphaned" and "unknown" are the same miss (AC-07).
> - **Record last use (at most once per minute):** `UPDATE … SET "lastUsedAt" = $now WHERE "id" = $id AND ("lastUsedAt" IS NULL OR "lastUsedAt" <= $now − 1 min)` → PK. `$now` and the cutoff come from the app clock.
> - **Record first success:** `UPDATE … SET "firstSuccessAt" = $now WHERE "id" = $id AND "firstSuccessAt" IS NULL` → PK. The adapter runs it only when the authenticate row had `firstSuccessAt` NULL.
>
> — `data-model.md §PersonalKey, Access patterns, abridged` · full text: [data-model.md](../data-model.md)

> **Count a call (flows 6 to 11):** one atomic upsert per substantive call:
> `INSERT INTO "PersonalKeyUsageWeek" (…) VALUES ($key, $weekStart, 1, $success, $assistantError) ON CONFLICT ("personalKeyId", "weekStart") DO UPDATE SET "attempts" = … + 1, "successes" = … + EXCLUDED."successes", "assistantErrors" = … + EXCLUDED."assistantErrors";`
> `$success` and `$assistantError` are 0 or 1 and never both 1. Use `$executeRaw` for it: a Prisma `upsert` with `increment` can raise P2002 when two first calls of a week race.
>
> — `data-model.md §PersonalKeyUsageWeek, Access patterns, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** **Never** log or report the `Authorization` header, a key, a key digest, or answer bodies.
> Key check on every call, no cache (0 s revocation).
>
> — `sad.md §8, Logging + Authentication rows, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `PersonalKey.digest` | TEXT | UNIQUE | read (lookup) |
| `PersonalKey.lastUsedAt` | TIMESTAMP(3) | NULL | written ≤ once a minute |
| `PersonalKey.firstSuccessAt` | TIMESTAMP(3) | NULL | written once |
| `User.timeZone` | TEXT | NULL = UTC | read in the auth join |
| `PersonalKeyUsageWeek.(personalKeyId, weekStart)` | TEXT, TIMESTAMP(3) | PK | upserted; `weekStart` = Monday 00:00 UTC |
| `PersonalKeyUsageWeek.attempts/successes/assistantErrors` | INTEGER | NOT NULL DEFAULT 0 | incremented |

— `data-model.md §PersonalKey + §PersonalKeyUsageWeek, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. Signatures (server-actions.md): `authenticatePersonalKey(fullKey, now): Promise<{ ok: true; actor; keyId; firstSuccessPending } | { ok: false }>` · `recordPersonalKeyUsage(keyId, outcome: 'success' | 'assistant_error' | 'server_failure', now): Promise<void>`.

## Acceptance criteria

### AC-05 — happy path

> **Given** a Freelancer with three Personal keys, one of which has never been used
> **When** they open the connect page
> **Then** each active key shows its name, creation date, last four characters and last use, accurate to within 5 minutes, or "never used". Last use is the latest call presented with the key that passed the key check, including tool listings and calls refused by the call limit. Each has a revoke action. Revoked keys are listed separately with their revocation date
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy path

> **Given** a Freelancer revokes a Personal key and confirms
> **When** an Assistant calls with that key and the key is checked after the revocation was confirmed, even for a call that was already waiting
> **Then** the call is refused and returns no data, and the key moves to the revoked list. A call whose key check passed before the revocation was confirmed may finish. A revoked key can never be reactivated
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — authorization

> **Given** an Assistant presenting a key that is revoked, unknown, malformed, or belongs to a deleted account
> **When** it asks for anything
> **Then** the system refuses without returning any Freelancer data and without revealing whether the key ever existed or whose it was. The refusal tells the Assistant to ask the Freelancer for a valid key
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — cross-context

> **Given** a Freelancer with active Personal keys
> **When** they delete their account
> **Then** every key stops working from that moment, and an Assistant using one is refused as in AC-07
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `authenticatePersonalKey`: `isWellFormedKey` (T03) → `digestKey` → join query → throttled last-use update → `actingFreelancerFromPersonalKey(userId, timeZone)` (T04) — `lib/services/personal-keys/authenticate.ts`
- [ ] `recordPersonalKeyUsage`: Monday-00:00-UTC `weekStart`, `$executeRaw` upsert, first-success update when pending — `lib/services/personal-keys/usage.ts`
- [ ] Integration tests with fake clock — `tests/integration/services/personal-keys/authenticate.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Malformed key / bad checksum | `{ ok: false }`, no DB query issued |
| Unknown, revoked, or deleted-account key | identical `{ ok: false }` |
| Valid key, `User.timeZone` NULL | actor `timeZone = 'UTC'` |
| Two calls 30 s apart | `lastUsedAt` written once |
| Two racing first calls of a week | one row, `attempts = 2`, no P2002 |
| `outcome = 'server_failure'` | `attempts + 1` only |
| Second success | `firstSuccessAt` unchanged |

## Definition of Done

- [ ] Integration tests show a malformed key refused with no query, unknown/revoked/deleted-account keys return the same {ok:false}, a valid key yields an ActingFreelancer with the account zone or UTC, lastUsedAt is written at most once a minute, and recordPersonalKeyUsage upserts attempts/successes/assistantErrors atomically under two racing first calls and sets firstSuccessAt once.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
