---
id: T23
title: "Add Personal keys, weekly usage and the time zone to the data export and verify deletion removes them"
layer: "app"
deps: ["T01"]
blocks: []
acs: ["AC-25", "AC-26"]
files_hint: ["lib/services/account/account.ts", "app/api/user/export/route.ts", "tests/integration/api/user-export.test.ts", "tests/integration/services/account/delete-account-keys.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T23 — Add Personal keys, weekly usage and the time zone to the data export and verify deletion removes them

## Place in the sequence

- **Blocked by:** T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone · **Blocks:** — · **Wave:** 2 — only needs the new tables.
- **Lane:** own lane. (Rows are seeded with the T01 factories; a `PersonalKey` row can be inserted directly without the T09 factory.)

## Why (user story)

> **As a** Freelancer
> **I want** my Personal keys listed in my data export and removed when I delete my account
> **So that** nothing keeps access to my data after I leave
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task extends `readExport` to version 2.1 and pins the verified deletion cascade with a test.

## Inlined context

> New per-key records: name, a one-way digest of the key, its last four characters, creation date, last use and revocation date. All are tied to the account, listed in the data export and removed with the account. … Weekly usage counts per key for the KPIs. These hold aggregates only, never request content. They are listed in the data export and removed with the account.
>
> — `spec.md §6.1, Personal data touched, abridged` · full text: [spec.md](../spec.md)

> `deleteAccount` (`lib/services/account/account.ts:44`) already ends its transaction with `prisma.user.delete`. That one statement cascades `PersonalKey`, then `PersonalKeyUsageWeek` (through `PersonalKey`), then the `MCP_KEY` limit rows (through `userId`), all inside the same transaction (verified). `MCP_SOURCE` rows belong to no account and are left to the 24 h sweep … This differs in wording from SAD flow 15 and the §11 risk, which assumed `RESTRICT` and explicit deletes.
>
> — `data-model.md §Account deletion, verbatim` · full text: [data-model.md](../data-model.md)

> - `personalKeys`: `{ name, createdAt, lastUsedAt, revokedAt }` per key, with the key's `usageWeeks`: `{ weekStart, attempts, successes, assistantErrors }`.
> - `user`: add `timeZone` and `overdueNoticeDismissedAt` to the existing `select`. They are account data now.
>
> — `data-model.md §Export, verbatim` · full text: [data-model.md](../data-model.md)

> W->>S: in the existing account-deletion transaction … alt any delete fails → transaction rolled back, nothing removed; else committed → C->>M: calls a tool with one of the deleted keys → S->>D: find an active key by digest with a live account → no key → uniform refusal, ask the Freelancer for a valid key, nothing about the account revealed
>
> — `sad.md §6, Flow 15, abridged` (data-model wins on the cascade mechanism) · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md)) and follow it. Do not guess.

## Data delta

| Table / column | Change |
|---|---|
| `PersonalKey.name, createdAt, lastUsedAt, revokedAt` | read-only (export) |
| `PersonalKey.digest, lastFour, activeNameKey, id` | **never exported** |
| `PersonalKeyUsageWeek.weekStart, attempts, successes, assistantErrors` | read-only (export, via `personalKeyId IN …` → PK prefix) |
| `User.timeZone, overdueNoticeDismissedAt` | read-only (export) |
| `PersonalKey`, `PersonalKeyUsageWeek`, `LimitEvent` (`MCP_KEY`) | deleted by the existing `prisma.user.delete` cascade |

— `data-model.md §PersonalKey + §PersonalKeyUsageWeek + §Account deletion, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getAccountExport` / `GET /api/user/export`: `exportVersion` `'2.0'` → `'2.1'` (additive only). Added `user.timeZone: string | null`, `user.overdueNoticeDismissedAt: string | null`, `personalKeys: Array<{ name; createdAt; lastUsedAt | null; revokedAt | null; usageWeeks: Array<{ weekStart; attempts; successes; assistantErrors }> }>`. The export **never** contains `digest`, `lastFour`, `activeNameKey`, `id` or the key itself. The existing per-Freelancer export limit is unchanged.
- `deleteUserAccount()` — unchanged signature; from the commit on, every key's check fails like an unknown key (uniform `401`).

— `contracts/server-actions.md §Data export + §Account deletion, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-25 — happy path

> **Given** a Freelancer with one active and one revoked Personal key
> **When** they download their data export
> **Then** the export lists each key's name, creation date, last use and revocation date, but never the key itself or anything from which it could be rebuilt
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — cross-context

> **Given** a Freelancer with active Personal keys
> **When** they delete their account
> **Then** every key stops working from that moment, and an Assistant using one is refused as in AC-07
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/services/account/account.ts` — extend `readExport` (`user` select + `personalKeys` with `usageWeeks`), bump `exportVersion` to `'2.1'`; explicit `select` lists so `digest` / `lastFour` / `activeNameKey` / `id` cannot leak.
- [ ] `app/api/user/export/route.ts` — no shape change beyond the service; confirm the version.
- [ ] `tests/integration/api/user-export.test.ts` — one active + one revoked key with usage weeks; assert fields present and forbidden fields absent (also scan the serialized JSON for the digest and full key).
- [ ] `tests/integration/services/account/delete-account-keys.test.ts` — delete the account; assert no `PersonalKey`, `PersonalKeyUsageWeek` or `MCP_KEY` rows remain and `MCP_SOURCE` rows are untouched.

## Edge cases

| Case | Behaviour |
|---|---|
| Freelancer with no keys | `personalKeys: []` |
| Never-used key | `lastUsedAt: null` |
| Active key | `revokedAt: null` |
| Time zone not saved | `user.timeZone: null` |
| Serialized export searched for the full key or digest | not found |
| Deletion transaction fails | rolled back, keys still present (existing behaviour) |

## Definition of Done

- [ ] Integration tests show export version 2.1 lists each key's name, createdAt, lastUsedAt, revokedAt and usageWeeks plus user.timeZone and overdueNoticeDismissedAt and never digest, lastFour, activeNameKey, id or the key, and deleting the account removes every key and usage row in the one transaction.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
