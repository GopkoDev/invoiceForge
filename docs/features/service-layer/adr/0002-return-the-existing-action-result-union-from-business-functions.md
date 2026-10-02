---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-01"
feature_size: "M"
ticket: "service-layer"
---

# 0002 — Return the existing ActionResult union from business functions

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Actions return `ActionResult<T>`: `{ success: true, data }` or `{ success: false, code, error, fieldErrors?, details? }`, with typed codes `UNAUTHORIZED | NOT_FOUND | VALIDATION | CONFLICT | FAILED` and conflict details `TOTALS_CHANGED` / `HAS_INVOICES` (`types/actions.ts`, architecture-hardening ADR-0009). An unexpected failure goes through `failed()`, which logs a redacted cause and reports it to Sentry exactly once. Once logic moves into business functions, we must decide how they signal failure to the web wrappers now and to the Assistant later.

## Decision drivers

- Quality goal 2 / AC-02, AC-04: the same plain-language messages next to the same fields, and each unexpected failure reported exactly once.
- Spec §6: 0 changed expected values in existing tests.
- AC-13, AC-26: an Assistant is told which value is invalid and what is allowed.

## Considered options

1. **The same `ActionResult` union.** Business functions return the union themselves (moved to `types/result.ts`, with `ActionResult` kept as an alias). The `try/catch` + `failed()` stay inside the business function, and wrappers pass the result through.
2. **Typed domain errors.** Business functions return bare data and throw `NotFoundError`, `ConflictError`, `ValidationError`. One web adapter maps them to `ActionResult` and reports unexpected ones to Sentry.

## Decision outcome

**Chosen:** Option 1. It keeps every message, field error and code byte-identical with no mapping layer to get wrong. That is what the parity oracle (the unchanged test suite) needs. The error cases also stay visible in the type system for the Assistant, which is not the case for thrown errors.

## Consequences

**Positive**
- A wrapper is three steps: identify the Freelancer, call, revalidate on success.
- Exactly-once reporting stays where it is proven today (`failed()` tests).
- The Assistant gets typed `code` + `fieldErrors` + `details` for free.

**Negative**
- Human-readable English messages live in the business layer. A future non-English or tool-specific wording needs a mapping at the consumer (accepted debt, §11).
- A business function never returns `UNAUTHORIZED` (identity is an input), but the union still lists it. Only wrappers produce it.

**Neutral**
- Switching to thrown errors later is mechanical but touches every function and test (≥3 days).

## Links

- Spec: [[../spec.md]] — US-01, US-05; AC-02, AC-04, AC-13, AC-26
- SAD: [[../sad.md]] §4 (choice 2), §8 (Error handling)
- Related ADR: architecture-hardening `adr/0009-classify-action-failures-with-typed-error-codes-and-segment-error-boundaries.md`
