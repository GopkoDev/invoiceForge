---
status: Superseded by mcp-server ADR-0006
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "code-review 2026-09-26: A3, L9"
---

# 0010 — Carry the browser time zone to the server in a cookie

- **Status:** Superseded by [mcp-server ADR-0006](../../mcp-server/adr/0006-save-the-freelancer-time-zone-on-the-account.md) (2026-10-04) — the time zone is now saved on the account; the browser cookie only seeds it on first visit.
- **Date:** 2026-09-26
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

The invoice list and the dashboard are server-rendered, and the server doesn't know the Freelancer's time zone. `dateTo` is parsed as UTC midnight, so an invoice issued later on the last day of a range is excluded (L9). A malformed dashboard range should fall back to "the current month", and whose month that is depends on the time zone (A3).

## Decision drivers

- AC-25: fall back to the current month in the Freelancer's time zone, "the one their browser reports".
- AC-27: invoices issued at any time on the last day of a range are included, counting days in that time zone.
- §6 NFR: 0 unhandled page errors from malformed links. An invalid time-zone value must not become a new crash source.

## Considered options

1. **Cookie.** A small client component in the protected layout writes the browser's IANA time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) to a `tz` cookie. The server validates it against the runtime's zone list and computes day bounds: start at local 00:00, end exclusive at the next day's local 00:00. With no cookie (the very first request), it uses UTC, then refreshes once after the cookie is set.
2. **The browser computes range bounds.** The client converts the chosen local dates into UTC instants and sends them with the request or link; the server uses them as given. Also browser-reported and needs no cookie, but a shared or bookmarked link carries the creator's bounds rather than the viewer's, and the server still has no time zone for AC-25's "current month" fallback on a malformed link.

## Decision outcome

**Chosen:** Option 1. It implements the spec's wording directly for both AC-25 and AC-27, needs no schema or UI, keeps links free of per-viewer state (a shared link shows each viewer their own days), and is contained in `lib/helpers/time-zone.ts`. An invalid or missing cookie falls back to UTC and never throws.

## Consequences

**Positive**
- Fixes L9 and gives A3's fallback a well-defined "current month".
- Every date-range query derives its bounds from one helper.

**Negative**
- The first-ever render uses UTC, and a second render follows once the cookie exists. A Freelancer far from UTC may see a one-time adjustment.
- The cookie is client-controlled input. It is validated, and only ever used to compute date bounds.

**Neutral**
- Promoting it to an account setting later would be additive, but it is a new capability outside this feature.

**Amendment (2026-10-10, editor-ux T57, review r4 P5)**
- The sign-in pages (the `(auth)` layout: /login, /verify-request, the sign-in error page) also write the `tz` cookie, without a refresh. They render nothing that depends on the zone.
- Why: on the first sign-in the private layout wrote the cookie and called `router.refresh()`. In WebKit, a navigation started during that round trip cancelled the refresh fetch. Next.js then did a full load of the landing page, and the Freelancer's navigation was lost. Now the cookie is already current when the Sign-in link lands, so the private layout does not refresh, and the first private request seeds the account zone (mcp-server ADR-0006) from the right value.
- The private layouts still write the cookie and refresh once when it is missing or stale. This covers a Sign-in link opened in a different browser, and a changed device zone. In that rarer case the race can still happen. How the server reads the cookie is unchanged.

## Links

- Spec: [[../spec.md]] AC-25, AC-27
- SAD: [[../sad.md]] §8
