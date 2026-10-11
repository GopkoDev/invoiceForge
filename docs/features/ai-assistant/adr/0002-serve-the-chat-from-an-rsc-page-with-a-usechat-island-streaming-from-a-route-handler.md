---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-11"
feature_size: "L"
ticket: "roadmap.md steps 1–6"
---

# 0002 — Serve the chat from an RSC page with a useChat island streaming from a route handler

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Replies must appear progressively, and a Draft card must be pressable while or after a reply streams. The app renders pages as React Server Components with client islands (`components/assistants/assistant-keys.tsx`), mutates through server actions, and keeps HTTP endpoints under `app/api/*` behind the deny-by-default proxy. The owner named the AI SDK `useChat` hook in the idea brief.

## Decision drivers

- Spec §6: first visible words ≤ 3 s p95; full reply to a read question ≤ 12 s p95.
- AC-11c / AC-13: Create is not a message and must work independently of a running reply.
- AC-42: a Visitor is sent to sign in and nothing is processed.
- Existing precedent: client island inside an RSC page; `actingFreelancerForRoute` guard for route handlers.

## Considered options

1. **Hybrid** — RSC pages for the AI section and Conversation shell; a client island with `useChat` reading a UI-message stream from a new route handler `app/api/chat/route.ts`.
2. **Stream through server actions** — a server action returns a streamable value (AI SDK RSC).
3. **Own streaming client** — the same route handler with a hand-written Server-Sent Events protocol and client state in zustand.

## Decision outcome

**Chosen:** Option 1. It reuses the app's page model, gives `useChat`'s tested streaming, stop and error states, and keeps the stream on a route handler so Next.js does not queue the page's server actions (Create, delete) behind a long reply. Option 2 serializes actions per client and relies on an experimental package; option 3 rebuilds what `useChat` already provides.

## Consequences

**Positive**
- Messages travel in the AI SDK UI-message shape (typed parts: text, tool calls, data parts for the Draft card), which is also the stored shape (ADR-0008).
- The route handler follows the existing guard and error conventions: `actingFreelancerForRoute`, `RATE_LIMITED` → 429, anonymous → 401 at the proxy.

**Negative**
- One more session route under `/api`; the proxy keeps refusing it anonymously, and the page redirects the Visitor to sign-in.
- The route needs an explicit `maxDuration` above the 12 s reply budget on Vercel.

**Neutral**
- The Create press and Conversation deletion stay server actions, outside the stream.

## Links

- Spec: [[../spec.md]] §6, AC-11c, AC-13, AC-42
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0003-run-the-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-claude-haiku-5-5]], [[0008-store-conversations-in-prisma-tables-keeping-only-what-the-freelancer-saw]]
