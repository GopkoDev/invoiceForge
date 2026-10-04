---
id: T12
title: "Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline"
layer: "ports"
deps: ["T10", "T11"]
blocks: ["T13"]
acs: ["AC-06", "AC-07", "AC-09", "AC-11", "AC-26"]
files_hint: ["package.json", "app/api/mcp/route.ts", "lib/mcp/server.ts", "lib/mcp/authenticate.ts", "config/routes.config.ts", "proxy.ts", "sentry.server.config.ts", "tests/integration/api/mcp-pipeline.test.ts", "tests/unit/config/mcp-proxy-exception.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T12 — Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline

## Place in the sequence

- **Blocked by:** T10 — Add the per-key and per-source MCP limit scopes that fail closed, T11 — Authenticate a presented Personal key and record its last use and weekly usage · **Blocks:** T13 — Shape MCP answers, register read-only tools and count substantive calls · **Wave:** 4 — the trust boundary; every tool task sits behind it.
- **Lane:** shares `config/routes.config.ts` with T20 and `lib/mcp/server.ts` with T13, T18, T19 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
> **So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my Personal keys listed in my data export and removed when I delete my account
> **So that** nothing keeps access to my data after I leave
>
> — `spec.md §4, US-10, verbatim` · full text: [spec.md](../spec.md)

This task delivers the endpoint and its request pipeline: everything decided before a JSON-RPC message is dispatched.

## Inlined context

> **Request pipeline (sad.md critical flow 1), in this order, before the JSON-RPC body is read:**
> 1. **Source limit.** The network source (`sourceLimitKey`, IPv4 address or IPv6 /64) with 30 refused key checks in the most recent 5 minutes is refused with `429` before any key is checked. Limit store unavailable → `503` (fail closed, ADR-0007).
> 2. **Key check.** Only the `Authorization: Bearer <key>` header is read; cookies are never read and never create a session (AC-09, ADR-0003). … Every refusal — missing, malformed, unknown, revoked, or of a deleted account — is the one uniform `401` (AC-07, AC-26) and records one refused key check for the source. A missing key counts too.
> 3. **Last use.** A passed key check records last use, throttled to once a minute (AC-05).
> 4. **Key limit.** A key with 60 counted calls in the most recent 60 seconds is refused with `429` and `Retry-After`; limit store unavailable → `503`. Every JSON-RPC message that passed the key check counts — `initialize`, `ping`, `tools/list` and `tools/call` alike; refused calls do not (AC-11).
>
> — `contracts/openapi.yaml §info.description, Request pipeline, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Chosen:** Option 1. (Route handler + official SDK, stateless — `app/api/mcp/route.ts` hosts `@modelcontextprotocol/sdk`'s Streamable HTTP transport with no session id: a fresh server per POST, JSON responses, no standing SSE stream (GET answers 405).)
>
> — `adr/0002 §Decision outcome + Option 1, abridged` · full text: [ADR-0002](../adr/0002-serve-mcp-from-a-stateless-route-handler-in-the-next-app.md)

> **Chosen:** Option 1. (Exact-path exception for `/api/mcp` — add the path to the public allowlist and to the anonymous-mutation exceptions in `config/routes.config.ts`; the handler reads only `Authorization: Bearer`, ignores cookies, sends no CORS headers; a scanned test pins this as the only non-auth exception.)
>
> — `adr/0003 §Decision outcome + Option 1, abridged` · full text: [ADR-0003](../adr/0003-admit-only-api-mcp-past-the-proxy-and-authenticate-it-by-bearer-key-alone.md)

> **Hard rule:** **Never** log or report the `Authorization` header, a key, a key digest, or answer bodies; Sentry scrubbing extends to request headers on `/api/mcp`.
>
> — `sad.md §8, Logging, verbatim (cut)` · full text: [sad.md](../sad.md)

> **Hard rule:** `/api/mcp` shares the origin with session cookies … Handler reads only `Authorization`; unit test: valid session cookie + no key ⇒ refused; no CORS headers.
>
> — `sad.md §11, risk row 5, abridged` · full text: [sad.md](../sad.md)

> MCP SDK / protocol revisions change transport or auth behaviour — Pin the SDK version.
>
> — `sad.md §11, risk row 7, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [openapi.yaml](../contracts/openapi.yaml) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (Reads/writes go through T10 and T11 functions.)

## API contract

- `POST /api/mcp` → `200` JSON-RPC response · `202` for notifications · `400` / `406` / `415` transport errors (SDK) · `401` `KeyRefused` · `429` `Limited` · `503` `LimitStoreUnavailable` · `500` `ServerFailure`.
- `KeyRefused`: header `WWW-Authenticate: Bearer realm="invoiceflow", error="invalid_token"` (no `resource_metadata`); body `{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"This Personal key is not valid. Ask the Freelancer to create a key on the Connect your AI page in invoiceFlow and put it in this assistant's settings.","data":{"code":"UNAUTHORIZED"}}}` — byte-identical for every cause.
- `Limited`: `Retry-After` = whole seconds to `retryAt`, rounded up; `error.code -32029`, `data: { code: RATE_LIMITED, details: { kind: RETRY_AT, retryAt } }`; key message "Too many calls with this Personal key: at most 60 calls a minute. Try again after <retryAt>." · source message "Too many refused key checks from this network. Try again after <retryAt>."
- `LimitStoreUnavailable`: `error.code -32003`, message "invoiceFlow cannot check its call limits right now, so the call was refused. Try again in a few minutes.", `data: { code: FAILED }`, no `Retry-After`.
- `GET` / `DELETE /api/mcp` → `405`, `Allow: POST`, before any key check.

— `contracts/openapi.yaml, operationIds postMcpMessage/getMcpStream/deleteMcpSession + components.responses, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-06 — happy path

> **Given** a Freelancer revokes a Personal key and confirms
> **When** an Assistant calls with that key and the key is checked after the revocation was confirmed, even for a call that was already waiting
> **Then** the call is refused and returns no data, and the key moves to the revoked list. A call whose key check passed before the revocation was confirmed may finish. A revoked key can never be reactivated
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — authorization

> **Given** an Assistant presenting a key that is revoked, unknown, malformed, or belongs to a deleted account
> **When** it asks for anything
> **Then** the system refuses without returning any Freelancer data and without revealing whether the key ever existed or whose it was. The refusal tells the Assistant to ask the Freelancer for a valid key
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-09 — authorization

> **Given** a Visitor, or a browser with a signed-in Freelancer's session but no Personal key
> **When** it calls the Assistant connection
> **Then** the system refuses. A browser session is never accepted in place of a Personal key, so a web page cannot make a signed-in Freelancer's browser read their data through it
>
> — `spec.md §5, AC-09, verbatim` · full text: [spec.md](../spec.md)

### AC-11 — domain invariant

> **Given** a Personal key that has made 60 calls in the past 60 seconds
> **When** it makes another call
> **Then** the system refuses that call and tells the Assistant when it can try again. Every call presented with the key that passes the key check counts, including tool listings; calls refused by the limit do not count, and the 60 seconds are always the most recent 60, not a calendar minute. The Freelancer's other keys and every other Freelancer keep working normally
>
> — `spec.md §5, AC-11, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — cross-context

> **Given** a Freelancer with active Personal keys
> **When** they delete their account
> **Then** every key stops working from that moment, and an Assistant using one is refused as in AC-07
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add and pin `@modelcontextprotocol/sdk` (exact version) — `package.json`
- [ ] Add `/api/mcp` as the single exact-path public + anonymous-mutation exception — `config/routes.config.ts`, `proxy.ts`
- [ ] Pipeline: source limit → bearer key (never cookies) → `authenticatePersonalKey` → `takeMcpKeyCall` → dispatch; refusal builders for 401/429/503 — `lib/mcp/authenticate.ts`
- [ ] Per-request stateless server (no tools registered yet; T13 adds the registry) — `lib/mcp/server.ts`
- [ ] Route handler: `POST` dispatch, `GET`/`DELETE` → 405, no CORS headers, Node.js runtime — `app/api/mcp/route.ts`
- [ ] Scrub `Authorization` and bodies on `/api/mcp` — `sentry.server.config.ts`
- [ ] Integration tests for every refusal + a passing `initialize` / `tools/list` — `tests/integration/api/mcp-pipeline.test.ts`
- [ ] Unit test pinning `/api/mcp` as the only non-auth proxy exception — `tests/unit/config/mcp-proxy-exception.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Valid session cookie, no `Authorization` | uniform 401, refused key check recorded |
| `Authorization: Basic …` or no `Bearer ` prefix | uniform 401 |
| Revoked while a call waited before the key check | 401 (no cache) |
| Source blocked | 429 + `Retry-After`, no key lookup at all |
| Limit store down at source or key step | 503, no data, no `Retry-After` |
| Key at 60 calls | 429 + `Retry-After`; other keys still 200 |
| Recording the refused key check fails | still the uniform 401 |
| `OPTIONS` preflight from a web origin | no `Access-Control-Allow-*` headers |

## Definition of Done

- [ ] Integration tests on /api/mcp show the byte-identical 401 for missing/malformed/unknown/revoked/deleted-account keys and for a session cookie without a key, 429 with Retry-After for the key and source limits, 503 when the limit store is unavailable, 405 for GET/DELETE, no CORS headers, and a unit test pins /api/mcp as the only non-auth proxy exception.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
