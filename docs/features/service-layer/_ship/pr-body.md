## Summary

This PR moves every business rule and data query in Invoice Forge into `lib/services/`, one business layer that does not depend on a browser session.

- **Explicit, owner-scoped functions.** Every business function takes an explicit `ActingFreelancer` (user id and time zone). It limits each read and write to that Freelancer's records in its own `where` clause.
- **Thin web wrappers.** The `'use server'` actions, page loaders and route handlers become thin wrappers. They keep the same export names, messages and refreshes.
- **Search and paging on every list.** Each list also reports its total and whether more results exist.
- **Dashboard in SQL.** The dashboard is computed in parameterized SQL instead of in memory, and its figures match the old ones to the cent.

The goal is to let the upcoming AI chat and MCP Assistant use the same rules as the web app, with no faked session and no copied queries. For the Freelancer, nothing changes apart from the deliberate dashboard naming and order fixes in spec §1.

Spec: [`docs/features/service-layer/spec.md`](docs/features/service-layer/spec.md). Changelog: [`_ship/changelog.md`](docs/features/service-layer/_ship/changelog.md).

> **Release shape.** SAD §7 planned four code-only waves. Wave 4 (dashboard SQL) was meant to ship only after 7 days of `dashboard.<section>` latency baseline from the old code. This branch holds all four waves, so merging it ships them as **one** release, with no before window. The release is code-only and has no schema change, so rollback is a redeploy of the previous build.

## Acceptance criteria

- AC-01 — the web app shows the same records, values, order, messages and confirmations, and every existing check passes unchanged ✓
- AC-02 — invalid form values are blocked with the same field messages ✓
- AC-03 — a successful change refreshes the same pages as before ✓
- AC-04 — an unexpected failure shows the same error and retry option, and is reported to Sentry once ✓
- AC-05 — old-vs-new dashboard amounts are equal to the cent, and counts, groups and listed invoices are identical ✓
- AC-06 — a Debtor appears once, under the most recent name, and ties are ordered by name. Sender accounts are in a fixed order ✓
- AC-07 — an Assistant with no browser session gets exactly what the Freelancer sees ✓
- AC-08 — another Freelancer's record, or a list it owns, answers exactly like a missing id, and the record is unchanged ✓
- AC-09 — a link or form carrying another Freelancer's id gets "not found" ✓
- AC-10 — a Visitor, or a session without an account, is sent to sign in, and nothing is read or changed ✓
- AC-11 — a case-insensitive search with paging returns the total, the page, the page count and whether more exist ✓
- AC-12 — a list requested without paging returns the full list as one page ✓
- AC-13 — an invalid page, page size, search text or date range is refused, and the response names the value ✓
- AC-14 — a page past the end returns page 1 ✓
- AC-15 — an empty invoice number takes the next number in the sender profile's sequence ✓
- AC-16 — no duplicate numbers can exist, and a typed duplicate is blocked with the message ✓
- AC-17 — a Customer or sender profile that has invoices can't be deleted, and the message gives the count ✓
- AC-18 — a legacy invoice whose total changed needs the old and new totals confirmed ✓
- AC-19 — a reference to another Freelancer's customer, sender profile, bank account or product is "not found", and nothing is stored ✓
- AC-20 — a failed account deletion removes nothing ✓
- AC-21 — date filters and the dashboard use the Freelancer's local days, the same for the web and the Assistant ✓
- AC-22 — a missing or unknown time zone falls back to UTC ✓
- AC-23 — the paid date is set when an invoice is paid, kept when it is saved again as paid, and cleared when it leaves paid ✓
- AC-24 — a duplicate is a draft, dated today and due in 30 days, with the next sequence number, and the original is unchanged ✓
- AC-25 — the editor data and the Assistant get the same customers, products and custom prices ✓
- AC-26 — the invoice filters and sorts match the invoices page, and a value the page doesn't offer is refused ✓

## Design

- Spec: `docs/features/service-layer/spec.md`
- Architecture: `docs/features/service-layer/sad.md`
- Decisions: `docs/features/service-layer/adr/` (ADR-0001 … ADR-0006)
- Data model: `docs/features/service-layer/data-model.md`. The schema doesn't change and there is no migration.
- API: `docs/features/service-layer/contracts/public-api.md` (the in-process business-layer interface) and `contracts/api-sync-report.md`.
- Test plan: `docs/features/service-layer/test-plan.md`
- Reviews: `docs/features/service-layer/_review/`. The last pass, `review-2026-10-02-3.md`, is a **PASS**.

## Tasks (SDD-Task trailers)

All 32 tasks are done.

<details><summary>33 task commits</summary>

- `7080fb0` T1 — Enforce the lib/services boundary: server-only, lint rules, boundary test, build in CI
- `1d3b8c4` T5 — Wrap the current dashboard actions in dashboard.<section> Sentry spans to start the latency baseline
- `e1f9d4b` T2 — Move the result contract and result helpers into the shared business-layer kernel
- `a2b29a7` T3 — Add the branded ActingFreelancer, its three factories and the Intl-and-PostgreSQL time-zone resolution
- `772bb0b` T4 — Add the shared ListQuery schema, the Page envelope and the paginate helper
- `891ef7a` T7 — Move products into lib/services/products with search, paging and owner-scoped writes
- `64d16ab` T6 — Move customers into lib/services/customers with search, paging and owner-scoped writes
- `028948a` T10 — Move bank accounts into lib/services/bank-accounts with a parent-scoped list
- `d9a9921` T8 — Move custom prices into lib/services/custom-prices with parent-scoped lists and owner-scoped writes
- `240e746` T9 — Move sender profiles into lib/services/sender-profiles and route the convert-image logo lookup through it
- `2dc12fd` T11 — Move profile, account deletion, data export and the dashboard setup check into the layer
- `3bbcfbe` T17 — Build the dashboard SQL for currency tabs, summary stats and the chart, with the old-vs-new parity harness
- `d0eff4e` T12 — Move invoice numbering, getInvoice, the editor data and the next-number preview into lib/services/invoices
- `efcc690` T13 — Add listInvoices with validated filters and local-date bounds, and delete the unused list-all function
- `ed84e76` T18 — Build the dashboard SQL for sender accounts, recent invoices, Debtors and Expected payments
- `e5d5156` T19 — Switch the dashboard wrappers to the layer, pass local-date periods, record parity values and delete the in-memory code
- `7639229` T14 — Move createInvoice into the layer with owned references and numbering under the row lock
- `54c1d0b` T15 — Move updateInvoice and updateInvoiceStatus into the layer with the totals check and the paid-date rule
- `006567e` T16 — Move duplicateInvoice and deleteInvoice into the layer
- `6a02cab` T20 — Close the move: zero data-store calls in lib/actions, inventory checks for request-free and foreign-record tests
- `9510340` T11 — Declare the re-exported result types as aliases so the production build passes
- `5d086dd` T21 — Harden list input and ordering against inherited statuses, huge pages, search wildcards and ties
- `2f9d2af` T23 — Restore wrapper parity for currency-tab order, preview lists, logo failures, session factory and route time zone
- `5b2480e` T22 — Put the owner in the where clause of numbering, item delete, default reset and custom-price lists
- `d0abed4` T24 — Pin foreign sender profile on update, every invoice sort, sender naming and record identity in the parity snapshot
- `1aa8e4b` T25 — Cut the services-to-actions import edge and delete the re-export shims
- `f5c2c01` T26 — Restore the generic logo warning and the old preview-list failure messages
- `b2cc402` T28 — Close the remaining list and owner gaps
- `34a816e` T27 — Record the parity snapshot's record identities from the old dashboard actions
- `9e6b9dc` T29 — Fail both session factories on a time-zone lookup failure and catch relative imports at the boundary
- `43f501e` T30 — Pin the convert-image time-zone-failure response and fix the sync report's page cap
- `ed569ce` T31 — Close the remaining import forms the services-to-actions boundary checks miss
- `159a865` T32 — Anchor the services-to-actions ESLint zone rule to the repo root

</details>

## Verification

Commit: `852cf52`, run on 2026-10-02.

- **Unit and component tests:** 101 files, 706 tests, all passing.
- **Integration tests:** 51 files, 354 passing and 30 skipped. They run on Testcontainers Postgres 16. The skips are the placeholders for a missing container runtime and the local-only `.env` guard.
- **Lint and types:** `eslint` reports 0 errors and 6 warnings, all older than this branch. `tsc --noEmit` is clean.
- **E2E (Playwright, production build, throwaway Postgres):** 8 of 8 pass. The `next build` inside the run succeeded.
- **Ran the feature.** I called `lib/services` directly against a seeded throwaway Postgres, with no browser session and no request. This is the AC-07 Assistant path, run from outside the test suite. Observed:
  - AC-11: 23 customers, 4 of which match "ACME" in name or email in any letter case. `listCustomers(actor, {search:'ACME', page:1, pageSize:2})` returned 2 items, `total: 4, page: 1, totalPages: 2, hasMore: true`.
  - AC-12: with no query, the list returned all 23, `page: 1, totalPages: 1, hasMore: false`.
  - AC-14: `page: 99` returned page 1 with the same items.
  - AC-13: `page: 0` returned `VALIDATION`, with `fieldErrors.page` = "Page must be a whole number of at least 1."
  - AC-08: for another Freelancer's customer, `getCustomer` and `deleteCustomer` both returned `NOT_FOUND` "Customer not found.", the same as a made-up id. That customer's name was unchanged afterwards.
  - AC-15: `createInvoice` with an empty number on a profile whose counter is 4 got `SHIP-2026-0005`.
  - AC-16: retyping that number in lower case with surrounding spaces returned `CONFLICT` "This invoice number is already used in this sender profile." on the `invoiceNumber` field.
  - AC-19: an invoice that pointed at another Freelancer's sender profile got `NOT_FOUND` "Sender profile not found.".
  - AC-21: an invoice paid at 00:30 on 1 Oct in Kyiv (21:30 UTC on 30 Sep). In `Europe/Kyiv`, the September dashboard showed received 0 (0 invoices) and October showed 100 (1 invoice). `listInvoices` for September in Kyiv was empty, and for October it included `KYIV-1`.
  - AC-22: an unknown zone resolved to `UTC`, and in UTC the same invoice counted in September (100, 1 invoice).
- **Not exercised by hand.** The web wrappers' refreshes (AC-03) and messages (AC-02, AC-04) were not clicked through in a browser. The integration suite and the wrapper parity tests cover them. Dashboard latency against production traffic can only be measured after deploy (see below).

## Operational notes

- **Migration.** None. The schema is unchanged.
- **Feature flag / config.** None. Each dashboard section now runs in a named Sentry span, `dashboard.<section>`. CI also runs `pnpm build`.
- **After deploy.** Compare the 7-day p95 of the `dashboard.<section>` spans with what production traces show for the previous build. The latency target is still open (spec §8).
- **Rollback.** Redeploy the previous build. There is no stored-data change.
- **Noise, not a regression.** `next build` logs `Error checking authentication: Dynamic server usage` for the protected routes during prerender. This is pre-existing and does not fail the build.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01HUPqRwBKKbCBfW571dhDS2
