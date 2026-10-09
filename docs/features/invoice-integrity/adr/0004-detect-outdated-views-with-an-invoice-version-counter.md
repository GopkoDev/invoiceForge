---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
ticket: "invoice-integrity"
---

# 0004 — Detect outdated views with an invoice version counter

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`updateInvoice` reads the invoice outside its transaction and writes the status the editor sent, so an editor opened before the invoice was marked paid in another tab writes pending back and clears `paidAt` (brief D5). AC-10 requires any save from a view loaded before a later change, a notes-only change included, to be refused with "changed elsewhere, reload", while a status change from the list is not freshness-checked and is judged by the lifecycle against the current status. `updateInvoice` already locks the row `FOR UPDATE` inside its transaction.

## Decision drivers

- Quality goal 2; spec §6 NFR "Concurrent saves": 0 lost status or payment-date changes across 50 runs of an outdated editor save racing a status change.
- AC-10 scope: every change after the view was loaded counts, from any write path.
- Some writes to `Invoice` use raw SQL (the lazy calendar-day normalisation, mcp-server ADR-0009), which Prisma's `@updatedAt` does not touch.

## Considered options

1. **An explicit `Invoice.version` integer** — incremented by every service write; the editor sends the version it loaded; `updateInvoice` compares it under the row lock and returns `CONFLICT` on a mismatch.
2. **Reuse `updatedAt` as the token** — no schema change; the editor sends the loaded timestamp.

## Decision outcome

**Chosen:** Option 1. A counter is deterministic: it does not depend on server clocks, millisecond collisions or on every writer going through Prisma Client. The column is added as `INT NOT NULL DEFAULT 0`, a metadata-only change in PostgreSQL. `updateInvoice`, `updateInvoiceStatus` and every later invoice write set `version = version + 1`; `updateInvoice` refuses with `CONFLICT` and the AC-10 message when the submitted `loadedVersion` differs from the locked row's, before any other rule runs. `updateInvoiceStatus` takes no version and decides against the locked row's current status (ADR-0002). The lazy calendar-day normalisation does not bump the version, because it does not change the day the Freelancer sees. A successful save returns the new version so the editor's next save compares against it.

## Consequences

**Positive**
- The NFR race is provable with an integration test that runs both writes concurrently.
- The same token serves the future Assistant edit tools.

**Negative**
- A schema change, and a discipline every new invoice write must follow; a test asserts that each service write path bumps the version.

**Neutral**
- `updatedAt` keeps its current meaning for display and ordering.

## Links

- Spec: [[../spec.md]] US-05; AC-10
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-decide-every-status-change-in-one-pure-lifecycle-module]]
