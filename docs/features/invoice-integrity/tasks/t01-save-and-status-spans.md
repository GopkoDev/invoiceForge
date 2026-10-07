---
id: T01
title: "Wrap invoice saves and status changes in Sentry spans and tag generic failures by path"
layer: "app"
deps: []
blocks: ["T07"]
acs: []
files_hint: ["lib/services/invoices/invoices.ts", "lib/services/_shared/result-helpers.ts", "tests/unit/services/invoice-save-spans.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T01 — Wrap invoice saves and status changes in Sentry spans and tag generic failures by path

## Place in the sequence

- **Blocked by:** — · **Blocks:** T07 — Create and duplicate invoices only as drafts under the draft rules, numbered by the issue date's year · **Wave:** 1 — behaviour-free, needs no schema; it must ship (and be released) at least 7 days before the rest of the feature to create the latency baseline.
- **Lane:** invoices.ts lane (T01 → T07 → T08 → T09 → T10, serialized because they all edit `lib/services/invoices/invoices.ts`). T01 runs first.

## Why (user story)

No user story — this task serves the spec §6 latency and generic-failure NFRs and the SAD §11 risk that has no baseline today.

> | The latency baseline does not exist: no Sentry spans wrap invoice saves or status changes today, so "7 days before release" cannot be measured if the spans ship with the feature | High | Ship `invoices.save` and `invoices.status-change` spans first as a behaviour-free change, released at least 7 days before this feature; resolve before `implement` (it is the first task) | Dmytro Hopko |
>
> — `sad.md §11, risk "latency baseline", verbatim` · full text: [sad.md](../sad.md)

This task delivers the measuring instruments, so the feature's cost can be proved against a real "before".

## Inlined context

> - Sentry spans `invoices.save` (create and update) and `invoices.status-change` — the source for the spec §6 latency target (p95 no more than 10 % slower than the 7 days before release). The spans do not exist yet, so they ship first, as a behaviour-free change released at least 7 days before this feature, to give the pre-release baseline the spec measures against (§11).
> - Generic save failures (`FAILED`) on invoices and products — already sent to Sentry by `failed()` (`captureException`), so the spec §7 baseline over the 14 days before release exists today; a path tag is added in the same early release as the spans.
>
> — `sad.md §7, Monitoring, abridged` · full text: [sad.md](../sad.md)

> | Logging | … Never log form bodies, issued details or bank data; context is ids only. |
>
> — `sad.md §8, Logging row, abridged` · full text: [sad.md](../sad.md)

> Existing pattern to copy: `Sentry.startSpan({ name: 'dashboard.summary-stats', op: 'function' }, async () => { … })` in `lib/services/dashboard/dashboard.ts:58`; `failed(logContext, error, message)` in `lib/services/_shared/result-helpers.ts:45` calls `captureException(error)`.
>
> — `repo code at 87862ef, grep startSpan / failed, abridged` · re-run the grep: the code wins

> **Hard rule:** behaviour-free. No outcome, message, or `ActionResult` code may change; the NFR "Changed test expectations" allows none for this task.
>
> — `sad.md §11, risk "latency baseline" (behaviour-free change), abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [server-actions.md](../contracts/server-actions.md) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

No §5 AC — serves NFR "Latency p95" and "Generic failures from user input":

> | Latency p95, invoice save and status change | no more than 10 % slower than the 7 days before release | save and status-change spans in error tracking, 7-day window after release |
> | Generic failures from user input | 0 generic failures for amount, date, price, discount or currency input; each comes back as a field error | automated tests per AC-09, AC-11, AC-12, AC-19, AC-20, AC-20b + error tracking, 30 days after release |
>
> — `spec.md §6, NFR rows "Latency p95" and "Generic failures from user input", verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/services/invoices/invoices.ts` — wrap the bodies of `createInvoice`, `updateInvoice` and `duplicateInvoice` in `Sentry.startSpan({ name: 'invoices.save', op: 'function' }, …)` and `updateInvoiceStatus` in `invoices.status-change`; attributes are ids/operation only (`operation: 'create' | 'update' | 'duplicate'`).
- [ ] `lib/services/_shared/result-helpers.ts` — let `failed()` attach a `path` tag (derived from `logContext` or an optional argument) to the captured exception; existing callers keep compiling unchanged.
- [ ] `tests/unit/services/invoice-save-spans.test.ts` — mock `@sentry/nextjs`; assert span names per function and the `path` tag on a `FAILED` result.

## Edge cases

| Case | Behaviour |
|---|---|
| The wrapped service returns a refusal (`VALIDATION`, `CONFLICT`, `NOT_FOUND`) | Same result as before; the span still ends |
| The wrapped service throws | Same `FAILED` result as before, now tagged with its path |
| Sentry disabled (dev/test, no DSN) | `startSpan` is a pass-through; behaviour identical |

## Definition of Done

- [ ] createInvoice/updateInvoice/duplicateInvoice run inside an invoices.save span and updateInvoiceStatus inside an invoices.status-change span, failed() carries a path tag, a unit test asserts both span names and the tag, and no outcome of any existing test changes.
- [ ] No form body, issued detail or bank datum is attached to a span or tag.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
