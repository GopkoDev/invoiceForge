---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0001 — Build the backend service and the web frontend as two surfaces of one deployable

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The feature adds server behaviour (a chat route, a topic router and agent, the draft resolver, the Create action, an MCP draft tool, counters, a daily clean-up) and 13 screens or screen changes (`ux-flows.md`). Every downstream stage gates its artifacts on the declared surfaces, so the choice decides which task layers and test tiers exist. The open question was whether the 90-day Conversation clean-up deserves its own `worker` surface.

## Decision drivers

- Spec §1 and §4: the primary user is a signed-in Freelancer in the browser; the secondary actor is an external Assistant over MCP.
- Spec §6: automatic Conversation deletion within 24 h after the 90-day mark; a daily job is enough.
- Existing capability: the daily Vercel cron route `/api/cron/purge-limits` already runs maintenance inside the app (`vercel.json`).

## Considered options

1. **`[backend-service, web-frontend]`** — the Next.js app owns all behaviour; the clean-up is one more step in the existing daily cron route.
2. **`[backend-service, web-frontend, worker]`** — the clean-up becomes its own scheduled container with its own task layer and deployment.

## Decision outcome

**Chosen:** Option 1. A daily delete query needs no separate lifecycle, and the cron route already provides schedule, secret and Sentry reporting.

## Consequences

**Positive**
- `api`, `tasks` and `plan-tests` add the `ui` layer and the component / visual-regression / e2e-through-UI tiers on top of the backend tiers; nothing else.
- One deployable, one deploy pipeline, as today.

**Negative**
- The cron route grows several unrelated clean-ups; one failing step must not skip the others.

**Neutral**
- Moving the clean-up into a worker later is a move of one function plus a schedule.

## Links

- Spec: [[../spec.md]] §1, §4, §6
- SAD: [[../sad.md]] §4, §5
- Related ADR: mcp-server ADR-0001 (same two-surface shape)
