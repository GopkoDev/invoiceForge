---
id: T08
title: "Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure"
layer: "app"
deps: ["T01", "T03"]
blocks: ["T22", "T31"]
acs: ["AC-09", "AC-10", "AC-10b", "AC-11"]
files_hint: ["lib/services/assistant-usage/allowance.ts", "lib/services/assistant-usage/index.ts", "tests/integration/services/assistant-usage/allowance.test.ts", "tests/unit/services/assistant-usage/allowance-day.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T08 — Count the Daily message allowance in per-local-day rows: read, reserve with a conditional increment, release on failure

## Place in the sequence

- **Blocked by:** T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables, T03 — Add the FORBIDDEN code, the three new error-detail kinds, the shared assistant types and the zod draft schemas · **Blocks:** T22 — Build the AI start panel with example prompts, the start=draft variant and the AllowanceNotice counter and used-up modes, T31 — Serve POST /api/chat: validate, check the Conversation, reserve a slot, stream the turn, save it, release on failure · **Wave:** 2 — the cost guard the chat route and the AI section read.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to see how many messages I have left today and what happens when they run out
> **So that** a limit never surprises me in the middle of a task
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

This task makes the allowance exact and honest: it counts per local day, never lets two tabs overshoot, gives a slot back when the system fails, and tells the Freelancer when it renews.

## Inlined context

> **Chosen:** Option 1. (**Counter rows per local day** — one row per (Freelancer, local day) with `used`, the time zone and first-message time it was opened with … A message reserves a slot with a conditional increment (`used < 30`) before any model call and releases it on a system-side failure.) A conditional increment is atomic without an advisory lock, maps one-to-one to a calendar day and a lift, shows "N left today" in one read, and keeps the per-day aggregates the export must list.
>
> — `adr/0009 §Decision outcome + Option 1, abridged` · full text: [ADR-0009](../adr/0009-count-daily-allowances-in-per-local-day-counter-rows.md)

> *Allowance after a time-zone change:* changing the Freelancer time zone never renews the allowance earlier than 24 hours after the first message of that day. The counter row keeps the time zone and first-message time it was opened with (ADR-0009).
>
> — `sad.md §4, resolved spec §8 open questions, verbatim` · full text: [sad.md](../sad.md)

> - Daily message allowance (roadmap D2): it counts every message the chat accepts, including refused and follow-up turns. … Only messages whose reply failed on the system's side are not counted. Pressing Create on a draft card, or confirming an updated card, is not a message: it never counts and still works when no messages are left.
>
> — `spec.md §1, decision "Daily message allowance", abridged` · full text: [spec.md](../spec.md)

> | Daily message allowance | 30 messages per Freelancer per day, renewing at midnight in the Freelancer time zone | integration test |
> | Allowance enforcement under concurrency | 0 messages processed beyond the allowance | integration test with simultaneous sends |
>
> — `spec.md §6, NFR rows, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** Counting fails closed: if the reservation cannot be written, nothing is processed.
>
> — `sad.md §8, Error handling, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([data-model.md](../data-model.md) §MessageAllowanceDay · [ADR-0009](../adr/0009-count-daily-allowances-in-per-local-day-counter-rows.md) · [server-actions.md](../contracts/server-actions.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `userId` | TEXT | PK (1), FK → `User(id)` CASCADE | read/write |
| `day` | TIMESTAMP(3) | PK (2) | the local calendar day at 00:00 UTC |
| `used` | INTEGER | NOT NULL DEFAULT 0 | reserve +1 / release −1 |
| `timeZone` | TEXT | NOT NULL | the zone the day was opened with |
| `firstMessageAt` | TIMESTAMP(3) | NOT NULL | first reservation of the day |

Access patterns:
- **Which day is "today":** read the latest row, `WHERE "userId" = $1 ORDER BY "day" DESC LIMIT 1`. A new day starts when the local date in the current zone is after that row's `day`. If the zone differs from the row's `timeZone`, a new day also needs `$now ≥ firstMessageAt + 24 h`. Otherwise the latest row stays current.
- **Reserve:** `INSERT … ON CONFLICT DO NOTHING` the day row, then `UPDATE … SET "used" = "used" + 1 WHERE "userId" = $1 AND "day" = $d AND "used" < 30`. 0 rows affected = used up. If the write itself fails, nothing is processed.
- **Release:** `UPDATE … SET "used" = "used" - 1 WHERE … AND "used" > 0`.
- **"N left today":** `30 − used` from the same read.

— `data-model.md §MessageAllowanceDay, abridged` · full text: [data-model.md](../data-model.md)

## API contract

```ts
getAllowanceState(actor): Promise<ActionResult<AllowanceState>>   // writes nothing; no row today → used: 0
reserveMessageSlot(actor, now): Promise<{ ok: true; state: AllowanceState; release: () => Promise<AllowanceState> }
  | { ok: false; usedUp: AllowanceUsedUpDetails } | { ok: false; unavailable: true }>;
```
`AllowanceState { limit: 30, used, left, renewsAt, timeZone }`; `AllowanceUsedUpDetails { kind: ALLOWANCE_USED_UP, limit: 30, renewsAt, timeZone }` — `renewsAt` is the next local midnight, or the 24-hour mark after a time-zone change.

— `contracts/server-actions.md §getAllowanceState, §Chat route internals; openapi.yaml AllowanceState, AllowanceUsedUpDetails, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-09 — happy path

> **Given** a Freelancer with a Daily message allowance of 30 who has sent 18 messages today
> **When** they send one more message
> **Then** the chat shows 11 messages left today
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-10 — domain invariant

> **Given** a Freelancer who has used their whole Daily message allowance today
> **When** they try to send another message
> **Then** the message is not processed; the chat says plainly that today's allowance is used up, when it renews in their own local time, and that an AI client connected through a Personal key is not affected — and their earlier Conversations stay readable
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-10b — domain invariant

> **Given** a Freelancer with one message left today and the chat open in two browser tabs
> **When** they send a message from both tabs at the same moment
> **Then** only one message is processed and the other tab shows that today's allowance is used up
>
> — `spec.md §5, AC-10b, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — error

> **Given** a Freelancer with messages left today
> **When** a reply fails on the system's side before it is complete
> **Then** the chat says the reply could not be completed and invites them to try again, and that message does not count toward the allowance
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Pure day logic (`currentAllowanceDay(latestRow, zone, now)`, `renewsAt`) with the 24-hour rule — `lib/services/assistant-usage/allowance.ts`
- [ ] `getAllowanceState` (read only) and `reserveMessageSlot` with `release` — same file; export from `lib/services/assistant-usage/index.ts`
- [ ] Unit tests for the day logic (midnight in Kyiv, zone change before/after 24 h, UTC fallback) — `tests/unit/services/assistant-usage/allowance-day.test.ts`
- [ ] Integration tests: 18 used → reserve → 11 left (AC-09); 30th then 31st (AC-10); `used: 29` + two parallel reserves on separate connections → one ok (AC-10b); release restores (AC-11); a failing write → `unavailable` — `tests/integration/services/assistant-usage/allowance.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| No row today | `used: 0, left: 30`; `getAllowanceState` writes nothing |
| Two tabs race for the last slot | exactly one `ok`, the other `usedUp` (AC-10b) |
| Release called twice | the second is a no-op (`used > 0` guard and a once-only `release`) |
| Zone changed after the day's first message, < 24 h | same day row stays current; `renewsAt` = firstMessageAt + 24 h |
| User has no saved zone | UTC |
| Database error on reserve | `{ ok: false, unavailable: true }` — caller processes nothing |

## Definition of Done

- [ ] Integration tests on Postgres show 30 reservations succeed and the 31st returns ALLOWANCE_USED_UP with renewsAt, two simultaneous reservations for the last slot yield exactly one success, release gives a slot back, a write failure fails closed, and a time-zone change never opens a new day earlier than 24 h after firstMessageAt.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
