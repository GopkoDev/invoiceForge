# Tracker — architecture-hardening

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T00 | [Set up the test harness, throwaway database and factories](./t00-test-harness.md) | infra | Dmytro Hopko | M | — | done |
| T01 | [Add the LogoFetchWindow table and Prisma model](./t01-logo-fetch-window-table.md) | migration | Dmytro Hopko | S | — | todo |
| T02 | [Deny unauthenticated requests by default in the proxy, with one public allowlist](./t02-deny-by-default-proxy.md) | wiring | Dmytro Hopko | M | — | done |
| T03 | [Build the IP-pinning safe fetcher with per-hop checks and size/time caps](./t03-safe-fetcher.md) | infra | Dmytro Hopko | L | — | todo |
| T04 | [Implement the per-Freelancer sliding-window logo rate limiter](./t04-logo-rate-limiter.md) | infra | Dmytro Hopko | S | T01 | todo |
| T05 | [Rewrite /api/convert-image to fetch only an owned sender profile's logo](./t05-convert-image-endpoint.md) | ports | Dmytro Hopko | M | T03, T04 | todo |
| T06 | [Request logos by sender-profile id with a per-session cache and show the PDF logo warning](./t06-pdf-logo-client-and-warning.md) | ui | Dmytro Hopko | M | T05 | todo |
| T07 | [Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step)](./t07-invoice-number-key-migration.md) | migration | Dmytro Hopko | M | T01 | todo |
| T08 | [Introduce typed ActionResult error codes and move every action onto them](./t08-typed-action-result.md) | app | Dmytro Hopko | L | — | todo |
| T09 | [Treat sessions without a live account as Visitors in layouts and guards](./t09-live-account-guard.md) | app | Dmytro Hopko | S | T05, T08 | todo |
| T10 | [Make invoice-calculations a pure exact-decimal module shared by editor and server](./t10-shared-decimal-calculations.md) | domain | Dmytro Hopko | M | — | done |
| T11 | [Tighten the invoice schema and add applyStatusChange for the paid date](./t11-invoice-rules-and-status.md) | domain | Dmytro Hopko | M | T08, T10 | todo |
| T12 | [Add normalizeInvoiceNumber and the row-locked allocateInvoiceNumber](./t12-numbering-module.md) | app | Dmytro Hopko | M | T07 | todo |
| T13 | [Rewrite createInvoice and duplicateInvoice on the allocator and recomputed amounts](./t13-create-and-duplicate-invoice.md) | app | Dmytro Hopko | L | T08, T10, T11, T12 | todo |
| T14 | [Rewrite updateInvoice for profile moves, legacy invoices and confirmed totals](./t14-update-invoice-move-and-legacy.md) | app | Dmytro Hopko | L | T13 | todo |
| T15 | [Extend ConfirmationModal with a body slot, async confirm and a hideable confirm button](./t15-confirmation-modal-async-body.md) | ui | Dmytro Hopko | S | — | done |
| T16 | [Build the editor number hint, field errors, saved state, legacy alert and SCR-15 dialog](./t16-editor-number-and-save-states.md) | ui | Dmytro Hopko | L | T14, T15 | todo |
| T17 | [Add the deletion summary and delete the account in one explicit transaction](./t17-account-deletion-transaction.md) | app | Dmytro Hopko | M | T08 | todo |
| T18 | [Show the invoice count and export offer in the delete-account dialog](./t18-delete-account-dialog.md) | ui | Dmytro Hopko | M | T15, T17 | todo |
| T19 | [Refuse deleting a Customer or sender profile that has invoices, with the count](./t19-block-deleting-records-with-invoices.md) | app | Dmytro Hopko | M | T08, T15 | todo |
| T20 | [Require an https logo link when saving a sender profile](./t20-sender-profile-https-logo.md) | app | Dmytro Hopko | S | T08 | todo |
| T21 | [Validate custom prices on create and update and link them to an explicit owned Customer](./t21-custom-price-validation-and-links.md) | app | Dmytro Hopko | M | T08 | todo |
| T22 | [Carry the browser time zone in a validated tz cookie with day-bound helpers](./t22-time-zone-cookie.md) | infra | Dmytro Hopko | S | T09 | todo |
| T23 | [Parse invoice-list link parameters with fallback defaults and inclusive local date ranges](./t23-invoice-list-link-params.md) | ports | Dmytro Hopko | M | T14, T22 | todo |
| T24 | [Parse dashboard date ranges with a current-month fallback and key Suspense on currency](./t24-dashboard-link-params.md) | ports | Dmytro Hopko | M | T22, T23 | todo |
| T25 | [Add the segment load-error boundaries with retry and Sentry reporting](./t25-load-error-boundaries.md) | ui | Dmytro Hopko | S | — | done |
| T26 | [Route page load outcomes: FAILED to the error boundary, NOT_FOUND to not-found](./t26-page-outcome-routing.md) | ui | Dmytro Hopko | L | T08, T25, T14 | todo |
| T27 | [Harden the data export: session first, parallel reads, Invoice Forge file name](./t27-data-export-endpoint.md) | ports | Dmytro Hopko | S | T09 | todo |
| T28 | [Check the session before parsing input in profile and account settings actions](./t28-profile-actions-guard-first.md) | app | Dmytro Hopko | S | T08, T17 | todo |
| T29 | [Disallow the root and every page of each private section in robots.txt](./t29-robots-disallow-section-roots.md) | ports | Dmytro Hopko | S | T02 | todo |
| T30 | [Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step)](./t30-invoice-number-key-contract.md) | migration | Dmytro Hopko | S | T07, T14 | todo |
| T31 | [Declare the sdd marketplace, ignore local settings and remove the empty route folder](./t31-repository-hygiene.md) | docs | Dmytro Hopko | S | — | done |

**Total:** 32 tasks, ~26 person-days (S = ½ day, M/L = 1 day; L means a full, dense day, not more).
