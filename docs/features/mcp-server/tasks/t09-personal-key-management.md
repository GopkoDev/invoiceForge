---
id: T09
title: "Create, list and revoke Personal keys through the business layer and server actions"
layer: "app"
deps: ["T01", "T03"]
blocks: ["T21", "T22"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06"]
files_hint: ["lib/services/personal-keys/personal-keys.ts", "lib/actions/personal-key-actions.ts", "lib/validations/personal-key.ts", "tests/support/factories/personal-key.ts", "tests/integration/services/personal-keys/manage.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T09 — Create, list and revoke Personal keys through the business layer and server actions

## Place in the sequence

- **Blocked by:** T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone, T03 — Generate, checksum and digest ifk_ Personal keys · **Blocks:** T21 — Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI, T22 — Show the overdue-rule notice and the Connect your AI entry point on the dashboard · **Wave:** 2 — needs the `PersonalKey` table and the key generator.
- **Lane:** own lane (its files under `lib/services/personal-keys/` are distinct from T03's `key-format.ts` and T11's `authenticate.ts` / `usage.ts`).

## Why (user story)

> **As a** Freelancer
> **I want** to create a named Personal key from a visible "Connect your AI" entry point and get ready-to-paste setup and example prompts for my assistant
> **So that** my assistant can answer questions about my invoices without me opening the app
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see each Personal key with its name and last use, and revoke any of them
> **So that** I stay in control of which Assistants can read my data
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task delivers the business functions and server actions behind creating, listing and revoking keys, plus the "has any key ever been used" read that drives the dashboard entry point.

## Inlined context

> Every action resolves the session first (security-patch backstop guard) and calls the service with the session `ActingFreelancer`.
> `digest` and `activeNameKey` never leave the service.
> Validation: `personalKeyNameSchema = z.string().trim().min(1).max(50)` (`lib/validations/personal-key.ts`), both messages `KEY_NAME_MESSAGE`. Order: name rule → lock → count (AC-04) → name match (AC-03) → insert. With both a duplicate name and 10 active keys, the name refusal wins (flow 4 draws the name branch first).
>
> — `contracts/server-actions.md §Personal keys, createPersonalKey, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **Create (flow 4, AC-02 to AC-04), in one interactive transaction:**
> 1. `SELECT pg_advisory_xact_lock(hashtext('personal-key:' || $userId))` serializes creates per Freelancer. This is the repo's lock pattern (security-patch ADR-0002).
> 2. Count the active keys (`WHERE "userId" = $1 AND "revokedAt" IS NULL`). At 10, refuse (AC-04).
> 3. Look for an active key with the same `activeNameKey`. If there is one, refuse with the AC-03 message.
> 4. Insert.
>
> The unique index `(userId, activeNameKey)` is the backstop: a P2002 on it maps to the same AC-03 refusal.
> - **Revoke (critical flow 2):** `UPDATE … SET "revokedAt" = $now, "activeNameKey" = NULL WHERE "id" = $id AND "userId" = $actor AND "revokedAt" IS NULL` → PK. If 0 rows are affected, return `NOT_FOUND` (`notFoundIfNoneAffected`).
> - **List (flow 3):** `WHERE "userId" = $1 ORDER BY "createdAt" DESC`, split into active and revoked in the service.
> - **Entry point (AC-01):** `EXISTS (… WHERE "userId" = $1 AND "lastUsedAt" IS NOT NULL)`. Keys are never deleted while the account exists, so once a key is used, the entry point stays hidden for good.
>
> — `data-model.md §PersonalKey, Access patterns, abridged` · full text: [data-model.md](../data-model.md)

> **Chosen:** Option 1. With 256 bits of randomness a fast digest is not brute-forceable even from a database dump … The checksum lets the handler refuse malformed keys before any lookup.
>
> — `adr/0004 §Decision outcome, verbatim (cut)` · full text: [ADR-0004](../adr/0004-store-personal-keys-as-sha-256-digests-of-prefixed-random-secrets.md)

> **Hard rule:** The full key is shown once and never stored in readable form.
>
> — `spec.md §6.1, AuthZ/AuthN impact, verbatim` · full text: [spec.md](../spec.md)

> **Test fixture:** `createPersonalKey(prisma, overrides)` in `tests/support/factories/personal-key.ts` … generates a real `ifk_` key with the production generator and returns `{ row, fullKey }` … Defaults: `name: 'Test key <n>'`, active (`activeNameKey` = lower-case name), `lastUsedAt: null`. Use `revoked: true` to set `revokedAt` and clear `activeNameKey` together.
>
> — `data-model.md §Test fixtures, abridged` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `PersonalKey.name` | TEXT | NOT NULL, trimmed 1–50 | written on create |
| `PersonalKey.activeNameKey` | TEXT | NULL, UNIQUE with `userId` | `name.toLowerCase()` on create, NULL on revoke |
| `PersonalKey.digest` / `lastFour` | TEXT | NOT NULL (`digest` UNIQUE) | written on create from T03's generator |
| `PersonalKey.revokedAt` | TIMESTAMP(3) | NULL | set on revoke, never cleared |
| `PersonalKey.lastUsedAt` | TIMESTAMP(3) | NULL | read-only here (list, entry point) |

— `data-model.md §PersonalKey, table, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `createPersonalKey({ name })` → `ok({ key: PersonalKeySummary, fullKey })` · `fail('VALIDATION', KEY_NAME_MESSAGE, { fieldErrors: { name: [KEY_NAME_MESSAGE] } })` for empty / >50 / duplicate active name (also P2002) · `fail('CONFLICT', KEY_LIMIT_MESSAGE)` at 10 active · `fail('FAILED', 'Could not create the key. Try again.')`.
- `revokePersonalKey(id)` → `ok()` · `fail('NOT_FOUND', 'Key not found.')`.
- `listPersonalKeys(actor)` → `ActionResult<{ active: PersonalKeySummary[]; revoked: RevokedPersonalKeySummary[] }>` (both `createdAt` DESC); `PersonalKeySummary = { id, name, createdAt, lastFour, lastUsedAt | null }`.
- `hasUsedAnyPersonalKey(actor)` → `ActionResult<boolean>`.
- `KEY_NAME_MESSAGE = 'The name must be 1 to 50 characters and different from your other active keys.'` · `KEY_LIMIT_MESSAGE = 'At most 10 keys can be active at once. Revoke one to make room.'`

— `contracts/server-actions.md §Personal keys, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-01 — happy path

> **Given** a signed-in Freelancer with no Personal keys
> **When** they open the dashboard or the settings
> **Then** they see a "Connect your AI" entry point that leads to the connect page. On the dashboard it stays visible until any of their keys has been used at least once, and it does not come back after that, even if every key is later revoked. A key counts as used when any call presented with it passes the key check
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-02 — happy path

> **Given** a Freelancer on the connect page
> **When** they create a Personal key named "Laptop assistant"
> **Then** the full key is shown exactly once, with a copy action and a warning that it will not be shown again. The page also shows setup steps for each supported assistant, which keep the key in a private setting rather than in a project file, and three example prompts. After leaving the page, the key is shown only by its name, creation date and last four characters
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** a Freelancer creating a Personal key
> **When** the name is empty, longer than 50 characters, or the same as one of their other active keys
> **Then** the system does not create the key and tells them the name must be 1 to 50 characters and different from their other active keys. Spaces at either end are removed before checking, and names that differ only in letter case count as the same
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** a Freelancer who already has 10 active Personal keys
> **When** they try to create another
> **Then** the system refuses and tells them that at most 10 keys can be active at once and that they can revoke one to make room
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

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

## Checklist

- [ ] `personalKeyNameSchema` + `KEY_NAME_MESSAGE` / `KEY_LIMIT_MESSAGE` — `lib/validations/personal-key.ts`
- [ ] `createPersonalKey` (trim → lock → count → name match → insert via T03 `generatePersonalKey`; P2002 → AC-03 result), `revokePersonalKey`, `listPersonalKeys`, `hasUsedAnyPersonalKey` — `lib/services/personal-keys/personal-keys.ts`
- [ ] `'use server'` actions `createPersonalKey`, `revokePersonalKey` (session guard, revalidate the connect page) — `lib/actions/personal-key-actions.ts`
- [ ] Test factory `createPersonalKey(prisma, overrides)` returning `{ row, fullKey }` — `tests/support/factories/personal-key.ts`
- [ ] Integration tests for every AC-01…AC-06 outcome incl. parallel creates — `tests/integration/services/personal-keys/manage.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Name `"  Laptop  "` | stored as `Laptop`; checked after trimming |
| Name differs only by case from an active key | `VALIDATION` with `KEY_NAME_MESSAGE` |
| Same name as a **revoked** key | allowed (`activeNameKey` is NULL on revoked rows) |
| Duplicate name **and** 10 active keys | name refusal wins |
| Two parallel creates at 9 active keys | one succeeds, the other gets `CONFLICT` (advisory lock) |
| Unique-index race (P2002) | same `VALIDATION` as AC-03 |
| Revoke another Freelancer's key / already revoked / unknown id | `NOT_FOUND 'Key not found.'`, nothing changed |
| Every key revoked after one was used | `hasUsedAnyPersonalKey` stays `true` |
| List result | never contains `digest` or `activeNameKey` |

## Definition of Done

- [ ] Integration tests cover create (fullKey once, never stored), the AC-03 name refusals incl. case-insensitive duplicate and P2002 mapping, the AC-04 10-active refusal under parallel creates, list split active/revoked createdAt DESC with no digest, revoke (owner-scoped, NOT_FOUND for another Freelancer's or a revoked key) and hasUsedAnyPersonalKey staying true after every key is revoked.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
