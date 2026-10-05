---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0002 — Serve MCP from a stateless route handler in the Next.js app

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

An MCP client lists and calls tools over HTTP. Invoice Forge's business logic lives in `lib/services`, marked `server-only` and reachable only in-process with an `ActingFreelancer` (service-layer ADR-0001, ADR-0006). The app runs as Vercel functions in one region (`iad1`) with no Redis or other session store. The tools are read-only, so the server never needs to push notifications to the client.

## Decision drivers

- Spec §6 NFR: p95 ≤ 800 ms server-side for list and single-record questions; ≤ 1.5 s for summary figures, Debtors and Expected payments at 5,000 invoices.
- §2 constraint: services are in-process only (`server-only`, service-layer ADR-0006).
- §2 Organisational: one developer — every new store or service adds operating burden (secrets, monitoring, a second fail-closed path); preferred, not mandated.
- Read-only scope (spec §3): no server-initiated messages, no long-lived streams needed.

## Considered options

1. **Route handler + official SDK, stateless** — `app/api/mcp/route.ts` hosts `@modelcontextprotocol/sdk`'s Streamable HTTP transport with no session id: a fresh server per POST, JSON responses, no standing SSE stream (GET answers 405).
2. **Route handler + Vercel `mcp-handler` adapter** — the same location through a wrapper library; its SSE/resumable mode needs Redis, and its auth helper is shaped for OAuth.
3. **A separate MCP service** — its own deployment calling Invoice Forge through a new internal API.

## Decision outcome

**Chosen:** Option 1. It calls `lib/services` directly (no network hop against the p95 budget), needs no session store, fits request-scoped Vercel functions, and keeps the one dependency that tracks the protocol itself.

## Consequences

**Positive**
- One deployable; MCP tools are thin adapters over existing services, so the parity goal reuses the dashboard's own queries.
- Stateless requests scale horizontally with no sticky sessions.

**Negative**
- No server-to-client notifications or resumable streams; a future write feature needing progress updates would revisit this.
- Every request rebuilds the tool registry (cheap, but it is per-request work).

**Neutral**
- Moving to a separate service later means extracting an internal API over `lib/services`; the tool adapters themselves would move unchanged.

## Links

- Spec: [[../spec.md]] §1, §6
- SAD: [[../sad.md]] §4, §5, §7
- Related ADR: [[0003-admit-only-api-mcp-past-the-proxy-and-authenticate-it-by-bearer-key-alone]]
