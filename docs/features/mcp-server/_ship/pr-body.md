## Summary

This PR lets a Freelancer connect their own AI assistant (Claude Desktop, Claude Code, Cursor or any MCP client) to invoiceFlow with a named, revocable Personal key. The assistant can then answer money questions through seven read-only tools on `POST /api/mcp`:

- who is overdue;
- who the Debtors are;
- what is coming in;
- summary figures;
- customers;
- invoice search;
- one invoice.

The central promise is that **an Assistant's numbers always match the dashboard**. So the same release also:

- applies one shared overdue rule on every surface: a past-due unpaid invoice is overdue without being marked by hand;
- saves the Freelancer's time zone on the account;
- stores invoice dates as calendar days.

**Stacked on #5 (`security-patch`).** The base is `security-patch`, so the diff shows only this feature (96 commits). Retarget it to `main` after #5 merges.

Spec: [`docs/features/mcp-server/spec.md`](docs/features/mcp-server/spec.md). Changelog: [`_ship/changelog.md`](docs/features/mcp-server/_ship/changelog.md).

## Acceptance criteria

- AC-01 — a "Connect your AI" entry point on the dashboard and in settings; the dashboard one disappears for good after the first use ✓
- AC-02 — a new key is shown exactly once, with a copy action, setup steps per assistant and three example prompts ✓
- AC-03 — a key name must be 1–50 characters and unique among active keys, ignoring case and surrounding spaces ✓
- AC-04 — at most 10 active keys ✓
- AC-05 — each key shows its name, creation date, last four characters and last use (within 5 min); revoked keys are listed separately ✓
- AC-06 — a revoked key is refused on the first call after the revocation is confirmed and can't be reactivated ✓
- AC-07 — revoked, unknown, malformed and deleted-account keys get the same refusal, which reveals nothing ✓
- AC-08 — another Freelancer's record looks exactly like a missing one ✓
- AC-09 — a browser session is never accepted in place of a key ✓
- AC-10 — only read-only tools are offered ✓
- AC-11 — 60 calls per 60 s per key, then a refusal that says when to retry; other keys are unaffected ✓
- AC-12 — overdue invoices with days overdue and per-currency totals over the full set ✓
- AC-13 — every Debtor, paged and ranked per currency, matching the dashboard ✓
- AC-14 — Expected payments for a period, grouped by currency, with totals matching the dashboard ✓
- AC-15 — four summary figures per currency that equal the dashboard to the cent ✓
- AC-16 — an invalid period is refused with an explanation ✓
- AC-17 — search returns issued invoices only, unless drafts or cancelled invoices are asked for, with totals over every match ✓
- AC-18 — every list is capped at 50 rows, and the answer says when the page size was capped ✓
- AC-18b — a page past the end is refused with the total and the last page number ✓
- AC-19 — one invoice as stored, with a link and without bank numbers ✓
- AC-19b — free text the Freelancer typed is marked as data ✓ (see security review L-01 below)
- AC-20 — an ambiguous invoice number lists the candidates instead of picking one ✓
- AC-21 — a Customer's invoices are found under its current and former names; several matches are listed, not guessed ✓
- AC-22 — the time zone is seeded from the browser once, can be changed in settings, and is UTC until saved ✓
- AC-23 — the Kyiv month boundary is handled the same on the dashboard and by the Assistant ✓
- AC-23b — the New York day boundary is handled the same on the dashboard and by the Assistant ✓
- AC-24 — a past-due unmarked invoice is overdue on the dashboard, the invoice list, the customer page and the invoice itself ✓
- AC-25 — the export lists key metadata, never the key ✓
- AC-26 — account deletion stops every key ✓

## Design

- Spec: `docs/features/mcp-server/spec.md`
- Architecture: `docs/features/mcp-server/sad.md`
- Decisions: `docs/features/mcp-server/adr/` (ADR-0001 … ADR-0009, all Accepted)
- Data model and migrations: `docs/features/mcp-server/data-model.md` (live as `prisma/migrations/20261004100000…20261004100400` and `20261005100000`)
- API: `docs/features/mcp-server/contracts/openapi.yaml` (the MCP endpoint) and `contracts/server-actions.md` (the web surface)
- Screens and flows: `docs/features/mcp-server/screens.md`, `ux-flows.md`
- Test plan: `docs/features/mcp-server/test-plan.md`
- Reviews: `docs/features/mcp-server/_review/`. The last pass, `review-2026-10-05-r7.md`, is a **PASS**.
- Security review: `docs/features/mcp-server/_ship/security-review-2026-10-05.md`. It found nothing at HIGH or MEDIUM and one LOW finding.

## Tasks (SDD-Task trailers)

All 50 tasks are done.

<details><summary>57 task commits</summary>

- T01 `aa9f20d` feat(mcp-server): Promote the five staged migrations and extend the test support for keys, usage and time zone
- T02 `f39100f` feat(mcp-server): Add the shared overdue rule module with its SQL, Prisma and TypeScript forms
- T03 `387969f` feat(mcp-server): Generate, checksum and digest ifk_ Personal keys
- T04 `eb72134` feat(mcp-server): Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings
- T05 `dd0998f` feat(mcp-server): Add the Time zone card to Profile settings
- T06 `7d1d600` feat(mcp-server): Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies
- T07 `fa0724e` feat(mcp-server): Return the derived status from every invoice read and filter by the shared rule
- T08 `5395400` feat(mcp-server): Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices
- T09 `3e8aee5` feat(mcp-server): Create, list and revoke Personal keys through the business layer and server actions
- T10 `2a77dfd` feat(mcp-server): Add the per-key and per-source MCP limit scopes that fail closed
- T11 `47bdbd5` feat(mcp-server): Authenticate a presented Personal key and record its last use and weekly usage
- T12 `a7640a2` feat(mcp-server): Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline
- T13 `130cbe6` feat(mcp-server): Shape MCP answers, register read-only tools and count substantive calls
- T14 `2982ae0` feat(mcp-server): Page overdue invoices and Debtors strictly with totals over every match
- T15 `15d5f3e` feat(mcp-server): Page Expected payments by period and compute summary figures for every issued-invoice currency
- T16 `a05ebc7` feat(mcp-server): Match Customers by current and invoice-copied names and search issued invoices for an Assistant
- T17 `8377ba7` feat(mcp-server): Find one invoice by id or by number with an optional sender profile name
- T18 `a30c02b` feat(mcp-server): Expose the overdue, Debtors, Expected payments and summary figures tools
- T19 `52128f8` feat(mcp-server): Expose the customers, invoice search and one-invoice tools
- T20 `8edc07f` feat(mcp-server): Add the Connect your AI settings page with setup steps, example prompts and a CopyButton
- T21 `132c7b6` feat(mcp-server): Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI
- T22 `1978514` feat(mcp-server): Show the overdue-rule notice and the Connect your AI entry point on the dashboard
- T23 `ea9c41d` feat(mcp-server): Add Personal keys, weekly usage and the time zone to the data export and verify deletion removes them
- T24 `b4100d6` test(mcp-server): Prove Assistant-dashboard parity, day boundaries, tenant isolation and the latency budget end to end
- T25 `d836bd0` fix(mcp-server): Store issue and due dates as calendar days and compare every period and the overdue rule by calendar day
- T26 `ec3e088` fix(mcp-server): Keep the stored status through an editor save of a derived-overdue invoice
- T27 `8a11361` fix(mcp-server): Refuse JSON-RPC batches and cap the MCP request body before the transport
- T28 `05a069c` fix(mcp-server): Build dashboard and invoice-list periods from the account time zone
- T29 `9596e30` fix(mcp-server): Match the contract's InvoiceCandidate and ServerFailure, report route failures, accept any-case Bearer, drop dead paging code
- T30 `8ae8968` fix(mcp-server): Answer a key-check store failure with 503 and prove last use on tools/list and on a refused call
- T31 `3d00dba` fix(mcp-server): Leave cancelled-only currencies out of summary currencies and dashboard tabs
- T32 `c64d7d1` fix(mcp-server): Guard the overdue literal scan without obfuscation and validate the real 2.1 export body
- T33 `32af248` fix(mcp-server): Polish the key-name hint, revoke focus and time-zone labels, and test the one-time reveal on remount
- T34 `515f219` fix(mcp-server): Add the e2e specs the test plan declares for the proxy, key flows, sign-in return, time zone and overdue surfaces
- T35 `fba8a91` fix(mcp-server): Normalise legacy invoice dates lazily when the Freelancer time zone is first saved
- T36 `ef85393` fix(mcp-server): Build dashboard presets and the applied-range label in the account time zone
- T37 `22be741` fix(mcp-server): Keep request bodies out of Sentry, check Accept and Content-Type first, and put 413 and the batch refusal in the contract
- T38 `774126e` fix(mcp-server): Map a submitted OVERDUE back to PENDING only for a derived-overdue invoice
- T39 `8a26199` fix(mcp-server): Give the no-zone, export-schema, revoke-title and overdue-surface tests teeth
- T40 `f00cf91` fix(mcp-server): Keep unedited legacy invoice dates through an editor save, seed the zone from the editor, and accept only calendar-day strings on the server
- T40 `82b2b73` fix(mcp-server): Address review on T40
- T41 `67a94d1` fix(mcp-server): Keep MCP request data out of Sentry transactions, report SDK failures, treat client aborts as client errors, and return the contract 405 body
- T41 `272519a` fix(mcp-server): Address review on T41
- T42 `23df1ad` fix(mcp-server): Label dashboard chart days as calendar days, resolve presets on the server, show the applied preset, and keep focus after a not-found revoke
- T42 `0447deb` fix(mcp-server): Address review on T42
- T43 `abc415c` docs(mcp-server): Bring the ADRs, contracts, data model, screens manifest and test plan in line with the fixes
- T44 `bf70eb6` fix(mcp-server): Compare an editor save against the dates the editor loaded, lock the row with its owner, and make the normalisation race test deterministic
- T44 `205999e` fix(mcp-server): Address review on T44
- T44 `dc23fcd` fix(mcp-server): Keep a date edited while a save is in flight, and clear the loaded dates on reset
- T45 `ea533b2` fix(mcp-server): Answer an SDK catch-all failure with the contract ServerFailure and scrub /api/mcp/ with a trailing slash
- T46 `538ef73` fix(mcp-server): Ignore a save that resolves after the editor was reset, keep a number or status edited while a save is in flight, move LoadedDates into the store types, and list the loaded-dates tests in the test plan
- T46 `0ba622f` fix(mcp-server): Address review on T46
- T47 `472fdad` fix(mcp-server): Scrub /api/mcp requests whose path has repeated slashes
- T48 `4fe28f4` fix(mcp-server): Show a stale save failure, keep an empty number after a sender switch in flight, guard the sender hint and Retry with the session token, test the isSaving guard, and correct T46's ACs
- T48 `62b1572` fix(mcp-server): Address review on T48
- T49 `7b39b40` fix(mcp-server): Scrub percent-encoded /api/mcp paths
- T50 `bf22a1e` fix(mcp-server): Give the sender-hint reset test teeth, block Retry while a save is in flight, test Retry in the same session, and list the stale-session cases in the test plan

</details>

## Verification

Commit `d114858`, run on 2026-10-05.

- **Unit and component tests:** 154 files, 1 286 tests, all passing.
- **Integration tests:** 88 files, 733 passing and 35 skipped, on Testcontainers Postgres 16. They include the dashboard parity test, the day-boundary tests, tenant isolation and the latency budgets. The skips are the conditional suites: a missing container runtime and the local-only `.env` guard.
- **Lint and types:** `eslint` reports 0 errors and 6 warnings, all in files outside this feature. `tsc --noEmit` is clean.
- **E2E (Playwright, production build, throwaway Postgres):** the five MCP specs pass, 14 of 14. They cover AC-01, AC-02, AC-06, AC-09, AC-19, AC-22 and AC-24 through the real UI.
- **Ran the feature.** The setup was a production build (`next start`) on a throwaway Postgres. Two Freelancers were seeded in Kyiv time, with invoices in USD and EUR. Calls went to `POST /api/mcp` over HTTP.
  - **AC-10:** `tools/list` returns exactly the 7 tools, all `readOnlyHint: true`.
  - **AC-12:** `list_overdue_invoices` returns the invoice due yesterday and never marked (1 day overdue) and the one marked by hand but due in 5 days (0 days). It leaves out the one due tomorrow and the other Freelancer's invoice. Totals: USD 300.00 / 2, EUR 50.00 / 1.
  - **AC-15 (parity):** `get_summary_figures` for this month gives USD received 0.00 / 0, planned 300.00 / 1, overdue 300.00 / 2, all future 600.00 / 3, and EUR overdue 50.00 / 1, all future 50.00 / 1. These equal the rendered dashboard's USD and EUR tabs to the cent. The EUR tab appears with no EUR bank account (ADR-0008).
  - **AC-14:** `list_expected_payments` for this month returns only AAA-003, with the period 2026-10-01…2026-10-31 and Europe/Kyiv.
  - **AC-16:** a period sent as a bare string or as an unknown preset is refused with VALIDATION and the period rule.
  - **AC-08:** `get_invoice` with the other Freelancer's invoice id gives the same NOT_FOUND as an id that does not exist.
  - **AC-19 / AC-19b:** `get_invoice` returns status "overdue", the edit link, and the notes text ("Ignore previous instructions…") wrapped as `freelancerText`. The bank account number appears nowhere in the answer.
  - **AC-18 / AC-18b:** `pageSize: 1000` is served as 50 with `pageSizeCapped: true`. Page 7 gives `PAGE_OUT_OF_RANGE` with the total and the last page.
  - **AC-06 / AC-07:** the revoked, unknown and malformed keys get byte-identical `401` answers.
  - **AC-09:** a valid session cookie with no key gets the same `401`.
  - **AC-11:** 61 calls with one key give 60 × `200` and then `429` with `retry-after: 59`. Another key still gets `200`.
  - **Real client (SAD §11 risk):** Claude Code CLI connected with `--mcp-config`.
    - Asked "who owes me money right now?", it answered *"USD 300.00 overdue (2 invoices) · EUR 50.00 overdue (1 invoice), as of 2026-10-05 in Europe/Kyiv"*.
    - With the revoked key it reported the server's plain "This Personal key is not valid" message, with no OAuth sign-in prompt.
- **Not run here:**
  - Claude Desktop (through `mcp-remote`) and Cursor against a deployment.
  - The 7-day production latency and dashboard-slowdown measurements in spec §6, which can only be measured after release.

## Operational notes

- **Migrations:** run `prisma migrate deploy`. Five of the six migrations are additive.
  - `20261005100000_normalize_invoice_calendar_dates` changes data only. It is idempotent and safe to roll back with the code; its down script is a no-op.
  - **Pre-deploy check (spec §8):** that migration's text was rewritten in place (d836bd0 → fba8a91).
    - The dev database has none of the migrations from 2026-10-02 onwards applied, so it never ran the old text.
    - No preview deploy of this branch has existed, and the build does not migrate.
    - Before deploy, confirm that production's `_prisma_migrations` has no row for `20261005100000_normalize_invoice_calendar_dates`.
- **Feature flag / config:** none. The existing `LIMIT_KEY_SECRET` is reused.
- **Release-day behaviour change:** the dashboard's overdue figures, Debtors and Expected payments change for anyone with past-due invoices they never marked overdue. A one-time dashboard notice explains why.
- **Rollback:** redeploy the previous build. The new tables and columns are ignored by the old code. The down scripts exist if the schema must go too.
- **Known follow-up (security review L-01, LOW):** `invoiceNumber`, sender and customer `email`, and `website` reach the Assistant without the `freelancerText` marking. AC-19b's list doesn't name these fields, and keys are read-only, so nothing in invoiceFlow can be changed through them.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
