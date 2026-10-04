---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0003 — Admit only /api/mcp past the proxy and authenticate it by bearer key alone

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`proxy.ts` denies by default, including `/api` (architecture-hardening ADR-0001), and refuses every anonymous non-read method before the public-path check (security-patch ADR-0003). An Assistant arrives with POST and no session, so it would be refused with 401 before the handler runs. Spec §1 and §6.1 call for exactly one added, reviewed exception that performs its own key check on every call. AC-09 forbids accepting a browser session in place of a key.

## Decision drivers

- AC-07, AC-09: refuse uniformly; never accept a browser session on this connection.
- Spec §6.1: one reviewed exception to the anonymous-request refusal; security review required.
- Keep the security-critical proxy allowlist short and fully tested.

## Considered options

1. **Exact-path exception for `/api/mcp`** — add the path to the public allowlist and to the anonymous-mutation exceptions in `config/routes.config.ts`; the handler reads only `Authorization: Bearer`, ignores cookies, sends no CORS headers; a scanned test pins this as the only non-auth exception.
2. **A separate host (`mcp.<domain>`)** — host-based routing in the proxy so session cookies of the main host are never sent to the endpoint.

## Decision outcome

**Chosen:** Option 1. It is a one-path change that preview deployments and integration tests exercise as-is. AC-09 holds because the handler never reads cookies, and a cross-origin page cannot send the `Authorization` header (a non-simple header needs a CORS preflight the endpoint never approves).

## Consequences

**Positive**
- The exception is one exact path, visible in one config file and guarded by a test that fails if a second path appears.
- No DNS or domain setup; previews work.

**Negative**
- The endpoint shares the origin with session cookies; safety depends on the handler's "never read cookies" discipline, enforced by a unit test that a request with a valid session cookie and no key is refused.

**Neutral**
- Moving to a separate host later is additive (route the host to the same handler) and does not change the key model.

## Links

- Spec: [[../spec.md]] §1, §6.1, AC-07, AC-09
- SAD: [[../sad.md]] §4, §8
- Related ADR: security-patch [[../../security-patch/adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard]], architecture-hardening [[../../architecture-hardening/adr/0001-deny-by-default-in-proxy-with-public-allowlist]], [[0004-store-personal-keys-as-sha-256-digests-of-prefixed-random-secrets]]
