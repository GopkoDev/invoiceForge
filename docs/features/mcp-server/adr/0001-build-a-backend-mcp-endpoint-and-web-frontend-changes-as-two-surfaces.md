---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0001 — Build the feature as a backend MCP endpoint plus web-frontend changes

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The feature has two kinds of caller. The Assistant reaches invoiceFlow without a browser and needs a machine interface (US-03 – US-06, US-09). The Freelancer needs a "Connect your AI" page, a time-zone setting and new overdue statuses on five existing screens (US-01, US-02, US-07, US-08, US-10; `ux-flows.md` inventories SCR-01 – SCR-11). The SAD must declare which C4 containers the feature owns so every downstream stage gates its output the same way.

## Decision drivers

- Spec §1: v1 serves an external MCP client *and* a visible connect page with named, revocable keys.
- `ux-flows.md` lists one new page (SCR-03), one new dialog (SCR-04) and changed states on SCR-01, SCR-02, SCR-05, SCR-06, SCR-07.
- Quality goal 1 (dashboard parity) spans both surfaces — the overdue rule changes the web UI in the same release.

## Considered options

1. **`[backend-service, web-frontend]`** — the MCP endpoint is a backend surface; the connect page, time-zone setting and status changes are a web-frontend surface.
2. **`[backend-service]` only** — treat the UI work as minor edits to the existing app; skip the screens stage and the `ui` task layer.

## Decision outcome

**Chosen:** Option 1. The UI work is real (a one-time secret display, a confirmation flow, status states on five screens), and the parity promise is only testable if the web side gets its own tasks and component / e2e-through-UI tests.

## Consequences

**Positive**
- `screens`, the `ui` task layer and the UI test tiers run, so the one-time key display and the overdue states get a manifest and tests.
- §5 draws the MCP endpoint and the web app as separate containers, keeping the new trust boundary visible.

**Negative**
- More tasks and test rows than a backend-only feature of the same size class.

**Neutral**
- Both surfaces ship from the same Next.js deployable; "two surfaces" is a design split, not two deployments (see ADR-0002).

## Links

- Spec: [[../spec.md]] §1, §4
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0002-serve-mcp-from-a-stateless-route-handler-in-the-next-app]]
