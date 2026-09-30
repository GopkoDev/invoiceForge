---
id: T03
title: "Build the IP-pinning safe fetcher with per-hop checks and size/time caps"
layer: "infra"
deps: ["T00"]
blocks: ["T05"]
acs: ["AC-03"]
files_hint: ["lib/security/safe-fetch.ts", "package.json"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T03 — Build the IP-pinning safe fetcher with per-hop checks and size/time caps

## Place in the sequence

- **Blocked by:** — · **Blocks:** T05 — Rewrite /api/convert-image to fetch only an owned sender profile's logo · **Wave:** wave 1 — the image-conversion security release, shipped alone first (spec §1).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task makes it impossible for the logo fetch to reach an internal or private address or to exhaust the server with a huge or slow response.

## Inlined context

> Taking an id instead of a URL removes the free-form address entirely (AC-02b), and pinning the connection to the address that was checked defeats DNS rebinding, which a check-then-fetch approach does not. The code is small and security-critical, and we keep it under review rather than behind a dependency whose `fetch` support we can't verify.
>
> — `adr/0003, Decision outcome, abridged` · full text: [ADR-0003](../adr/0003-fetch-logos-by-owned-profile-id-through-ip-pinning-fetcher.md)

> Endpoint contract (the shape; `api` owns the exact schema): input `{ senderProfileId }`. Output is either the data URL, or a refusal code from a closed set: `NOT_HTTPS`, `NOT_IMAGE`, `TOO_LARGE`, `RATE_LIMITED`, `UNAVAILABLE`. `UNAVAILABLE` covers unreachable, timeout, and a private or internal destination alike (AC-03). Upstream status and error text are logged, never returned.
>
> — `adr/0003, Decision outcome, verbatim` · full text: [ADR-0003](../adr/0003-fetch-logos-by-owned-profile-id-through-ip-pinning-fetcher.md)

>                     SF->>SF: https only, resolves DNS, rejects private and internal ranges
>                     SF->>H: requests the image from the validated address
>                     H-->>SF: image bytes or a redirect
>                     Note over SF,H: every redirect hop is re-validated, at most 3 hops, 5 s total, 512 KB cap
>
> — `sad.md §6, flow 1 safe-fetcher steps, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Gaps in private-address classification: IPv6 forms, IPv4-mapped IPv6, NAT64, decimal or octal IPv4 literals in hostnames | Medium | Normalize addresses with Node's `net` parsing before range checks; connect only to the checked address (ADR-0003); include these forms in the §10 probe set | Dmytro Hopko |
>
> — `sad.md §11, risk row «private-address classification», verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Outbound HTTP | The server fetches a user-influenced URL **only through the safe fetcher** (https, validated and pinned address per hop, 5 s, 512 KB, `image/*`). No other code path fetches user-supplied URLs |
>
> — `sad.md §8, row Outbound HTTP, verbatim` · full text: [sad.md](../sad.md)

> | Logo fetch — size cap | ≤ 512 KB per image; larger is refused | enforced limit + warning count in logs |
> | Logo fetch — time cap | ≤ 5 s per fetch, then aborted | enforced timeout + abort count in logs |
>
> — `spec.md §6, NFR rows «Logo fetch — size/time cap», verbatim` · full text: [spec.md](../spec.md)

> Metrics, as structured log lines: `logo_fetch outcome=<ok|NOT_HTTPS|NOT_IMAGE|TOO_LARGE|RATE_LIMITED|UNAVAILABLE> reason=<size|timeout|blocked_ip|…>`, which gives the size-cap, time-cap and refusal counts spec §6 measures "in logs". The upstream host and IP go to the log only, never to the response.
>
> — `sad.md §7, Monitoring, verbatim` · full text: [sad.md](../sad.md)

Dependency note: `undici` is not a direct dependency today (`package.json`); add it (the pinned agent's `connect.lookup` is the pin), or use Node's built-in `https.request` with a custom `lookup` — either way the connection must go to the address that was checked.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. Exposes to T05: `safeFetchImage(url: string): Promise<{ ok: true; bytes: Buffer; contentType: string } | { ok: false; code: 'NOT_HTTPS' | 'NOT_IMAGE' | 'TOO_LARGE' | 'UNAVAILABLE'; reason: string }>` (the `reason` is for the log line only).

## Acceptance criteria

### AC-03 — error

> **Given** a signed-in Freelancer whose logo link is not secure, is unreachable, times out, returns something other than an image, exceeds the size limit, leads (directly or after redirects) to an internal or private network address, or whose logo fetch limit per minute is reached
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF is still produced without the logo, and the Freelancer sees a plain-language warning: a specific reason only for "link is not a secure web address", "file is not an image", "file is larger than the size limit" and "too many requests, try again in a minute"; unreachable, timed-out and internal or private addresses all share one message, "the logo could not be loaded from this link", so the warning never reveals which addresses exist
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `undici` (or document the `https.request` + `lookup` alternative in the file header) — `package.json`
- [ ] IP classifier: parse with `net.isIP` / normalize IPv4-mapped IPv6 (`::ffff:a.b.c.d`), NAT64 (`64:ff9b::/96`), reject loopback, RFC1918, CGNAT `100.64/10`, link-local `169.254/16` + `fe80::/10`, ULA `fc00::/7`, `0.0.0.0/8`, multicast, broadcast, metadata `169.254.169.254`, `::`/`::1` — `lib/security/safe-fetch.ts`
- [ ] Reject non-`https:` URLs → `NOT_HTTPS`; reject URLs with credentials; resolve DNS with `dns.lookup({ all: true })`, refuse if **any** answer is private, pin the connection to a checked address
- [ ] Follow redirects manually (`redirect: 'manual'`), re-run scheme + DNS + IP checks per hop, max 3 hops → else `UNAVAILABLE reason=redirects`
- [ ] One `AbortSignal.timeout(5000)` across all hops → `UNAVAILABLE reason=timeout`; stream the body and abort at 524 288 bytes → `TOO_LARGE`; `Content-Type` not `image/*` → `NOT_IMAGE`
- [ ] Emit one `logo_fetch outcome=… reason=…` log line per call (host/IP in the log only)
- [ ] Run the QG-1 probe list against the function from a scratch script (not committed): `169.254.169.254`, `127.0.0.1`, `[::1]`, `::ffff:127.0.0.1`, `http://0x7f.1/`, redirect to `10.0.0.1`, a 5 MB image, a slow-drip server

## Edge cases

| Case | Behaviour |
|---|---|
| Host resolves to both a public and a private address | Refused (`UNAVAILABLE reason=blocked_ip`); never connects |
| DNS answer changes between check and connect (rebinding) | Connection is pinned to the checked address; the second lookup is never used |
| Redirect from https to http | `NOT_HTTPS` is not revealed per hop — returns `UNAVAILABLE reason=redirect_scheme` (only the stored link's own scheme maps to `NOT_HTTPS`) |
| Server sends no `Content-Length` and streams forever | Aborted at 512 KB (`TOO_LARGE`) or at 5 s (`UNAVAILABLE`), whichever first |
| Upstream 404/500 | `UNAVAILABLE`; the status is logged, never returned |
| Decimal/octal IPv4 literal hostname (`http://2130706433/`) | Normalized by the URL parser/`net`, classified as loopback, refused |

## Definition of Done

- [ ] the probe list above yields `UNAVAILABLE` (blocked/redirect/timeout) or `TOO_LARGE` for every hostile case and `ok` for a real public https PNG, verified by a scratch script run recorded in the PR description
- [ ] no code path in the repo other than this module fetches a user-supplied URL (`grep -rn "fetch(" app lib` reviewed)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
