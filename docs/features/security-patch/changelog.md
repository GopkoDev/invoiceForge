# Changelog — security-patch

## security-patch — close the pre-launch security holes before Invoice Forge goes public

**What:** Invoice Forge can now be shared publicly. Before this change, a Visitor could crash the server with one dashboard link, flood any mailbox with sign-in emails, or call private actions. These paths are now closed:

- **Dependencies:** the framework, the sign-in library and the mail library are on patched releases. No critical or high advisory remains in production packages. Prisma is on 7.10 and the unused acceleration extension is gone.
- **"Signed in" means a verified session and nothing else.** An error from the sign-in check never counts as a signed-in user. If the check fails, the Freelancer sees a "We couldn't load your data" page with "Try again". Their session is kept and they are never sent into a sign-in loop.
- **Anonymous action calls are refused** however the request is shaped. Only the sign-in actions are exempt.
- **Sign-in links are limited** to 5 per mailbox per hour and 30 per source per 5 minutes. A limited request looks the same as a sent one, in wording and in timing. If the limit cannot be checked, no email is sent. Google sign-in is never blocked by these limits.
- **Sign-in mail goes out only over verified TLS.** Addresses longer than 254 characters or containing non-ASCII characters are refused.
- **Dashboard period cap:** a custom period can be at most 5 years. Longer links fall back to the current month, and the filter explains the limit. "All time" still shows the full history.
- **Data exports** are limited to 3 per Freelancer per hour. The Freelancer is told when they can export again.
- **Browser protections:** an enforced content-security policy plus transport and framing headers. Web and image addresses must be http(s). Older non-web values are shown as plain text.
- **Error-reporting relay:** it forwards only to the error-tracking project configured for the environment.
- **Required settings:** a deploy without one of them fails at build time and names the missing setting.

**Why:** the public demo and the upcoming AI chat bring automated traffic. The pre-launch audit found holes a Visitor could reach without signing in ([spec](spec.md) §1–§2, [brief](brief.md)). Each hole is closed where every caller passes through, not only on the page the audit cited. The key decisions:

- [ADR-0001](adr/0001-enforce-sign-in-email-rules-inside-the-auth-js-email-provider-hooks.md): sign-in email rules are enforced inside the email provider hooks.
- [ADR-0002](adr/0002-count-limited-events-in-a-postgres-event-log-under-a-per-key-advisory-lock.md): limits are counted in a Postgres event log under a per-key advisory lock.
- [ADR-0003](adr/0003-refuse-anonymous-mutations-in-the-proxy-by-method-and-backstop-with-a-scanned-action-guard.md): anonymous mutations are refused in the proxy by HTTP method, with a scanned action guard as a backstop.
- [ADR-0004](adr/0004-share-one-calendar-date-five-year-period-rule-across-link-filter-and-business-layer.md): one calendar-date 5-year rule, shared by the link reader, the filter and the business layer.
- [ADR-0005](adr/0005-limit-exports-in-the-business-layer-and-refuse-with-a-typed-rate-limited-result.md): exports are limited in the business layer and refused with a typed result.
- [ADR-0006](adr/0006-forward-browser-error-reports-through-an-app-owned-tunnel-that-accepts-only-the-configured-dsn.md): an app-owned error-report tunnel that accepts only the configured DSN.
- [ADR-0007](adr/0007-purge-limit-records-daily-with-a-vercel-cron-job-behind-a-bearer-secret.md): a daily purge cron behind a bearer secret.
- [ADR-0008](adr/0008-fail-the-build-when-a-required-setting-is-missing.md): the build fails when a required setting is missing.

**How to use:** nothing changes for Freelancers on the happy path. The new user-facing messages are listed below. Server actions keep their contracts ([server-actions.md](contracts/server-actions.md)). The new HTTP surfaces are the error-report tunnel `POST /monitoring` and the cron endpoint `GET /api/cron/purge-limits` ([openapi.yaml](contracts/openapi.yaml)). New messages:

- the dashboard filter's 5-year notice;
- "sign-in by email temporarily unavailable";
- "you can export again at …".

**Operational notes:**

- **Migration:** adds `20261002120000_create_limit_event` (the `LimitEvent` table). Before the production release, apply it with `prisma migrate deploy` against the production URL. Rollback: run [`migrations/01_create_limit_event.down.sql`](migrations/01_create_limit_event.down.sql) by hand. Prisma has no down step.
- **New required settings** (the build fails without them; set them in Vercel for both production and preview): `CRON_SECRET`, `LIMIT_KEY_SECRET` and `NEXT_PUBLIC_SENTRY_DSN`. The mail and Google settings were already needed and are now enforced at build time.
- **Optional setting:** `SIGNIN_RESPONSE_FLOOR_MS`, clamped to 300–1200. When unset it defaults to 1000. Measure it on the preview, as described in [ship-notes](ship-notes.md) checklist item 7.
- **Cron:** `vercel.json` schedules `/api/cron/purge-limits` daily at 03:17 UTC.
- **Release gates:** the [ship-notes](ship-notes.md) preview checklist has two kinds of blocking items. Items 1–5 (F-31) are the preview checks for CSP, real Google sign-in, real-mailbox sign-in, PDF and Sentry. Item 8 (TD-3) is the read-only production check for non-ASCII addresses. All of them must pass before production.
- **Rollback:** revert the deploy. The `LimitEvent` table can stay, because nothing older reads it. Drop it with the down script only if you are abandoning the feature.

**Acceptance criteria delivered:** AC-01 to AC-27, including AC-07b. AC-02 and AC-20 are verified locally on the production build. Their preview runs are on the ship-notes checklist.
