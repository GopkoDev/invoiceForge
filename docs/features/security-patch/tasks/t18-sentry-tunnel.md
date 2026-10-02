---
id: T18
title: "Replace the open Sentry rewrite with an app-owned tunnel that forwards only the configured DSN"
layer: "ports"
deps: ["T1"]
blocks: ["T19"]
acs: ["AC-22"]
files_hint: ["app/monitoring/route.ts", "next.config.ts", "instrumentation-client.ts", "tests/integration/api/monitoring-tunnel.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

# T18 — Replace the open Sentry rewrite with an app-owned tunnel that forwards only the configured DSN

## Place in the sequence

- **Blocked by:** T1 — Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change · **Blocks:** T19 — Serve the enforced content-security policy and transport headers from next.config.ts · **Wave:** 2.
- **Lane:** shares `next.config.ts` with T19 — serialized (this one first, it removes `tunnelRoute`).

## Why (user story)

> **As a** Freelancer
> **I want** the app to tell my browser to block injected content, refuse framing, use encrypted connections only, and accept only web addresses as customer websites
> **So that** a malicious link or stored value cannot run in my session
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task closes the open error-reporting relay: the app's domain only ever delivers browser reports to its own Sentry project, while keeping the ad-blocker-resilient tunnel.

## Inlined context

> **Chosen:** Option 1. Remove `tunnelRoute`. Add `app/monitoring/route.ts`, POST only. It reads the envelope header line, parses its `dsn`, and forwards to Sentry's envelope endpoint only when host and project id match `NEXT_PUBLIC_SENTRY_DSN`; otherwise it returns 403. The browser SDK sets `tunnel: '/monitoring'`. […] `/monitoring` stays excluded from the proxy matcher (it carries no app data). Per spec §3, the relay is not rate-limited, because Sentry's quota bounds floods into our own project.
>
> — `adr/0006-forward-browser-error-reports-through-an-app-owned-tunnel-that-accepts-only-the-configured-dsn.md, Options + Decision outcome + Neutral, abridged` · full text: [ADR-0006](../adr/0006-forward-browser-error-reports-through-an-app-owned-tunnel-that-accepts-only-the-configured-dsn.md)

> C->>S: posts an error envelope to the app's own tunnel · S->>S: read the project address in the envelope header · alt project address is the one configured for this environment → S->>X: forward the envelope to error tracking · X-->>S: accepted · S-->>C: accepted · else any other project address, or none readable → S-->>C: refused, nothing forwarded. Postcondition: the app's domain only ever delivers reports to its own project. The tunnel is not rate-limited (spec non-goal). Nothing persisted
>
> — `sad.md §6, Flow 8, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Client error reporting after release — browser error events arrive within 5 min of a synthetic error on production.
>
> — `spec.md §6, NFR row "Client error reporting after release", verbatim` · full text: [spec.md](../spec.md)

> **Non-goal:** Rate-limiting the error-reporting relay. Floods into the app's own error-tracking project are bounded by the provider's quota.
>
> — `spec.md §3, Non-goals, verbatim` · full text: [spec.md](../spec.md)

Code fact at breakdown time: `next.config.ts:29` has `tunnelRoute: '/monitoring'`; `instrumentation-client.ts:11` calls `Sentry.init({…})`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) ·
[adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `POST /monitoring` (`operationId: forwardErrorEnvelope`, `security: []`), body `application/x-sentry-envelope`: line 1 is the JSON header with `dsn`; only the header line is parsed.
  - `200` — forwarded, and Sentry accepted it. Sentry's response body is passed through.
  - `403` — the `dsn` names another host or project, is missing, or the header line is unreadable. Nothing is forwarded (AC-22). Empty body.
  - `502` — the envelope was for the right project but Sentry was unreachable or answered with an error. Empty body, nothing retried server-side.
- Outside the proxy matcher, carries no app data, not rate-limited, not idempotent-keyed (Sentry dedupes by event id). Responses carry no app error body.

— `contracts/openapi.yaml, operationId forwardErrorEnvelope, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-22 (US-08) — authorization

> **Given** anyone sends error reports through the app's error-reporting relay addressed to any error-tracking project other than the one configured for the current environment
> **When** the relay receives them
> **Then** it refuses to forward them, so the app's domain cannot be used to deliver reports anywhere else
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `next.config.ts`: remove `tunnelRoute: '/monitoring'` from the Sentry options (leave the rest of the Sentry wrapper intact).
- [ ] `instrumentation-client.ts`: add `tunnel: '/monitoring'` to `Sentry.init`.
- [ ] `app/monitoring/route.ts`: `POST` only; read the body as text, take the first line, `JSON.parse` it, parse `dsn` with `URL`; compare host and project id (last path segment) with `NEXT_PUBLIC_SENTRY_DSN`; match → `fetch` Sentry's envelope endpoint `https://<host>/api/<projectId>/envelope/` with the raw body and pass status/body through; no match / unreadable → `403` empty; fetch throws or non-2xx → `502` empty. No logging of the envelope body.
- [ ] Confirm `/monitoring` is still excluded from the proxy matcher (architecture-hardening ADR-0001); no change to `proxy.ts`.
- [ ] Integration test `tests/integration/api/monitoring-tunnel.test.ts` with a stubbed `fetch`: own DSN → forwarded once, 200; foreign project id → 403, no fetch; foreign host same project id → 403; missing `dsn` / garbage first line / empty body → 403; upstream 500 or network error → 502.

## Edge cases

| Case | Behaviour |
|---|---|
| Envelope for another project id on the same Sentry host | `403`, nothing forwarded |
| Envelope for the right project id on another host | `403`, nothing forwarded |
| No `dsn` in header, non-JSON first line, empty body | `403` |
| `GET /monitoring` | not allowed (405 from the framework), nothing forwarded |
| Sentry unreachable / 5xx | `502`, no server-side retry |
| `NEXT_PUBLIC_SENTRY_DSN` unset (non-production) | `403` for everything (nothing configured to match) |
| Flood of own-project envelopes | forwarded; bounded by Sentry quota (spec §3 non-goal) |

## Definition of Done

- [ ] `monitoring-tunnel.test.ts` passes all branches above (AC-22).
- [ ] `tunnelRoute` gone from `next.config.ts`; browser SDK uses `tunnel: '/monitoring'`.
- [ ] Preview check (done by the user): a synthetic browser error reaches the Sentry project through `/monitoring` (spec §6 NFR); verified fully in T20.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
