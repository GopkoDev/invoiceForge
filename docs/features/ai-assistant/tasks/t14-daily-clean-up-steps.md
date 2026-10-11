---
id: T14
title: "Add the four independent AI retention steps to the daily purge cron"
layer: "wiring"
deps: ["T01", "T04"]
blocks: []
acs: ["AC-38"]
files_hint: ["app/api/cron/purge-limits/route.ts", "lib/services/conversations/purge.ts", "lib/services/assistant-usage/purge.ts", "tests/integration/api/purge-limits.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T14 — Add the four independent AI retention steps to the daily purge cron

## Place in the sequence

- **Blocked by:** T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables, T04 — Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema · **Blocks:** nothing — a leaf of the graph · **Wave:** 2 — retention needs only the tables and the Mastra store.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to delete one or all of my Conversations, and to know they are deleted automatically after 90 days
> **So that** my customers' names and amounts do not pile up in a chat history forever
>
> — `spec.md §4, US-12, verbatim` · full text: [spec.md](../spec.md)

This task deletes Conversations automatically 90 days after their last message, and enforces every other retention period of the feature, in the cron that already runs daily.

## Inlined context

> **Retention (daily cron):**
> - **Conversations** (with their messages and Draft cards): 90 days after the last message, deleted within 24 h of the mark (spec §6).
> - **MCP repeat keys:** after 24 h (ADR-0012).
> - **Mastra traces** (metadata only): after 30 days.
> - **`AssistantTurn` rows and the daily counters** (`MessageAllowanceDay`, `PersonalKeyDraftDay`): after 400 days. They are listed in the export and removed with the account sooner.
>
> — `sad.md §7, Retention, verbatim` · full text: [sad.md](../sad.md)

> Flow 9: run the daily clean-up with the scheduler secret → secret missing or wrong → refused, nothing deleted; authorised → every step deletes by age only, so a repeated run deletes nothing new; each step on its own, one failure never skips the others … no retry inside a run, the next daily run retries every step … a step failed → report the failed step and its error.
>
> — `sad.md §6, Flow 9, abridged` · full text: [sad.md](../sad.md)

> The route keeps its auth (the cron secret) and response. It gains four independent steps … Each step reports its count and outcome. A failed step is reported to Sentry and never skips the others. This is not a public contract.
>
> — `contracts/server-actions.md §Daily clean-up, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

> **Chosen:** Option 1. A daily delete query needs no separate lifecycle, and the cron route already provides schedule, secret and Sentry reporting.
>
> — `adr/0001 §Decision outcome, verbatim` · full text: [ADR-0001](../adr/0001-build-the-backend-service-and-the-web-frontend-as-two-surfaces.md)

Current route (code): `GET` checks `Authorization: Bearer $CRON_SECRET` with `timingSafeEqual`, runs `store.purgeOlderThan24h()` and `purgeExpiredVerificationTokens()` inside a Sentry check-in, answers `{ success: true, data: { deleted } }`.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [data-model.md](../data-model.md)) and follow it. Do not guess.

## Data delta

| Step | Delete | Index |
|---|---|---|
| Conversations | `DELETE FROM "Conversation" WHERE "lastMessageAt" < $now − 90 days` (messages and cards cascade, turns SET NULL) | `Conversation_lastMessageAt_idx` |
| Repeat marks | `McpDraftRepeat WHERE "createdAt" < $now − 24 h` | `McpDraftRepeat_createdAt_idx` |
| Mastra traces | Mastra storage, older than 30 days | Mastra's own |
| Turns + counters | `AssistantTurn WHERE "createdAt" < $now − 400 days`; `MessageAllowanceDay`, `PersonalKeyDraftDay WHERE "day" < $today − 400 days` | `AssistantTurn_createdAt_idx`, `*_day_idx` |

`$now` comes from the app clock, as in the security-patch purge.

— `data-model.md §Conversation, §McpDraftRepeat, §MessageAllowanceDay, §PersonalKeyDraftDay, §AssistantTurn purge patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

`GET /api/cron/purge-limits` (internal, cron secret) — unchanged auth; the response keeps `data.deleted` and adds `data.steps: Array<{ step: 'conversations' | 'repeatMarks' | 'traces' | 'turnsAndCounters'; deleted: number | null; ok: boolean }>`.

## Acceptance criteria

### AC-38 — domain invariant

> **Given** a Conversation whose last message was 90 days ago
> **When** that day passes
> **Then** the Conversation is deleted automatically, and the Conversation list tells the Freelancer that Conversations are kept for 90 days after their last message
>
> — `spec.md §5, AC-38, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `purgeConversationsOlderThan90Days(now)` — `lib/services/conversations/purge.ts`
- [ ] `purgeRepeatMarks(now)`, `purgeTurnsAndCounters(now)`, and the Mastra trace purge (30 days) via the Mastra storage API — `lib/services/assistant-usage/purge.ts`
- [ ] Run each step in its own `try`, report a failed step with `Sentry.captureException` (step name only, no row data), keep running the rest; the check-in is `error` if any step failed — `app/api/cron/purge-limits/route.ts`
- [ ] Integration test with a fixed clock: rows at 90 days + 1 h go, at 89 days stay; repeat marks at 25 h go; 401-day counters go; second run deletes 0; one step forced to throw → the others still delete — `tests/integration/api/purge-limits.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Wrong or missing secret | 401, nothing deleted (unchanged) |
| One step throws | others run; Sentry gets the step; the response marks it `ok: false` |
| Conversation deleted while its card created an invoice | invoice untouched (AC-37 spirit) |
| Run twice in a day | the second deletes nothing new |

## Definition of Done

- [ ] An integration test with a fixed clock shows one run deletes Conversations (with messages and cards) past 90 days, repeat marks past 24 h, Mastra traces past 30 days and AssistantTurn / allowance / key-draft rows past 400 days, a second run deletes nothing new, and one failing step is reported to Sentry while the others still run.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
