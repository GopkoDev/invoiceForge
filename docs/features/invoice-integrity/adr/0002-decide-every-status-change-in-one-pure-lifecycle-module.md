---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
ticket: "invoice-integrity"
---

# 0002 — Decide every status change in one pure lifecycle module

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`applyStatusChange` (`lib/helpers/invoice-status.ts`) accepts any transition and only maintains `paidAt`, so a paid invoice can go back to draft and then be deleted (brief D4). Five write paths touch status: create, update (the editor), status change (the list), delete and duplicate. The spec fixes one lifecycle (AC-04): draft → pending; pending → paid, overdue or cancelled; hand-marked overdue → pending while not past due; overdue → paid or cancelled; paid → pending. Cancelled is final, an issued invoice never returns to draft, only drafts are deleted, new invoices and duplicates start as drafts (AC-04b, AC-05, AC-06). The editor and the list must offer only the allowed moves (ux-flows).

## Decision drivers

- Quality goal 2; spec §6 NFR "Status lifecycle coverage": 100 % of the 25 from–to status pairs tested on every write path.
- AC-25: the same refusal and explanation on every path, editor or not.
- Consistency with `mcp-server` ADR-0005 (overdue is derived from the due date in the Freelancer time zone).
- The repo's precedent of pure shared rule modules that run in both browser and server (architecture-hardening ADR-0006).

## Considered options

1. **One pure module** — the transition table as data plus `decideStatusChange(current, requested, dueDate, today)`; every service write path calls it inside its transaction after locking the invoice row; the UI imports the same table.
2. **The same module plus a Postgres `BEFORE UPDATE` trigger** that rejects forbidden transitions as a second line of defence.

## Decision outcome

**Chosen:** Option 1. The 25 pairs become fast unit tests over one function, and the per-path tests only need to prove each path calls it. Refusals come back as ordinary `ActionResult` failures with the spec's explanations (for example "an issued invoice can never return to draft — cancel and duplicate it instead"), which a trigger error cannot do without a mapping layer. The rule needs no database backstop because every invoice write already goes through `lib/services` (service-layer ADR-0006), which the security review confirms (spec §6.1). The module keeps the `paidAt` rule: entering paid records the moment, paid → pending clears it, a same-status request is not a change and never touches `paidAt`. Hand-marked versus derived overdue is told apart by the stored status and the due date, using the shared overdue rule module.

## Consequences

**Positive**
- One place encodes the lifecycle for the editor, the list, any script and the future Assistant write tools.
- The UI offers only allowed actions from the same table, so the server refusal is a backstop rather than the normal path.

**Negative**
- A write that bypasses `lib/services` (raw SQL in a migration or a manual script) is not protected.

**Neutral**
- A trigger can be added later without changing the module, if a second writer ever appears.

## Links

- Spec: [[../spec.md]] US-03, US-11; AC-04, AC-04b, AC-05, AC-06, AC-25
- SAD: [[../sad.md]] §4
- Related ADR: [[0004-detect-outdated-views-with-an-invoice-version-counter]]
