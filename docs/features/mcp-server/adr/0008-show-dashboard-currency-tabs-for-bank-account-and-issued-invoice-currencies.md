---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0008 — Show dashboard currency tabs for bank-account and issued-invoice currencies

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The dashboard's currency tabs come from the Freelancer's bank-account currencies (`getCurrencyTabs` → `queryCurrencyTabs` in `lib/services/dashboard`). AC-15 makes an Assistant report every currency that appears on the Freelancer's issued invoices. An invoice issued in a currency with no bank account would then appear in an Assistant's figures but on no dashboard tab — a parity gap from day one. Spec §8 left this open until design completes, defaulting to "document the gap".

## Decision drivers

- Quality goal 1 / spec §6 NFR: 100 % of figures equal the dashboard to the cent.
- Spec §7 KPI: zero "Assistant disagrees with dashboard" reports within 90 days of launch.
- AC-15: Assistant figures cover every currency on issued invoices, never converted.

## Considered options

1. **Union** — dashboard tabs = currencies of the Freelancer's bank accounts ∪ currencies of their issued invoices.
2. **Keep bank-account tabs, document the gap** — parity guaranteed only for tab currencies; the parity test excludes the rest.

## Decision outcome

**Chosen:** Option 1. It closes the only known structural parity gap with one extra `DISTINCT` currency query in the dashboard service, so the parity test can run over every currency without exclusions.

## Consequences

**Positive**
- Every figure an Assistant reports has a dashboard tab to compare against.
- The parity test needs no currency exclusion list.

**Negative**
- A small scope addition beyond the spec's default: some Freelancers see a new tab for a currency they invoiced in without a bank account.

**Neutral**
- The empty-state fallback (a `USD` tab when there is nothing at all) is unchanged.

## Links

- Spec: [[../spec.md]] §8 (resolved), AC-15
- SAD: [[../sad.md]] §10, §11
- Related ADR: [[0005-compute-overdue-at-read-time-from-one-shared-rule-module]]
