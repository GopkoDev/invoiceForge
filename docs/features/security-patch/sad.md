---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
target_surfaces: [backend-service, web-frontend]
---

# Software Architecture Document — security-patch

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** Close the holes in invoiceFlow's current public surface before it becomes a public portfolio demo and gains an in-app AI chat (spec §1, §2). The feature upgrades the framework, sign-in and mail components to versions with no critical or high production advisory. It makes "signed in" mean a verified session and nothing else. It bounds what a Visitor can make the app do: Sign-in link emails per address and per source, the custom Dashboard period, and data exports per Freelancer. It sends mail only over verified TLS and refuses anonymous server actions however the request is shaped. Finally, it gives the browser a baseline content-security policy and transport headers, and closes the open error-reporting relay. Every hole is closed at the point all callers pass through, not only in the page the brief cites.

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Fail-closed auth boundary.** Nothing private is served without a verified session, whatever shape the request takes and even when the sign-in check itself errors (AC-04, AC-18).
2. **Bounded abuse cost without enumeration.** Sign-in emails, the Dashboard period and data exports are capped. A limited sign-in request is indistinguishable from a sent one in wording and timing (spec §6: ≤ 150 ms median difference; dashboard p95 ≤ 2 s).
3. **Core flows survive the hardening.** Sign-in, the dashboard chart, invoice PDFs and client error reporting keep working under the enforced policy and the upgraded components: zero policy violations (AC-20), and browser error events still arrive (spec §6).

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Freelancer | Account and data never exposed; email sign-in keeps working; dashboard and export stay usable within the caps | No |
| Visitor | Can sign in (link or Google) without being able to abuse the app; sees no difference between a sent and a limited link | No |
| Assistant | Future business-layer caller; gets a plain refusal for an over-long Dashboard period (AC-10) and is subject to the same export limit | No |
| App operator | Receives the targeted-lockout alert and CSP violation reports in error tracking | No |
| Security Lead | Reviews the auth-boundary change, the new personal data in limit records and the headers (`/security-review` before ship) | Yes (security review) |
| Tech Lead | SAD approval | Yes |

## 2. Constraints

**Technical.**
- TypeScript 5 (strict) on Node 22, pnpm 10.
- Next.js 16.1.1 → **16.3.x** (App Router; the edge guard is `proxy.ts`), with `eslint-config-next` moved in step. React 19.2.
- next-auth 5.0.0-beta.30 → **5.0.0-beta.32** (`@auth/core` ≥ 0.41.3). Providers are Google and Nodemailer, with JWT sessions (30-day lifetime) and the Prisma adapter. `auth.config.ts` must stay edge-safe: no Prisma or Nodemailer imports.
- nodemailer 7 → **10.x**.
- Prisma 7.2 → **latest 7.x** (`@prisma/client`, `prisma`, `@prisma/adapter-pg`) over Neon PostgreSQL. The schema is split under `prisma/schema/` and migrated with `prisma migrate`. `@prisma/extension-accelerate` is removed (AC-27).
- Hosting: Vercel serverless functions in `iad1`. No memory is shared between invocations, so any counter lives in Postgres, the only shared store.
- Sentry 10 (`@sentry/nextjs`), production only; browser events go through the `/monitoring` tunnel.
- Tests: Vitest unit (`pnpm test:unit`) and integration against a throwaway Postgres container (`pnpm test:integration`), Playwright e2e (`pnpm test:e2e`). CI (`.github/workflows/test.yml`) runs lint, typecheck, unit and integration on every PR. `next build` runs in the Vercel preview deploy for every PR.

**Organisational.**
- Effort budget: about one sprint (≈ 2 weeks) for one developer.
- Deadline (hard): merged before `ai-chat` starts and before the demo URL is shared publicly.
- The framework, sign-in and mail upgrades ship together in one change (spec §1 decision). The accepted cost is harder bisecting.

**Conventions.**
- Deny by default in `proxy.ts`, with one public allowlist in `config/routes.config.ts` (architecture-hardening ADR-0001). Route handlers re-check the session through `actingFreelancerForRoute()` / `requireSession()`.
- A session without a live account is a Visitor (architecture-hardening ADR-0002).
- Business functions live in `lib/services/` behind `server-only` and lint bans (service-layer ADR-0006). They take a branded `ActingFreelancer` (service-layer ADR-0001) and return the `ActionResult` union with typed codes (service-layer ADR-0002, architecture-hardening ADR-0009).
- No new external service for rate limiting; Postgres is the counter store (architecture-hardening ADR-0008 precedent).
- Zod schemas per entity in `lib/validations/`, shared by forms and actions. IDs are `cuid()`. Migrations are named `YYYYMMDDhhmmss_snake_case`.

**Regulatory / external.**
- Limit records hold personal data: a keyed digest of the normalized email address and a network source address. They are kept ≤ 24 h, never shown to anyone, purged by a sweep that covers every key, and removed on account deletion where they map to an account (spec §6.1).
- Security review is required before ship (`/security-review`), because the feature changes the authentication boundary.
- No other compliance regime applies to this feature.

## 3. Context and scope

invoiceFlow is a Next.js invoicing app for Freelancers, about to be shared publicly as a demo. This feature does not add a new product capability. It hardens the existing boundary between the public internet (Visitors, including scripts and bots) and each Freelancer's private data, and it bounds what an anonymous or signed-in caller can make the app spend: emails, CPU and export runs.

<!-- brownfield: Next.js 16 App Router monolith on Vercel; deny-by-default proxy.ts, business layer in lib/services (server-only), Postgres via Prisma 7, Auth.js v5 beta with JWT sessions, Postgres sliding-window limiter precedent (LogoFetchWindow). Scanned at e857fa5; docs/architecture-map.md (ded1be7) predates the service layer. -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Visitor | Person | Opens public pages; requests a Sign-in link or signs in with Google; may be a script calling endpoints directly. Untrusted. |
| Freelancer | Person | Uses private pages, the dashboard (Dashboard period), the editors and the data export with a verified session |
| Assistant | Person (future, external program) | Calls the business layer for exactly one Freelancer; today exercised only by direct business-layer tests (AC-10) |
| Google OAuth | System (external) | Identity provider for Google sign-in; unaffected by the sign-in-email limits (AC-14) |
| SMTP mail server | System (external) | Delivers Sign-in link emails. Must offer TLS with a certificate valid for its host name, or nothing is sent (AC-16). |
| Sentry | System (external) | Error tracking: server and browser errors (browser events through the app's tunnel), CSP violation reports, the targeted-lockout alert to the app operator, dashboard and sign-in spans for the NFRs |
| Neon PostgreSQL | System (external, managed) | The only shared store: app data, sessions' account lookup, and the new limit records |
| Vercel | System (external platform) | Runs the app. It is the only trusted source of the client network address and runs the daily retention job (cron). The build there fails the deploy when required settings are missing (AC-26). |

**Trust boundary.** Everything a Visitor sends is untrusted: headers, body, form fields, the `Next-Action` marker and query parameters. The client network address is taken only from the hosting platform, never from a header the client can set (spec §6.1). The Sign-in link address is untrusted until the link is opened (glossary: *Sign-in link*).

**C4 Context (L1):**

```mermaid
C4Context
    title security-patch - System Context

    Person(visitor, "Visitor", "Anyone without a verified session, including scripts and bots")
    Person(freelancer, "Freelancer", "Signed-in account holder; owns invoices, customers, sender profiles")
    Person_Ext(assistant, "Assistant", "Future program acting for one Freelancer via the business layer")

    System(app, "invoiceFlow", "Invoicing web app: public pages, sign-in, private pages, data export")

    System_Ext(google, "Google OAuth", "Identity provider for Google sign-in")
    System_Ext(smtp, "SMTP mail server", "Delivers Sign-in link emails over verified TLS only")
    System_Ext(sentry, "Sentry", "Error tracking, CSP reports, lockout alert, performance spans")
    SystemDb(db, "Neon PostgreSQL", "App data and short-lived limit records")
    System_Ext(vercel, "Vercel", "Hosting, trusted client address, build gate, daily cron")

    Rel(visitor, app, "Opens public pages, requests Sign-in links, signs in", "HTTPS")
    Rel(freelancer, app, "Uses private pages, dashboard, export", "HTTPS")
    Rel(assistant, app, "Asks for figures and changes for one Freelancer", "in-process call")
    Rel(app, google, "Delegates Google sign-in", "OAuth 2.0")
    Rel(app, smtp, "Sends Sign-in links", "SMTP with TLS")
    Rel(app, sentry, "Reports errors, spans, alerts, CSP violations", "HTTPS")
    Rel(app, db, "Reads and writes data and limit records", "Prisma over TLS")
    Rel(vercel, app, "Runs, supplies client address, triggers daily purge", "platform")
```

## 4. Solution strategy

**Target surfaces.** `[backend-service, web-frontend]`. Both are parts of the existing Next.js deployable: server-side proxy, route handlers, server actions and the business layer on one side, browser-delivered pages on the other. The feature introduces no new container. It changes server behaviour and adds three messages and two field messages to existing screens (SCR-01, SCR-04, SCR-06, SCR-07, SCR-08 in `ux-flows.md`). Inline, no ADR: both surfaces are given by the repo, so there is no alternative to choose between.

**UI architecture (web-frontend).** Keep the existing hybrid: React Server Components render on the server, and client components handle interactive parts (the dashboard filters, the sign-in form, the export button). The new messages reuse the existing shadcn/ui primitives and tokens from `docs/design-system.md`. No new primitive and no new client state library. Inline: unchanged from today.

**Top strategic choices (the seeds for ADRs):**

1. **Enforce the sign-in-email rules where every sign-in route converges: the Auth.js email provider hooks** ([ADR-0001](adr/0001-enforce-sign-in-email-rules-inside-the-auth-js-email-provider-hooks.md)). `normalizeIdentifier` applies the address rule (≤ 254 characters, ASCII only) while keeping identity normalization unchanged (AC-03). `sendVerificationRequest` applies the per-address and per-source limits, the equal response time and the TLS-only send. Both the `/login` action and direct calls to the sign-in service pass through these hooks; Google sign-in never does (AC-14). Serves quality goals 1 and 2.
2. **Count limited events exactly, in one Postgres event log** ([ADR-0002](adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock.md)). A new `LimitEvent` table holds one row per counted event. A per-key advisory lock makes check-then-insert safe under concurrency. The same shape gives sent-only counting, export reservation and release, the exact "export again at …" time, refusals per hour for the lockout alert, and a single global 24 h purge. No new external service (§2). The logo limiter stays as it is. Serves quality goal 2.
3. **Refuse anonymous mutations by method at the edge, and backstop every action with a guard that CI checks** ([ADR-0003](adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard.md)). Without a verified session, every request that is not GET, HEAD or OPTIONS is refused before the public-path check, except `/api/auth/*` and POSTs to `/login`. Every exported server action outside `login-actions.ts` resolves the session first, and a unit scan fails CI otherwise. Serves quality goal 1.
4. **Define the five-year Dashboard period boundary once, in an isomorphic module** ([ADR-0004](adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md)). The link reader falls back, the filter shows a notice and the business layer refuses, all through the same calendar-date rule (AC-08). Serves quality goal 2 (dashboard p95 ≤ 2 s for any link).
5. **"Signed in" means a verified session, decided by one predicate, and a failed check never ends a session.** `isVerifiedSession(x)` is true only when `x?.user?.id` is a non-empty string.
   - The edge config gains an edge-safe `session` callback that copies the JWT's account id into `session.user.id`. The Node config keeps its live-account lookup (architecture-hardening ADR-0002).
   - `proxy.ts`, `requireSession()` and `getAuthenticatedUser()` / `actingFreelancerFromSession()` all use the predicate, so an Auth.js error object or any other truthy non-session is a Visitor (S2, AC-04).
   - The proxy's `catch` branch becomes the ordinary Visitor branch. Public paths render, private pages redirect to sign-in, data and action requests get the 401. It no longer clears session cookies, so a Freelancer is signed in again once the check recovers (AC-04, AC-06).
   - Inline: this extends architecture-hardening ADR-0001 and ADR-0002 rather than choosing between alternatives.
6. **Upgrade in one change, then harden.** Next.js 16.3.x, next-auth 5.0.0-beta.32, nodemailer 10.x and Prisma's latest 7.x land in one change (spec §1 decision), followed by removal of `@prisma/extension-accelerate`. Every hardening step above is built against the upgraded APIs, so the provider hooks and the proxy are written once. Serves quality goal 3 (AC-01, AC-02, AC-27).

Each tactical decision in later sections traces to one of these seeds. A tactical decision that contradicts one is surfaced in §11.

## 5. Building block view

The feature keeps the repo's layering unchanged. Edge proxy → pages, server actions and route handlers → business layer (`lib/services`, `server-only`, `ActingFreelancer` in, `ActionResult` out) → Prisma. It adds three small modules, each with one job:
- `lib/security/limits/` counts limited events (ADR-0002).
- `lib/auth/email-provider.ts` holds the Auth.js email hooks (ADR-0001).
- A dependency-free rules module under `lib/validations/` is shared by browser and server (ADR-0004).

Business functions stay the only place business rules live. Route handlers and actions only resolve the caller and map results. The export limit lives in the business layer and refuses with a typed `RATE_LIMITED` result ([ADR-0005](adr/0005-limit-exports-in-the-business-layer-and-refuse-with-a-typed-rate-limited-result.md)). The open error relay is replaced by an app-owned tunnel that forwards only the configured DSN ([ADR-0006](adr/0006-forward-browser-error-reports-through-an-app-owned-tunnel-that-accepts-only-the-configured-dsn.md)).

**Internal decomposition (new or changed):**

```
proxy.ts                                  # verified-session predicate; refuse anonymous non-GET before isPublicPath (ADR-0003); catch = Visitor, cookies untouched
auth.config.ts                            # + edge-safe session callback copying the JWT account id to session.user.id
auth.ts                                   # Nodemailer provider wired to lib/auth/email-provider.ts
lib/
├── auth/
│   └── email-provider.ts                 # normalizeIdentifier (identity unchanged + 254/ASCII rule), sendVerificationRequest (limits, response floor, TLS-only send)
├── security/
│   ├── logo-rate-limit.ts                # unchanged (architecture-hardening ADR-0008)
│   └── limits/
│       ├── limit-store.ts                # LimitEvent check-and-record under pg_advisory_xact_lock, release, purge
│       ├── scopes.ts                     # signin-address (5/h, sent only), signin-source (30/5 min), export (3/h, started minus failed)
│       ├── keys.ts                       # address limit key (case, +tag, Gmail dots folded; keyed digest), source key (IPv4, IPv6 /64)
│       └── lockout-alert.ts              # 3 consecutive UTC hours with a refusal → one Sentry alert per address digest per day
├── helpers/
│   ├── verified-session.ts               # isVerifiedSession(x): x?.user?.id is a non-empty string (edge-safe)
│   ├── route-auth.ts                     # requireSession() uses the predicate
│   └── auth-helpers.ts                   # getAuthenticatedUser() uses the predicate
├── validations/
│   ├── dashboard-period.ts               # isWithinMaxCustomPeriod, MAX_CUSTOM_PERIOD_YEARS = 5 (isomorphic, ADR-0004)
│   ├── auth.ts                           # loginEmailSchema aligned to ≤ 254 chars, ASCII only
│   ├── web-address.ts                    # http(s)-only rule for website / image / logo fields (AC-21)
│   └── search-params.ts                  # dashboard link reader applies the shared period rule
├── services/
│   ├── dashboard/period.ts               # parseDashboardInput refuses > 5 years before any query (AC-10)
│   └── account/account.ts                # getAccountExport reserves / releases an export place (ADR-0005)
├── get-email-server-config.ts            # secure on 465, requireTLS otherwise, certificate checked against host
└── env/required-settings.ts              # required-settings list read by the build check (§7)
types/result.ts                           # + RATE_LIMITED code, RETRY_AT details
app/
├── monitoring/route.ts                   # app-owned tunnel, own DSN only (ADR-0006)
└── api/
    ├── user/export/route.ts              # maps RATE_LIMITED → 429 + Retry-After
    └── cron/purge-limits/route.ts        # daily purge, Vercel Cron secret (§7)
components/                               # three messages + field messages on existing screens; legacy non-web values as plain text
prisma/schema/auth.prisma                 # + LimitEvent model (shape fixed by the data-model stage)
```

**C4 Container (L2):**

```mermaid
C4Container
    title security-patch - Containers

    Person(visitor, "Visitor", "No verified session; may be a script")
    Person(freelancer, "Freelancer", "Verified session")

    Container_Boundary(app, "invoiceFlow (one Next.js deployable on Vercel)") {
        Container(web, "Web pages", "React 19 RSC + client components", "Sign-in, dashboard filters, editors, privacy settings")
        Container(proxy, "Edge proxy", "proxy.ts, Auth.js edge config", "Verified-session predicate, deny by default, refuses anonymous mutations by method")
        Container(actions, "Server actions", "lib/actions, use server", "Each resolves the session first; login actions exempt")
        Container(handlers, "Route handlers", "app/api, app/monitoring", "Sign-in service with email provider hooks, export, error tunnel, purge job")
        Container(services, "Business layer", "lib/services, server-only", "Dashboard figures with period cap, account export with limit")
        Container(limits, "Limits", "lib/security/limits", "Event-log limiter: check and record under a per-key lock, lockout alert, purge")
        Container(rules, "Shared rules", "lib/validations, isomorphic", "Five-year period rule, email address rule, web-address rule")
    }

    ContainerDb(db, "Neon PostgreSQL", "Prisma 7 + adapter-pg", "App data, LimitEvent, VerificationToken")
    System_Ext(smtp, "SMTP mail server", "Sign-in link delivery over verified TLS")
    System_Ext(sentry, "Sentry", "Errors, CSP reports, lockout alert")
    System_Ext(google, "Google OAuth", "Google sign-in")
    System_Ext(cron, "Vercel Cron", "Daily trigger for the purge job")

    Rel(visitor, proxy, "Every request", "HTTPS")
    Rel(freelancer, proxy, "Every request", "HTTPS")
    Rel(proxy, web, "Allowed page requests")
    Rel(proxy, actions, "Allowed action calls")
    Rel(proxy, handlers, "Allowed API calls")
    Rel(web, rules, "Validates period and addresses in the browser")
    Rel(actions, services, "Calls with ActingFreelancer")
    Rel(handlers, services, "Calls with ActingFreelancer")
    Rel(handlers, limits, "Checks sign-in limits")
    Rel(services, limits, "Reserves and releases export runs")
    Rel(services, rules, "Applies the five-year rule")
    Rel(limits, db, "Counts and records events", "SQL")
    Rel(services, db, "Reads and writes", "Prisma")
    Rel(handlers, smtp, "Sends Sign-in links", "SMTP with TLS")
    Rel(handlers, google, "OAuth sign-in", "OAuth 2.0")
    Rel(handlers, sentry, "Forwards own-project envelopes only", "HTTPS")
    Rel(limits, sentry, "Raises lockout alert", "HTTPS")
    Rel(cron, handlers, "Triggers daily purge", "HTTPS + secret")
```

## 6. Runtime view

Two seed flows cover the riskiest runtime paths: the sign-in-link request, where limits, timing and TLS meet, and the edge decision for a request without a verified session. Participants are the §5 containers. The `sequences` stage adds a flow or branch for every remaining §5 AC: dashboard period fallback and refusal, export reservation and release, the relay check, the retention purge.

**Critical flow 1: Sign-in link request (every route — action on /login or direct call to the sign-in service)**

```mermaid
sequenceDiagram
    actor V as Visitor
    participant H as Route handlers (sign-in service + email provider)
    participant L as Limits
    participant DB as Neon PostgreSQL
    participant M as SMTP mail server
    participant S as Sentry

    V->>H: requests a Sign-in link for an address
    H->>H: normalizeIdentifier applies the address rule (max 254 chars, ASCII only)
    alt address invalid
        H-->>V: enter a valid email address (nothing sent, nothing counted)
    else address well-formed
        H->>L: may a link be sent to this address from this source
        L->>DB: per-key locks, record this request for the source, count requests per source (5 min) and sent links per address (1 h)
        alt limit store unavailable
            DB-->>L: error
            L-->>H: limits unavailable
            H-->>V: sign-in by email temporarily unavailable, try again or use Google
        else address or source limit reached
            L->>DB: record refusal
            L->>L: check refusals in 3 consecutive UTC hours
            opt third consecutive hour and no alert today
                L->>S: targeted-lockout alert carrying the address digest only
            end
            L-->>H: limited
            H->>H: hold until the response floor
            H-->>V: check your inbox
        else allowed
            L-->>H: allowed
            H->>M: send link over TLS, certificate checked against host
            alt TLS offered and certificate valid
                M-->>H: accepted
                H->>L: record link sent for the address
                L->>DB: insert sent event
                H->>H: hold until the response floor
                H-->>V: check your inbox
            else no TLS or invalid certificate
                M-->>H: refused before any content is sent
                H->>S: report send failure
                H-->>V: could not send, try again
            end
        end
    end
```

**Critical flow 2: A request without a verified session at the edge**

```mermaid
sequenceDiagram
    actor C as Visitor or caller
    participant P as Edge proxy
    participant W as Web pages
    participant A as Server actions

    C->>P: any request
    P->>P: read session, apply isVerifiedSession
    Note over P: a thrown or malformed check counts as Visitor and session cookies are left untouched
    alt verified session
        P->>W: pass through (pages, actions, API)
    else not GET, HEAD or OPTIONS, outside the sign-in service and the sign-in page
        P-->>C: not signed in, no data
    else public path
        P->>W: render public page, no redirect loop
    else data request
        P-->>C: not signed in, no data
    else private page
        P-->>C: redirect to sign-in with callback
    end
    opt action posted to the sign-in page
        P->>A: forwarded
        A->>A: non-sign-in action resolves the session first and refuses
        A-->>C: not signed in, no data
    end
```

**Response floor (inline decision).** Every "check your inbox" response, for a sent or a limited link, completes no earlier than a configured floor *F* plus a small random jitter. *F* defaults to the p90 send time measured on preview, capped at 1.2 s so the sign-in p95 stays within the spec's ≤ 1.5 s. A sent link that takes longer than *F* responds when the send finishes. Both response-time distributions collapse onto *F*, which keeps the medians within the spec's ≤ 150 ms. Sending after the response was rejected, because AC-16 must report a failed send in the same response. Holding only the limited request for a measured median was rejected, because serverless instances share no memory and the two tails would still differ.

## 7. Deployment view

The topology is unchanged: one Next.js deployable on Vercel serverless functions in `iad1`, with the edge proxy in front, Neon PostgreSQL as the only datastore, and SMTP, Google and Sentry as external services. Production and every PR preview are separate Vercel deployments with their own settings. The feature adds three deployment elements:
- a daily Vercel Cron job that purges limit records ([ADR-0007](adr/0007-purge-limit-records-daily-with-a-vercel-cron-job-behind-a-bearer-secret.md));
- a build-time check that fails any deploy missing a required setting ([ADR-0008](adr/0008-fail-the-build-when-a-required-setting-is-missing.md));
- response headers (content-security policy, strict transport, permissions policy) served for every route (§8).

One migration adds the `LimitEvent` table (its shape is fixed by the `data-model` stage). It is additive, so it needs no downtime.

**Monitoring:**
- Spans:
  - `dashboard.chart` (exists) feeds the dashboard p95 ≤ 2 s NFR;
  - a new `auth.signin.email` span records the outcome only (sent / limited / invalid / unavailable / failed), never the address, and feeds the sign-in p95 ≤ 1.5 s NFR and the floor check.
- Alerts:
  - the targeted-lockout alert (an address digest refused in 3 consecutive UTC hours, at most once per address per day);
  - limit-store errors on the sign-in path (fail-closed, AC-15);
  - SMTP TLS failures (AC-16);
  - a missed purge run (Sentry Crons).
- CSP violation reports land in Sentry (§8).
- Tracing stays at the existing request boundary; no new tracing.

**Scaling thresholds:**
- `LimitEvent` volume is bounded by the limits themselves. One source adds at most 30 request rows per 5 minutes. Sent-link rows are at most 5 per address per hour, and refusal rows are at most one per refused request. Export rows are at most 3 started rows per Freelancer per hour, plus any failures. With the 24 h purge, the table stays in the low thousands of rows even under a sustained single-source flood, so no partitioning is needed.
- Revisit the store only if limit checks show in sign-in spans as more than about 50 ms at p95. That would mean lock contention on one key or a missing index on `(scope, key, at)`.

## 8. Crosscutting concepts

The repo's conventions carry over unchanged. The rows marked *new* are specific to this feature.

| Concept | Convention | Where defined |
|---|---|---|
| Logging | `console.error` with `redactError()` for expected noise; unexpected failures through `failed()`, which reports to Sentry exactly once. *New:* never log or report a raw email address or network address. Only the limit digest appears, and only in the lockout alert. | `lib/helpers/prisma-error-scrub.ts`, `lib/services/_shared/result-helpers.ts` |
| Authentication | Deny by default in `proxy.ts` with one public allowlist (architecture-hardening ADR-0001). A session without a live account is a Visitor (architecture-hardening ADR-0002). *New:* "signed in" is decided by one predicate, `isVerifiedSession` (session carries a non-empty account id), used by the proxy, `requireSession()` and `getAuthenticatedUser()`. A failed check is a Visitor and never clears cookies. Anonymous mutations are refused by method (ADR-0003). | §4 choice 5, `lib/helpers/verified-session.ts` |
| Error handling | `ActionResult` union with typed codes (service-layer ADR-0002, architecture-hardening ADR-0009). *New:* the `RATE_LIMITED` code with `details: { kind: 'RETRY_AT', retryAt }` (ADR-0005). Sign-in-provider outcomes "limits unavailable" and "send failed" are typed errors mapped to fixed messages on the sign-in page (ADR-0001). | `types/result.ts` |
| ID strategy | `cuid()` for app models (unchanged); `LimitEvent` follows it. | `prisma/schema/` |
| Rate limiting | Logo fetches: per-minute counter (architecture-hardening ADR-0008, unchanged). *New:* sign-in and export limits on the `LimitEvent` event log, with an exact sliding window under a per-key advisory lock (ADR-0002). Sign-in fails closed. A refused or failed request never counts towards the address limit. | `lib/security/limits/` |
| Limit keys (personal data) | *New:* an address limit key folds letter case, any `+tag`, and dots in Gmail local parts, then is stored only as HMAC-SHA256 under `LIMIT_KEY_SECRET` (a required setting, ADR-0008). The digest cannot be reversed by a dictionary without the key, and it never decides account identity (AC-03). Records are kept ≤ 24 h (ADR-0007) and deleted on account deletion. | `lib/security/limits/keys.ts` |
| Client address | *New:* taken only from the hosting platform (`@vercel/functions` `ipAddress()`), never from a header the client can set. IPv4 counts per address, IPv6 per /64 network (spec §6.1). | `lib/security/limits/keys.ts` |
| Input rules shared by browser and server | *New:* dependency-free rules in `lib/validations/`, used by forms and by the server: the five-year Dashboard period (ADR-0004), the email address rule (≤ 254 characters, ASCII only; AC-17), and the web-address rule (http or https only; AC-21). | `lib/validations/dashboard-period.ts`, `auth.ts`, `web-address.ts` |
| Unsafe stored URLs | *New:* website, image and logo values pass the web-address rule on save. On display, a value that fails the rule, including the copy on an issued invoice, is rendered as plain text: never an `href`, never an image `src`, on SCR-09 and in the invoice PDF (SCR-10). Stored data is not rewritten. | `lib/validations/web-address.ts` |
| Browser security headers | *New:* served for every route from `next.config.ts` `headers()`, moved from `vercel.json` so they apply identically in preview, production and local runs. **Content-Security-Policy** (enforced): `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; upgrade-insecure-requests`, plus a report endpoint. `'unsafe-inline'` for scripts covers Next.js's inline bootstrap; a per-request nonce policy is a follow-up (spec §3). **Strict-Transport-Security:** `max-age=63072000`, no `includeSubDomains`, no `preload`. **Permissions-Policy:** camera, microphone, geolocation and payment disabled. **X-XSS-Protection:** `0`. Kept as they are: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. The release gate is AC-20: zero violations on the listed flows in preview. | `next.config.ts` |
| CSP violation reports | *New:* sent to Sentry's security endpoint for the current environment's DSN (`report-uri` and `report-to`), so a missed source shows up in error tracking before users report it. **Resolves spec §8 OQ1.** | `next.config.ts` |
| HSTS scope | No subdomains until the mail provider's click-tracking subdomain is confirmed to serve HTTPS. **Resolves spec §8 OQ3** (default kept). | `next.config.ts` |
| SMTP transport | *New:* `secure: true` on port 465, `requireTLS: true` on every other port. The certificate is verified against the configured host (`rejectUnauthorized` stays on, `servername` = host). Nothing is ever sent in clear text (AC-16). | `lib/get-email-server-config.ts` |
| Internationalisation | N/A: single language (English UI). | — |
| Observability | Sentry spans `dashboard.chart` (exists) and `auth.signin.email` (*new*, outcome only); the lockout alert; Sentry Crons for the purge job (§7). | §7 |
| Events | N/A: no events or queues; direct calls only. | — |

## 9. Architecture decisions

| # | Title | Status | Section |
|---|---|---|---|
| [0001](adr/0001-enforce-sign-in-email-rules-inside-the-auth-js-email-provider-hooks.md) | Enforce sign-in email rules inside the Auth.js email provider hooks | Accepted | §4 |
| [0002](adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock.md) | Count limited events in a Postgres event log under a per-key advisory lock | Accepted | §4 |
| [0003](adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard.md) | Refuse anonymous mutations in the proxy by method, and backstop with a scanned action guard | Accepted | §4 |
| [0004](adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md) | Share one calendar-date five-year period rule across link, filter and business layer | Accepted | §4 |
| [0005](adr/0005-limit-exports-in-the-business-layer-and-refuse-with-a-typed-rate-limited-result.md) | Limit exports in the business layer and refuse with a typed RATE_LIMITED result | Accepted | §5 |
| [0006](adr/0006-forward-browser-error-reports-through-an-app-owned-tunnel-that-accepts-only-the-configured-dsn.md) | Forward browser error reports through an app-owned tunnel that accepts only the configured DSN | Accepted | §5 |
| [0007](adr/0007-purge-limit-records-daily-with-a-vercel-cron-job-behind-a-bearer-secret.md) | Purge limit records daily with a Vercel Cron job behind a bearer secret | Accepted | §7 |
| [0008](adr/0008-fail-the-build-when-a-required-setting-is-missing.md) | Fail the build when a required setting is missing | Accepted | §7 |

ADR files live under `docs/features/security-patch/adr/NNNN-<title>.md`. Decisions kept inline (below the blast-radius gate): target surfaces and UI architecture (§4), the verified-session predicate (§4 choice 5), the response floor (§6), and the header set (§8). Earlier ADRs this feature builds on, unchanged: architecture-hardening ADR-0001, ADR-0002, ADR-0008, ADR-0009; service-layer ADR-0001, ADR-0002, ADR-0006.

## 10. Quality requirements

Each top-3 goal from §1, expanded into testable scenarios. Every number is quoted from spec §6.

**QG-1. Fail-closed auth boundary**
- **When:**
  - the sign-in check returns anything other than a verified session (an Auth.js error object, a session without an account id, a thrown check);
  - or a Visitor sends a mutation in any shape (with or without `Next-Action`, form-encoded, to a public page or to `/login` carrying a non-sign-in action);
  - or the limit store is unavailable when a Sign-in link is requested.
- **Then:**
  - a private page redirects to sign-in, a data or action request is refused with no data, and no private code runs (AC-04, AC-18);
  - public pages render without a redirect loop (AC-06), and session cookies are not cleared;
  - the sign-in actions still work (AC-19);
  - with the limit store down, the limiter fails closed: no email when limits cannot be checked (spec §6).
- **How verify:**
  - unit tests of the proxy decision table, feeding `req.auth` shapes and methods and paths;
  - a CI unit scan that fails on any exported `'use server'` function outside `login-actions.ts` without a session check first (ADR-0003);
  - an integration test with the limit store unavailable;
  - the e2e page-access sweep on preview with a genuine session from the real sign-in flow (AC-05).

**QG-2. Bounded abuse cost without enumeration**
- **When:** a source or an address hits the Sign-in link limits, a link carries an over-long Dashboard period, or a Freelancer starts a fourth export within the hour.
- **Then:**
  - Sign-in link request, limited vs sent: median response times differ by ≤ 150 ms. Sign-in link request p95 ≤ 1.5 s.
  - Dashboard load, any link including an over-long period, p95 ≤ 2 s.
  - Limit-record retention: records older than 24 h are purged at least daily, by a sweep that covers every key.
  - Targeted-lockout alert: an address refused at least once in each of 3 consecutive clock hours (UTC) raises one alert to the app operator, at most once per address per day, carrying only the address digest.
  - Exports beyond 3 in an hour are refused with the retry time (AC-24).
- **How verify:**
  - an integration test with 50 limited and 50 sent requests, comparing medians. It runs twice: once with an instant fake SMTP and once with fake-SMTP latency drawn at random between 0 and the response floor *F* (§6), so the floor is proven against send variance and not only against an instant send;
  - after release, sign-in and dashboard chart spans in error tracking (7-day window), with `auth.signin.email` medians compared by outcome (sent vs limited) in the ship stage;
  - an integration test for the purge, plus a row count checked in the ship stage;
  - an integration test for the lockout alert with an injected clock;
  - integration tests for concurrent exports (AC-24, AC-25).

**QG-3. Core flows survive the hardening**
- **When:** the enforced content-security policy and the upgraded framework, sign-in and mail components run in a preview environment, then in production.
- **Then:**
  - every AC-20 flow completes with zero policy violations: Google and Sign-in link sign-in, the dashboard chart, invoice PDF download and print, a client-side error, and the full page-access sweep including settings, logo and customer-image previews, the Google profile picture, the data export and the legal pages;
  - browser error events arrive within 5 min of a synthetic error on production;
  - production advisories: 0 critical, 0 high;
  - every environment variable the app reads is listed in the example env file under the exact name the app reads.
- **How verify:**
  - Playwright e2e on preview, collecting `securitypolicyviolation` events and CSP reports (gate: zero) before production release;
  - a post-deploy smoke in the ship stage that throws a synthetic browser error and checks Sentry;
  - an advisory audit of production packages in the ship stage;
  - a unit test asserting that the required-settings list equals `env.example` (ADR-0008), plus the review checklist.

## 11. Risks and technical debt

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| The framework, sign-in, mail and database-toolkit upgrades land in one change (spec §1 decision), so a regression is hard to bisect | High | Land the upgrade first in the branch and run the full unit + integration suite and the e2e page-access sweep on preview (AC-02, AC-03) before any hardening step builds on it; rollback is a revert of the upgrade commit | Dmytro Hopko |
| The enforced content-security policy breaks a flow outside the AC-20 list (for example a third-party script added later) | Medium | Violation reports go to Sentry (§8); AC-20 gate on preview before production; the header lives in `next.config.ts`, so relaxing one directive is a one-line change | Dmytro Hopko |
| Shared network addresses (carrier NAT, offices) reach 30 requests per 5 minutes, so a legitimate Visitor sees "check your inbox" but gets no email | Medium | Google sign-in is unaffected (AC-14); `auth.signin.email` spans by outcome show source-limited volume; IPv6 counted per /64 per spec §6.1; revisit the threshold if limited outcomes from real users appear | Dmytro Hopko |
| SMTP sends regularly take longer than the response floor *F*, so slow sent responses become distinguishable from limited ones | Medium | *F* is configurable and set from the measured p90 send time on preview; ship-stage comparison of `auth.signin.email` medians by outcome (§10 QG-2) | Dmytro Hopko |
| Auth.js beta hook signatures (`normalizeIdentifier`, `sendVerificationRequest`) or the `req.auth` shape change in a later beta | Medium | Contract tests of both hooks and of `isVerifiedSession` against real Auth.js output; re-check on every Auth.js upgrade (ADR-0001); replacing the beta library is deferred to the Assistant work (spec §3) | Dmytro Hopko |
| Advisory-lock keys are 32-bit hashes, so two unrelated limit keys can occasionally share a lock and briefly serialize | Low | Harmless for correctness (only waiting); negligible at these volumes | Dmytro Hopko |
| A limited Sign-in link request still leaves an unused `VerificationToken` row (Auth.js creates it before the send hook) | Low | The token expires on its own and its URL is never sent; the per-source limit bounds how many one source can create | Dmytro Hopko |
| `next build` checks (required settings, ADR-0008; the `server-only` guard) run only in the Vercel preview deploy, not in CI | Low | Every PR gets a preview deploy, and merging requires it to be green | Dmytro Hopko |
| `docs/architecture-map.md` reflects `ded1be7` and predates the service layer; this SAD was designed against a fresh scan at `e857fa5` | Low | Run `/sdd:survey` to refresh the map before the next feature | Dmytro Hopko |
| Spec §8 OQ2: an existing account may use a non-ASCII email address that the AC-17 rule would lock out of email sign-in | Open question | Resolve before `sdd:tasks`; check production accounts first (default: refuse non-ASCII) | Dmytro Hopko |

**Accepted debt (acceptable in v1, plan to fix later):**
- The content-security policy allows `'unsafe-inline'` scripts and styles. A per-request nonce policy is a follow-up (spec §3).
- With no traffic and a late Hobby-plan cron run, a limit record can outlive 24 h (worst case ≈ 48 h) before the daily sweep removes it. Stale rows never affect a decision, and any traffic triggers the global opportunistic purge (ADR-0007).
- The repo has two limiter styles: the logo counter (architecture-hardening ADR-0008) and the `LimitEvent` event log (ADR-0002). Moving logo fetches onto the event log is a later, separate change.

## 12. Glossary

Canonical domain terms come from [CONTEXT.md](../../../CONTEXT.md); the meanings below are as used in this SAD.

| Term | Meaning |
|---|---|
| Visitor | Anyone reaching the app or its endpoints without a verified session, including scripts and bots (CONTEXT). |
| Freelancer | A signed-in account holder who sees only their own data (CONTEXT). |
| Assistant | A program acting for exactly one Freelancer without a browser session (CONTEXT); here, a future business-layer caller. |
| Sign-in link | A single-use emailed link that signs an address in as a Freelancer (CONTEXT). It is the thing the sign-in-email limits count. |
| Dashboard period | A named preset (current month, all time) or a custom from–to range of at most 5 years (CONTEXT). Only custom ranges are capped. |
| Verified session | A valid, signed session that carries a non-empty account id (spec §6.1). Anything else is a Visitor. Decided by `isVerifiedSession`. |
| Source | The client network address as reported by the hosting platform; IPv4 per address, IPv6 per /64 network (spec §6.1). |
| Limit key | The value a limit counts by: for an address, the keyed digest of its case-, tag- and Gmail-dot-folded form; for a source, the address or /64; for exports, the Freelancer id. It never decides account identity. |
| Limit event | One row in `LimitEvent`: a counted or refused occurrence (link sent, request from source, refusal, export started or failed) with its scope, limit key and time. |
| Response floor | The minimum time every "check your inbox" response takes, so a limited request is indistinguishable from a sent one. |
| Targeted lockout | An attacker keeping a victim's address limited; detected when the address is refused in 3 consecutive UTC hours. |
| App operator | Whoever receives alerts in the app's error-tracking project (lockout alert, CSP reports, missed purge runs). *Not in CONTEXT.md; candidate for `/sdd:glossary`.* |
| Content-security policy | The browser header that restricts where scripts, styles, images, frames and form posts may come from. Enforced from the first release. |
