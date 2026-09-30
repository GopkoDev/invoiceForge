---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
ticket: "code-review 2026-09-26: A1, A2, F1"
---

# 0003 — Fetch logos only by owned sender-profile id, through an IP-pinning fetcher that checks every hop

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`app/api/convert-image/route.ts` accepts any `imageUrl`, follows redirects, buffers the whole body and returns it as base64. Its only guard is an Origin/Referer check that any script can forge (A1, A2). The browser needs the logo as a data URL because PDFs render client-side, and fetching from the browser directly fails on hosts without CORS headers. This fix is wave 1 and ships as its own release.

## Decision drivers

- Spec §2 goal: image conversion can never reach internal or private network addresses.
- AC-02b: fetch only the logo stored on a sender profile the caller owns; accept no other address; a foreign profile is "not found".
- §6.1 abuse case: SSRF through redirects and through a second DNS lookup that points at an internal address.
- §6 NFR: ≤ 512 KB per image; ≤ 5 s per fetch, then aborted; ≤ 30 fetches per minute per Freelancer (where the rate-limit counter lives → SAD §8).
- AC-03: generic refusals that never reveal which addresses exist and never echo upstream status or error text.

## Considered options

1. **Own fetcher with connect-time IP pinning.** The endpoint takes `senderProfileId`. `lib/security/safe-fetch.ts` allows only `https`, resolves DNS, rejects private, loopback, link-local, CGNAT, multicast and metadata ranges (IPv4 and IPv6, including IPv4-mapped IPv6), connects only to the validated address through an undici `Agent` whose `connect.lookup` returns it, follows redirects manually with the same check on each hop (max 3), aborts at 5 s, streams with a 512 KB cap, and requires an `image/*` content type.
2. **Same contract, IP filtering from a library** such as `request-filtering-agent`. Less security code of our own, but such libraries target Node `http.Agent` rather than the built-in `fetch` (undici), so compatibility is unproven, and the caps still have to be written by us.
3. **Fetch the logo from the browser; remove the endpoint.** No SSRF at all, but logos silently disappear on hosts without CORS headers, and the server can no longer enforce the size, type or rate caps.

## Decision outcome

**Chosen:** Option 1. Taking an id instead of a URL removes the free-form address entirely (AC-02b), and pinning the connection to the address that was checked defeats DNS rebinding, which a check-then-fetch approach does not. The code is small and security-critical, and we keep it under review rather than behind a dependency whose `fetch` support we can't verify.

Endpoint contract (the shape; `api` owns the exact schema): input `{ senderProfileId }`. Output is either the data URL, or a refusal code from a closed set: `NOT_HTTPS`, `NOT_IMAGE`, `TOO_LARGE`, `RATE_LIMITED`, `UNAVAILABLE`. `UNAVAILABLE` covers unreachable, timeout, and a private or internal destination alike (AC-03). Upstream status and error text are logged, never returned.

The browser caches each fetched data URL per sender profile for the editor or export session, so reusing a logo doesn't count against the rate limit (§6 NFR).

## Consequences

**Positive**
- Closes A1 and A2 completely. The endpoint cannot be pointed anywhere a Freelancer did not store on their own profile.
- The refusal codes map one-to-one onto AC-03's plain-language warnings.

**Negative**
- We own IP-range classification code; a missed range is a security bug. The range list is reviewed by the Security Lead and kept in one module.
- PDFs of older invoices use the sender profile's current logo, not the `senderLogo` URL snapshotted on the invoice. If a Freelancer changed their logo, an old invoice's PDF shows the new one.

**Neutral**
- Replacing links with uploaded logo files later (a spec §3 non-goal) would make this fetcher obsolete, not wrong.

## Links

- Spec: [[../spec.md]] AC-01, AC-02, AC-02b, AC-03, AC-04, §6, §6.1
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0001-deny-by-default-in-proxy-with-public-allowlist]]
