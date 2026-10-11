---
id: T17
title: "Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached"
layer: "app"
deps: ["T03", "T09"]
blocks: ["T21", "T24"]
acs: ["AC-27", "AC-28"]
files_hint: ["lib/services/assistant-usage/key-drafts.ts", "lib/services/personal-keys/personal-keys.ts", "lib/actions/personal-key-actions.ts", "types/personal-key/types.ts", "tests/integration/services/assistant-usage/key-drafts.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T17 — Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached

## Place in the sequence

- **Blocked by:** T03 — Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas, T09 — Set Draft permission only when a Personal key is created and return it from the key list and the key check · **Blocks:** T21 — Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction, T24 — Add the Draft permission choice, the permission badges, the read-only explanation and the lift action to Connect your AI · **Wave:** 3 — the per-key write cap the MCP create path and the keys page need.
- **Lane:** shares `lib/actions/personal-key-actions.ts` with T09; shares `lib/services/personal-keys/personal-keys.ts` with T09; shares `types/personal-key/types.ts` with T09 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to create a new Personal key with Draft permission, keep my existing keys read-only, and control how many drafts a key may create per day
> **So that** my own AI client can draft invoices without a leaked key ever flooding my account
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task keeps a leaked Draft-permission key from flooding the account: at most 50 drafts a day per key, liftable by the Freelancer from the web, 50 at a time, for today only.

## Inlined context

> **Chosen:** Option 1. (… one row per (key, local day) with `created`, `allowance` (50 + 50 per lift) and `lastLiftedAt`.)
>
> — `adr/0009 §Option 1, abridged` · full text: [ADR-0009](../adr/0009-count-daily-allowances-in-per-local-day-counter-rows.md)

> Critical flow 3: in one transaction take one of today's key drafts, create the Draft invoice with origin key name, write the repeat row → key daily limit reached → no draft slot left, nothing created → refused, lift the limit on the keys page.
>
> Flow 10: for the owner's key and today in the Freelancer time zone, add 50 only if today's count has reached the limit → key not the Freelancer's, or limit not reached yet → nothing changed; limit reached → lifted, 50 more until midnight local time. Postcondition: a lift adds 50 for today only and the next day starts again at 50.
>
> — `sad.md §6, critical flow 3 + Flow 10, abridged` · full text: [sad.md](../sad.md)

> | Per-key daily draft limit | 50 Assistant drafts per Personal key per day in the Freelancer time zone; liftable by the Freelancer from the web | integration test |
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([data-model.md](../data-model.md) §PersonalKeyDraftDay · [server-actions.md](../contracts/server-actions.md) §Personal keys) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `personalKeyId` | TEXT | PK (1), FK → `PersonalKey(id)` CASCADE | read/write |
| `day` | TIMESTAMP(3) | PK (2) | the key owner's local day at 00:00 UTC |
| `created` | INTEGER | NOT NULL DEFAULT 0 | +1 per draft |
| `allowance` | INTEGER | NOT NULL DEFAULT 50 | +50 per lift |
| `lastLiftedAt` | TIMESTAMP(3) | NULL | set by a lift |

- **Take a draft slot, inside the invoice's transaction:** upsert the day row, then `UPDATE … SET "created" = "created" + 1 WHERE "personalKeyId" = $k AND "day" = $d AND "created" < "allowance"`. 0 rows affected = limit reached, so the whole transaction rolls back and nothing is created.
- **Lift:** `UPDATE … SET "allowance" = "allowance" + 50, "lastLiftedAt" = $now WHERE … AND "created" >= "allowance"`, joined to an owner check on the key. 0 rows = not reached or not the Freelancer's key. A double click lifts once.
- **Keys page:** today's row per key by `(personalKeyId, day)`. Last lift time: the latest row with `lastLiftedAt` set.

— `data-model.md §PersonalKeyDraftDay, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `takeKeyDraftSlot(tx, key, zone, now)` → `{ ok: true } | { ok: false; details: { kind: 'DRAFT_LIMIT_REACHED'; created; allowance; renewsAt } }` (internal, used by T21).
- `PersonalKeySummary` ✎ gains `draftsToday: { created: number; allowance: number; lastLiftedAt: string | null } | null` — null for read-only keys; with no row today `{ created: 0, allowance: 50, lastLiftedAt: <the latest earlier lift or null> }`.
- `liftKeyDraftLimit(keyId: string)` ★ (AC-28) → `ActionResult<{ created: number; allowance: number; lastLiftedAt: string }>`:

| Outcome | Result |
|---|---|
| lifted | `ok(…)`: `allowance + 50` for today only. `lastLiftedAt` = now. Revalidates the keys page |
| the limit is not reached yet (`created < allowance`) | `fail('CONFLICT', 'The limit can be lifted once the key has reached it.')`. A double click lifts once |
| unknown key, another Freelancer's, revoked, or read-only | `fail('NOT_FOUND', 'Key not found.')` |

— `contracts/server-actions.md §Personal keys, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-27 — domain invariant

> **Given** a Personal key with Draft permission that has created 50 Assistant drafts today in the Freelancer time zone
> **When** its Assistant tries to create another draft
> **Then** the attempt is refused with an explanation that the key's daily draft limit is reached and that the Freelancer can lift it on the page where keys are managed; reading through the key keeps working
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

### AC-28 — happy path

> **Given** a Personal key that has reached its daily draft limit
> **When** the Freelancer lifts the limit for that key on the page where keys are managed
> **Then** the key can create up to another 50 drafts until the end of today in the Freelancer time zone, and the page shows when the limit was last lifted. A limit can be lifted only once it is reached. Each lift adds 50 for today only, and lifts can be repeated. The next day the key starts again at 50.
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `takeKeyDraftSlot`, `liftKeyDraftLimit` service, `draftsTodayFor(keys)` — `lib/services/assistant-usage/key-drafts.ts`
- [ ] `listPersonalKeys` adds `draftsToday` in the owner's time zone — `lib/services/personal-keys/personal-keys.ts`, `types/personal-key/types.ts`
- [ ] `liftKeyDraftLimit` server action (session actor, revalidate `/settings/assistants`) — `lib/actions/personal-key-actions.ts`
- [ ] Integration tests: 50 then 51 (rolled-back outer tx creates nothing), lift before limit, lift at 50 → 100, parallel double lift → one lift, next local day → 50, read-only/revoked/foreign key → NOT_FOUND — `tests/integration/services/assistant-usage/key-drafts.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Lift twice in parallel at 50 | one lift (100), the other `CONFLICT` |
| Lift at 100 after 100 created | 150 |
| Day boundary in the owner's zone | new row, allowance 50 |
| Revoked key | `NOT_FOUND`; counts kept until the account goes |
| Read-only key | `draftsToday: null`; lift → `NOT_FOUND` |

## Definition of Done

- [ ] Integration tests show the 51st slot of a day is refused with DRAFT_LIMIT_REACHED and renewsAt, a lift before the limit returns CONFLICT, a lift at 50 gives 100 for today only with lastLiftedAt, a double lift lifts once, the next local day starts at 50, and listPersonalKeys returns draftsToday per draft key.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
