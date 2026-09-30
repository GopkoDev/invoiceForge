# Changelog — architecture-hardening

## architecture-hardening — close the 2026-09-26 review's security, data-integrity and error-handling findings

**What:** Invoice Forge now enforces its own rules on the server, so it no longer trusts the browser.

- **Access.** A Visitor can reach only the deliberately public pages. Every other page sends them to sign-in, and every data request or action is refused as "not signed in". This includes routes added in the future.
- **Logo fetch.** The PDF logo fetch no longer accepts an address. It fetches only the logo stored on the Freelancer's own sender profile, and it can never reach an internal or private network address. Fetches are capped at 512 KB, 5 s and 30 per minute.
- **Invoice data.**
  - Invoice numbers are unique within a sender profile, ignoring case and surrounding spaces.
  - A number left empty is assigned at save time with no collision. A typed number never moves the sequence.
  - Totals are recomputed on the server with exact decimals, and a total can never be negative.
- **Account deletion.** It now always succeeds and removes everything. The dialog states how many invoices will be lost and offers an export first. A Customer or sender profile that still has invoices can't be deleted on its own.
- **Malformed links and failed loads.** A bad link falls back to defaults instead of crashing. A load failure shows an error with a retry, not an empty list or "not found".

**Why:** A review on 2026-09-26 found 27 open problems in production (see [spec](../spec.md) §1).

- **Logo endpoint.** Any Visitor could make the server fetch any address, including cloud metadata.
- **Numbers and totals.** Two invoices could share a number, and browser-sent totals were stored unchecked.
- **Account deletion.** It failed for every Freelancer who had an invoice.

The key decisions:

- [ADR-0001](../adr/0001-deny-by-default-in-proxy-with-public-allowlist.md): deny by default, with one public allowlist.
- [ADR-0002](../adr/0002-treat-sessions-without-a-live-account-as-visitors.md): a session without a live account is a Visitor.
- [ADR-0003](../adr/0003-fetch-logos-by-owned-profile-id-through-ip-pinning-fetcher.md): fetch the logo by an owned profile id, through an IP-pinning fetcher.
- [ADR-0004](../adr/0004-enforce-invoice-number-uniqueness-on-a-normalized-key-column.md) and [ADR-0005](../adr/0005-allocate-invoice-numbers-under-a-sender-profile-row-lock.md): a normalized number key, allocated under a row lock.
- [ADR-0006](../adr/0006-compute-invoice-amounts-in-one-shared-decimal-module.md): one shared exact-decimal module computes all amounts.
- [ADR-0007](../adr/0007-delete-account-in-one-explicit-transaction-keeping-restrict-fks.md): account deletion runs in one transaction, and the restrict foreign keys stay.
- [ADR-0008](../adr/0008-rate-limit-logo-fetches-with-a-postgres-sliding-window-counter.md): the logo rate limit is a Postgres counter.
- [ADR-0009](../adr/0009-classify-action-failures-with-typed-error-codes-and-segment-error-boundaries.md): actions return typed error codes, and each page segment has an error boundary.
- [ADR-0010](../adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md): the browser time zone reaches the server in a cookie.

**How to use:** Freelancers need to do nothing new. The visible changes:

- **Invoice editor.**
  - The number field shows "assigned on save" as a hint.
  - Out-of-range amounts are blocked next to the field.
  - Editing a legacy invoice asks you to confirm the old and new totals.
- **PDF export.** A warning appears when the logo can't be included.
- **Delete account.** The dialog counts the invoices that will be lost and offers the export.
- **Error pages.** List and detail pages show an error card with Retry.

`POST /api/convert-image` now takes `{ "senderProfileId": "<id>" }`, not a URL ([openapi.yaml](../contracts/openapi.yaml), `convertLogoImage`).

**Operational notes:**
- **Migrations.** This change adds four migrations under `prisma/migrations/`, and every one is expand-only:
  - `20260927094537_create_logo_fetch_window`
  - `20260927100000_add_invoice_number_key`
  - `20260927100100_backfill_invoice_number_key`
  - `20260927100200_create_invoice_number_key_unique`

  The build does not apply them. Run `pnpm exec prisma migrate deploy` against production before you deploy this build. Before you do, run the read-only pre-flight in [data-model.md §Pre-flight](../data-model.md). If some rows share a number, those rows keep a `NULL` key (the ADR-0004 fallback), and AC-17 blocks their next save until the number is changed.
- **Not included.** The contract step (staged migrations `05`/`06`: `invoiceNumberKey NOT NULL`, drop the exact-match unique) is **not** in this change. It is task T30, blocked by its own gate. Promote it only after this release has run in production without a rollback **and** `SELECT count(*) FROM "Invoice" WHERE "invoiceNumberKey" IS NULL` returns 0.
- **Feature flag / config.** None.
  - A new `tz` cookie carries the browser time zone. It is set by the app and needs no setup.
  - `robots.txt` now disallows every private section.
  - Open editor tabs from before the deploy may fail one save with the old payload shape. Release at a low-traffic hour (spec §8).
- **Rollback.** Redeploy the previous build. The schema needs no down-migration: the old code ignores `LogoFetchWindow`, and the rows it writes keep a `NULL` key, which the unique index allows. To revert the schema too, apply the `*.down.sql` files in [migrations/](../migrations/) in the order 04 → 01.

**Acceptance criteria delivered:** AC-01 – AC-31, including AC-02b (32 criteria).

- Logo fetch: safe and owned (AC-01–05).
- Invoice numbering: unique and race-free (AC-06–12).
- Amounts: server-computed and never negative (AC-13–17, AC-31).
- Paid date: tracked (AC-18–19).
- Account and deletion: safe (AC-20–24).
- Links and loads: robust, with honest errors (AC-25–29).
- `robots.txt`: private sections are disallowed (AC-30).
