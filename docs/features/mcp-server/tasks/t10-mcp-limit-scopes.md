---
id: T10
title: "Add the per-key and per-source MCP limit scopes that fail closed"
layer: "infra"
deps: ["T01"]
blocks: ["T12"]
acs: ["AC-11"]
files_hint: ["lib/security/limits/scopes.ts", "lib/security/limits/limit-store.ts", "lib/security/limits/mcp.ts", "tests/integration/security/limits/mcp-limits.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T10 — Add the per-key and per-source MCP limit scopes that fail closed

## Place in the sequence

- **Blocked by:** T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone (adds `MCP_KEY` / `MCP_SOURCE` to `LimitScope`) · **Blocks:** T12 — Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline · **Wave:** 2 — runs in parallel with T09 and T11's other prerequisites.
- **Lane:** own lane (`lib/security/limits/` is touched by no other task).

## Why (user story)

> **As a** Freelancer
> **I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
> **So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task delivers the "bounded rate": the per-key call window and the per-source refused-key-check window, both failing closed.

## Inlined context

> **Chosen:** Option 1. It is exact across instances, already reviewed, already purged, and its failure mode (database unavailable) coincides with the tools being unable to answer anyway.
> (Option 1 — **Reuse the Postgres limit log** — two new scopes in `LimitEvent`: a per-key scope counting calls that passed the key check, and a per-source scope counting refused key checks; any store error refuses the call.)
>
> — `adr/0007 §Decision outcome + §Considered options, abridged` · full text: [ADR-0007](../adr/0007-count-assistant-calls-in-the-existing-postgres-limit-log-and-fail-closed.md)

> | Per-key call limit | 60 calls per minute per Personal key; no daily cap |
> | Failed-key attempts per source | at most 30 refused key checks per 5 minutes per network source; beyond that the source is refused before any key is checked |
> | Limiter failure mode | fail-closed: 100 % of Assistant calls are refused while the limit store is unavailable |
>
> — `spec.md §6, NFR rows, verbatim` · full text: [spec.md](../spec.md)

> ```ts
> checkMcpSource(sourceKey: string, now: Date): Promise<{ allowed: true } | { allowed: false; retryAt: Date } | { unavailable: true }>;
> recordRefusedKeyCheck(sourceKey: string, now: Date): Promise<void>;     // MCP_SOURCE / REFUSED
> takeMcpKeyCall(keyId: string, userId: string, now: Date): Promise<{ allowed: true } | { allowed: false; retryAt: Date } | { unavailable: true }>; // MCP_KEY / REQUESTED
> ```
> `unavailable` maps to `503` (fail closed). A refused key check is recorded for a missing header too (decided at `api`, 2026-10-04). If recording a refused key check fails, the call is still refused with the uniform `401`.
>
> — `contracts/server-actions.md §Limits, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> - No new outcome values. Every check and record runs under the existing per-`(scope, key)` advisory lock, against `LimitEvent_scope_key_at_idx`. The existing daily sweep and the opportunistic purge cover the new rows.
> - The security-patch app rule "`userId` only on `EXPORT` rows" becomes "`userId` only on `EXPORT` and `MCP_KEY` rows".
> - **Time handling:** unchanged from security-patch. Insert `at` from the app clock, and bind every cutoff as a parameter, never `now()`.
>
> — `data-model.md §LimitEvent, verbatim` · full text: [data-model.md](../data-model.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Scope | `key` | Outcome written | Counted rule | `userId` |
|---|---|---|---|---|
| `MCP_KEY` ★ | `PersonalKey.id` | `REQUESTED`: every call that passed the key check, tool listings included. Nothing is written for a call the limit refuses (AC-11) | `count(REQUESTED) where at > now − 60 s` ≥ 60 → refused. Retry at `min(at) + 60 s` | the key's owner (so account deletion cascades these rows) |
| `MCP_SOURCE` ★ | `sourceLimitKey(ip)`: the existing HMAC digest of the IPv4 address or IPv6 /64 | `REFUSED`: every refused key check (missing, malformed, unknown, revoked) | `count(REFUSED) where at > now − 5 min` ≥ 30 → the source is refused before any key check | NULL |

— `data-model.md §LimitEvent, scope table, verbatim` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (T12 maps `{ allowed: false, retryAt }` to `429` + `Retry-After` and `{ unavailable: true }` to `503`.)

## Acceptance criteria

### AC-11 — domain invariant

> **Given** a Personal key that has made 60 calls in the past 60 seconds
> **When** it makes another call
> **Then** the system refuses that call and tells the Assistant when it can try again. Every call presented with the key that passes the key check counts, including tool listings; calls refused by the limit do not count, and the 60 seconds are always the most recent 60, not a calendar minute. The Freelancer's other keys and every other Freelancer keep working normally
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `MCP_KEY: { windowMs: 60_000, max: 60, countedOutcomes: ['REQUESTED'] }`, `MCP_SOURCE: { windowMs: 5 * MIN, max: 30, countedOutcomes: ['REFUSED'] }` — `lib/security/limits/scopes.ts`
- [ ] Allow `userId` on `MCP_KEY` rows; keep the advisory-lock check-and-record path — `lib/security/limits/limit-store.ts`
- [ ] `checkMcpSource`, `recordRefusedKeyCheck`, `takeMcpKeyCall` returning `unavailable` on any store error — `lib/security/limits/mcp.ts`
- [ ] Integration tests with a fake clock and a broken store — `tests/integration/security/limits/mcp-limits.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| 60 counted calls, oldest 59 s ago | call 61 refused, `retryAt` = oldest `at` + 60 s, nothing written |
| Oldest of 60 calls slid out of the window | next call allowed (sliding, not calendar minute) |
| Key A at the limit | key B of the same Freelancer and other Freelancers unaffected |
| 30 refusals from one source in 5 min | `checkMcpSource` → `{ allowed: false, retryAt: oldest + 5 min }` |
| Store throws / unreachable | `{ unavailable: true }` for both checks (fail closed) |
| `recordRefusedKeyCheck` fails | no throw to caller that would change the 401 |

## Definition of Done

- [ ] Integration tests show the 61st counted call in the most recent 60 s refused with retryAt = oldest + 60 s while other keys pass, refused calls not counted, 30 refused key checks in 5 min block the source with retryAt = oldest + 5 min, MCP_KEY rows carry userId, and an unavailable store returns unavailable for both checks.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
