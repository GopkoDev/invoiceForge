---
id: T27
title: "Harden the data export: session first, parallel reads, Invoice Forge file name"
layer: "ports"
deps: ["T00", "T09"]
blocks: []
acs: ["AC-24"]
files_hint: ["app/api/user/export/route.ts", "config/site.config.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T27 — Harden the data export: session first, parallel reads, Invoice Forge file name

## Place in the sequence

- **Blocked by:** T09 — Treat sessions without a live account as Visitors in layouts and guards · **Blocks:** — · **Wave:** wave 4 — the rest (spec §1).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task gives the Freelancer the export offered before deletion: one "Invoice Forge" file with everything deletion removes except sessions.

## Inlined context

> One file holding the same categories account deletion removes (AC-20), except sessions
> (AC-24). The categories are read in parallel (A10). The file name starts with the
> product name, `Invoice Forge`. A stale token (deleted account) is a Visitor → 401
> (AC-21, ADR-0002).
>
> — `contracts/openapi.yaml, /api/user/export description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> `api/user/export/route.ts               ✎ requireSession; parallel reads; filename from siteConfig (A10, AC-24)`
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> | Data export latency p95 | TBD — ≤ baseline − 30% (see §8) | production performance traces |
>
> — `spec.md §6, NFR row «Data export latency p95», verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** | Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one |
>
> — `sad.md §8, row Authorization, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table | Access | Change |
|---|---|---|
| `User`, `Account` (no tokens), `EmailHistory`, `SenderProfile` + `BankAccount`, `Customer` + `CustomPrice`, `Product`, `Invoice` + `InvoiceItem` | read, scoped to the caller, in parallel | read-only; `Session` no longer exported |

— `contracts/openapi.yaml, UserDataExport, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## API contract

- `GET /api/user/export` (`exportUserData`) → `200` `UserDataExport` with `exportVersion: "2.0"`, required `[exportDate, exportVersion, user, accounts, emailHistory, senderProfiles, customers, products, invoices]`; header `Content-Disposition: attachment; filename="Invoice Forge export YYYY-MM-DD.json"` (UTC date).
- `401` `NotSignedIn` · `500` `FAILED` "Your data couldn't be exported. Try again." (nothing partial).

— `contracts/openapi.yaml, operationId exportUserData, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-24 — happy

> **Given** a signed-in Freelancer
> **When** the Freelancer exports their data
> **Then** they receive one file whose name starts with the product name "Invoice Forge", holding the same categories of data that account deletion removes (AC-20), except sessions
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Call `requireSession()` first — `app/api/user/export/route.ts`
- [ ] Read the categories with one `Promise.all` scoped by `userId`; `accounts` select only `provider`, `type`, `createdAt`; drop sessions; `exportVersion: "2.0"`
- [ ] File name from `siteConfig` product name: `Invoice Forge export ${utcDate}.json` — `config/site.config.ts` (read only if the name is already there)
- [ ] Any read failure → `500 FAILED` body, `console.error` + Sentry; never a partial file

## Edge cases

| Case | Behaviour |
|---|---|
| Stale token | 401 |
| One read fails | 500 FAILED, nothing partial |
| Freelancer with no data yet | 200 with empty arrays |

## Definition of Done

- [ ] in `pnpm dev`, the export downloads "Invoice Forge export YYYY-MM-DD.json" containing every AC-20 category except sessions, and no OAuth tokens (AC-24)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
