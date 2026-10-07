# Release runbook — invoice-integrity

> The order of the release steps (sad.md §7 Deployment view, §11 risk "release migration applied by
> hand"). The new code reads `Invoice.version`, so the migration runs **before** the code deploy;
> `pnpm build` does not migrate. No issued invoice is rewritten by this release; the migration only
> repairs duplicate and missing defaults (AC-18).

**Database targets.** `.env` = dev, `.env.prod` = production. Before **every** command that touches a
database, check which host it points to (the report prints it; for Prisma, read
`grep DATABASE_URL <file>`). Never assume which database `.env` targets: it has pointed at
production before.

## 0. Spans first (T01) — at least 7 days earlier

The `invoices.save` and `invoices.status-change` Sentry spans and the `path` tag on generic failures
ship as a behaviour-free release **at least 7 days before** this feature. Those 7 days are the
latency baseline of spec §6 ("p95 no more than 10 % slower"), and the 14 days before release are
the generic-failure baseline of spec §7.

- [ ] Spans release deployed on: ____ (≥ 7 days before step 4)

## 1. Pre-release report against production (read-only)

```sh
node --env-file=.env.prod scripts/invoice-integrity-report.ts
```

- The script prints `Database host: …` first — confirm it is the production host before reading on.
- It runs in one `READ ONLY` transaction and prints counts only (no ids, names or amounts). A write
  attempt would fail.
- Record the counts below: they are the baseline of the spec §7 "new rule violations" KPI.
- Answer spec §8 open question 1: does any category besides duplicate/missing defaults need a
  one-time repair? Default: no — counts only, nothing else is repaired. A different decision is a
  separate, owner-approved change, not part of this release.

| Category | Count |
|---|---|
| Freelancers with more than one default sender profile | |
| Freelancers with sender profiles but no default | |
| Sender profiles with more than one default account | |
| Sender profiles with accounts but no default | |
| Invoices whose currency differs from their bank account (draft / issued) | |
| Invoices with a catalogue line in another currency (draft / issued) | |
| Invoices with the due date before the issue date | |
| Invoices with an impossible status history | |
| Invoices with an amount above 99,999,999.99 | 0 (not reachable) |
| Issued invoices saved after a related record changed (upper bound) | |

## 2. Migrate dev, verify

```sh
grep DATABASE_URL .env        # confirm the dev host
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

Applies, in order: `…_add_invoice_version`, `…_create_invoice_bank_account_id_index`
(`CONCURRENTLY`, its own migration), `…_single_default_sender_profile`,
`…_single_default_bank_account` (each repairs defaults, then creates its partial unique index, in
one transaction).

Verify on dev:

- `pnpm report:invoice-integrity` — the four default categories now print 0.
- `Invoice_bankAccountId_idx` is valid: `SELECT indisvalid FROM pg_index WHERE indexrelid = '"Invoice_bankAccountId_idx"'::regclass;`
  If `false`, `DROP INDEX CONCURRENTLY "Invoice_bankAccountId_idx";` and re-run step 2.

## 3. Migrate production

```sh
grep DATABASE_URL .env.prod   # confirm the production host
DOTENV_CONFIG_PATH=.env.prod pnpm exec prisma migrate deploy
DOTENV_CONFIG_PATH=.env.prod pnpm exec prisma migrate status
```

Run the same verification as step 2 against production (`node --env-file=.env.prod scripts/invoice-integrity-report.ts`).
If any migration fails, it rolls back on its own and the release **stops here** — do not deploy
the code (sad.md §6 flow 11).

## 4. Deploy the code

Deploy only after step 3 succeeded. The previous build keeps working against the migrated schema
(it never writes `version`, and the repair leaves exactly one default).

## Rollback

1. Deploy the previous build first (the new code reads and bumps `version`).
2. Run the staged down migrations, in reverse order, against the target database:
   `docs/features/invoice-integrity/migrations/04_…down.sql`, `03_…down.sql`, `02_…down.sql`
   (its own statement, `CONCURRENTLY`), `01_…down.sql`.
3. The default repair is **not** reverted: it only removed duplicate defaults and filled gaps, and
   the previous build works with exactly one default.

## After the release

- 7 days: compare the `invoices.save` / `invoices.status-change` p95 with the step-0 baseline.
- 30 days: re-run the report; new violations created after the release should be 0 (spec §7).
