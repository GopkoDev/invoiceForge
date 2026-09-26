---
id: T12
title: "Add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber"
layer: "app"
deps: ["T00", "T07"]
blocks: ["T13"]
acs: ["AC-06", "AC-07", "AC-09"]
files_hint: ["lib/actions/invoice-actions/numbering.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T12 — Add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber

## Place in the sequence

- **Blocked by:** T07 — Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step) · **Blocks:** T13 — Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts · **Wave:** wave 2 — invoice data integrity (spec §1).
- **Lane:** shares files with T08 (`lib/actions/invoice-actions/numbering.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** every invoice I save to get an invoice number that is unique within its sender profile, whether I keep the proposed number or type my own
> **So that** my numbering is continuous and a save never fails over a number I didn't choose
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task provides the one allocator that gives concurrent saves different numbers and skips numbers already taken by manual entries.

## Inlined context

> Concurrent saves in one sender profile simply queue for milliseconds, and saves in different profiles never contend. There is no retry budget that can run out, so AC-07 holds by construction. One allocator, `allocateInvoiceNumber(tx, senderProfileId)`, serves create, move (AC-11) and duplicate (AC-12). The unique index from ADR-0004 remains the backstop.
>
> — `adr/0005, Decision outcome, verbatim` · full text: [ADR-0005](../adr/0005-allocate-invoice-numbers-under-a-sender-profile-row-lock.md)

>         else number field empty, system-assigned
>             S->>DB: increments the profile counter, which locks the profile row
>             loop while the candidate key is taken by a manual number
>                 S->>DB: increments again and checks the next candidate
>             end
>             S->>DB: inserts the invoice with the allocated number and key
>
> — `sad.md §6, flow 2 system-assigned branch, verbatim` · full text: [sad.md](../sad.md)

> | `invoiceCounter` | INTEGER | NOT NULL DEFAULT 0 | **the invoice sequence**. Advanced **only** by system-assigned numbers via `UPDATE … SET "invoiceCounter" = "invoiceCounter" + 1 WHERE id = $1 RETURNING`, which also takes the row lock ADR-0005 relies on. Manual numbers never touch it (AC-10) |
>
> — `data-model.md §Entities, SenderProfile invoiceCounter row, verbatim` · full text: [data-model.md](../data-model.md)

> **Hard rule:** **Normalization parity.** The backfill (03) trims leading and trailing whitespace with the POSIX `\s` class (space, tab, CR, LF, VT, FF) and applies `lower()`. `normalizeInvoiceNumber()` must produce the same key for every stored number. [...] `implement` must either make the function match (e.g. `s.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, '').toLowerCase()`) or re-run a verification after deploy.
>
> — `data-model.md §Pre-flight queries, Normalization parity, abridged` · full text: [data-model.md](../data-model.md)

> **Hard rule:** | Region mismatch: functions run in Vercel `iad1`, the database in Neon `eu-central-1` [...] | Medium | Keep allocation to the fewest round-trips (one `UPDATE … RETURNING`, the key check, the insert); measure the save baseline before wave 2 [...] | Dmytro Hopko |
>
> — `sad.md §11, risk row «Region mismatch», abridged` · full text: [sad.md](../sad.md)

> Returns the **hint only** ("assigned on save", AC-06): the first free number from the current sequence, computed without a lock and **without side effects**. It is never sent back as the number.
>
> — `contracts/server-actions.md §generateInvoiceNumber, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> **Hard rule:** | Invoice numbering | The number is unique within a sender profile on a **normalized key** (lower-case, trimmed). An empty field means system-assigned and is allocated under a profile row lock; a filled field is manual and never moves the sequence |
>
> — `sad.md §8, row Invoice numbering, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `SenderProfile.invoiceCounter` | INTEGER | NOT NULL DEFAULT 0 | incremented under row lock (system-assigned only) |
| `SenderProfile.invoicePrefix` | TEXT | UNIQUE (global) | read — number format |
| `Invoice.invoiceNumberKey` | TEXT | UNIQUE with `senderProfileId` | read — "is this key taken" |

— `data-model.md §Entities, SenderProfile + Invoice, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. Exposes: `normalizeInvoiceNumber(s)`, `isInvoiceKeyTaken(tx, senderProfileId, key, excludeInvoiceId?)`, `allocateInvoiceNumber(tx, senderProfileId) → { invoiceNumber, invoiceNumberKey }`, `formatInvoiceNumber(prefix, n)`, `peekNextInvoiceNumber(senderProfileId)` (hint, no side effects).

## Acceptance criteria

### AC-06 — happy

> **Given** a Freelancer creating an invoice under a sender profile and leaving the invoice number field empty (the editor shows the proposed number only as a hint, "assigned on save")
> **When** the Freelancer saves the invoice
> **Then** the system assigns the next free number from that profile's invoice sequence at the moment of saving, advances the sequence, and shows the final number. An empty number field is the only signal that a number is system-proposed; any filled-in number is manual, even if it equals the hint
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — domain invariant

> **Given** a Freelancer with two editor tabs open for new invoices under the same sender profile, both showing the same proposed number as a hint and both with the number field left empty
> **When** both invoices are saved at about the same time
> **Then** both are saved, each with a different invoice number, and neither save fails
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — domain invariant

> **Given** a sender profile whose next proposed number was already taken by a manually typed invoice number
> **When** the Freelancer saves a new invoice without touching the number
> **Then** the system skips to the first free number, advances the sequence to it, and the Freelancer never sees an "already used" message
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Move the number format out of `generateInvoiceNumber` into `formatInvoiceNumber(prefix, n)` so create, duplicate and the hint share it — `lib/actions/invoice-actions/numbering.ts`
- [ ] `normalizeInvoiceNumber` with the POSIX-whitespace regex + `toLowerCase()` (parity with migration 03)
- [ ] `allocateInvoiceNumber(tx, id)`: `UPDATE "SenderProfile" SET "invoiceCounter" = "invoiceCounter" + 1 WHERE id = $1 RETURNING "invoiceCounter", "invoicePrefix"`; loop while `isInvoiceKeyTaken` → increment again; return number + key
- [ ] `peekNextInvoiceNumber`: read counter without lock, skip taken keys in memory, no writes
- [ ] Fire 2 parallel `$transaction`s calling the allocator 20× from a scratch script on the dev DB — all distinct

## Edge cases

| Case | Behaviour |
|---|---|
| Next candidate already typed manually (AC-09) | Loop skips it, counter advanced past it; no "already used" error |
| Two concurrent allocations in one profile (AC-07) | Second waits on the row lock, gets the next number |
| Allocations in different profiles | No contention |
| Unique violation P2002 despite the lock | Propagates to the caller (T13 maps it to `CONFLICT` + Sentry alert) |

## Definition of Done

- [ ] scratch script: 2 × 20 parallel allocations in one profile produce 40 distinct numbers; a pre-inserted manual number equal to the next candidate is skipped (AC-07, AC-09)
- [ ] `normalizeInvoiceNumber(" INV-001 ") === normalizeInvoiceNumber("inv-001")`
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
