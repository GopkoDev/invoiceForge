# Tracker — architecture-hardening

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T00 | [Set up the test harness, throwaway database and factories](./t00-test-harness.md) | infra | Dmytro Hopko | M | — | done |
| T01 | [Add the LogoFetchWindow table and Prisma model](./t01-logo-fetch-window-table.md) | migration | Dmytro Hopko | S | — | done |
| T02 | [Deny unauthenticated requests by default in the proxy, with one public allowlist](./t02-deny-by-default-proxy.md) | wiring | Dmytro Hopko | M | — | done |
| T03 | [Build the IP-pinning safe fetcher with per-hop checks and size/time caps](./t03-safe-fetcher.md) | infra | Dmytro Hopko | L | — | done |
| T04 | [Implement the per-Freelancer sliding-window logo rate limiter](./t04-logo-rate-limiter.md) | infra | Dmytro Hopko | S | T01 | done |
| T05 | [Rewrite /api/convert-image to fetch only an owned sender profile's logo](./t05-convert-image-endpoint.md) | ports | Dmytro Hopko | M | T03, T04 | done |
| T06 | [Request logos by sender-profile id with a per-session cache and show the PDF logo warning](./t06-pdf-logo-client-and-warning.md) | ui | Dmytro Hopko | M | T05 | done |
| T07 | [Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step)](./t07-invoice-number-key-migration.md) | migration | Dmytro Hopko | M | T01 | done |
| T08 | [Introduce typed ActionResult error codes and move every action onto them](./t08-typed-action-result.md) | app | Dmytro Hopko | L | — | done |
| T09 | [Treat sessions without a live account as Visitors in layouts and guards](./t09-live-account-guard.md) | app | Dmytro Hopko | S | T05, T08 | done |
| T10 | [Make invoice-calculations a pure exact-decimal module shared by editor and server](./t10-shared-decimal-calculations.md) | domain | Dmytro Hopko | M | — | done |
| T11 | [Tighten the invoice schema and add applyStatusChange for the paid date](./t11-invoice-rules-and-status.md) | domain | Dmytro Hopko | M | T08, T10 | done |
| T12 | [Add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber](./t12-numbering-module.md) | app | Dmytro Hopko | M | T07 | done |
| T13 | [Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts](./t13-create-and-duplicate-invoice.md) | app | Dmytro Hopko | L | T08, T10, T11, T12 | done |
| T14 | [Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals](./t14-update-invoice-move-and-legacy.md) | app | Dmytro Hopko | L | T13 | done |
| T15 | [Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button](./t15-confirmation-modal-async-body.md) | ui | Dmytro Hopko | S | — | done |
| T16 | [Build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog](./t16-editor-number-and-save-states.md) | ui | Dmytro Hopko | L | T14, T15 | done |
| T17 | [Add the deletion summary and delete the account in one explicit transaction](./t17-account-deletion-transaction.md) | app | Dmytro Hopko | M | T08 | done |
| T18 | [Show the invoice count and export offer in the delete-account dialog](./t18-delete-account-dialog.md) | ui | Dmytro Hopko | M | T15, T17 | done |
| T19 | [Refuse deleting a Customer or sender profile that has invoices, with the count](./t19-block-deleting-records-with-invoices.md) | app | Dmytro Hopko | M | T08, T15 | done |
| T20 | [Require an https logo link when saving a sender profile](./t20-sender-profile-https-logo.md) | app | Dmytro Hopko | S | T08 | done |
| T21 | [Validate custom prices on create and update and link them to an explicit owned Customer](./t21-custom-price-validation-and-links.md) | app | Dmytro Hopko | M | T08 | done |
| T22 | [Carry the browser time zone in a validated tz cookie with day-bound helpers](./t22-time-zone-cookie.md) | infra | Dmytro Hopko | S | T09 | done |
| T23 | [Parse invoice-list link parameters with fallback defaults and inclusive local date ranges](./t23-invoice-list-link-params.md) | ports | Dmytro Hopko | M | T14, T22 | done |
| T24 | [Parse dashboard date ranges with a current-month fallback and key Suspense on currency](./t24-dashboard-link-params.md) | ports | Dmytro Hopko | M | T22, T23 | done |
| T25 | [Add the segment load-error boundaries with retry and Sentry reporting](./t25-load-error-boundaries.md) | ui | Dmytro Hopko | S | — | done |
| T26 | [Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found](./t26-page-outcome-routing.md) | ui | Dmytro Hopko | L | T08, T25, T14 | done |
| T27 | [Harden the data export: session first, parallel reads, Invoice Forge file name](./t27-data-export-endpoint.md) | ports | Dmytro Hopko | S | T09 | done |
| T28 | [Check the session before parsing input in profile and account settings actions](./t28-profile-actions-guard-first.md) | app | Dmytro Hopko | S | T08, T17 | done |
| T29 | [Disallow the root and every page of each private section in robots.txt](./t29-robots-disallow-section-roots.md) | ports | Dmytro Hopko | S | T02 | done |
| T30 | [Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step)](./t30-invoice-number-key-contract.md) | migration | Dmytro Hopko | S | T07, T14 | blocked |
| T31 | [Declare the sdd marketplace, ignore local settings and remove the empty route folder](./t31-repository-hygiene.md) | docs | Dmytro Hopko | S | — | done |
| T32 | [Fix invoice amount rules: shared line totals, 2-decimal inputs, field errors, no silent rewrites, validated duplicates](../_review/review-2026-09-27.md) | app | Dmytro Hopko | M | T13, T16, T21 | done |
| T33 | [Treat NULL-key invoices by normalized number in the taken and shared checks](../_review/review-2026-09-27.md) | app | Dmytro Hopko | M | T12, T14 | done |
| T34 | [Test the real session callback, stale-session actions and the cookie-less route sweep](../_review/review-2026-09-27.md) | infra | Dmytro Hopko | M | T02, T09 | done |
| T35 | [Build the missing SCR-02 duplicated and paid-date states and the detail-page delete entry](../_review/review-2026-09-27.md) | ui | Dmytro Hopko | M | T13, T19 | done |
| T36 | [Harden the safe fetcher and rate limiter, and make the SSRF tests fail on regression](../_review/review-2026-09-27.md) | infra | Dmytro Hopko | M | T03, T04, T05 | done |
| T37 | [List the next-auth paths explicitly, allow the manifest icons, anchor the matcher and guard clear-session](../_review/review-2026-09-27.md) | wiring | Dmytro Hopko | M | T02, T09 | done |
| T38 | [Fix local-date display, midnight-DST day bounds, dashboard chart zone, page cap and tab status](../_review/review-2026-09-27.md) | ports | Dmytro Hopko | M | T22, T23, T24 | done |
| T39 | [Route UNAUTHORIZED to sign-in, make retry recover and report FAILED causes to Sentry](../_review/review-2026-09-27.md) | ui | Dmytro Hopko | M | T08, T25, T26 | done |
| T40 | [Fix the async ConfirmationModal regression and the remaining dialog and editor findings](../_review/review-2026-09-27.md) | ui | Dmytro Hopko | M | T15, T16, T18, T19 | done |
| T41 | [Keep raw drafts in the editor number inputs, validate only amounts on duplicate, and pin the NULL-key manual and P2002 paths](../_review/review-2026-09-28.md) | app | Dmytro Hopko | M | T32, T33 | done |
| T42 | [Route every UNAUTHORIZED and rejected action call to sign-in, and fix the delete-account dialog state](../_review/review-2026-09-28.md) | ui | Dmytro Hopko | M | T39, T40 | done |
| T43 | [Report FAILED causes to Sentry once in every action module and show the retrying state](../_review/review-2026-09-28.md) | ui | Dmytro Hopko | M | T39 | done |
| T44 | [Sweep the built route manifest and test a stale session against a server create action](../_review/review-2026-09-28.md) | infra | Dmytro Hopko | M | T34 | done |
| T45 | [Fix midnight spring-forward day bounds east of UTC, unique chart day keys and the paid-date zone](../_review/review-2026-09-28.md) | ports | Dmytro Hopko | M | T38 | done |
| T46 | [Log NOT_HTTPS and RATE_LIMITED logo refusals and pin the ::/96 rule](../_review/review-2026-09-28.md) | infra | Dmytro Hopko | S | T36 | done |
| T47 | [Refresh the F-13 deferral note, the architecture map and the screens design-system reference](../_review/review-2026-09-28.md) | docs | Dmytro Hopko | S | T43, T42 | done |
| T48 | [Route UNAUTHORIZED and rejected calls to sign-in at the remaining form, editor and row-action call sites](../_review/review-2026-09-30.md) | ui | Dmytro Hopko | M | T42 | todo |
| T49 | [Report every FAILED once, including auth and client render errors, and keep form data out of Sentry](../_review/review-2026-09-30.md) | app | Dmytro Hopko | M | T43 | todo |
| T50 | [Show the paid date in the Freelancer's zone from the tz cookie](../_review/review-2026-09-30.md) | ui | Dmytro Hopko | S | T45 | todo |
| T51 | [Parse editor numbers strictly and write the duplicate refusal into the contract](../_review/review-2026-09-30.md) | app | Dmytro Hopko | S | T41 | todo |
| T52 | [Exclude only the next-auth catch-all from the sweep and classify SIIT and local-use NAT64 addresses](../_review/review-2026-09-30.md) | infra | Dmytro Hopko | S | T44, T46 | todo |
| T53 | [Update design-system.md and sad.md for the retrying state, the ConfirmationModal rejection rule and the reporting path](../_review/review-2026-09-30.md) | docs | Dmytro Hopko | S | T48, T49 | todo |

**Total:** 54 tasks (T32–T40 are review follow-ups from `_review/review-2026-09-27.md`, T41–T47 from `_review/review-2026-09-28.md`, T48–T53 from `_review/review-2026-09-30.md`), ~36 person-days (S = ½ day, M/L = 1 day; L means a full, dense day, not more).

> **T30 blocked by its own gate (2026-09-27):** promote migrations 05–06 only after wave 2 has run in production without a rollback **and** the wave-4 pre-flight `SELECT count(*) FROM "Invoice" WHERE "invoiceNumberKey" IS NULL;` returns 0 (sad §7 row 4, data-model §Pre-flight). The red contract test is staged at `docs/features/architecture-hardening/migrations/05-06_contract.test.ts.staged` — move it to `tests/integration/invoice-number-key-contract.test.ts` when the gate passes. Promoting also retires the NULL-key legacy paths: update the invoice factory to default `invoiceNumberKey` to the normalized number, and revisit the T07 expand-step assertions (nullable column, exact unique present) and the T12/T13/T14 legacy-key tests at that time.
