# Changelog — mcp-server

## mcp-server — a Freelancer's own AI assistant can answer money questions, with numbers that match the dashboard

**What:** A Freelancer can connect their own AI assistant (Claude Desktop, Claude Code, Cursor, or any client that speaks the Model Context Protocol) to Invoice Forge and ask about their money in the conversation. They don't need to open the app.

- **Connect your AI** (Settings → Assistants, plus an entry point on the dashboard).
  - The Freelancer creates named Personal keys. A new key is shown once, with a copy action.
  - The page gives setup steps for each supported assistant. The steps keep the key in user-level config, not in a project file.
  - The page also offers three example prompts.
  - Each key shows its last four characters, when it was created and when it was last used. Keys can be revoked; a revoked key stops working immediately and never comes back.
  - At most 10 keys can be active at once.
- **Seven read-only tools** on `POST /api/mcp`:
  - `list_overdue_invoices`
  - `list_debtors`
  - `list_expected_payments`
  - `get_summary_figures`
  - `list_customers`
  - `search_invoices`
  - `get_invoice`

  Every list has at most 50 rows per page. Totals and counts per currency are computed by Invoice Forge over the full set, and every answer says whether more pages exist. Text the Freelancer typed is marked as data, not instructions. Bank account numbers are never returned.
- **One overdue rule everywhere.**
  - An issued, unpaid invoice is overdue when it was marked overdue by hand, or when its due date is before today in the Freelancer's time zone.
  - The dashboard, the invoice list, the customer page, the invoice itself and every Assistant answer use this rule.
  - Stored statuses are not changed.
  - A one-time dashboard notice explains the change.
- **The time zone is saved on the account.** The browser fills it on the Freelancer's next visit, and they can change it in Profile settings. It decides "today" and "this month" for the dashboard and for Assistants alike. Until it is saved, both use UTC.
- **Invoice dates are calendar days.** An issue date or due date is the day the Freelancer picked, with no time-zone shift.
- **Dashboard currency tabs** now also cover currencies that appear only on issued invoices.
- **Data export 2.1** lists each key's name, dates and last use, plus the weekly usage counts. It never includes the key itself. Deleting an account removes its keys and their usage.

**Why:** Freelancers who already work in an AI assistant had to leave it to answer simple money questions. The central promise is that **an Assistant's numbers always match the dashboard**. That is why the overdue rule and the account time zone ship in the same release as the tools. See [spec](../spec.md) §1–§2.

The key decisions:

- [ADR-0002](../adr/0002-serve-mcp-from-a-stateless-route-handler-in-the-next-app.md): MCP is served from a stateless route handler inside the Next.js app.
- [ADR-0003](../adr/0003-admit-only-api-mcp-past-the-proxy-and-authenticate-it-by-bearer-key-alone.md): `/api/mcp` is the one exception to the proxy's refusal of anonymous non-read requests. It is authenticated by its Bearer key alone, and a session cookie is never accepted there.
- [ADR-0004](../adr/0004-store-personal-keys-as-sha-256-digests-of-prefixed-random-secrets.md): keys look like `ifk_…`, carrying a checksum so secret scanners can spot them. Only their SHA-256 digest is stored.
- [ADR-0005](../adr/0005-compute-overdue-at-read-time-from-one-shared-rule-module.md): overdue is computed when data is read, from one shared rule module.
- [ADR-0006](../adr/0006-save-the-freelancer-time-zone-on-the-account.md): the time zone is saved on the account. This supersedes the browser-cookie rule of architecture-hardening ADR-0010.
- [ADR-0007](../adr/0007-count-assistant-calls-in-the-existing-postgres-limit-log-and-fail-closed.md): the call limits are 60 calls per 60 s per key and 30 failed key checks per 5 minutes per source. Both live in the existing Postgres limit log, and calls are refused while that store is unavailable.
- [ADR-0008](../adr/0008-show-dashboard-currency-tabs-for-bank-account-and-issued-invoice-currencies.md): dashboard tabs follow bank-account and issued-invoice currencies.
- [ADR-0009](../adr/0009-store-invoice-dates-as-calendar-days.md): invoice dates are stored as calendar days, and legacy values are converted lazily.

**How to use:** In Invoice Forge, open Settings → Assistants (or the dashboard's "Connect your AI") and create a key. Then add the server to your assistant, for example in Claude Code:

```sh
claude mcp add --transport http --scope user invoice-forge https://<your-invoice-forge-host>/api/mcp \
  --header "Authorization: Bearer ifk_…"
```

Then ask: *"Who owes me money right now?"*, *"What payments are due this month?"* or *"Show my summary for last quarter."* The full tool contract is in [openapi.yaml](../contracts/openapi.yaml), and the web actions are in [server-actions.md](../contracts/server-actions.md).

**Operational notes:**
- **Migrations:** six run on deploy with `prisma migrate deploy`.
  - `20261004100000_add_user_time_zone`, `20261004100100_add_user_overdue_notice_dismissed_at`, `20261004100200_create_personal_key`, `20261004100300_create_personal_key_usage_week` and `20261004100400_add_mcp_limit_scopes` are additive. Each has a down script in `docs/features/mcp-server/migrations/`.
  - `20261005100000_normalize_invoice_calendar_dates` changes data only. It converts the legacy invoice dates of owners who already have a saved zone, and on release day that is almost no one. Everyone else is converted when their zone is first saved. The migration is idempotent, and its down script is a no-op because the old instants are not kept. The previous build reads the new values correctly, so a code rollback is safe.
  - The migration's first text (d836bd0) was rewritten in place (fba8a91). Before deploy, confirm that no database you keep recorded the old checksum in `_prisma_migrations` (spec §8).
- **Config:** there is no new setting or feature flag. The existing `LIMIT_KEY_SECRET` also keys the per-source MCP limit. Sentry spans are named `mcp.*`.
- **Behaviour change on release day:** dashboard overdue figures, Debtors and Expected payments change for any Freelancer who has past-due invoices they never marked overdue. The one-time dashboard notice explains why.
- **Rollback:** redeploy the previous build. The new tables and columns are unused by the old code and can stay. To remove them, run the five down scripts in reverse order. Revert `add_mcp_limit_scopes` only after its `LimitEvent` rows are purged.

**Acceptance criteria delivered:** AC-01 – AC-26, including AC-18b, AC-19b and AC-23b (29 criteria).

| ACs | What they guarantee |
|---|---|
| AC-01 – AC-06 | Connect and manage keys: the entry point, a key shown once, name rules, at most 10 active keys, last use, immediate revocation |
| AC-07 – AC-11 | Access: uniform refusals that reveal nothing, a reference to another Freelancer's record looks like a missing one, a session cookie is never accepted, read-only access, the 60 / 60 s limit |
| AC-12 – AC-16 | Overdue, Debtors, Expected payments and summary figures equal the dashboard to the cent; invalid periods are refused |
| AC-17 – AC-21 | Search, one invoice, the 50-row cap, honest paging, Freelancer text marked as data, ambiguity resolved by asking, Customer renames handled |
| AC-22 – AC-24 | One time zone and one overdue rule on every surface, including at the day boundaries |
| AC-25 – AC-26 | Export without secrets; keys stop working when the account is deleted |
