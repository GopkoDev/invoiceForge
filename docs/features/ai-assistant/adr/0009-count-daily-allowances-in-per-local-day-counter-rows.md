---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0009 — Count daily allowances in per-local-day counter rows

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Two daily limits are new: the Daily message allowance (30 messages per Freelancer per day in the Freelancer time zone) and the per-key draft limit (50 Assistant drafts per Personal key per day, liftable by +50 for today once reached, repeatable). The repo already has a rate limiter: a sliding-window event log (`LimitEvent`) under an advisory lock, purged daily, failing closed for Assistant calls.

## Decision drivers

- Spec §6: 0 messages processed beyond the allowance under simultaneous sends (AC-10b); 30 per day renewing at midnight in the Freelancer time zone; 50 drafts per key per day, liftable.
- AC-11: a message whose reply failed on the system's side is not counted.
- Spec §6.1: per-day message counts and per-key draft counts and lift times are listed in the data export and removed with the account.
- Spec §8 (resolved here): a time-zone change never renews the allowance earlier than 24 hours after the first message of that day.

## Considered options

1. **Counter rows per local day** — one row per (Freelancer, local day) with `used`, the time zone and first-message time it was opened with; one row per (key, local day) with `created`, `allowance` (50 + 50 per lift) and `lastLiftedAt`. A message reserves a slot with a conditional increment (`used < 30`) before any model call and releases it on a system-side failure.
2. **New scopes in the `LimitEvent` log** — one event per message or draft, a window from local midnight to now, a delete on failure and a lift event.

## Decision outcome

**Chosen:** Option 1. A conditional increment is atomic without an advisory lock, maps one-to-one to a calendar day and a lift, shows "N left today" in one read, and keeps the per-day aggregates the export must list; the event log is purged after a day and models rolling windows, so the time-zone rule, "lift only when reached" and the export become awkward queries over it.

## Consequences

**Positive**
- Exactly-once reservation under concurrency; refund is a single decrement.
- The MCP draft tool and the Connect your AI page read the same key counter.

**Negative**
- A second limiting pattern beside `LimitEvent`; both are documented in §8.
- The time-zone rule needs the row to remember its time zone and first-message time; a new day starts only when the local date changed *and*, if the time zone changed, 24 hours passed since that first message.

**Neutral**
- Counting fails closed: if the reservation cannot be written, the message is not processed and nothing is counted (same posture as mcp-server ADR-0007).

## Links

- Spec: [[../spec.md]] §6, §6.1, §8, AC-09–AC-11c, AC-27, AC-28, AC-34
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: mcp-server ADR-0007
