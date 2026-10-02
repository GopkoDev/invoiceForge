---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-01"
feature_size: "M"
ticket: "service-layer"
---

# 0001 — Pass a branded acting Freelancer to every business function

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Today each of the 63 exported functions in `lib/actions/` finds its caller with `getAuthenticatedUser()` (next-auth session) and, where dates matter, reads the `tz` cookie through `getRequestTimeZone()`. The business layer this feature introduces must not touch the request (spec §6 request-independence), so the acting Freelancer and their time zone become an explicit input. That input's shape will appear in every business function, every test and every future Assistant tool. It also decides how easily a raw id taken from a form, a link or a prompt could be passed off as the acting identity (spec §6.1 "forged acting identity").

## Decision drivers

- Quality goal 3 / spec §6: 100% of business functions callable with only the acting Freelancer (+ time zone), 0 uses of session, cookie or header in the layer.
- Quality goal 1 / spec §6.1: business functions trust their caller, so identity must be established only by trusted, visible code paths.
- AC-21, AC-22: the same time zone must drive JS day bounds and SQL buckets, and an unknown zone falls back to UTC.

## Considered options

1. **Branded `ActingFreelancer`.** A `{ userId, timeZone }` object with a compile-time brand, constructible only through trusted factories (`actingFreelancerFromSession()`, a later Assistant factory, `actingFreelancerForTest()`). The factories resolve the time zone.
2. **Plain `{ userId, timeZone }` object.** Anyone can build one as a literal. Time-zone normalization is each caller's job.

## Decision outcome

**Chosen:** Option 1. For about 30 lines of code it makes every identity-establishing call site greppable. It stops a raw id from compiling as an acting identity by accident, and it resolves the zone exactly once (AC-22), which a plain object leaves to each of the 60 callers.

## Consequences

**Positive**
- `grep actingFreelancerFrom` lists every place where identity enters the layer, which is useful for the security review.
- A form field or a link parameter can't reach a business function as the actor by mistake.
- The zone is validated once, against both `Intl` and PostgreSQL (§4 inline note), so no function re-validates it.

**Negative**
- The brand exists only at compile time: an `as ActingFreelancer` cast bypasses it. It guards against mistakes, not attackers. An attacker has to be stopped by the authenticating layer in front (spec §3). A lint rule bans the cast outside the factory module (§8).
- Tests need the test factory instead of a literal.

**Neutral**
- The Assistant feature adds its own factory after authenticating. The business layer does not change for it.

## Links

- Spec: [[../spec.md]] — US-03, US-06, US-07; AC-07, AC-08, AC-21, AC-22; §6.1
- SAD: [[../sad.md]] §4 (choice 1), §8 (Authorization, Time zones)
- Related ADR: [[0003-scope-every-write-by-owner-in-its-own-where-clause]], [[0006-isolate-business-functions-in-lib-services-behind-server-only-and-lint-rules]]
