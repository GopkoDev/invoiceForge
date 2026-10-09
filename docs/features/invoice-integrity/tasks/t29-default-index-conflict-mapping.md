---
id: "T29"
title: "Map a real unique hit on the default index to a retryable CONFLICT and match the index explicitly"
layer: "tests"
deps: []
blocks: []
acs: ["AC-17"]
files_hint: ["lib/services/sender-profiles/sender-profiles.ts", "lib/services/bank-accounts/bank-accounts.ts", "tests/integration/services/sender-profiles/single-default.test.ts", "tests/integration/services/bank-accounts/single-default-and-currency-lock.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
source: "review-2026-10-08"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T29 — Map a real unique hit on the default index to a retryable CONFLICT and match the index explicitly

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Origin:** follow-up from the review record [`_review/review-2026-10-08.md`](../_review/review-2026-10-08.md).

## Why

Review finding S3: ADR-0005 says a hit on the index becomes a retryable CONFLICT, but the tests only assert a constant and the mapping searches JSON text, so an adapter upgrade could silently turn it into FAILED.

## Inlined context

> Both tests (`single-default.test.ts:155-162`, `single-default-and-currency-lock.test.ts:180`) only assert what `defaultConflict()` / `defaultAccountConflict()` return. `isDefaultIndexConflict` (`sender-profiles.ts:39-43`, `bank-accounts.ts:30-34`) runs `JSON.stringify(error.meta)` and searches for the index name — works only because Prisma 7.10's `DriverAdapterError` exposes `cause.constraint.index` enumerably. `invoice-integrity-migrations.test.ts:214` already produces a real P2002 from the partial index.
>
> — `_review/review-2026-10-08.md S3, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/) · [review record](../_review/review-2026-10-08.md)) and follow it. Do not guess.

## Acceptance criteria

Open `spec.md §5` for the verbatim text of: AC-17. AC-11 was amended on 2026-10-08 (commit 13accf3).

## Checklist

- [ ] Find the code seam to force the unique hit (e.g. bypass the lock with a raw insert in a concurrent tx, or call the write helper directly).
- [ ] Explicit field match with a fallback order documented in a comment.

## Edge cases

| Case | Behaviour |
|---|---|
| P2002 on another unique index | not mapped to the default CONFLICT |

## Definition of Done

- [ ] Integration tests provoke a real P2002 on each partial default index (sender profile and bank account) and assert the service returns the retryable CONFLICT, not FAILED; isDefaultIndexConflict matches the index name through an explicit field of the Prisma error (meta.target or the driver adapter constraint), not a JSON.stringify text search.
- [ ] Any existing test whose expectation changes is listed in the commit body.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
