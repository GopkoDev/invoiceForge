---
id: T20
title: "Add the count-only pre-release report script and the release runbook"
layer: "infra"
deps: ["T02"]
blocks: []
acs: []
files_hint: ["scripts/invoice-integrity-report.ts", "tests/integration/invoice-integrity-report.test.ts", "docs/features/invoice-integrity/release.md", "package.json"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T20 — Add the count-only pre-release report script and the release runbook

## Place in the sequence

- **Blocked by:** T02 — Promote the four staged migrations, declare them in the Prisma schema and adapt the test factories · **Blocks:** — · **Wave:** 2 — the runbook orders the promoted migrations; the report itself reads only existing columns.
- **Lane:** own lane.

## Why (user story)

No §4 user story — this task serves the release step and the KPI baseline:

> - [ ] What does the pre-release report find, and does any category besides duplicate defaults need a one-time repair? Default now: report counts only and repair nothing else. — owner: Dmytro Hopko, due: before the production deploy of `invoice-integrity`
>
> — `spec.md §8, open question 1, verbatim` · full text: [spec.md](../spec.md)

> **New rule violations after release:** records breaking the new invariants (mismatched currencies on new drafts, more than one default, due date before issue date, impossible status history), counted by re-running the pre-release report. Baseline: the pre-release report's counts. Target: 0 records created after the release, checked 30 days after release.
>
> — `spec.md §7, KPI "New rule violations after release", verbatim` · full text: [spec.md](../spec.md)

This task produces the report that answers that open question and sets the KPI baseline, plus the ordered release steps.

## Inlined context

> One Prisma migration ships with the release and is applied as an explicit release step, `prisma migrate deploy` against dev and then production, **before** the code is deployed, because the new code reads `Invoice.version` (`pnpm build` does not migrate). Rollback: the down migration drops the two indexes and the column; the default repair is not reverted. Before the production deploy, the count-only report (`scripts/invoice-integrity-report.ts`) runs read-only against production and its counts become the baseline of the "new rule violations" KPI; it changes nothing.
>
> — `sad.md §7, Deployment view, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** The release migration is applied by hand; deploying the code before it runs breaks every invoice save (the code reads `Invoice.version`). Mitigation: Release checklist: `prisma migrate deploy` on dev, then production, before the deploy; the down migration is staged with it.
>
> — `sad.md §11, risk "release migration applied by hand", verbatim` · full text: [sad.md](../sad.md)

> The Sentry spans `invoices.save` and `invoices.status-change` ship first, as a behaviour-free change released at least 7 days before this feature, to give the pre-release baseline the spec measures against.
>
> — `sad.md §7, Monitoring, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** No automatic rewrite of issued invoices at release; only duplicate or missing defaults are repaired.
>
> — `sad.md §2, Regulatory / external, verbatim` · full text: [sad.md](../sad.md)

DB env: `.env` = dev, `.env.prod` = prod — the runbook names which file each step uses and says to check the host before every DB command.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes (read-only queries). The report categories, verbatim definitions to reuse:

| Category | Query (counts only) |
|---|---|
| Freelancers with more than one default sender profile | `SELECT count(*) FROM (SELECT "userId" FROM "SenderProfile" WHERE "isDefault" GROUP BY 1 HAVING count(*) > 1) t` |
| Freelancers with sender profiles but no default | `SELECT count(DISTINCT "userId") FROM "SenderProfile" s WHERE NOT EXISTS (SELECT 1 FROM "SenderProfile" d WHERE d."userId" = s."userId" AND d."isDefault")` |
| Sender profiles with more than one default account / with accounts but no default | the same two queries on `"BankAccount"` grouped by `"senderProfileId"` |
| Invoices whose currency differs from their bank account's, split by draft or issued | `… JOIN "BankAccount" b ON b."id" = i."bankAccountId" WHERE b."currency" <> i."currency" GROUP BY i."status" = 'DRAFT'` |
| Invoices with a catalogue line in another currency, split by draft or issued | `… JOIN "InvoiceItem" it … JOIN "Product" p … WHERE p."currency" <> i."currency"`, `count(DISTINCT i."id")` |
| Due date before the issue date | `SELECT count(*) FROM "Invoice" WHERE "dueDate"::date < "issueDate"::date` |
| Impossible status history | `SELECT count(*) FROM "Invoice" WHERE ("status" = 'PAID') <> ("paidAt" IS NOT NULL)` |
| Amount above 99,999,999.99 | not reachable (`DECIMAL(10,2)`); report 0 without a query |
| Issued invoices saved after a related record changed (upper bound) | `… WHERE i."status" <> 'DRAFT' AND (sp."updatedAt" > i."createdAt" OR c."updatedAt" > i."createdAt" OR b."updatedAt" > i."createdAt")` |

— `data-model.md §Pre-release count-only report, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (CLI script: `pnpm tsx scripts/invoice-integrity-report.ts`, prints one line per category; add a `package.json` script entry.)

## Acceptance criteria

No §5 AC — this task serves spec §8 open question 1 and the §7 KPI baseline (quoted above), and the release order behind AC-18:

> **Then** where there were several defaults, only the earliest-created of them stays the default. Where there was none, the earliest-created sender profile, or the earliest-created bank account of that profile, becomes the default. Nothing else about their profiles, accounts or invoices changes, and from then on AC-17 holds
>
> — `spec.md §5, AC-18, Then clause, verbatim` (owned by T02; the runbook only orders it) · full text: [spec.md](../spec.md)

## Checklist

- [ ] `scripts/invoice-integrity-report.ts` — run the categories above in one read-only transaction (`SET TRANSACTION READ ONLY`), print counts; no PII, ids only if any.
- [ ] `package.json` — script entry for the report.
- [ ] `tests/integration/invoice-integrity-report.test.ts` — seed one record per category on the throwaway container, assert counts, assert row counts/`updatedAt` unchanged after the run.
- [ ] `docs/features/invoice-integrity/release.md` — runbook: (0) spans release ≥7 days earlier (T01); (1) run the report against prod, record counts as KPI baseline, answer spec §8 OQ1; (2) `prisma migrate deploy` on dev (`.env`), verify; (3) same on prod (`.env.prod`), check host first; (4) deploy code; rollback = down migration, repair not reverted.

## Edge cases

| Case | Behaviour |
|---|---|
| Empty database | Every category prints 0 |
| Run accidentally after the migration | Default categories print 0; script still writes nothing |
| Script pointed at prod | Read-only transaction; any write attempt fails |
| A category returns non-zero besides defaults | Reported only; the owner decides on repair (spec §8), nothing auto-fixed |

## Definition of Done

- [ ] An integration test seeds one record per data-model report category and shows scripts/invoice-integrity-report.ts prints the expected counts while writing nothing, and the runbook orders report → migrate deploy on dev then production → code deploy, with the rollback.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
