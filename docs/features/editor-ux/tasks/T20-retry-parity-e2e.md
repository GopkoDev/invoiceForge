---
id: T20
title: "Add e2e tests that reach every save outcome by Save and by Retry and compare the results"
layer: "tests"
deps: ["T14"]
blocks: []
acs: ["AC-05c", "AC-05d"]
files_hint: ["tests/e2e/editor-retry-parity.spec.ts", "tests/e2e/support/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T20 — Add e2e tests that reach every save outcome by Save and by Retry and compare the results

## Place in the sequence

- **Blocked by:** T14 — Route Retry, the created-address change and the save dialogs through the save command · **Blocks:** nothing · **Wave:** DAG wave 7; delivery wave 3 of spec §1.
- **Lane:** shares files with T19 (`tests/e2e/support/`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** to keep typing while an invoice is saving
> **So that** my change is never lost or marked saved by mistake, the totals always match the lines I see, and retrying a failed save behaves exactly like saving
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

Proves Retry parity end to end in the real app.

## Inlined context

> | Retry parity | 100 % of Save and Save-and-issue outcomes (created, updated, issued, changed elsewhere, totals changed, field error) produce the same address, dialog and saved state when reached through Retry | automated editor test per outcome |
>
> — `spec.md §6, NFR «Retry parity», verbatim` · full text: [spec.md](../spec.md)

> plus one Playwright e2e per outcome that reaches it once by Save and once by Retry and compares address, dialog and unsaved flag.
>
> — `sad.md §10, QG-1 How verify, abridged` · full text: [sad.md](../sad.md)

> Only the accessibility and date-matrix e2e suites run in CI; AC-07 isolation, first-PDF timing and the Retry-outcome e2e run before each wave ships and nightly (`tests/README.md`)
>
> — `sad.md §11, risk «e2e outside CI», abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-05c — happy path

> **Given** a Freelancer creating a new invoice whose save failed, with the failure message offering Retry
> **When** they choose Retry and the save succeeds
> **Then** Retry repeats the action that failed (Save, or Save and issue) with the form as it is when Retry is chosen, including any change made after the failure. The editor treats it exactly like a successful Save: the invoice is confirmed as created, and the browser's address becomes the saved invoice's own editing address. Reloading the page opens that invoice, not a blank new one, and the next Save updates it instead of creating a second invoice
>
> — `spec.md §5, AC-05c, verbatim` · full text: [spec.md](../spec.md)

### AC-05d — error

> **Given** a Freelancer whose save failed, with the failure message offering Retry
> **When** they choose Retry and the system refuses the retried save because the invoice was changed elsewhere, or asks them to confirm changed totals
> **Then** they see the same changed-elsewhere explanation or totals confirmation that Save shows, and can reload or confirm from there. A retried save never fails silently, and Retry while a save is running or after the editor moved to another invoice does nothing, as today
>
> — `spec.md §5, AC-05d, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Force the first save to fail with `page.route` on the server-action POST (abort once), then Retry.
- [ ] For each outcome set up its precondition (new invoice; existing draft; Save and issue; a concurrent DB update for changed elsewhere; server-recalculated totals; an invalid field) and run it via Save and via Retry.
- [ ] Assert URL (`/invoices/{id}/edit` for created; reload opens it), dialog (SCR-09 / SCR-10), unsaved flag, and for created that the next Save updates (invoice count unchanged).

## Edge cases

| Case | Behaviour |
|---|---|
| Retry clicked while a save is running | no-op |
| Retry after moving to another invoice | no-op |

## Definition of Done

- [ ] `pnpm test:e2e tests/e2e/editor-retry-parity.spec.ts` passes for all six outcomes
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
