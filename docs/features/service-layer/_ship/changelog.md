# Changelog — service-layer

## service-layer — one browser-free business layer that every caller, including a future Assistant, goes through

**What:** Every business rule in Invoice Forge now lives in one place, `lib/services/`, and no longer depends on a browser session.

- **For the Freelancer, nothing changes.** Pages, data, messages, confirmations and refreshes stay as they were. The exceptions are the deliberate dashboard changes listed below.
- **Explicit acting Freelancer.** Every business function takes the acting Freelancer and their time zone as an explicit input (`ActingFreelancer`). Each function limits every read and every write to that Freelancer's records itself. A record that belongs to someone else looks exactly like one that never existed.
- **Thin web actions.** The `'use server'` actions, page loaders and route handlers now only identify the Freelancer from the session, call the business function, and refresh the same pages as before.
- **Search and paging on every list.** This covers invoices, customers, products, custom prices, sender profiles and bank accounts. The search is case-insensitive and literal. Every list reports the total and whether more results exist, so nothing is truncated silently.
- **Dashboard figures from the database.** The database computes them instead of loading every invoice into memory, and they match the old figures to the cent.
- **Deliberate dashboard changes** (spec §1):
  - A Debtor's name, a sender profile's name and the bank names come from the most recent invoice in the group.
  - Debtors tied on their overdue total are ordered by name.
  - Sender profiles and their accounts are listed in a fixed order.
  - Amounts are exact sums, with no floating-point noise.
  - Every list ends its sort order with the record id, so paging never repeats or skips a record.

**Why:** The next features on the roadmap are an in-app AI chat and an MCP server. In both, an Assistant acts for one Freelancer and has no browser session. Without this layer, each feature would fake a session or copy the queries, and with them the numbering, amount, ownership and deletion rules that were hardened on 2026-09-26–30. The dashboard also slowed down as a Freelancer's history grew. See the [spec](../spec.md) §1–§2.

The key decisions:

- [ADR-0001](../adr/0001-pass-a-branded-acting-freelancer-to-every-business-function.md): a branded `ActingFreelancer` is passed to every business function. Only trusted factories can create one.
- [ADR-0002](../adr/0002-return-the-existing-action-result-union-from-business-functions.md): business functions return the existing action-result union.
- [ADR-0003](../adr/0003-scope-every-write-by-owner-in-its-own-where-clause.md): every write puts the owner in its own `where` clause, so a check and a write can't drift apart.
- [ADR-0004](../adr/0004-aggregate-dashboard-figures-in-parameterized-raw-sql.md): dashboard figures come from parameterized raw SQL.
- [ADR-0005](../adr/0005-page-lists-by-page-number-with-a-shared-page-envelope.md): lists are paged by page number and share one page envelope.
- [ADR-0006](../adr/0006-isolate-business-functions-in-lib-services-behind-server-only-and-lint-rules.md): `lib/services` is isolated behind `server-only`, ESLint rules and a boundary test, and it never imports `lib/actions`.

**How to use:** Freelancers need to do nothing. For developers, the in-process interface is described in [public-api.md](../contracts/public-api.md):

```ts
import { listCustomers } from '@/lib/services/customers/customers';

// actor: from actingFreelancerFromSession() / actingFreelancerForRoute() on the web,
// actingFreelancerForTest(userId, 'Europe/Kyiv') in tests; the Assistant's factory comes with that feature.
const res = await listCustomers(actor, { search: 'acme', page: 1, pageSize: 20 });
// res.data → { items, total, page, pageSize, totalPages, hasMore }
```

If no page is requested, the list returns the full set as page 1. If the page number is past the end, the first page is returned. Invalid input (a page below 1, a search over 100 characters, a half-open or reversed date range, a sort or status the page doesn't offer) is refused with a `VALIDATION` result that names the field.

**Operational notes:**
- Migration: none. The schema is unchanged and stored data is not touched.
- Feature flag / config: none.
  - Each dashboard section now runs inside a named Sentry span, `dashboard.<section>`.
  - The `next build` boundary check runs on every PR as the Vercel preview build, not in GitHub Actions (ADR-0006).
- Release shape:
  - SAD §7 planned four code-only waves. Wave 4 (dashboard SQL) was meant to ship after at least 7 days of `dashboard.<section>` latency baseline from the old code.
  - This branch holds all four waves, so merging it ships them as one release, with no before/after baseline.
  - The 7-day after-window from the new code still shows any regression. The dashboard latency target is still open (spec §8).
- Rollback: redeploy the previous build. There is no schema change and no down-migration.

**Acceptance criteria delivered:** AC-01 – AC-26 (26 criteria).

- The web app behaves as before (AC-01–04).
- Dashboard figures match to the cent, and its naming and order are fixed (AC-05–06).
- An Assistant can read without a browser session and gets exactly the records the Freelancer sees (AC-07, AC-25).
- Ownership: another Freelancer's record looks like a missing one, and a signed-out visitor is sent to sign in (AC-08–10, AC-19).
- Search and paging work on every list, with validated input (AC-11–14, AC-26).
- Invoice rules hold for every caller (AC-15–18, AC-23–24):
  - numbering and unique numbers;
  - deletion is blocked while invoices depend on a record;
  - legacy totals need confirmation;
  - the paid date is tracked;
  - duplicates are drafts with a fresh number.
- Account deletion removes everything or nothing (AC-20).
- Dates are local to the Freelancer, with a UTC fallback (AC-21–22).
