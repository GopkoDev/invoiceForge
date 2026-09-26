---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: L2, L4, L10"
---

# 0005 — Allocate invoice numbers under a sender-profile row lock inside the save transaction

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Today the number is read by a separate call before saving, `createInvoice` always increments the counter even for manual numbers, `updateInvoice` assigns a new profile's number without incrementing its counter, and `duplicateInvoice` copies the formatting code (L2, L4, L10). Two tabs can get the same number, and a manual number desynchronizes the sequence. The glossary defines the invoice sequence as advanced only by system-assigned numbers.

## Decision drivers

- AC-06 (empty field → next free number at save time), AC-07 (two concurrent saves both succeed with different numbers), AC-09 (skip numbers taken manually, never show "already used"), AC-10 (manual number doesn't move the sequence), AC-11 (moving profiles uses B's rules), AC-12 (duplicates use the same allocator).
- §6 NFR: 0 "number already used" failures per month on untouched numbers; save latency p95 target = baseline + 20% (open, §11).
- §2 constraint: Neon via its connection pooler. Interactive transactions work; session-level state doesn't.

## Considered options

1. **Pessimistic row lock.** In the save transaction, `UPDATE "SenderProfile" SET "invoiceCounter" = "invoiceCounter" + 1 ... RETURNING` locks the profile row until commit. Format the candidate; if its normalized key is taken, increment again (bounded loop); insert.
2. **Optimistic retry.** Read the counter without locking, insert, and on a unique violation (P2002) retry with the next number, updating the counter compare-and-set. No locks, but more code paths, and retries can run out under contention, which breaks AC-07's "neither save fails".

## Decision outcome

**Chosen:** Option 1. Concurrent saves in one sender profile simply queue for milliseconds, and saves in different profiles never contend. There is no retry budget that can run out, so AC-07 holds by construction. One allocator, `allocateInvoiceNumber(tx, senderProfileId)`, serves create, move (AC-11) and duplicate (AC-12). The unique index from ADR-0004 remains the backstop.

Rules: an empty number field means system-assigned and advances the sequence. Any non-empty number is manual: it is checked against the normalized key, returns a "number already used in this sender profile" field error if taken, and never touches the counter.

## Consequences

**Positive**
- Fixes L2, L4 and L10 with one code path, and the number format lives in one place.
- Deterministic under concurrency; no user-visible retries.

**Negative**
- The profile row is locked for the duration of the save transaction, so the transaction must stay short (no network calls inside).
- AC-09's skip loop adds a query per taken number. It is bounded, and it only happens after manual numbers collide with the sequence.

**Neutral**
- Gaps in the sequence can still occur when a save rolls back after allocation. The spec requires uniqueness, not gaplessness.

## Links

- Spec: [[../spec.md]] AC-06, AC-07, AC-09, AC-10, AC-11, AC-12, §6
- SAD: [[../sad.md]] §4, §6
- Related ADR: [[0004-enforce-invoice-number-uniqueness-on-a-normalized-key-column]]
