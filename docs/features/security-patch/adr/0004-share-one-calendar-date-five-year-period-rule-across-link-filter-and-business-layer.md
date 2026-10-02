---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0004 — Share one calendar-date five-year period rule across link, filter and business layer

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

A custom Dashboard period is validated twice today, independently. The link reader (`dashboardParamsSchema` in `lib/validations/search-params.ts`) falls back to the current month on anything invalid. The business layer (`parseDashboardInput` in `lib/services/dashboard/period.ts`) returns `VALIDATION`. Neither bounds the span, and `getChartData` walks every day of the period, so `from=0100-01-01&to=9999-12-31` builds about 3.6 million day keys (brief S3). The feature adds a third reader, the browser filter, which must refuse an over-long range with a notice (AC-07b). AC-08 requires that the link reader and the business rule agree on the same boundary, defined on calendar dates independent of time zone. A period is allowed when `end ≤ start + 5 calendar years`, and a 29 February start counts to 28 February.

## Decision drivers

- AC-07, AC-07b, AC-08, AC-10: one boundary, three readers, three different reactions (fall back, notice, refuse).
- Spec §6 NFR: dashboard load p95 ≤ 2 s for any link, including an over-long period.
- Service-layer ADR-0006: `lib/services` is `server-only` and cannot be imported by client code.

## Considered options

1. **One isomorphic module.** A pure `isWithinMaxCustomPeriod(from, to)` and `MAX_CUSTOM_PERIOD_YEARS = 5` live in a dependency-free module under `lib/validations/`, with no `server-only` and no Node or Next imports. The link reader, the filter component and `period.ts` all import it.
2. **Business layer only.** The rule lives in `period.ts`. The link reader calls the business parser and falls back on `VALIDATION`, and the filter learns of the refusal only after a server round trip.

## Decision outcome

**Chosen:** Option 1. The boundary is defined once and tested once with a table: 2021-01-01 → 2026-01-01 applied, → 2026-01-02 refused, 29 February starts, and time-zone independence. All three readers then agree by construction. Option 2 cannot give the filter an immediate notice without duplicating the rule on the client, because `server-only` blocks the import.

## Consequences

**Positive**
- The link reader, the filter and the business layer can never drift apart on the boundary.
- The CPU problem is closed at both entry points: the link falls back before any query, and the business layer refuses before computing (AC-10).

**Negative**
- The business layer now imports from `lib/validations/`. The module must stay free of server or browser dependencies, enforced by a lint rule or a unit test.

**Neutral**
- "All time" stays a preset and is never passed through the custom-period rule (AC-09).

## Links

- Spec: [[../spec.md]] US-03, US-04, AC-07 – AC-10
- SAD: [[../sad.md]] §4
- Related ADR: service-layer ADR-0006 (server-only boundary), architecture-hardening ADR-0010 (time zone)
