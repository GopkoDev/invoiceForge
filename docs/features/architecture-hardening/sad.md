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

These flows seed the runtime view with the three highest-risk paths, one per strategic choice that changes runtime behaviour. The `sequences` stage adds a flow or branch for every remaining §5 acceptance criterion. Participants are the §5 containers; messages are semantic, not endpoints.

**Critical flow 1: logo fetch for a PDF (wave 1; AC-01, AC-02, AC-02b, AC-03, AC-21)**

```mermaid
sequenceDiagram
    actor F as Freelancer
    participant B as Browser UI
    participant P as Proxy
    participant S as Server app
    participant SF as Safe fetcher
    participant DB as PostgreSQL
    participant H as Logo image hosts
    F->>B: generates an invoice PDF
    alt logo already fetched in this editor or export session
        B->>B: reuses the cached data URL
    else not cached
        B->>P: asks for the logo of sender profile X
        alt no session token
            P-->>B: refused as not signed in
        else token signature valid
            P->>S: forwards the request
            S->>DB: loads the live user and profile X scoped to that user
            alt account gone or profile not owned
                S-->>B: not signed in, or not found
            else owned profile
                S->>DB: increments the sliding-window counter
                alt over 30 per minute
                    S-->>B: refusal RATE_LIMITED
                else within the limit
                    S->>SF: fetches the stored logo link
                    SF->>SF: https only, resolves DNS, rejects private and internal ranges
                    SF->>H: requests the image from the validated address
                    H-->>SF: image bytes or a redirect
                    Note over SF,H: every redirect hop is re-validated, at most 3 hops, 5 s total, 512 KB cap
                    SF-->>S: image, or a refusal code
                    S-->>B: data URL, or a generic refusal
                end
            end
        end
    end
    B-->>F: PDF with the logo, or without it plus a plain-language warning
```

**Critical flow 2: saving an invoice, system-assigned vs manual number (wave 2; AC-06, AC-07, AC-08, AC-09, AC-10, AC-13, AC-14, AC-15)**

```mermaid
sequenceDiagram
    actor F as Freelancer
    participant B as Browser UI
    participant S as Server app
    participant DB as PostgreSQL
    F->>B: saves the invoice
    B->>B: shows totals from the shared calculation module
    B->>S: submits the invoice form
    S->>S: checks the live session, validates with the shared schema, recomputes every amount
    alt a rule is broken
        S-->>B: field errors next to the offending fields, nothing saved
    else input valid
        S->>DB: begins a transaction
        alt number field filled in, manual
            S->>DB: checks the normalized number key, counter untouched
            alt key already used in this sender profile
                S->>DB: rolls back
                S-->>B: this invoice number is already used in this sender profile
            else key free
                S->>DB: inserts the invoice with the manual number
            end
        else number field empty, system-assigned
            S->>DB: increments the profile counter, which locks the profile row
            loop while the candidate key is taken by a manual number
                S->>DB: increments again and checks the next candidate
            end
            S->>DB: inserts the invoice with the allocated number and key
        end
        S->>DB: commits, releasing the profile lock
        S-->>B: saved invoice with its final number and stored totals
    end
    B-->>F: shows the final number and totals, or the blocking message
```

**Critical flow 3: account deletion (wave 2; AC-20, AC-21, AC-24)**

```mermaid
sequenceDiagram
    actor F as Freelancer
    participant B as Browser UI
    participant S as Server app
    participant DB as PostgreSQL
    F->>B: chooses to delete the account
    B->>S: asks how many invoices will be lost
    S->>DB: counts invoices across the Freelancer's sender profiles
    S-->>B: invoice count
    B-->>F: warning with the count and an export offer
    opt export first
        F->>B: exports data
        B->>S: requests the export file
        S->>DB: reads every exportable category in parallel
        S-->>B: file named Invoice Forge
    end
    F->>B: confirms the deletion
    B->>S: deletes the account
    S->>DB: in one transaction deletes the invoices, then the user and everything it cascades to
    alt any step fails
        DB-->>S: error, the transaction rolls back
        S-->>B: deletion failed, nothing removed
        B-->>F: stays on settings with an error
    else committed
        S-->>B: deleted
        B-->>F: lands on sign-in, other devices become Visitors on their next request
    end
```

## 7. Deployment view

There is no infrastructure change. The app stays one Vercel project (`vercel.json`, functions in region `iad1`, the proxy on the edge) over the existing Neon Postgres reached through its pooler (`eu-central-1`). No new service, queue or store is added: the logo-fetch counter is a table in the same database (ADR-0008). The feature ships as **four production releases**, one per wave (spec §1). Every schema change is expand-only inside its wave, so the previous build can be redeployed without a database rollback (§6 NFR: 0 minutes of planned downtime).

| Wave | Ships | Schema change | Rollback-safe because |
|---|---|---|---|
| 1 | ADR-0001, ADR-0002, ADR-0003, ADR-0008; F1, A1, A2 | new `LogoFetchWindow` table | old code ignores the table |
| 2 | ADR-0004, ADR-0005, ADR-0006, ADR-0007; L1–L5, L7, L10 | `Invoice.invoiceNumberKey` nullable + backfill + unique index | old code doesn't write the key, so its rows stay `NULL`, which the unique index tolerates |
| 3 | ADR-0009, ADR-0010; A3–A7, L6, L8, L9 | none | code only |
| 4 | A8–A10, F3–F6 | contract step: `invoiceNumberKey` `NOT NULL` | applied only after wave 2 has run in production without a rollback |

Migrations are applied with `prisma migrate deploy` before the release that needs them. The wave-2 migration counts normalized duplicate numbers first and takes the ADR-0004 fallback if the count is above 0. Releases go out at low-traffic hours (spec §8, stale editor tabs).

**Monitoring:**
- Metrics, as structured log lines: `logo_fetch outcome=<ok|NOT_HTTPS|NOT_IMAGE|TOO_LARGE|RATE_LIMITED|UNAVAILABLE> reason=<size|timeout|blocked_ip|…>`, which gives the size-cap, time-cap and refusal counts spec §6 measures "in logs". The upstream host and IP go to the log only, never to the response.
- Alerts (Sentry): any "number already used" on a system-assigned number (target 0 per month; it indicates an allocator bug); any unhandled error on the list or dashboard pages (target 0 per month); a spike in `UNAVAILABLE reason=blocked_ip` (a likely SSRF probe).
- Load failures (AC-28): reported by the new `error.tsx` boundaries and by `captureException` in the server paths that throw into them.
- Tracing: the existing Sentry performance traces (10% sample in production, `sentry.server.config.ts:18`) give invoice-save and data-export p95 over a 7-day window. Their targets are open (§11).

**Scaling thresholds** (design estimates, current scale is 3 accounts and 27 invoices on the configured database):
- Number allocation serializes saves within one sender profile only. Each save holds the profile lock for its transaction's round-trips (see the region note in §11), which is comfortable up to roughly 1 save per second per sender profile. Above that, move the allocation into a single SQL statement.
- `LogoFetchWindow` holds about 2 rows per actively fetching Freelancer after opportunistic cleanup. It stays tiny until thousands of concurrent Freelancers.
- Account deletion runs in one transaction. It is comfortable up to about 10,000 invoices per Freelancer; above that, delete invoices in batches inside the transaction or move deletion to a background job.

## 8. Crosscutting concepts

Default is the repo's convention set (`docs/architecture-map.md` §Conventions). The rows below state each convention this feature relies on, and **bold** marks where it adds or overrides one.

| Concept | Convention | Where defined |
|---|---|---|
| Authentication | next-auth JWT sessions. **Deny by default**: the proxy covers `/api`, and one `publicRoutes` allowlist is the only way to make a path public. **A token without a live account is a Visitor** everywhere in the Node layer | ADR-0001, ADR-0002; `config/routes.config.ts` |
| Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one | architecture-map §Conventions; ADR-0009; AC-23, AC-29 |
| Input validation | Every action re-runs the entity's zod schema, **with no `as` casts that bypass it** (L8). **Link parameters are parsed with fallback-to-default schemas**: page ≥ 1, page size ∈ {10, 20, 30, 50, 100} (the sizes the list offers, `components/invoices/invoices-table-footer.tsx:29`), sort field, order, status and tab from enums; anything invalid becomes its default, and the controls show what was applied | `lib/validations/`, `lib/validations/search-params.ts` |
| Error handling | Actions return `ActionResult<T>` and never throw to the client. **Typed `code`** (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `FAILED`) plus a plain-language `error` and optional `fieldErrors`. Pages map `FAILED` to the segment `error.tsx` (retry + Sentry). Raw database or upstream text is logged, never returned | ADR-0009; `types/actions.ts` |
| Money | `Decimal(10,2)` at rest. All amounts are computed by **one pure exact-decimal module** shared by editor and server, rounding half-up. The server ignores client-sent totals | ADR-0006 |
| Invoice numbering | The number is unique within a sender profile on a **normalized key** (lower-case, trimmed). An empty field means system-assigned and is allocated under a profile row lock; a filled field is manual and never moves the sequence | ADR-0004, ADR-0005 |
| Status and paid date | **One transition function**, `applyStatusChange()`: entering Paid sets `paidAt` to now; saving an already-Paid invoice keeps it; leaving Paid clears it; an unknown status is rejected | `lib/helpers/invoice-status.ts`; AC-18, AC-19 |
| Destructive operations | Deleting a Customer or sender profile counts its invoices and refuses with the count (the `Restrict` FKs stay as the database backstop). **Account deletion is one explicit transaction**; any new entity that references Freelancer-owned data with `Restrict` must join that transaction | ADR-0007; AC-20, AC-22 |
| Outbound HTTP | The server fetches a user-influenced URL **only through the safe fetcher** (https, validated and pinned address per hop, 5 s, 512 KB, `image/*`). No other code path fetches user-supplied URLs | ADR-0003 |
| Rate limiting | Real logo fetches are limited per Freelancer by a Postgres sliding-window counter; browser-side reuse never reaches the server | ADR-0008 |
| Time and time zones | Stored as UTC. Day boundaries and "current month" use the validated browser time zone from the `tz` cookie, falling back to UTC. Range ends are exclusive at the next local midnight | ADR-0010; `lib/helpers/time-zone.ts` |
| Logging and observability | Existing `console.error` inside `try/catch`, plus Sentry (production). **Load failures and allocator conflicts go to Sentry**; logo-fetch outcomes are structured log lines (§7). No request body or bank detail is logged | §7; `sentry.*.config.ts` |
| Cache invalidation | Mutations call `revalidatePath(protectedRoutes.<x>)`. **Dashboard Suspense boundaries for debtors, expected payments and recent invoices are keyed on currency only** (A9) | architecture-map §Conventions |
| ID strategy | `cuid()` on domain models; unchanged | `prisma/schema/invoice.prisma:21` |
| Internationalisation | N/A: English only | — |
| Events | N/A: no events or queues; all calls are direct function calls | — |
| Repository configuration | **The `sdd` marketplace is declared in `.claude/settings.json` `extraKnownMarketplaces`** (F4). **`.claude/settings.local.json` is git-ignored** (F5). There are no empty route folders (F6) | spec §6 repository-hygiene rows |

## 9. Architecture decisions

| # | Title | Status | Section |
|---|---|---|---|
| 0001 | Deny unauthenticated requests in the proxy by default, with an explicit public allowlist | Accepted | §4 |
| 0002 | Treat sessions without a live account as Visitors, keeping JWT sessions | Accepted | §4 |
| 0003 | Fetch logos only by owned sender-profile id, through an IP-pinning fetcher that checks every hop | Accepted | §4 |
| 0004 | Enforce invoice-number uniqueness on a normalized key column | Accepted | §4 |
| 0005 | Allocate invoice numbers under a sender-profile row lock inside the save transaction | Accepted | §4 |
| 0006 | Compute invoice amounts in one shared exact-decimal module used by both editor and server | Accepted | §4 |
| 0007 | Delete an account in one explicit transaction, keeping Restrict foreign keys on invoices | Accepted | §4 |
| 0008 | Rate-limit logo fetches with a Postgres sliding-window counter | Accepted | §5 |
| 0009 | Classify action failures with typed error codes and route load failures to segment error boundaries | Accepted | §8 |
| 0010 | Carry the browser time zone to the server in a cookie | Accepted | §8 |

ADR files live under `docs/features/architecture-hardening/adr/NNNN-<title>.md`.

## 10. Quality requirements

There is no automated test harness (spec §3, F7). Every "How verify" is a manual probe run before the wave ships, a production metric, or both. The numbers are quoted verbatim from spec §6 and §7.

**QG-1. Security of the boundary**
- **When:** a Visitor (no cookie, or the token of a deleted account) requests any page, `/api/*` route or server action outside the public allowlist, including a route added after this feature.
- **Then:** a page request is sent to sign-in; a data request or action is refused as "not signed in" with no data (AC-05, AC-21, AC-23).
- **How verify:** before each wave, a scripted request sweep without cookies over every route in the `next build` route manifest, where only allowlisted paths may return content; the same sweep with a deleted account's token; Security Lead review of the matcher and allowlist.

- **When:** a signed-in Freelancer's logo link is not https, is not an image, is large, is slow, or leads (directly, via a redirect, or via a DNS answer that changes between lookup and connect) to a private, loopback, link-local or metadata address, or the Freelancer keeps regenerating PDFs.
- **Then:** the PDF is produced without the logo, with the AC-03 warning. Size cap: ≤ 512 KB per image; larger is refused. Time cap: ≤ 5 s per fetch, then aborted. Rate limit: ≤ 30 fetches per minute per Freelancer; only real fetches from the external address count, and reusing a logo already fetched within the same editor or export session does not. No private address is ever connected to.
- **How verify:** a probe set on a preview deployment covering `169.254.169.254`, `127.0.0.1`, `[::1]`, an IPv4-mapped IPv6 address, a redirect to `10.0.0.1`, a DNS-rebinding test host, a 5 MB image, a slow-drip server, and 31 fetches in a minute; then the counts of `logo_fetch outcome=` log lines (size-cap warnings, aborts, refusals), as spec §6 measures them.

**QG-2. Integrity of stored invoice data**
- **When:** two editor tabs save new invoices under one sender profile at the same time with the number field empty, or a system-proposed number is already taken by a manual one.
- **Then:** both saves succeed with different numbers. Duplicate-number save failures on untouched numbers: 0 per month.
- **How verify:** a script that fires two parallel saves 20 times on a preview deployment (all must succeed with distinct numbers); in production, the error-monitoring count of "number already used" where the number was system-proposed (Sentry alert, §7).

- **When:** a Freelancer saves an invoice with any line items, discount, shipping and tax, or edits a legacy invoice, or deletes an account that has invoices.
- **Then:** newly saved invoices with a negative total or a line total ≠ quantity × price: 0 new ones in the 30 days after the integrity wave ships. Account deletions that fail: 0 failed deletions within 14 days of release. Invoice save latency p95 (incl. number assignment): TBD — baseline + 20% (see §8).
- **How verify:** a SQL count on release day and at day 30 (`total < 0`, or any item whose stored total ≠ round-half-up(quantity × price)); the Sentry/log count of failed `deleteUserAccount` calls over 14 days; production performance traces over a 7-day window for save p95, once the baseline is set (§11 open question).

**QG-3. Honest, crash-free reads**
- **When:** a Freelancer opens an invoice-list or dashboard link with malformed, out-of-range or tampered parameters (A3–A5 examples: `?from=abc&to=xyz`, `?page=-1`, `?pageSize=2.5`, `?sortBy=items`, `?status=FOO`).
- **Then:** the page opens with the default for each bad value and the controls show what was applied. Unhandled page errors from malformed links: 0 per month.
- **How verify:** a malformed-link checklist opened on a preview deployment before wave 3; in production, the error-monitoring count on the list and dashboard pages.

- **When:** any data page (invoice list, dashboard, sender profiles, customers, products, invoice/customer/sender-profile detail, invoice editor) can't load its data, or the record doesn't exist or belongs to someone else.
- **Then:** a load failure shows the error state with retry (SCR-17) and is reported to Sentry; a missing or foreign record shows the same "not found" (SCR-16).
- **How verify:** on a preview deployment with the database made unreachable, open each listed page and confirm SCR-17 and a Sentry event; open another account's record ids and confirm SCR-16.

- **When:** the Freelancer changes the dashboard date range.
- **Then:** only the date-dependent sections reload (3 fewer data loads per change).
- **How verify:** the request count per change in a production trace.

**Supporting NFRs (outside the top 3, still verified):**
- Availability during rollout: 0 minutes of planned downtime, and the schema change is backward-compatible within a wave. Verified by the deploy log and the §7 rollback-safety table.
- Data export latency p95: TBD — ≤ baseline − 30% (see §8). Verified by production performance traces.
- Repository hygiene, plugin setup: 0 missing-plugin failures on a fresh clone; the plugin installs from shared repo config alone (F4). Verified by a fresh-clone check on a second machine.
- Repository hygiene, personal settings: 0 personal settings files tracked in the repo; 0 empty route folders (F5, F6). Verified by an ignore-rule check and a folder scan in review.

## 11. Risks and technical debt

| Risk / debt | Severity | Mitigation | Owner |
|---|---|---|---|
| No automated tests around security-critical code: the proxy matcher and allowlist, IP classification in the safe fetcher, the number allocator, and the deletion transaction (spec §3, F7). A regression is found only in review or in production | High | Security Lead review of the ADR-0001 and ADR-0003 code paths; the §10 manual probe sets run before each wave; the §7 Sentry alerts; a test harness is the recommended next feature | Dmytro Hopko |
| Region mismatch: functions run in Vercel `iad1`, the database in Neon `eu-central-1` (brownfield: `vercel.json`, `.env`). Every round-trip inside the save transaction crosses the Atlantic, which inflates save latency and how long the sender-profile lock is held (ADR-0005) | Medium | Keep allocation to the fewest round-trips (one `UPDATE … RETURNING`, the key check, the insert); measure the save baseline before wave 2; moving the function region next to the database is a separate decision | Dmytro Hopko |
| The proxy matcher regex and allowlist become security-critical (ADR-0001). A wrong exclusion silently makes a path public | Medium | Every exclusion commented with its reason; the §10 QG-1 route sweep before every release that touches `proxy.ts` or `routes.config.ts` | Dmytro Hopko |
| Gaps in private-address classification: IPv6 forms, IPv4-mapped IPv6, NAT64, decimal or octal IPv4 literals in hostnames | Medium | Normalize addresses with Node's `net` parsing before range checks; connect only to the checked address (ADR-0003); include these forms in the §10 probe set | Dmytro Hopko |
| The production duplicate-number count may differ from the count on the database configured in `.env` (0 groups, 27 invoices, measured 2026-09-26) | Low | The wave-2 migration counts first and takes the ADR-0004 fallback (nullable key, AC-17 path) if the count is above 0 | Dmytro Hopko |
| PDFs of older invoices show the sender profile's current logo, not the logo URL snapshotted on the invoice (ADR-0003) | Low | Accepted; mention it in the release note; revisit with logo uploads (spec §3 non-goal) | Dmytro Hopko |
| next-auth 5.0.0-beta.30: the live-account rule relies on the session callback's database lookup (ADR-0002) | Low | Pin the version; `requireLiveUser()` checks for a missing `user.id` explicitly, so a callback change fails closed | Dmytro Hopko |
| Open architectural decision: p95 latency targets for invoice save (incl. number assignment) and data export | Open question | Resolve before the wave-2 release for save, and before the wave-4 release for export; default is baseline + 20% (save) and baseline − 30% (export) measured from Sentry traces (spec §8) | Dmytro Hopko |
| Open architectural decision: editor tabs opened before a deploy send data in the old shape after a wave ships | Open question | Resolve before `sdd:tasks`; default is to accept the risk and ship waves at low-traffic hours (spec §8) | Dmytro Hopko |

**Accepted debt (acceptable in v1, plan to fix later):**
- **No one-time clean-up of already-corrupted data** (spec §8 Q1, closed here). On the configured database there are 0 duplicate numbers and 0 negative totals. Sequences behind their highest number are handled by the allocator's skip loop (AC-09). Stale paid dates and wrong line totals are corrected on the next status change or edit (AC-17, AC-18, AC-19).
- **Invoice prefixes stay unique across all Freelancers** (`invoicePrefix @unique`, spec §8 Q2, closed here as a follow-up). One Freelancer can learn that another already uses a prefix. Planned as a separate feature that scopes uniqueness to one account.
- The logo rate limit is a sliding-window estimate, not an exact 60-second log (ADR-0008).
- The first-ever server render uses UTC until the `tz` cookie exists (ADR-0010).
- `invoiceNumberKey` stays nullable between waves 2 and 4 (§7) for rollback safety.

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
