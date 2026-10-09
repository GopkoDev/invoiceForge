---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-09"
feature_size: "M"
target_surfaces: [web-frontend]  # filled in §4 — subset of: backend-service | web-frontend | mobile-app | desktop-app | cli | worker | library-sdk. Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — editor-ux

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** Make the invoice editor and the lists around it solid before the app is shown publicly, without changing a single business rule (spec §1, §2). Pages that never print stop loading the PDF toolkit, and Download, Print and the PDF preview fetch it on demand. The editor always tells the truth: it shows the opened invoice from the first display, its totals add up the lines on screen, a change typed during a save is never lost or wrongly marked saved, and Retry behaves exactly like Save. Every list, the editor, the preview and the PDF show the same calendar day and the same money format, whatever the Freelancer time zone, the browser's zone or the device language. The editor works with a screen reader and opens in its phone layout on a phone. The repository loses its unused components and packages, keeps one theme switcher and gets a README that works as written. Everything `invoice-integrity` decided about saves, refusals and issued invoices stays as it is (spec §3). The people served are the Freelancer who uses the editor every day, the Customer who reads the PDF, and the Contributor who clones the repository.

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Editor truthfulness** — no change is lost or marked saved by mistake, totals always equal the lines on screen, Retry reaches the same outcomes as Save, and nothing from another invoice or another signed-in visit ever appears in the editor.
2. **Document consistency** — the preview, the PDF, the editor and every list show the same calendar day and the same money format, so what the Freelancer checked is what the Customer reads.
3. **Page weight, stability and access** — no PDF toolkit on pages that don't print, no layout jump on phones, and no serious or critical accessibility violation on the editor, the invoices list and the dashboard.

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Freelancer | Creates, saves, issues and prints invoices in the editor; reads dates and amounts in the lists; may use a screen reader or a phone | No |
| Customer | Receives the PDF outside the app; needs it to match what the Freelancer reviewed | No |
| Visitor | Reaches a signed-out tab after a sign-out; must see none of the previous Freelancer's data (AC-07) | No |
| Contributor | Clones the repository, follows the README, runs the tests and changes the code (US-08) | No |
| Security Lead | Light review: per-session editor isolation (AC-07) and on-demand loading inside the content-security rules (spec §6.1) | Yes |
| Tech Lead | SAD approval | Yes |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

**Technical.**
- TypeScript 5 (strict) on Node.js, pnpm 10.
- Next.js 16.3.8 App Router (React Server Components, server actions, route handlers), React 19.2.3, next-auth 5.0.0-beta.32 (JWT sessions), zustand 5, react-hook-form 7 + zod 3, date-fns 4, `@react-pdf/renderer` 4.3 (the PDF toolkit, rendered in the browser with `pdf(doc).toBlob()`).
- PostgreSQL via Prisma 7.10 + `@prisma/adapter-pg`. This feature changes no schema and adds no migration (spec §6.1 "no field is added, stored or sent anywhere new").
- Hosted on Vercel, region `fra1`; Sentry 10 (`@sentry/nextjs`, browser and server) and Vercel Speed Insights (`<SpeedInsights/>` in `app/layout.tsx`) are already mounted.
- Business logic only in `lib/services/*` behind `server-only` (service-layer ADR-0006), taking an `ActingFreelancer { userId, timeZone }` (service-layer ADR-0001) and returning `ActionResult<T>` (service-layer ADR-0002). This feature changes no service.
- Amounts are computed by the one shared decimal module `lib/helpers/invoice-calculations.ts` (architecture-hardening ADR-0006), used by both the editor and the services.
- Issue and due dates are calendar days stored at `T00:00:00Z` (mcp-server ADR-0009), handled by `lib/helpers/calendar-day.ts`; the Freelancer time zone is saved on the account, UTC until saved (mcp-server ADR-0006).
- A save carries the invoice version and is refused when the invoice changed elsewhere (invoice-integrity ADR-0004); the outcomes `CHANGED_ELSEWHERE`, `TOTALS_CHANGED`, field errors and `FAILED` already exist (architecture-hardening ADR-0009).
- Content-Security-Policy in `next.config.ts`: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` — same-origin chunks and the PDF toolkit's WASM layout engine are already allowed; `tests/unit/security-headers.test.ts` guards it.
- Tests: vitest 5 (unit, component; an integration config on throwaway PostgreSQL containers) and Playwright 1.63 for e2e. CI (`.github/workflows/test.yml`) runs install, `prisma generate`, audit, lint, `tsc`, unit and integration; e2e runs before each wave ships, not yet in CI. No accessibility checker is installed.

**Organisational.**
- No external deadline; the trigger is the public showing of the app (spec §1).
- Size M (`docs/features/editor-ux/.size`), route `standard`; delivered in the four waves of spec §1: (1) PDF toolkit on demand + repository hygiene, (2) one date and money format, PDF and preview in step, (3) editor save, Retry and first display, (4) accessibility and mobile.
- Team: one developer (Dmytro Hopko) working with AI agents through the SDD pipeline.

**Conventions.**
- `docs/architecture-map.md` §Conventions and §Frontend — stale (reflects `ded1be7`: it still says no tests exist and predates `lib/services`); the ADRs of `service-layer`, `security-patch`, `architecture-hardening`, `mcp-server` and `invoice-integrity` are authoritative where they differ.
- UI: shadcn/ui (base-vega) over `@base-ui/react`, Tailwind 4 tokens in `app/globals.css`, `cn()`; reuse-first per `docs/design-system.md` (code-only canon).
- Modals go through the typed registry `store/use-modal-store.ts` and are mounted by a per-area modal container (the editor's is `components/modals/invoice-editor/invoice-editor-modal-container.tsx`, mounted in `app/(invoice-editor)/layout.tsx`).
- Client state in zustand; server data through RSC pages and server actions.

**Regulatory / external.**
- No new personal data; data classification stays Confidential (spec §6.1).
- Security review: required, light — confirm the per-session editor isolation (AC-07) and that on-demand loading stays inside the content-security rules (spec §6.1).

## 3. Context and scope

Invoice Forge is the invoicing web app a Freelancer uses to bill Customers. This feature moves no boundary: the Freelancer still works in the browser, the Customer still only receives the PDF the Freelancer sends, and a Visitor still only reaches the public pages and sign-in. What changes is inside the browser-facing part of the app — how pages load the PDF toolkit, what the editor shows on its first display and after a save, how dates and money are formatted, what the editor announces to a screen reader — plus the repository a Contributor clones.

<!-- brownfield: Next.js 16 monolith on Vercel fra1. @react-pdf/renderer is statically imported by lib/helpers/invoice-pdf-helpers.tsx and components/invoice-editor/invoice-pdf-document.tsx and reached from invoice-row-actions, related-invoices-list, the PDF preview modal and the editor header; no dynamic import exists. The editor's zustand store is a module-level singleton initialized in a useEffect (blank form on the first render); Retry lives in the store's toast and skips the header's address change and dialogs; the HTML preview and the PDF document duplicate their wording and format money with toFixed(2) + code; useIsMobile starts undefined → desktop first; no bfcache handling and no Cache-Control on signed-in pages; two theme-toggle copies; 15 unused ui components (explorer scan at ed1e370; architecture-map.md reflects ded1be7 and is stale) -->

**External systems (in / out):**

| Actor or system | Type | Interaction |
|---|---|---|
| Freelancer | Person | Opens the dashboard, lists and editor; saves, retries, issues; downloads, prints and previews PDFs; may use a screen reader or a phone |
| Customer | Person (external) | Receives the PDF from the Freelancer outside Invoice Forge; never signs in |
| Visitor | Person (external) | Anyone without a session — here, whoever holds a tab after a Freelancer signed out (AC-07) |
| Contributor | Person (external) | Clones the repository, follows the README, runs the tests (US-08); never touches production |
| Sentry | System (external) | Error tracking — receives failed PDF generations (AC-02b) and render-mismatch errors (spec §7 KPI) |
| Vercel Speed Insights | System (external) | Real-user web vitals — the measurement source for phone-width layout shift (spec §6 NFR) |

External: no new third-party system — deliberate; the PDF toolkit is fetched from the app's own origin (spec §6.1) and the accessibility checker is test-only tooling.

**C4 Context (L1):**

```mermaid
C4Context
    title editor-ux - System Context

    Person(freelancer, "Freelancer", "Edits, saves and prints invoices; may use a screen reader or a phone")
    Person_Ext(customer, "Customer", "Receives the invoice PDF")
    Person_Ext(visitor, "Visitor", "Holds a tab after a sign-out")
    Person_Ext(contributor, "Contributor", "Clones, runs and tests the repository")

    System(invoiceforge, "Invoice Forge", "Invoicing web app: dashboard, lists, editor, on-demand PDFs")

    System_Ext(sentry, "Sentry", "Error tracking")
    System_Ext(speed, "Vercel Speed Insights", "Real-user web vitals")

    Rel(freelancer, invoiceforge, "Edits invoices, downloads and prints PDFs", "HTTPS, browser session")
    Rel(freelancer, customer, "Sends the PDF", "email, outside Invoice Forge")
    Rel(visitor, invoiceforge, "Goes Back or Forward, is sent to sign in", "HTTPS")
    Rel(contributor, invoiceforge, "Runs locally from a fresh clone", "README, pnpm")
    Rel(invoiceforge, sentry, "Reports PDF failures and render mismatches", "HTTPS")
    Rel(invoiceforge, speed, "Reports layout shift", "HTTPS")
```

## 4. Solution strategy

**Target surfaces:** `web-frontend` only — the dashboard, the lists, the editor, the PDF preview dialog and the PDF itself, all inside the existing Next.js app. The feature adds no endpoint, server action, business function, schema or migration (spec §6.1 "no field is added, stored or sent anywhere new"). Its server-side work stays inside the web app container: RSC pages hand the editor richer initial data (today's date in the Freelancer time zone) and signed-in pages get response headers (§8). Inline, not an ADR: the gate scores 0 of 3 — a single surface, reversible, and no real alternative once no contract changes. Downstream: `data-model` and `api` have nothing to derive (no schema or contract change).

**Top strategic choices (the seeds for ADRs):**

1. **The PDF toolkit is a lazy module behind one hook** — `@react-pdf/renderer`, the react-pdf invoice document and the generate/download/print helpers move into one entry module that is only reached through a dynamic `import()`. Every PDF trigger (the invoices list's and related invoices' row actions, the dashboard's recent invoices, the PDF preview dialog, the editor header) calls one `usePdfAction` hook that fetches the module once per visit and owns the "preparing", "couldn't prepare — try again" and "newer version — reload" states. The editor's live preview is HTML (ADR-0002), so the editor too fetches the toolkit only on Download or Print. Serves quality goal 3 and spec §6 "PDF toolkit on non-printing pages" (ADR-0001).
2. **One document model, two layouts** — a pure `buildInvoiceDocument()` turns the editor form or an issued invoice into every label, line, formatted date and formatted amount the document shows; the HTML preview and the react-pdf document only lay that model out. Wording lives in one place, so a layout wording change reaches both or neither (AC-10). Serves quality goal 2 (ADR-0002).
3. **One editor store per opened editor, built from the server's data** — the module-level zustand singleton becomes a store factory provided through React context, created synchronously from the RSC page's data and keyed by the invoice and the signed-in Freelancer. The first server and browser render already show the opened invoice (AC-06), and no state survives into another invoice or another Freelancer's visit (AC-07). Serves quality goal 1 (ADR-0003).
4. **One save command owns every outcome** — Save, Save and issue, Retry and confirming changed totals all call one store command that reads the form when it is called, tags the save with the form's revision and resolves every outcome itself: saved, saved with later edits, issued with later edits, created (address change), changed elsewhere, totals changed, field errors, failed. Totals shown after a save are either the stored figures (no edit since the save began) or recomputed from the lines on screen by the shared decimal module (architecture-hardening ADR-0006). Serves quality goal 1 (ADR-0005).
5. **One format module with a fixed locale** — money, calendar days and moments are formatted by one module with the `en-US` locale on both the server and the browser: money as `Intl` currency (`$1,234.50`, `UAH 1,234.50`), calendar days read in UTC (mcp-server ADR-0009), moments in the Freelancer time zone the server supplies. The lists, the editor, the document model and the PDF all use it, so the server's HTML and the browser's first render agree and the device language changes nothing (AC-08, AC-09). Serves quality goal 2 (ADR-0006).

**UI architecture (web-frontend):** unchanged hybrid — Next.js App Router, React Server Components for data, client components for the editor, composed from the existing shadcn/ui primitives and tokens (`docs/design-system.md`). Within it, the editor's phone and desktop layouts become one DOM tree switched by CSS breakpoints only, with no JavaScript width check deciding what renders; the phone layout is in the server's first HTML, and rotating a tablet restyles the same elements, so focus and a half-typed "12." survive (AC-13, AC-14; ADR-0004). No ADR for the hybrid itself: the only alternative (a client-side SPA) contradicts the repo's established stack.

**Tactical choices recorded inline (gate below 2 of 3):**

- **"Today" comes from the server.** The new-invoice page computes today's calendar day in the Freelancer time zone (UTC until one is saved, mcp-server ADR-0006) and passes it, with the due date that follows from the payment terms, in the editor's initial data. The browser clock and the time-zone cookie of architecture-hardening ADR-0010 do not decide it — the glossary does (spec §1).
- **Edits during a save are detected by a form revision counter**, not by comparing values: every edit increments it, and a save remembers the revision it started from. AC-04 counts an edit that puts a value back as a change, which a value comparison would miss.
- **The proposed invoice number stays asynchronous.** Its field reserves its final size and shows a loading state until the hint arrives, so the layout does not move (AC-06).
- **Spec §8 open question "currencies sharing a symbol" (due before design) — closed with the spec's default.** The `Currency` enum is UAH, USD, EUR, GBP and PLN; only USD uses "$", so no two currencies share a symbol today. The app's existing money format stays, identical on screen and in the PDF. Revisit if a second dollar currency is added.

Each tactical decision in later sections should trace to one of these seeds. Tactical decisions that *contradict* a strategic choice are red flags — surface them in §11.

## 5. Building block view

The feature keeps the repo's layering — RSC pages and the proxy at the edge, server actions over the `lib/services` business layer, Prisma/PostgreSQL underneath — and changes none of the server layers. All its building blocks live in the browser-facing part of the web app and in pure modules both sides import. Three small shared modules are added under `lib/` (the lazy PDF entry, the document model, the format module), the editor store becomes a factory with a provider, and the editor's dialogs move into its existing modal container. Pure modules stay framework-free so the server render, the browser and vitest run the same code (the pattern of architecture-hardening ADR-0006).

**Internal decomposition:**

```
lib/
├── format/                      NEW  formatMoney, formatDay, formatMoment — fixed en-US (ADR-0006)
├── invoice-document/            NEW  buildInvoiceDocument(source) + the document's wording (ADR-0002)
├── pdf/                         NEW  the only importer of @react-pdf/renderer (ADR-0001)
│   ├── invoice-pdf-kit.tsx           lazy entry: react-pdf document + generate / download / print
│   └── load-pdf-kit.ts               cached import() + failure classification (offline / new version)
└── helpers/
    ├── invoice-calculations.ts       unchanged — totals rule shared with the services (arch-hardening ADR-0006)
    ├── calendar-day.ts               unchanged — calendar-day storage rules (mcp-server ADR-0009)
    └── invoice-pdf-helpers.tsx       REMOVED — moved into lib/pdf/
hooks/
├── use-pdf-action.ts            NEW  preparing / try again / reload states for every PDF trigger
├── use-invoice-pdf.tsx               rewritten over use-pdf-action
└── use-editor-header-buttons.tsx     thinned — calls the store's save command (ADR-0005)
store/invoice-editor-store/
├── create-invoice-editor-store.ts    the old module-level store, as a factory (ADR-0003)
├── invoice-editor-provider.tsx  NEW  creates the store once per mount, keyed by Freelancer + invoice
├── save-command.ts              NEW  save(intent): revision tag + every outcome (ADR-0005)
└── selectors.ts                      useFormData, useSummary, … read the store from context
components/
├── invoice-editor/                   one DOM tree for both layouts (ADR-0004); HTML preview over the document model
├── invoices/ , dashboard/ , modals/  PDF triggers call use-pdf-action; dates and money via lib/format
├── modals/invoice-editor/            invoice-editor-modal-container hosts every editor dialog, the save confirmation included
├── session-restore-guard.tsx    NEW  pageshow guard in the signed-in layouts (ADR-0007)
├── theme-toggle.tsx                  the one theme switcher (replaces both teheme-toggle copies)
└── ui/                               15 unused primitives + toggle removed
proxy.ts                              adds Cache-Control: private, no-store on signed-in pages (ADR-0007)
app/(invoice-editor)/invoices/new     passes today and the due date in the Freelancer time zone
scripts/check-pdf-chunks.ts      NEW  CI build-output check: no toolkit in non-editor routes' initial chunks
tests/e2e/                            + accessibility checks (@axe-core/playwright, test-only)
```

**C4 Container (L2):**

```mermaid
C4Container
    title editor-ux - Containers

    Person(freelancer, "Freelancer", "Edits, saves and prints invoices")

    Container_Boundary(app, "Invoice Forge") {
        Container(web, "Web app in the browser", "React 19 client components, zustand", "Dashboard, lists, editor with a per-mount store, document model, format module, on-demand PDF")
        Container(pdfkit, "PDF toolkit chunk", "@react-pdf/renderer, lazy JS chunk", "Fetched from the app origin on the first Download, Print or preview of a visit")
        Container(rsc, "Server rendering and proxy", "Next.js 16 RSC pages, proxy.ts", "Renders pages with the invoice and today's date, sets no-store on signed-in pages")
        Container(actions, "Server actions and business layer", "Next.js server actions, lib/services", "Unchanged: createInvoice, updateInvoice and their refusals")
        ContainerDb(db, "PostgreSQL", "Prisma 7", "Unchanged: invoices, users with their time zone")
    }

    System_Ext(sentry, "Sentry", "Error tracking")
    System_Ext(speed, "Vercel Speed Insights", "Real-user web vitals")

    Rel(freelancer, rsc, "Opens pages", "HTTPS")
    Rel(rsc, web, "Sends HTML and initial data, then hydrates")
    Rel(freelancer, web, "Edits, saves, retries, downloads", "browser")
    Rel(web, pdfkit, "Imports on demand", "dynamic import, same origin")
    Rel(web, actions, "Saves invoices", "server action")
    Rel(rsc, actions, "Loads editor and list data")
    Rel(actions, db, "Reads and writes", "Prisma")
    Rel(web, sentry, "Reports PDF failures and render mismatches", "HTTPS")
    Rel(web, speed, "Reports layout shift", "HTTPS")
```

The web app in the browser is the feature's one surface (`web-frontend`). The PDF toolkit chunk is drawn apart because it now ships separately and is fetched only on demand. Server rendering, server actions and the database are existing containers, shown because the editor's first display and its saves cross them; their contracts do not change.

## 6. Runtime view

Two seed flows, one per feature risk; the `sequences` stage adds the rest (every §5 AC, including first display, sign-out and Back, dates, screen-reader and phone flows). Participants are the §5 containers; the editor store and the save command live inside the web app in the browser.

**Critical flow 1: a Save with an edit made while it runs, and a Retry (ADR-0003, ADR-0005)**

```mermaid
sequenceDiagram
    actor Freelancer
    participant Web as Web app in the browser
    participant Store as Editor store save command
    participant Actions as Server actions and business layer
    participant DB as PostgreSQL
    Freelancer->>Web: clicks Save
    Web->>Store: save with intent save
    Store->>Store: reads the form now and remembers revision r
    Store->>Actions: saves the form with its version
    Freelancer->>Web: changes a line's quantity
    Web->>Store: edit, revision becomes r plus one
    Actions->>DB: stores the invoice and its totals
    DB-->>Actions: stored, new version
    Actions-->>Store: saved invoice
    alt revision is still r
        Store-->>Web: stored totals, marked saved
    else revision moved on
        Store->>Store: keeps the form, recomputes totals from the lines on screen
        Store-->>Web: save confirmed, still unsaved
    end
    Note over Freelancer,Store: a failed save offers Retry
    Freelancer->>Web: chooses Retry
    Web->>Store: save with the intent that failed
    Store->>Actions: saves the form as it is now
    Actions-->>Store: created, changed elsewhere, totals changed or saved
    Store-->>Web: same address change, dialog or saved state as Save
```

**Critical flow 2: a PDF on demand from a list (ADR-0001)**

```mermaid
sequenceDiagram
    actor Freelancer
    participant Web as Web app in the browser
    participant Kit as PDF toolkit chunk
    participant Sentry
    Freelancer->>Web: chooses Download on an invoice row
    Web-->>Freelancer: the PDF is being prepared
    alt toolkit already loaded in this visit
        Web->>Web: reuses the loaded toolkit
    else first PDF of the visit
        Web->>Kit: imports the toolkit from the app origin
        alt fetched
            Kit-->>Web: toolkit ready
        else connection dropped
            Kit-->>Web: fetch failed, origin unreachable
            Web-->>Freelancer: could not prepare the PDF, try again
        else app updated since the page opened
            Kit-->>Web: chunk missing, origin reachable
            Web-->>Freelancer: a newer version is available, reload
        end
    end
    Web->>Web: builds the document model and generates the PDF
    alt generated
        Web-->>Freelancer: file downloaded
    else generation failed
        Web->>Sentry: reports the failure
        Web-->>Freelancer: could not prepare the PDF, try again
    end
```

## 7. Deployment view

No infrastructure change: the feature ships inside the existing single Vercel deployment (region `fra1`), with no new function, cron, store or environment setting. The PDF toolkit becomes a separate static chunk served from the same origin under the same content-security rules. Releases follow the four waves of spec §1, each a normal deploy; there is no migration. Vercel Skew Protection stays off — a page opened before a deploy that then misses the toolkit chunk shows "a newer version is available, reload" (AC-02b), which the e2e suite exercises against a missing chunk.

**Monitoring:**
- **Layout shift** — Vercel Speed Insights CLS for the editor route at phone width; the spec §6 NFR target (≤ 0.1 at p75) is read 14 days after the wave-4 release.
- **Render mismatches** — Sentry issues from React hydration errors on the invoices list, dashboard and editor; baseline counted over the 14 days before release, target 0 within 14 days after (spec §7).
- **PDF failures** — Sentry events from `use-pdf-action` tagged `pdf.stage` = `fetch` / `version` / `generate`, so a rise in "newer version" failures after a deploy is visible separately from generation errors.
- **Tracing** — none added; the feature makes no new server calls.

**Build and CI gates (added):**
- `scripts/check-pdf-chunks.ts` after `next build`: fails when any route other than the invoice editor lists a chunk containing `@react-pdf/renderer` among its initial chunks (spec §6 "PDF toolkit on non-printing pages").
- Accessibility e2e (`@axe-core/playwright`) on the editor (new and existing invoice), the invoices list and the dashboard: fails on any serious or critical violation; runs with the e2e suite before each wave ships and nightly, as `tests/README.md` places e2e today.
- Existing gates unchanged: lint, `tsc`, unit and integration, and every `invoice-integrity` acceptance test (spec §6 "No regressions").

**Scaling thresholds:** none — the feature removes browser weight and adds no server load. The toolkit chunk (~1.6 MB) is the only size to watch: if it grows past what downloads in 3 s at 10 Mbit/s (spec §6 "First PDF after page load"), revisit ADR-0001 option 2 (server rendering).

## 8. Crosscutting concepts

The repo's conventions are inherited unchanged (results, errors, IDs, auth guards, validation — §2). The rows below are the ones this feature adds or tightens.

| Concept | Convention | Where defined |
|---|---|---|
| Session isolation in the browser | Signed-in page responses carry `Cache-Control: private, no-store` (set in `proxy.ts`); `SessionRestoreGuard` in the signed-in layouts hides and reloads any page restored from the back/forward cache; the editor store is created per mount and keyed by Freelancer and invoice | ADR-0007, ADR-0003 |
| Display formatting | Money, calendar days and moments only through `lib/format` with the fixed `en-US` locale; calendar days read in UTC, moments in the Freelancer time zone passed from the server; lint forbids `toFixed(` and `toLocale*String(` in `components/` and `app/` | ADR-0006 |
| "Today" and time zone | Today's calendar day is computed on the server in the Freelancer time zone (UTC until saved) and passed to the page; the browser clock never decides it | §4 inline; mcp-server ADR-0006 |
| Document wording | Every label of the invoice document lives in `lib/invoice-document`; the preview and the PDF only lay out the model | ADR-0002 |
| On-demand code | `@react-pdf/renderer` is imported only by `lib/pdf/invoice-pdf-kit.tsx` (lint `no-restricted-imports`); every PDF trigger goes through `use-pdf-action`; fetched from the app's own origin under the existing CSP | ADR-0001 |
| Error handling (PDF) | A failed fetch is classified as offline (try again) or new version (reload) by probing the app origin; a generation failure is reported to Sentry with `pdf.stage` and shown as "could not prepare, try again"; the page stays usable | ADR-0001 |
| Error handling (save) | Unchanged server results (`ActionResult` with `CHANGED_ELSEWHERE`, `TOTALS_CHANGED`, field errors, `FAILED`); the store's save command is the only place that turns them into UI state, for Save and Retry alike | ADR-0005; architecture-hardening ADR-0009 |
| Accessibility | Every editor field uses the shadcn `Field`/`Label` pairing so its visible label is its name; field errors render with an id and the input carries `aria-invalid` + `aria-describedby`; line fields without a visible label get `aria-label` "<Column>, line <n>" from the current index; icon-only buttons get `aria-label`; text hidden on narrow screens keeps an accessible name (`sr-only`); row action buttons name the action and the invoice number | here; `docs/design-system.md` |
| Responsive layout | One DOM tree per screen; breakpoints rearrange and hide (`hidden`), never a JavaScript width check that changes the structure | ADR-0004 |
| Amount inputs | One shared `AmountInput` (`inputMode="decimal"`, "." as the only decimal separator) for line price and quantity, discount, tax rate and shipping | here; §11 iOS keypad risk |
| Dialogs | Every editor dialog, the save confirmation included, goes through `store/use-modal-store.ts` and is mounted by `invoice-editor-modal-container.tsx` | repo convention (§2) |
| Observability | Sentry for PDF failures and hydration errors; Vercel Speed Insights for CLS; no new tracing | §7 |
| Logging | Unchanged; no new server logs | — |
| Authentication / authorization | Unchanged server checks (`proxy.ts` deny-by-default, `requireLiveUser` in the editor layout, owner-scoped services); "invoice not found" for another Freelancer's invoice as today | architecture-hardening ADR-0001, ADR-0002; service-layer ADR-0003 |
| ID strategy | Unchanged `cuid()` on the server; the editor's client-side line keys use `crypto.randomUUID()` instead of the `uuid` package | §2; repo hygiene |
| Internationalisation | None — English UI and a fixed `en-US` format | ADR-0006 |
| Events | N/A — no events or queues | — |

## 9. Architecture decisions

| # | Title | Status | Section |
|---|---|---|---|
| 0001 | Load the PDF toolkit on demand through one lazy module | Accepted | §4 |
| 0002 | Render the preview and the PDF from one invoice document model | Accepted | §4 |
| 0003 | Create one editor store per mounted editor from the server's data | Accepted | §4 |
| 0004 | Switch the editor's layouts with CSS only, in one DOM tree | Accepted | §4 |
| 0005 | Route every save and Retry through one store save command | Accepted | §4 |
| 0006 | Format money and dates in one module with a fixed en-US locale | Accepted | §4 |
| 0007 | Mark signed-in pages no-store and reload pages restored from the back/forward cache | Accepted | §8 |

ADR files live under `docs/features/editor-ux/adr/NNNN-<title>.md`.

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
