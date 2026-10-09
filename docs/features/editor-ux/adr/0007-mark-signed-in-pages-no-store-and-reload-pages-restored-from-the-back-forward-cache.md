---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-09"
feature_size: "M"
ticket: "editor-ux"
---

# 0007 — Mark signed-in pages no-store and reload pages restored from the back/forward cache

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Browsers keep recently left pages, with their JavaScript state, in a back/forward cache and restore them instantly on Back or Forward without asking the server. Signed-in pages today send no `Cache-Control` header (only `app/api/auth/clear-session` sends `no-store`) and nothing listens for `pageshow`. After Freelancer A signs out (`signOut` from next-auth, a full navigation to sign-in), Back can restore A's editor or list from memory for a Visitor or for Freelancer B who signed in in the same tab (AC-07). ADR-0003 removes state shared across editor mounts, but a page restored from the cache is the old page itself.

## Decision drivers

- AC-07 and spec §6.1: a later Visitor or Freelancer never sees any part of an earlier one's invoice, not even for a moment, including a page restored from the back/forward cache.
- The security review (spec §6.1) must be able to verify the control.
- Browser behaviour differs: Chrome and Firefox generally keep `no-store` pages out of the cache or evict them when cookies change; Safari may restore them anyway.

## Considered options

1. **`no-store` on signed-in pages plus a restore guard** — the proxy adds `Cache-Control: private, no-store` to every signed-in page response; a small client guard in the signed-in layouts listens for `pageshow` and, when `event.persisted` is true, hides the page and does a full reload so the server decides (sign-in, B's data, or not found).
2. **Restore guard with a session check only** — keep the cache for speed; on restore, hide the page, ask the server who is signed in and show the page again only for the same Freelancer; needs a new session endpoint, and A's data stays in the tab's memory guarded by one script.
3. **`no-store` only** — one header, no client code; whether a restore is blocked then depends on the browser, and Safari can still show the page.

## Decision outcome

**Chosen:** Option 1. The header makes the cache ineligible in the browsers that honour it; the guard covers those that don't. The guard runs before paint on a restored page: it sets the document hidden (`visibility: hidden` on the root) in the `pageshow` handler and calls `location.reload()`, so a restored page is never shown, not even for the frame before the reload. The header is set in `proxy.ts`, which already decides which pages are signed-in, on page responses only (route handlers keep their own headers). `security-headers.test.ts` gains a case for it; an e2e test signs A out, signs B in and goes Back.

## Consequences

**Positive**
- AC-07 holds in every major browser, with a control the security review can read in two places.
- No new endpoint and no session state in the browser.

**Negative**
- Back and Forward between signed-in pages always reload from the server instead of restoring instantly.
- Pages with `no-store` cannot be served from the browser's HTTP cache either (they were not cacheable in practice, being personalised).

**Neutral**
- Public pages (landing, sign-in) keep their current caching.

## Links

- Spec: [[../spec.md]] US-03, AC-07, §6.1
- SAD: [[../sad.md]] §8
- Related ADR: [[0003-create-one-editor-store-per-mounted-editor-from-server-data]]
