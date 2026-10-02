---
id: T2
title: "Move the result contract and result helpers into the shared business-layer kernel"
layer: "domain"
deps: ["T1"]            # task ids that must finish first
blocks: ["T3", "T4"]    # task ids waiting on this one — the inverse of `deps` (markdown only)
acs: ["AC-04"]          # spec §5 acceptance criteria this task satisfies
files_hint: ["types/result.ts", "types/actions.ts", "lib/services/_shared/result-helpers.ts", "lib/services/_shared/owner-scope.ts", "lib/actions/action-result-helpers.ts", "tests/unit/services/owner-scope.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"           # S/M/L or hours — how long the work takes
context_budget: "M"     # what the task costs the executing agent to hold (markdown only).
                        # Measured, not guessed: the non-empty lines from `## Why (user story)`
                        # through `## Acceptance criteria`.
                        # S = ≤40 inlined lines, ≤1 extra file to open
                        # M = ≤120 inlined lines, 2–4 files in play
                        # L = beyond that — split the task, or keep it and say why right here:
                        #     context_budget: "L"   # justified: <one line>
status: "todo"
---

<!-- The governing rule of this file: **inline the slice the task actually needs, name where it came
from, and keep the link as the fallback for when the slice turns out not to be enough.** A task is
self-contained: it carries its own context instead of sending the executing agent off to reconstruct it.

Every inlined chunk ends with a one-line **provenance signature**:
`<file> §<section>, <identifier>, verbatim|abridged` — e.g. `spec.md §5, AC-02, verbatim`,
`data-model.md §Entities, table order, abridged`. Never «see the spec».

**Inline budget.** Exactly what THIS task needs: only its own acceptance criteria, only the
data-model fields and endpoints it touches. Cut a long chunk to the essential, mark it `abridged`,
and link the full text. `context_budget` in the frontmatter carries the measured number, and an `L`
either gets split or gets its `# justified:` reason on that line — the `tasks` skill checks both.

**Divergence risk.** An inline is a snapshot taken at breakdown time; upstream can move after it.
The source always wins — which is exactly why every chunk carries a signature pointing at where the
truth lives.

**To the executing agent:** work from what is inlined here. If a slice is insufficient, ambiguous,
or contradicts the code in front of you, open the named file for the full text and follow that.
Do not invent the missing part. -->

# T2 — Move the result contract and result helpers into the shared business-layer kernel

## Place in the sequence

- **Blocked by:** T1 — Enforce the lib/services boundary · **Blocks:** T3 — ActingFreelancer + time zone, T4 — ListQuery + Page · **Wave:** 2. It is the first real code under `lib/services`, and every business function returns this result and uses these helpers.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** every page, form, picker and the dashboard to behave exactly as before
> **So that** the internal change costs me nothing and I don't have to relearn anything
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task moves the result contract and the exactly-once failure reporting into the layer unchanged, so every moved function answers byte-identically.

## Inlined context

> 2. **One result contract across both layers** (ADR-0002). Business functions return the existing `ActionResult<T>` union (moved to a neutral `types/result.ts`, with `ActionResult` kept as an alias). Wrappers pass it through unchanged, so messages, field errors, typed codes and the "reported exactly once" rule stay byte-identical (quality goal 2, AC-02, AC-04).
>
> — `sad.md §4, choice 2, verbatim` · full text: [sad.md](../sad.md)

> 3. **The owner filter lives in every write's own `where` clause** (ADR-0003). […] A miss (Prisma `P2025`) maps to the same `NOT_FOUND`.
>
> — `sad.md §4, choice 3, abridged` · full text: [sad.md](../sad.md)

> ```
> │   ├── owner-scope.ts                         ★ P2025 → NOT_FOUND mapping for owner-scoped writes (ADR-0003)
> │   └── result-helpers.ts                      ✎ moved from lib/actions/action-result-helpers.ts: failed(), zodValidationFailure(), hasInvoicesConflict()…
> types/result.ts                                ★ the ActionResult union, moved here (ADR-0002); types/actions.ts re-exports it
> ```
>
> — `sad.md §5, internal decomposition, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. It keeps every message, field error and code byte-identical with no mapping layer to get wrong. That is what the parity oracle (the unchanged test suite) needs.
>
> — `adr/0002 §Decision outcome, abridged` · full text: [ADR-0002](../adr/0002-return-the-existing-action-result-union-from-business-functions.md)

> **Hard rule (Error handling):** **Business functions return `ActionResult<T>` themselves** (typed `code`, plain-language `error`, optional `fieldErrors`, `details`). `failed()` inside the business function reports the cause once, and wrappers pass results through untouched. Only wrappers produce `UNAUTHORIZED`
>
> — `sad.md §8, Error handling row, verbatim` · full text: [sad.md](../sad.md)

**Repo today:** `types/actions.ts` exports `ActionErrorCode`, `DecimalString`, `ActionErrorDetails`, `ActionFailure`, `ActionResult`, `ok()` and `fail()`. `lib/actions/action-result-helpers.ts` exports `zodValidationFailure`, `isUniqueConstraintError` (P2002), `failed` (console.error + `captureException` + `FAILED`), `isRestrictForeignKeyError` (P2003) and `hasInvoicesConflict`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [public-api.md](../contracts/public-api.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

> `types/result.ts` holds today's union from `types/actions.ts` verbatim, and `types/actions.ts` re-exports it (`ActionResult` stays as a name)
>
> | Code | When | Web wrapper does |
> |---|---|---|
> | `NOT_FOUND` | the record, a parent of a list, or a referenced record is missing **or belongs to another Freelancer**. Same message for both (AC-08, AC-09, AC-19). […] | today's not-found outcome (`notFound()` / toast) |
> | `FAILED` | anything unexpected. `failed()` inside the business function reports the cause to Sentry **once**, and the message is plain language (AC-04, QG-5) | passes it through and never reports again |
>
> **A business function never returns `UNAUTHORIZED`** (ADR-0002). Only `actingFreelancerFromSession()` produces it.
>
> — `contracts/public-api.md §1.2, Result, abridged` · full text: [public-api.md](../contracts/public-api.md)

> A write that misses (Prisma `P2025`, or `count === 0` on the `updateMany`/`deleteMany` fallback) returns `NOT_FOUND`.
>
> — `contracts/public-api.md §2, preamble, verbatim` · full text: [public-api.md](../contracts/public-api.md)

## Acceptance criteria

### AC-04 (US-01) — error

> **Given** a signed-in Freelancer's request fails for an unexpected reason (for example the data store is unreachable)
> **When** the page or form reports the failure
> **Then** the Freelancer sees the same plain-language error and retry option as before, without internal details, and the failure is reported to error monitoring exactly once
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] RED: `tests/unit/services/owner-scope.test.ts`. A `P2025` Prisma error, passed through the owner-scope helper, yields `fail('NOT_FOUND', <message>)`. A `count === 0` result from `updateMany`/`deleteMany` yields the same. Any other error is rethrown or left to `failed()`, never turned into `NOT_FOUND`.
- [ ] Create `types/result.ts` with the exact contents of today's `types/actions.ts`: types, `ok()` and `fail()`.
- [ ] Replace `types/actions.ts` with `export * from './result'`, keeping the file header comment. No import site changes in this task.
- [ ] Create `lib/services/_shared/result-helpers.ts` (starts with `import 'server-only'`). Move `zodValidationFailure`, `isUniqueConstraintError`, `failed`, `isRestrictForeignKeyError` and `hasInvoicesConflict` there verbatim, importing from `@/types/result`.
- [ ] Replace `lib/actions/action-result-helpers.ts` with re-exports from `@/lib/services/_shared/result-helpers`, so the existing tests and actions keep working.
- [ ] Create `lib/services/_shared/owner-scope.ts` (`import 'server-only'`) with a helper such as `notFoundOnMiss(promise, message)` or `isRecordNotFoundError(error)`, plus `notFoundIfNoneAffected(count, message)`.
- [ ] Run `pnpm test:unit`. `tests/unit/lib/actions/failed-reports-once.test.ts` must pass **unchanged**.

## Edge cases

| Case | Behaviour |
|---|---|
| A test mocks `@/lib/actions/action-result-helpers` | still works, because the module re-exports the same bindings |
| A test spies on `captureException` for `failed()` | reported exactly once. The wrapper adds no second report (QG-5) |
| A P2002, P2003 or unknown error inside an owner-scoped write | not mapped to `NOT_FOUND`. It stays with the existing handling (`CONFLICT` paths or `failed()`) |
| An importer of `ActionResult` from `@/types/actions` | unchanged, via the alias re-export |

## Definition of Done

- [ ] `types/result.ts` holds the union, and `types/actions.ts` re-exports it. `tsc --noEmit` passes.
- [ ] The helpers live in `lib/services/_shared/result-helpers.ts`, and the old path re-exports them.
- [ ] The `owner-scope` unit test passes (P2025 → `NOT_FOUND`, count 0 → `NOT_FOUND`, other errors untouched).
- [ ] The existing failed-reports-once tests pass with 0 changed expectations.
- [ ] The T1 boundary test passes for the new `_shared` files.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
