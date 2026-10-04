---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0006 — Save the Freelancer time zone on the account

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

architecture-hardening ADR-0010 carries the browser's time zone to the server in a `tz` cookie, resolved into `ActingFreelancer.timeZone`. An Assistant has no browser and no cookie, so it would compute "today" differently from the dashboard. Spec §1 decides that the time zone is saved on the Freelancer's account and decides "today" for every surface; the browser only fills it the first time; until one is saved, every surface uses UTC.

## Decision drivers

- Quality goal 1 / AC-22, AC-23, AC-23b: one "today" for the dashboard and every Assistant.
- AC-22: after a change, the next request on any surface uses the new zone.
- service-layer ADR-0001: `ActingFreelancer` is built only by trusted factories that resolve the zone once.

## Considered options

1. **A nullable `timeZone` column on the account** — every `ActingFreelancer` factory (session and Personal key) reads it; the browser value is saved only when the column is empty; settings change it.
2. **Keep the browser cookie** (ADR-0010) and let Assistants fall back to UTC or a per-key zone — the status quo for the dashboard.

## Decision outcome

**Chosen:** Option 1. It is the only option in which an Assistant and the dashboard agree without a browser. This supersedes architecture-hardening ADR-0010 for deciding "today"; the cookie survives only as the first-visit seed.

## Consequences

**Positive**
- Both factories produce the same `timeZone` for the same Freelancer, so parity reduces to "same account value".
- The zone is validated once on save (Intl + `pg_timezone_names`, the existing `resolveTimeZone`).

**Negative**
- Each `ActingFreelancer` construction reads the account row (one indexed read per request).
- A Freelancer who travels keeps their saved zone until they change it — intended, but different from today's behaviour.

**Neutral**
- Existing Freelancers are filled on their next visit; until then they and their Assistants use UTC alike.

## Links

- Spec: [[../spec.md]] §1, US-07, AC-22, AC-23, AC-23b
- SAD: [[../sad.md]] §4, §8
- Supersedes: architecture-hardening [[../../architecture-hardening/adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie]]
- Related ADR: [[0005-compute-overdue-at-read-time-from-one-shared-rule-module]]
