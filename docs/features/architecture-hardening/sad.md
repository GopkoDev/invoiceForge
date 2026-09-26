---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
target_surfaces: [backend-service, web-frontend]
---

# Software Architecture Document — architecture-hardening

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** Invoice Forge is in production, and a review on 2026-09-26 found 27 open problems. This feature fixes them in the existing app. It closes the authorization boundary so a Visitor can reach only deliberately public endpoints, and makes the logo fetch for PDFs unable to reach internal or private network addresses. The server enforces every invoice rule itself, so each saved invoice has a number unique within its sender profile and totals that equal what the Freelancer saw and are never negative. List and dashboard pages survive malformed links and report load failures honestly, and account deletion always succeeds and removes all of the Freelancer's data. Nothing new is built for the Freelancer beyond warnings, confirmations and error states. The work hardens what exists, shipped in four risk-ordered waves (spec §1).

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Security of the boundary.** Deny by default for every non-public endpoint, and a logo fetch that never reaches private, loopback or link-local addresses and stays within ≤ 512 KB, ≤ 5 s and ≤ 30 fetches per minute per Freelancer.
2. **Integrity of stored invoice data.** Invoice numbers are unique within a sender profile, 0 "number already used" failures on system-proposed numbers, totals are recomputed on the server and never negative, and account deletion is all-or-nothing.
3. **Honest, crash-free reads.** 0 unhandled page errors from malformed links; a load failure is shown as an error with retry, never as an empty state or "not found".

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Freelancer | Trusts every stored number and total; can export and delete the account; sees honest errors | No |
| Visitor | Adversary and crawler. Must reach only public pages, sign-in and the crawling rules | No |
| Customer | Data subject. Their details copied onto invoices must actually be removed when the Freelancer deletes the account | No |
| Dmytro Hopko (owner) | Ships the four waves; owns the §11 open questions | Yes |
| Tech Lead | SAD approval | Yes |
| Security Lead | Security review required by spec §6.1 (the authorization boundary of every endpoint changes) | Yes |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

**Technical.**
- TypeScript 5 (strict) on Node, pnpm 10 (`package.json`, `tsconfig.json`).
- Next.js 16.1.1 App Router + React 19.2.3. RSC pages call `'use server'` actions directly, and route handlers live under `app/api/`.
- PostgreSQL on Neon (reached through its connection pooler) via Prisma 7.2 + `@prisma/adapter-pg`. The schema is split in `prisma/schema/{base,auth,invoice}.prisma`, and money columns are `Decimal(10,2)` (`prisma/schema/invoice.prisma:187-193`).
- next-auth 5.0.0-beta.30 with the **JWT session strategy**, 30-day lifetime (`auth.ts`, `config/jwt.config.ts`). There is no server-side session row to revoke. `auth.config.ts` must stay edge-safe (no Prisma or Nodemailer imports), because `proxy.ts` runs on it.
- `proxy.ts` guards page routes only; its matcher excludes `api` (`proxy.ts:70`).
- Hosting on Vercel serverless functions. There is no shared in-process memory between invocations, so any counter that must hold across requests has to live in a shared store.
- PDFs are rendered in the browser with `@react-pdf/renderer` 4 (`lib/helpers/invoice-pdf-helpers.tsx:133`). The server only supplies the logo as a data URL.
- Sentry 10, production only, with a `/monitoring` tunnel (`next.config.ts`).
- zod 3 + react-hook-form 7 for validation; schemas are shared by forms and actions.

**Organisational.**
- Size M (1–2 sprints), one developer, the owner (Dmytro Hopko).
- Delivery in four risk-ordered waves (spec §1): (1) the image-conversion security fix as its own release; (2) invoice data integrity; (3) input and link validation; (4) the rest.
- No automated tests and no test harness (spec §3, F7). TDD is off, and regressions are caught by review and production monitoring.
- Target: 0 open High/Medium findings within 30 days of the first wave's release (spec §7). There is no other hard deadline.

**Conventions.** (source: `docs/architecture-map.md` §Conventions)
- Data access lives in `lib/actions/<domain>-actions.ts`. `getAuthenticatedUser()` runs first, then queries are scoped by `userId` (`lib/helpers/auth-helpers.ts:10`). Actions return `ActionResult<T>` (`types/actions.ts:5`) and never throw to the client.
- One zod schema file per entity in `lib/validations/`, reused by forms via `zodResolver`.
- Mutations call `revalidatePath(protectedRoutes.<x>)`. IDs are `cuid()`. Migrations use `prisma migrate` with `YYYYMMDDhhmmss_snake_case` folders.
- UI is built from shadcn/ui (base-vega) primitives in `components/ui/` and modals go through `store/use-modal-store.ts`.
- The canonical action to copy is `lib/actions/customer-actions.ts`. Account and profile actions are the known deviation (F3) this feature removes.

**Regulatory / external.**
- Data classification: confidential. Invoices hold names, addresses, tax ids and bank details (spec §6.1).
- Account deletion is immediate and total, with no soft delete and no grace period (spec §3). Export beforehand is the only safety net.
- Records in error monitoring and logs are not purged on deletion; they expire under normal retention (spec §3).
- A security review is required before release (spec §6.1). No formal compliance regime (e.g. SOC 2, PCI) applies; N/A.

## 3. Context and scope

Invoice Forge lets Freelancers keep sender profiles, Customers and products, create invoices, export them as PDFs and send them to their Customers. This feature changes no business capability. It moves the trust boundary: the server stops trusting the browser form, the Origin header and any URL a caller supplies, and treats every request without a live account as a Visitor. The one outbound call that reaches arbitrary internet hosts, the logo fetch, is fenced off from private networks.

<!-- brownfield: architecture-map.md reflects ded1be7; HEAD 1c90e41 differs only in docs, so the map is current. Next.js 16 App Router monolith on Vercel, Prisma 7 on Neon Postgres, next-auth JWT sessions, proxy excludes /api, no tests. -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Freelancer | Person | Signs in; manages sender profiles, Customers, products and invoices; exports PDFs and their data; deletes their account |
| Visitor | Person (external, untrusted) | Anyone without a signed-in session, including scripts, bots and search crawlers. May reach only the public set (AC-05) |
| Google OAuth | System (external) | Identity provider for sign-in |
| SMTP server | System (external) | Delivers magic-link sign-in email (Nodemailer) |
| Sentry | System (external) | Receives errors and load failures (production only) |
| Logo image hosts | System (external, untrusted) | Any public HTTPS host a Freelancer links a sender-profile logo to. Fetched server-side, capped by size, time and rate |
| Private and internal networks | System (external, forbidden) | Cloud metadata service, loopback, private and link-local ranges. The logo fetch must refuse them at every hop |

**C4 Context (L1):**

```mermaid
C4Context
    title architecture-hardening - System Context

    Person(freelancer, "Freelancer", "Signed-in account holder who owns sender profiles, customers, products and invoices")
    Person_Ext(visitor, "Visitor", "Anyone without a signed-in session, incl. scripts, bots and crawlers")

    System(forge, "Invoice Forge", "Invoicing web app: invoices, PDFs, dashboard, data export")

    System_Ext(google, "Google OAuth", "Sign-in provider")
    System_Ext(smtp, "SMTP server", "Magic-link email")
    System_Ext(sentry, "Sentry", "Error monitoring, production only")
    System_Ext(logohost, "Logo image hosts", "Public HTTPS hosts named in sender-profile logo links, untrusted")
    System_Ext(internal, "Private and internal networks", "Cloud metadata, loopback, private and link-local ranges")

    Rel(freelancer, forge, "Manages invoices, exports PDFs and data", "HTTPS")
    Rel(visitor, forge, "Public pages, sign-in, crawling rules only", "HTTPS")
    Rel(forge, google, "Delegates sign-in", "OAuth 2.0")
    Rel(forge, smtp, "Sends sign-in links", "SMTP")
    Rel(forge, sentry, "Reports errors and load failures", "HTTPS")
    Rel(forge, logohost, "Fetches an owned profile logo, capped", "HTTPS")
    Rel(forge, internal, "Never fetched, refused at every hop", "blocked")
```

## 4. Solution strategy

**Target surfaces: `backend-service` + `web-frontend`.** The feature introduces no new container. It hardens the two halves of the existing Next.js monolith: the server side (RSC pages, server actions, route handlers, proxy) and the browser side (client components, the invoice editor, PDF rendering). ux-flows lists 19 affected screens (SCR-01…SCR-19) and one new stop, the legacy-totals confirmation (SCR-15). Scored 1 of 3 on the blast-radius gate (multi-module only; nothing new is introduced and there is no real alternative), so this is recorded inline, not as an ADR.

**UI architecture (web-frontend): unchanged.** Server-rendered React Server Components with client islands, as today. New UI (error-with-retry, confirmations, field messages, the logo warning) is composed from the existing shadcn/ui primitives (`Empty`, `AlertDialog`, `Field`, `Sonner`) and modals go through `store/use-modal-store.ts` (architecture-map §Frontend). No new state or routing library.

**Top strategic choices (the seeds for ADRs):**

1. **Deny by default at the boundary** (ADR-0001, ADR-0002). One allowlist in `config/routes.config.ts` defines the public set, and the proxy now covers `/api` too. Everything else requires a session: page requests go to sign-in, and data requests and actions are refused. A token whose account no longer exists counts as a Visitor. The edge proxy checks the signature, and the Node layer (layouts, `getAuthenticatedUser()`, `requireSession()`) checks that the account is live. This serves quality goal 1 and closes F1, F2, F3 and AC-21 without changing the session model.
2. **Outbound fetches are fenced, not trusted** (ADR-0003). The logo endpoint takes an owned sender-profile id, never a URL. A dedicated fetcher pins each connection to an address it has validated as public, re-checks every redirect hop, and enforces the ≤ 512 KB / ≤ 5 s caps. Refusals come from a closed, generic code set. This serves quality goal 1 and is wave 1 on its own.
3. **The server is the single source of truth for invoice data** (ADR-0004, ADR-0005, ADR-0006). Numbers are allocated server-side inside the save transaction under a sender-profile row lock. Uniqueness is enforced by the database on a normalized key. Amounts are recomputed by one exact-decimal module that the editor also runs, so the saved total equals the displayed one. Every action re-validates its input with the shared zod schema (fixing L8's bypass). This serves quality goal 2 (waves 2–3).
4. **Destructive operations are explicit and atomic** (ADR-0007). Account deletion is one transaction that deletes invoices before the user, and the `Restrict` foreign keys that protect AC-22 stay in place. The paid date follows the status through one transition function (`applyStatusChange`: set on entering Paid, clear on leaving, reject unknown statuses) used by both the list and the editor. This serves quality goal 2.
5. **Reads fail honestly** (crosscutting mechanics in §8). Link parameters are parsed with fallback-to-default schemas, never cast. Load failures, "not found" and "not signed in" are distinct outcomes, each with its own destination: the error boundary with retry (SCR-17), not-found (SCR-16) or sign-in (SCR-01). This serves quality goal 3 (waves 3–4).

Delivery follows the spec's risk order, and every schema change is expand-only within its wave (§7). A tactical decision in later sections that contradicts one of these choices is a red flag for §11.

## 5. Building block view

The app keeps its existing style: a layered-by-convention Next.js monolith. Route groups render pages (ui), `'use server'` actions hold the use cases and data access, and Prisma talks to Postgres. `lib/helpers` and `lib/validations` hold shared rules. There are no hexagonal ports, and this feature doesn't introduce them. Every change extends an existing module or adds a small shared module next to its peers, so the closest precedents in `docs/architecture-map.md` still apply (copy `lib/actions/customer-actions.ts` for any action). Two surfaces map onto two containers: the **Server app** (`backend-service`) and the **Browser UI** (`web-frontend`). The proxy and the safe fetcher are drawn separately because they are the two trust checkpoints.

**Internal decomposition** (★ new, ✎ changed, ✗ removed):

```
proxy.ts                                   ✎ matcher covers /api; allowlist from routes.config (ADR-0001)
config/routes.config.ts                    ✎ single publicRoutes allowlist (AC-05)
app/
├── (protected)/layout.tsx                 ✎ requireLiveUser() (ADR-0002); tz-cookie client island (ADR-0010)
├── (protected)/error.tsx                  ★ load-error boundary: retry + Sentry (ADR-0009, SCR-17)
├── (invoice-editor)/layout.tsx            ✎ requireLiveUser()
├── (invoice-editor)/error.tsx             ★ load-error boundary for the editor
├── (protected)/dashboard/page.tsx         ✎ params via schema (A3); Suspense keyed on currency (A9)
├── (protected)/invoices/page.tsx          ✎ params via schema (A4, A5)
├── (protected)/{customers,products,sender-profiles}/…  ✎ typed failure → error boundary, not 404/empty (A6, A7)
├── api/convert-image/route.ts             ✎ requireSession + { senderProfileId } + safe fetch + rate limit (ADR-0003, ADR-0008)
├── api/user/export/route.ts               ✎ requireSession; parallel reads; filename from siteConfig (A10, AC-24)
├── api/auth/log-logout/                   ✗ empty leftover folder (F6)
└── robots.ts                              ✎ prefix disallow rules for section roots (A8, AC-30)
lib/
├── security/safe-fetch.ts                 ★ IP classification, pinned undici agent, per-hop checks, 512 KB / 5 s caps
├── security/logo-rate-limit.ts            ★ Postgres sliding-window counter (ADR-0008)
├── helpers/route-auth.ts                  ★ requireSession(), requireLiveUser()
├── helpers/invoice-calculations.ts        ✎ pure exact-decimal module shared by editor and server (ADR-0006)
├── helpers/invoice-status.ts              ★ applyStatusChange(): paid date set/clear, status enum (AC-18, AC-19)
├── helpers/time-zone.ts                   ★ validated tz cookie, day bounds, current month (ADR-0010)
├── validations/search-params.ts           ★ invoice-list and dashboard param schemas with fallback defaults
├── validations/invoice.ts                 ✎ ranges, discount cap, status enum (AC-14, AC-15, AC-19)
├── actions/invoice-actions/numbering.ts   ★ normalizeInvoiceNumber(), allocateInvoiceNumber() (ADR-0004, ADR-0005)
├── actions/invoice-actions/*.ts           ✎ recompute amounts, one allocator for create/move/duplicate, validated paging (L6)
├── actions/account-actions.ts             ✎ guard first + ActionResult (F3); invoice count; delete transaction (ADR-0007)
├── actions/profile-actions.ts             ✎ session check before parsing input (F3, AC-23)
├── actions/custom-price-actions.ts        ✎ validate on update, explicit customerId (L8, L10, AC-16, AC-31)
└── actions/{customer,sender-profile}-actions.ts  ✎ "N invoices depend on it" refusal (AC-22)
types/actions.ts                           ✎ ActionResult gains a typed error code (ADR-0009)
prisma/schema/                             ✎ Invoice.invoiceNumberKey + unique (ADR-0004); LogoFetchWindow model (ADR-0008)
components/                                ✎ editor number hint + field errors + legacy-totals dialog (SCR-15), delete dialogs with counts (SCR-08, SCR-14), logo warning (SCR-04)
.claude/settings.json, .gitignore          ✎ marketplace declared (F4); settings.local.json ignored (F5)
```

**C4 Container (L2):**

```mermaid
C4Container
    title architecture-hardening - Containers

    Person(freelancer, "Freelancer", "Signed-in account holder")
    Person_Ext(visitor, "Visitor", "No signed-in session, incl. scripts and crawlers")

    Container_Boundary(forge, "Invoice Forge") {
        Container(browser, "Browser UI", "React 19 client components", "web-frontend: editor, dialogs, error states, PDF rendering, per-session logo cache")
        Container(proxy, "Proxy", "proxy.ts, next-auth edge config", "Deny by default: verifies the JWT, public allowlist, covers /api")
        Container(server, "Server app", "Next.js 16 RSC, server actions, route handlers", "backend-service: pages, invoice rules, numbering, deletion, export, logo endpoint")
        Container(safefetch, "Safe fetcher", "lib/security, undici", "IP-pinned logo fetch, per-hop checks, 512 KB and 5 s caps")
    }

    ContainerDb(db, "PostgreSQL", "Neon, Prisma 7", "Invoices with normalized number key, sender-profile counters, logo-fetch windows")
    System_Ext(google, "Google OAuth", "Sign-in provider")
    System_Ext(smtp, "SMTP server", "Magic-link email")
    System_Ext(sentry, "Sentry", "Error monitoring")
    System_Ext(logohost, "Logo image hosts", "Untrusted public HTTPS hosts")
    System_Ext(internal, "Private and internal networks", "Must never be reached")

    Rel(freelancer, browser, "Uses", "HTTPS")
    Rel(visitor, proxy, "Any request", "HTTPS")
    Rel(browser, proxy, "Page loads, server actions, fetch", "HTTPS")
    Rel(proxy, server, "Forwards public or signed-in requests")
    Rel(server, db, "Reads and writes in transactions", "Prisma, pg")
    Rel(server, safefetch, "Fetches an owned profile logo")
    Rel(safefetch, logohost, "Requests the image from a validated address", "HTTPS")
    Rel(safefetch, internal, "Refused at every hop", "blocked")
    Rel(server, google, "Delegates sign-in", "OAuth 2.0")
    Rel(server, smtp, "Sends sign-in links", "SMTP")
    Rel(server, sentry, "Reports server errors", "HTTPS")
    Rel(browser, sentry, "Reports load failures", "HTTPS via /monitoring")
```

## 6. Runtime view

<!-- 🎯 Why: the RUNTIME FLOW of 1–2 critical scenarios — who talks to whom, when, in what order.
     Without §6, §5 is just boxes with no life.
     📋 Write: a Mermaid sequenceDiagram. Participants are names from §5 (don't invent new ones).
     Messages are semantic («saves a draft»), NO HTTP verbs / paths / status codes — endpoint-level
     sequences arrive at the `api` stage.
     📌 e.g. «author → web: composes draft → web → content API: save». Seed the primary flow(s) here;
     the `sequences` stage then covers every §5 AC (no cap). Never N/A for M+; XS/S keeps ≥1 happy-path flow. -->

**Critical flow 1: <flow name>**

```mermaid
sequenceDiagram
    actor Actor
    participant Web
    participant Service
    participant Store
    Actor->>Web: <action>
    Web->>Service: <call>
    Service->>Store: <write>
    Store-->>Service: ok
    Service-->>Web: result
    Web-->>Actor: confirmation
```

**Critical flow 2: <e.g. async event propagation>** — <if applicable, otherwise N/A>.

## 7. Deployment view

<!-- 🎯 Why: the TOPOLOGY DevOps must know without reading the deploy charts — how many replicas,
     where the background worker lives, AT WHAT NUMBERS we scale.
     📋 Write: 2–3 sentences on topology + monitoring + concrete threshold numbers.
     📌 e.g. «500 authors → partition by quarter» (not «we'll think about scale later»).
     🎯 N/A allowed for XS/S that reuses an existing deployment unit with no change.
     Deployment-diagram scaffold → templates/deployment.md. -->

<Topology in 2–3 sentences. Where it runs, replicas, scaling thresholds.>

**Monitoring:**
- <Metrics — e.g. `<metric_name>`>
- <Alerts — e.g. «worker lag > 10 min → page on-call»>
- <Tracing — e.g. spans on the request boundary>

**Scaling thresholds:**
- <e.g. comfortable in one table up to N rows/year>
- <e.g. partition by quarter above N rows/year>

<!-- For XS/S with no deployment change: <!-- N/A: reuses existing deployment unit, no infra change --> -->

## 8. Crosscutting concepts

<!-- 🎯 Why: CROSS-CUTTING PATTERNS spanning several modules: logging, errors, authorization, ID
     strategy, events, caching. ⭐ The second-densest section. A pattern inside one module is NOT
     here; a project-wide convention belongs in the convention file.
     📋 Write: a table — concept / convention / where defined. One row per concept.
     📌 e.g. «sortable time-based IDs generated in the app layer» as a default from the convention file. -->

| Concept | Convention | Where defined |
|---|---|---|
| Logging | <e.g. structured, fields `module=<name>`> | <convention file §X or here> |
| Authentication | <e.g. token-based via middleware> | <convention file §X> |
| Error handling | <e.g. domain sentinel → ports error mapping → JSON> | <convention file §X> |
| ID strategy | <e.g. sortable time-based ID in the app layer> | <convention file §X> |
| Internationalisation | <e.g. N/A, single language> | — |
| Observability | <e.g. tracing on the request boundary> | — |
| Events | <module-specific patterns, if any> | <here> |

## 9. Architecture decisions

<!-- 🎯 Why: the REVERSE INDEX onto the adr/ folder. `ls adr/` gives the files; §9 gives the
     semantics — why they exist, which SAD section they attach to, what status.
     📋 Write: a 4-column table, one row per ADR. Mixed status is fine.
     📌 e.g. «0001 | Store content as a table of typed blocks | Accepted | §4». -->

| # | Title | Status | Section |
|---|---|---|---|
| <NNNN> | <imperative — e.g. "Use a sliding-window counter for rate limiting"> | Accepted | §<N> |
| <NNNN> | <imperative — e.g. "Co-locate the worker in the API process"> | Accepted | §<N> |

ADR files live under `docs/features/<slug>/adr/NNNN-<title>.md`.

## 10. Quality requirements

<!-- 🎯 Why: the QUALITY TREE — take a goal from §1 and break it into concrete leaves: tests,
     metrics, configs, drills. ⭐ Without §10, §1 is a manifesto. With §10 each declaration maps
     to something PROVABLE.
     📋 Write: per §1 goal — When / Then / How-verify. Numbers from spec §6 NFR VERBATIM (don't
     round ≤250ms to ≤300ms — that's a critic F6 hit).
     📌 e.g. «p95 ≤ 500 ms on a block update, verified by a 100 req/s load test». -->

Each top-3 goal from §1 expanded into a full scenario:

**QG-1. <quality attribute>**
- **When:** <trigger condition>
- **Then:** <expected behaviour with numbers from spec §6 NFR>
- **How verify:** <test / chaos drill / load test / metric>

**QG-2. <quality attribute>**
- **When:** <trigger>
- **Then:** <expected>
- **How verify:** <how>

**QG-3. <quality attribute>**
- **When:** <trigger>
- **Then:** <expected>
- **How verify:** <how>

## 11. Risks and technical debt

<!-- 🎯 Why: ⭐ collects EVERYTHING that can break — not only the technical. Without §11 risks get
     discussed at standups and lost; debt lives only in the head of whoever accepted it.
     📋 Write: a risk/debt table — severity — mitigation — owner. Accepted debt in its own block.
     📌 The first risk is often a product risk, not a technical one. That's normal. -->

<!-- Severity literals: Low / Medium / High for regular risks; "Open question" for rows created by
     a Save-as-OQ resolution during the Socratic walk (see references/socratic.md). -->

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| <e.g. Worker lag may reach hours during a downstream outage> | Medium | <alert >10 min, on-call playbook, retry backoff> | <DevOps> |
| <e.g. No event-schema versioning in v1> | Medium | <ADR-NNNN planned for v2, tolerate unknown fields> | <Backend> |
| Open architectural decision: <decision-headline> | Open question | Resolve before <stage trigger or YYYY-MM-DD>; <inline rationale from the Save-as-OQ> | <owner> |

**Accepted debt (acceptable in v1, plan to fix later):**
- <e.g. the entity is immutable / unversioned — OK for v1, may need audit versioning in v2>

## 12. Glossary

<!-- 🎯 Why: ⭐ the DOMAIN GLOSSARY that ends arguments a year later («checkpoint — weekly or
     biweekly? quarter — calendar or fiscal?»).
     📋 Write: a term / meaning table. Business + technical terms mixed.
     📌 e.g. «Lesson | a unit inside a course made of blocks (text, video)». -->

| Term | Meaning |
|---|---|
| <e.g. domain object A> | <its meaning in this domain> |
| <e.g. domain object B> | <its meaning> |
| <e.g. domain invariant name> | <the rule, in plain language> |
