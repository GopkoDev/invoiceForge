---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
ticket: "invoice-integrity"
---

# 0003 — Compare locked fields in one update path and refuse any difference

- **Status:** Accepted
- **Date:** 2026-10-07
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

From the moment it is issued, an invoice may change only its due date, notes, payment terms and PO number; anything else needs Cancel then Duplicate (spec §1, AC-08). The editor posts the whole form to one `updateInvoice` today, and so would a stale tab or a script. AC-08 requires a forbidden change that reaches the system to be refused with an explanation; AC-14 requires that on an issued invoice only the rules of the fields that actually changed are checked, so an invoice issued before the release with a currency mismatch can still have its notes edited.

## Decision drivers

- Quality goal 2; AC-08, AC-14, AC-25 (the same refusal on every path).
- Quality goal 3: the refusal names the field (spec §6 NFR "Generic failures from user input": 0).
- Contract stability for the editor and for the next feature's Assistant write tools.

## Considered options

1. **One update path that compares locked fields** — for an issued invoice, `updateInvoice` normalizes and compares each locked field with the stored value and refuses any difference; otherwise it writes only the four editable fields.
2. **A separate narrow function** — `updateIssuedInvoice(actor, id, { dueDate, notes, paymentTerms, poNumber }, version)`, with `updateInvoice` refusing every non-draft invoice outright.

## Decision outcome

**Chosen:** Option 1. It implements AC-08 and AC-14 literally and keeps one save contract for every caller. Comparison uses the same normalizers as the write: amounts as two-decimal strings from the shared decimal module, dates as calendar days (an unedited legacy instant counts as unchanged, as `keepUnchangedLegacyDay` already does), lines compared in order on product, description, unit, quantity and price, the number by its normalized key. A difference returns `VALIDATION` with the AC-08 explanation and a field error on each changed locked field; nothing is stored. With no difference, only the rules of the changed editable fields run (due date not before the issue date) and only those four columns, plus `version`, are written. A cancelled invoice refuses every change (AC-06).

## Consequences

**Positive**
- A full-form save that changed only the notes succeeds from any caller, as the spec describes.
- The future Assistant edit tool can reuse the same function.

**Negative**
- The comparison must stay exactly aligned with the write normalizers, or it produces false refusals; it needs its own unit tests per field.

**Neutral**
- A narrow function for issued edits can be added later as a thin wrapper over the same rules.

## Links

- Spec: [[../spec.md]] US-04, US-11; AC-06, AC-07, AC-08, AC-09, AC-14, AC-25
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-freeze-the-existing-snapshot-columns-at-issue-and-print-from-them]], [[0002-decide-every-status-change-in-one-pure-lifecycle-module]]
