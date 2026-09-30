## Summary

This PR closes the High and Medium findings from the 2026-09-26 architecture review.

- **Deny by default.** A Visitor gets no access except to the public allowlist.
- **SSRF-proof logo fetch.** The endpoint fetches only an owned profile's logo, pins each connection to a validated IP and checks every redirect hop. Fetches are capped at 512 KB, 5 s and 30 per minute.
- **Server-enforced invoice integrity.** Invoice numbers are unique on a normalized key and allocated under a row lock. Amounts are computed with exact decimals and can't be negative.
- **Account deletion that always succeeds.**
- **Honest error states and robust link parsing.**

Spec: [`docs/features/architecture-hardening/spec.md`](docs/features/architecture-hardening/spec.md). Changelog: [`_ship/changelog.md`](docs/features/architecture-hardening/_ship/changelog.md).

> **Release shape.** SAD §7 plans four production releases, one per wave. This branch holds waves 1–4, all except the T30 contract step. Merging it deploys waves 1–4 as **one** release. Every schema change here is still expand-only, so the rollback story holds. If you want the wave-1 security fix out first on its own, cut it from this branch before merging.

## Acceptance criteria

- AC-01 — the PDF includes a secure, in-limit logo ✓
- AC-02 — a Visitor's image-fetch request is refused, with nothing fetched and nothing revealed ✓
- AC-02b — only the logo of a sender profile you own is fetched; another Freelancer's profile is "not found" ✓
- AC-03 — a bad or blocked logo still gives a PDF, with a generic warning (specific only for not-https, not-image, too large and rate-limited) ✓
- AC-04 — a non-https logo link is blocked when the sender profile is saved ✓
- AC-05 — deny by default: pages redirect to sign-in and data requests and actions get 401, including future routes ✓
- AC-06 — an empty number is assigned from the sequence at save time ✓
- AC-07 — two concurrent saves get different numbers, and neither fails ✓
- AC-08 — a duplicate typed number (ignoring case and spaces) is blocked, and the sequence doesn't move ✓
- AC-09 — the allocator skips numbers that were taken manually ✓
- AC-10 — a free typed number is kept, and the sequence doesn't move ✓
- AC-11 — moving an invoice to another profile clears its number and applies that profile's rules ✓
- AC-12 — a duplicated invoice gets a fresh sequence number ✓
- AC-13 — line totals are qty × price, rounded half-up, and computed by the server; the editor shows the same figure ✓
- AC-14 — negative price, shipping or discount, a quantity ≤ 0, and a tax rate outside 0–100 % are blocked per field ✓
- AC-15 — a discount over the subtotal plus shipping is blocked, and an equal one gives a total of 0 ✓
- AC-16 — a custom-price update is validated like a create ✓
- AC-17 — a legacy invoice needs its old and new totals confirmed, and one with a shared number can't be saved until the number changes; list status changes are never blocked ✓
- AC-18 — the paid date is set when the status changes to Paid, and a re-save keeps it ✓
- AC-19 — leaving Paid clears the paid date, and an unknown status is rejected ✓
- AC-20 — account deletion counts and warns, offers an export, and deletes everything or nothing ✓
- AC-21 — a session whose account was deleted is treated as a Visitor ✓
- AC-22 — a Customer or sender profile with invoices can't be deleted, and the refusal says how many invoices depend on it ✓
- AC-23 — account and profile actions check the session before the input ✓
- AC-24 — the export is one "Invoice Forge …" file with every category except sessions ✓
- AC-25 — a malformed dashboard range falls back to the current month in the Freelancer's time zone ✓
- AC-26 — malformed list parameters fall back to their defaults, and the controls match what's shown ✓
- AC-27 — a date filter includes the whole last day in the Freelancer's time zone ✓
- AC-28 — a load failure shows an error with Retry and is reported to Sentry once ✓
- AC-29 — another Freelancer's record looks exactly like a missing one ✓
- AC-30 — `robots.txt` disallows the root and every page of each private section ✓
- AC-31 — a custom price is linked to exactly the chosen owned Customer and product ✓

## Design

- Spec: `docs/features/architecture-hardening/spec.md`
- Architecture: `docs/features/architecture-hardening/sad.md`
- Decisions: `docs/features/architecture-hardening/adr/` (ADR-0001 … ADR-0010)
- Data model and migrations: `docs/features/architecture-hardening/data-model.md`. Migrations `20260927094537`, `20260927100000`, `20260927100100` and `20260927100200` are live. Migrations `05` and `06` stay staged for T30.
- API: `docs/features/architecture-hardening/contracts/openapi.yaml`
- Test plan: `docs/features/architecture-hardening/test-plan.md`
- Reviews: `docs/features/architecture-hardening/_review/`. The last pass, `review-2026-09-30-7.md`, is a **PASS**.

## Tasks (SDD-Task trailers)

65 of 66 tasks are done. T30, the contract migration, is blocked by its production gate.

<details><summary>74 task commits</summary>

- `6963823` T00 — set up the test harness, throwaway database and factories
- `ba6f3f6` T31 — declare the sdd marketplace, ignore local settings, drop empty route folder
- `62c0626` T10 — make invoice-calculations a pure exact-decimal module
- `409b955` T15 — extend ConfirmationModal with a body slot, async confirm and hideable confirm
- `e93b7d3` T25 — add segment load-error boundaries with retry and Sentry reporting
- `894db6d` T02 — deny unauthenticated requests by default in the proxy
- `16f4140` T03 — add the IP-pinning safe fetcher with per-hop checks and size/time caps
- `94f8575` T08 — introduce typed ActionResult error codes and move actions onto them
- `9e46d7a` T01 — add the LogoFetchWindow table and Prisma model
- `1380c8e` T04 — add the per-Freelancer sliding-window logo rate limiter
- `bc3c889` T07 — add, backfill and uniquely index Invoice.invoiceNumberKey (expand step)
- `42144fd` T05 — fetch only an owned sender profile's logo in /api/convert-image
- `9a2db69` T06 — request logos by sender-profile id with a per-session cache and show the PDF logo warning
- `11f668b` T09 — treat sessions without a live account as Visitors in layouts and guards
- `1eb1fbb` T11 — tighten the invoice schema and add applyStatusChange for the paid date
- `03185ee` T09 — let Next's control-flow errors escape the session guards
- `6b0f2f2` T12 — add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber
- `9c2c8b8` T13 — rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts
- `014eb82` T14 — rewrite updateInvoice for profile moves, legacy invoices and confirmed totals
- `fc7a4a3` T16 — build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog
- `1002840` T17 — add the deletion summary and delete the account in one explicit transaction
- `175a419` T18 — show the invoice count and export offer in the delete-account dialog
- `eb800d9` T19 — refuse deleting a Customer or sender profile that has invoices, with the count
- `a07ec62` T20 — require an https logo link when saving a sender profile
- `68f0237` T21 — validate custom prices on create and update and link them to an explicit owned Customer
- `49970c2` T22 — carry the browser time zone in a validated tz cookie with day-bound helpers
- `6d39ee2` T23 — parse invoice-list link parameters with fallback defaults and inclusive local date ranges
- `1c56332` T24 — parse dashboard date ranges with a current-month fallback and key Suspense on currency
- `ddafc3e` T26 — route page load outcomes, FAILED to the error boundary and NOT_FOUND to not-found
- `035da24` T26 — send an UNAUTHORIZED page load through the cookie-clearing route
- `452c367` T27 — harden the data export with session first, parallel reads and the Invoice Forge file name
- `dbcbd17` T28 — check the session before parsing input in profile and account settings actions
- `12ca50e` T29 — disallow the root and every page of each private section in robots.txt
- `2070e8d` T30 — stage the T30 contract-step test and mark T30 blocked on its production gate
- `bfe8817` T03 — refuse a logo body cut short of its declared length
- `31dac96` T02 — expire the __Secure- session cookie with the Secure flag in the proxy
- `0364a1d` T32 — fix invoice amount rules: shared line totals, 2-decimal inputs, field errors, no silent rewrites, validated duplicates
- `22d1206` T33 — treat null-key invoices by normalized number in the taken and shared checks
- `fa71e7b` T38 — fix local-date display, midnight-DST day bounds, dashboard chart zone, page cap and tab status
- `a8d4949` T35 — build the missing SCR-02 duplicated and paid-date states and the detail-page delete entry
- `febc61f` T39 — route UNAUTHORIZED to sign-in, make retry recover and report FAILED causes to Sentry
- `bec1199` T40 — fix the async ConfirmationModal regression and the remaining dialog and editor findings
- `8c34439` T36 — harden the safe fetcher and rate limiter, and make the SSRF tests fail on regression
- `710b9ac` T34 — test the real session callback, stale-session actions and the cookie-less route sweep
- `fc5cab9` T37 — list the next-auth paths explicitly, allow the manifest icons, anchor the matcher and guard clear-session
- `612d001` T41 — keep raw drafts in the editor number inputs, validate only amounts on duplicate, and pin the NULL-key manual and P2002 paths
- `2ea35d0` T44 — sweep the built route manifest and test a stale session against a server create action
- `a6c8317` T45 — fix midnight spring-forward day bounds east of UTC, unique chart day keys and the paid-date zone
- `9bef6a6` T46 — log NOT_HTTPS and RATE_LIMITED logo refusals and pin the ::/96 rule
- `7227eec` T42 — route every UNAUTHORIZED and rejected action call to sign-in, and fix the delete-account dialog state
- `7e984ef` T43 — report FAILED causes to Sentry once in every action module and show the retrying state
- `cb6a901` T47 — refresh the F-13 deferral note, the architecture map and the screens design-system reference
- `0b39c10` T48 — route UNAUTHORIZED and rejected calls to sign-in at the remaining form, editor and row-action call sites
- `14710c4` T48 — route UNAUTHORIZED and rejected calls to sign-in at the remaining form, editor and row-action call sites
- `dcecbcc` T49 — report every FAILED once, including auth and client render errors, and keep form data out of Sentry
- `e583fe6` T50 — format the paid date in the freelancer's time zone
- `fb62336` T51 — parse editor numbers strictly and write the duplicate refusal into the contract
- `e41eb55` T52 — exclude only the next-auth catch-all from the sweep and classify SIIT and local-use NAT64 addresses
- `9fcd4fc` T52 — classify all of local-use NAT64 64:ff9b:1::/48 as internal
- `27e05ca` T53 — update design-system.md and sad.md for the retrying state, the ConfirmationModal rejection rule and the reporting path
- `cf2ec82` T54 — scrub Prisma argument values from Sentry events and breadcrumbs, with a test on a real payload
- `f62de5f` T55 — pin the update conflict payload, every AC-28 loader, the uncovered T48 call sites, the paid-date zone wiring and the unreported duplicate refusal
- `a6a7720` T56 — trim editor number drafts, unit-test the sweep predicate, tighten two T48 tests and fix the remaining reporting-path docs
- `a48a709` T57 — keep Prisma argument values out of server logs
- `65c9fa4` T58 — test the breadcrumb Error branch directly and keep the Prisma code and reason in events
- `ab27b84` T59 — restore ADR-0009's original Option 1 wording under the amendment
- `868b4df` T60 — narrow the logging contract to application log sites and record the Auth.js logger exception
- `7135bf1` T61 — keep the Prisma reason paragraph only for value-free error codes
- `e860275` T62 — pin redactError's cause, string and no-invocation branches
- `f6c72af` T60 — name the Auth.js logger exposure in the sad.md logging row
- `318ca44` T61 — label redacted initialization errors with their errorCode
- `8cd9eb3` T63 — cut the reason of a P2011 null-constraint error
- `de0f39d` T64 — build the initialization-error test from the shape Prisma 7.2 throws
- `84d849f` T65 — build the start-up initialization-error test from the P2038 error Prisma 7.2 throws

</details>

## Verification

Commit: `36049f7`, run on 2026-09-30.

- **Unit and component tests:** 86 files, 583 tests, all passing.
- **Integration tests:** 25 files, 141 passing and 22 skipped. They run on Testcontainers Postgres 16. The 22 skips are the placeholders for a missing container runtime plus the local-only `.env` guard.
- **Lint and types:** `eslint` reports 0 errors and 6 warnings, all older than this branch. `tsc --noEmit` is clean.
- **E2E (Playwright, production build, throwaway Postgres):** 8 of 8 pass. This includes the AC-05 route-manifest sweep.
- **Ran the feature.** I ran `next start` on a production build against a seeded throwaway Postgres, never production, using minted JWT sessions:
  - AC-02: a Visitor's `POST /api/convert-image` got `401 UNAUTHORIZED`, with and without a `url` body.
  - AC-02b:
    - Posting another Freelancer's `senderProfileId` got `404 NOT_FOUND`.
    - A free-form `{url}` got `400 VALIDATION`.
  - AC-03:
    - An `http://` logo got `422 NOT_HTTPS` ("The logo link is not a secure web address.").
    - A logo at `https://169.254.169.254/…` got `502 UNAVAILABLE` ("The logo could not be loaded from this link."). The server log showed `logo_fetch outcome=UNAVAILABLE reason=blocked_ip`.
  - AC-05: a Visitor's `GET /invoices` got `307` to `/login?callbackUrl=%2Finvoices`, and `GET /api/user/export` got `401`.
  - AC-21: a valid JWT for a user id with no account got `307` to `/api/auth/clear-session` on `/invoices` and `401` on the export.
  - AC-24: the export returned `200` with `Content-Disposition: attachment; filename="Invoice Forge export 2026-09-30.json"`. Its keys were user, accounts, emailHistory, senderProfiles, customers, products and invoices.
  - AC-29:
    - Another Freelancer's invoice editor page (37,046 B) and a missing id's page (37,024 B) rendered the same not-found page. The size difference is only the length of the id in the URL.
    - The same held for customer detail pages.
    - My own invoice rendered its number (87,886 B).
  - AC-25 and AC-26: `/dashboard?from=2026-12-31&to=2026-01-01` and `/invoices?page=-7&pageSize=999&sort=hacker&order=sideways&status=BOGUS&tab=nope` both rendered `200` with no crash.
  - AC-30: `robots.txt` disallows `/dashboard`, `/invoices`, `/sender-profiles`, `/customers`, `/products`, `/settings` and `/api/`.
- **Not exercised by hand.** The invoice save flows (AC-06–AC-19) and account deletion (AC-20, AC-22) run through server actions. They are covered by the integration suite against a real Postgres but were not clicked through in a browser. As spec §8 F-13 records, the e2e and contract rows of the test plan are still open, and they are due before each wave's production release.

## Operational notes

- **Migration.** Run the read-only pre-flight (data-model.md §Pre-flight: normalized duplicate groups), then run `pnpm exec prisma migrate deploy` against production **before** deploying. The build step does not migrate. All four migrations are expand-only, so a rollback is a redeploy of the previous build. The down SQL is in `docs/features/architecture-hardening/migrations/0{1..4}_*.down.sql`.
- **After merge.** T30 (staged migrations 05 and 06, the contract step) waits until this has run in production without a rollback and the `invoiceNumberKey IS NULL` count is 0.
- **Feature flag / config.** None. A new first-party `tz` cookie is set by the app. Deploy at a low-traffic hour, because editor tabs opened before the deploy may fail one save.
- **Noise, not a regression.** `next build` logs `Error checking authentication: Dynamic server usage` for the protected routes during prerender. This comes from pre-existing code (bc08334) and does not fail the build.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
