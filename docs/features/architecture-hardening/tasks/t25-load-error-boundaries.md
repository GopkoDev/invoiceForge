---
id: T25
title: "Add the segment load-error boundaries with retry and Sentry reporting"
layer: "ui"
deps: ["T00"]
blocks: ["T26"]
acs: ["AC-28"]
files_hint: ["app/(protected)/error.tsx", "app/(invoice-editor)/error.tsx", "components/layout/content-area/load-error.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T25 — Add the segment load-error boundaries with retry and Sentry reporting

## Place in the sequence

- **Blocked by:** — · **Blocks:** T26 — Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`components/layout/content-area/load-error.tsx`), T26 (`components/layout/content-area/load-error.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** a clear error with a retry when my data can't be loaded
> **So that** I don't mistake a failure for "no data" or "page missing" and create duplicates
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task gives every data page an honest "we couldn't load your data" state with retry, instead of an empty state or "not found".

## Inlined context

> | default | A page load throws `FAILED` into the new segment boundary (`(protected)/error.tsx`, `(invoice-editor)/error.tsx`). It renders inside the app shell (the sidebar stays) and reports to Sentry. The text is plain language only, "We couldn't load your data", and never the raw error (AC-28; flow 12; ADR-0009) | `Empty` (primitive), `Button` | wireframe below |
> | retrying | "Try again" pressed: the `Button` shows a `Spinner` and is disabled, then `reset()` + `router.refresh()` run | `Button`, `Spinner` | — |
> | still-failing | The retry fails again → back to default. The failure is reported again | `Empty`, `Button` | wireframe below |
> | empty / not-found | N/A, **by design**: AC-28 forbids showing a load failure as either | — | — |
>
> — `screens.md §SCR-17 Load error with retry, states, verbatim` · full text: [screens.md](../screens.md)

```text
|                (!)                     |
|      We couldn't load your data        |
|  Something went wrong on our side.     |
|  Your data is safe. Try again.         |
|           [ Try again ]                |
```

— `screens.md §SCR-17, wireframe, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** SCR-17 builds its boundary from the `Empty` primitive plus a `Button`. `ErrorPageLayout` was ruled out because it is full-screen, has no retry and links home. `ContentAreaNotFound` was ruled out because AC-28 forbids showing a load failure as "not found".
>
> — `screens.md §New components, verbatim` · full text: [screens.md](../screens.md)

> Load failures (AC-28): reported by the new `error.tsx` boundaries and by `captureException` in the server paths that throw into them.
>
> — `sad.md §7, Monitoring, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** New UI (error-with-retry, confirmations, field messages, the logo warning) is composed from the existing shadcn/ui primitives (`Empty`, `AlertDialog`, `Field`, `Sonner`) and modals go through `store/use-modal-store.ts` (architecture-map §Frontend). No new state or routing library.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-28 — error

> **Given** a Freelancer opening any page that shows their data (the invoice list, the dashboard, the sender profiles, customers and products pages, any invoice, customer or sender profile detail page, and the invoice editor) while that data can't be loaded
> **When** the page renders
> **Then** the Freelancer sees an error state with a way to retry, not an empty state and not "page not found", and the failure is reported to error monitoring. "Not found" is shown only for a record that doesn't exist or isn't theirs (AC-29), never for a load failure
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Shared `LoadError` client component: `Empty` + icon + the two text lines + "Try again" `Button` with `Spinner`; `onRetry` calls `reset()` then `router.refresh()` — `components/layout/content-area/load-error.tsx`
- [ ] `'use client'` boundary: `useEffect(() => Sentry.captureException(error), [error])`; never render `error.message` — `app/(protected)/error.tsx`
- [ ] Same for the editor group — `app/(invoice-editor)/error.tsx`
- [ ] Force a throw in one page temporarily to see it inside the shell (sidebar visible)

## Edge cases

| Case | Behaviour |
|---|---|
| Retry fails again | Back to default; reported again |
| Error message contains SQL text | Never displayed; only the plain-language copy |
| `notFound()` thrown | Not caught here — goes to the not-found UI (SCR-16) |

## Definition of Done

- [ ] a temporarily forced throw in `/customers` and in the editor renders SCR-17 inside the shell with retry, and Sentry (or the dev console in non-production) receives the error (AC-28)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
