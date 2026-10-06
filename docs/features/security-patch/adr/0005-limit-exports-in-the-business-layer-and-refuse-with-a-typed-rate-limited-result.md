---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0005 — Limit exports in the business layer and refuse with a typed RATE_LIMITED result

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

The full data export (`GET /api/user/export` → `getAccountExport(actor)` in `lib/services/account`) has no limit. AC-23 – AC-25 cap it at 3 runs per Freelancer per hour. A run counts from the moment it starts, a failure on the system's side frees its place again, concurrent requests never run more than 3, and the refusal tells the Freelancer when they can export again. `ActionResult` (service-layer ADR-0002, architecture-hardening ADR-0009) has the codes `UNAUTHORIZED | NOT_FOUND | VALIDATION | CONFLICT | FAILED`, none of which means "try again at a given time". The export is a business function that a future Assistant may also call.

## Decision drivers

- AC-23, AC-24, AC-25: per-Freelancer, reservation semantics, a stated retry time.
- Spec §1 committed approach: close each hole at the point every caller passes through.
- Service-layer ADR-0002: failures travel as the typed `ActionResult` union, visible in the type system for the Assistant.

## Considered options

1. **In the business function, with a new code.** `getAccountExport` reserves a place through the Limits module (ADR-0002) before reading any data, and releases it if the run fails on the system's side. A refusal returns `fail('RATE_LIMITED', …, { details: { kind: 'RETRY_AT', retryAt } })`. The route maps it to `429` with `Retry-After`, and SCR-06 shows "you can export again at …".
2. **In the route handler only.** The route checks and records before calling the business function and returns `429` itself. `ActionResult` stays unchanged.

## Decision outcome

**Chosen:** Option 1. Every caller of the export, the route today and an Assistant tool later, is limited by construction. The release-on-failure rule lives next to the code that knows whether the failure was the system's. The new code is a reusable, typed signal for any later limit. Option 2 leaves direct business-layer callers unlimited, and it forces the route to infer why the business function failed.

## Consequences

**Positive**
- One limit for all callers; reservation and release stay atomic with the run.
- `RATE_LIMITED` + `RETRY_AT` is available to future limits and to the Assistant.

**Negative**
- Extending `ActionErrorCode` touches a type shared by every module and the client. Exhaustive `switch` statements over codes must handle the new case, and TypeScript flags each one.
- The business layer now depends on the Limits module (both are server-only, so the ADR-0006 boundary holds).

**Neutral**
- An export abandoned after the file was produced still counts (AC-24). Only a system-side failure releases the place.
- The `api` stage adds the `429` response to the export contract.

## Links

- Spec: [[../spec.md]] US-09, AC-23 – AC-25
- SAD: [[../sad.md]] §5
- Related ADR: [[0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock]]; service-layer ADR-0002
