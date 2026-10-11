---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0013 — Record the Assistant origin as write-once columns on the invoice

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Each Assistant draft is marked as created by an Assistant, naming the in-app chat or the key's name as it was at creation; renaming or revoking the key does not change the mark. Once issued, the mark disappears and the invoice the Customer receives says nothing about AI, but the origin is kept for the north-star KPI until the invoice or the account is deleted (AC-23).

## Decision drivers

- AC-23; spec §6.1 (origin kept after issuing, never shown; removed with the invoice or account).
- Spec §7: Assistant draft issue rate within 14 days, across chat and MCP.
- Invariant: issued details and the PDF are a fixed copy (invoice-integrity ADR-0001).

## Considered options

1. **Columns on `Invoice`** — `assistantOrigin` (`CHAT` | `PERSONAL_KEY`), `assistantKeyName`, `assistantKeyId` (set null on key deletion), written once at creation; plus `issuedAt` for the KPI.
2. **A 1:1 table** — `AssistantDraftOrigin` keyed by invoice id, cascading on invoice deletion.

## Decision outcome

**Chosen:** Option 1. The invoice list and editor read the mark without a join, the KPI is one query over invoices, and deletion follows the invoice automatically.

## Consequences

**Positive**
- The KPI is one query over invoices with an origin. The schema has no record of *when* an invoice left draft today (`issueDate` is a calendar day the Freelancer can set), so the same change adds `Invoice.issuedAt`, a timestamp written once by the status service when an invoice first leaves draft; "issued within 14 days" = `issuedAt - createdAt ≤ 14 days`.

**Negative**
- Three nullable columns on the busiest table.
- `duplicateInvoice` and the editor's save path must never copy or overwrite them; a unit test guards both.

**Neutral**
- The mark is a presentation rule (`status = DRAFT`), not data removal.

## Links

- Spec: [[../spec.md]] §6.1, §7, AC-23
- SAD: [[../sad.md]] §5
- Related ADR: invoice-integrity ADR-0001
