---
id: T10
title: "Fail the build on a missing required setting and send mail only over verified TLS"
layer: "wiring"
deps: ["T1"]
blocks: ["T11", "T15"]
acs: ["AC-16", "AC-26"]
files_hint: ["lib/env/required-settings.ts", "scripts/check-required-settings.ts", "package.json", "env.example", "lib/get-email-server-config.ts", "tests/unit/lib/env/", "tests/unit/lib/get-email-server-config.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "done"
---

# T10 — Fail the build on a missing required setting and send mail only over verified TLS

## Place in the sequence

- **Blocked by:** T1 — Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change · **Blocks:** T11 — email provider hooks (uses the TLS transport and the settings list), T15 — purge cron (`CRON_SECRET` is in the list) · **Wave:** 2 — independent of the DB work; needs nodemailer 10.x from T1.
- **Lane:** shares `package.json` with T1 and T2 (serialized: the `build` script edit must land after the dependency upgrades).

## Why (user story)

> **As a** Visitor signing in by email
> **I want** my Sign-in link sent only over an encrypted mail connection, and only to a well-formed address
> **So that** the link and the mail account's credentials cannot be read or redirected in transit
>
> — `spec.md §4, US-06, verbatim` · full text: [spec.md](../spec.md)

This task delivers the transport half of US-06 (TLS-only SMTP config) and the deploy-time guarantee that the mail settings exist at all.

## Inlined context

> **Missing mail settings stay a configuration error.** There is no "email sign-in disabled" mode. The CI build that used to fail without them no longer runs. Every deploy environment carries the settings, preview environments included, and a missing setting stops the deploy before it takes traffic (AC-26).
>
> — `spec.md §1, Decisions, verbatim` · full text: [spec.md](../spec.md)

> **Chosen:** Option 1 (build-time check). One list of required settings lives in `lib/env/required-settings.ts`: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, the four `EMAIL_SERVER_*`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET` and the limit-digest key. A script run as the first step of `pnpm build` fails and prints every missing name. Runtime code reads the same list, so `auth.ts` has no "undefined" branch. A unit test asserts that the list and `env.example` match. […] `env.example` is updated as part of this change (`AUTH_GOOGLE_*`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, the digest key).
>
> — `adr/0008-fail-the-build-when-a-required-setting-is-missing.md, Considered options 1 + Decision outcome + Neutral, abridged` · full text: [ADR-0008](../adr/0008-fail-the-build-when-a-required-setting-is-missing.md)

> Today `env.example` still says `GOOGLE_CLIENT_*` where Auth.js reads `AUTH_GOOGLE_*`, and it lacks `NEXT_PUBLIC_SENTRY_DSN`. `getEmailServerConfig()` returns `undefined` when any `EMAIL_*` variable is missing.
>
> — `adr/0008, Context, abridged` · full text: [ADR-0008](../adr/0008-fail-the-build-when-a-required-setting-is-missing.md)

> **SMTP transport:** `secure: true` on port 465, `requireTLS: true` on every other port. The certificate is verified against the configured host (`rejectUnauthorized` stays on, `servername` = host). Nothing is ever sent in clear text (AC-16).
>
> — `sad.md §8, SMTP transport row, verbatim` · full text: [sad.md](../sad.md)

> The limit-digest key is `LIMIT_KEY_SECRET` (HMAC-SHA256 for address and source keys).
>
> — `sad.md §8, Limit keys row` + `tasks stage decision (2026-10-02), TD-1`, abridged · full text: [sad.md](../sad.md)

> **Hard rule (NFR):** every environment variable the app reads is listed in the example env file under the exact name the app reads.
>
> — `spec.md §6, NFR row "Configuration documentation", abridged` · full text: [spec.md](../spec.md)

> **Risk accepted:** `next build` checks (required settings, ADR-0008) run only in the Vercel preview deploy, not in CI. Every PR gets a preview deploy, and merging requires it to be green.
>
> — `sad.md §11, risk row 8, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (The `auth.ts` wiring that consumes this config, and the user-facing "could not send" outcome, are T11 / T12.)

## Acceptance criteria

### AC-16 — error

> **Given** the mail server does not offer an encrypted connection, or offers one whose certificate is not valid for the mail server's name
> **When** the app tries to send a Sign-in link
> **Then** the email is not sent unencrypted, the Visitor sees the generic "could not send, try again" message, and the failure is reported to error tracking
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

(This task owns "not sent unencrypted"; the message and the Sentry report are asserted in T11/T12.)

### AC-26 — error

> **Given** a deploy environment, production or preview, that lacks a mail setting the app needs
> **When** it is deployed
> **Then** the deploy fails before it takes any traffic and names the missing setting, so no environment runs with email sign-in or Google sign-in broken
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `lib/env/required-settings.ts`: export `REQUIRED_SETTINGS` (the ADR-0008 list incl. `CRON_SECRET`, `LIMIT_KEY_SECRET`), `missingSettings(env)` and `requireSetting(name)` (throws naming the setting). No `server-only` import so the script can use it.
- [ ] `scripts/check-required-settings.ts`: prints every missing name and exits non-zero; prepend to `package.json` `build` (today `"prisma generate && next build"`). Leave `dev` untouched.
- [ ] `env.example`: rename `GOOGLE_CLIENT_*` → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`; add `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, `LIMIT_KEY_SECRET` with placeholder values and one-line comments; keep every other variable the app reads.
- [ ] `tests/unit/lib/env/required-settings.test.ts`: every `REQUIRED_SETTINGS` name appears in `env.example`; `missingSettings` lists all missing names; the script exits non-zero with the names in output.
- [ ] `lib/get-email-server-config.ts`: read through `requireSetting` (no `undefined` return); return nodemailer 10 transport options: `secure: port === 465`, `requireTLS: port !== 465`, `tls: { rejectUnauthorized: true, servername: host }`.
- [ ] `tests/unit/lib/get-email-server-config.test.ts`: options for 465 and 587; integration-style test with a local SMTP server using `tests/support/fixtures/tls` (no STARTTLS → send rejects before DATA; cert for another name → rejects).
- [ ] Ask the user to add `CRON_SECRET` and `LIMIT_KEY_SECRET` to Vercel production and preview settings before the first preview build of this branch (agent never edits remote settings).

## Edge cases

| Case | Behaviour |
|---|---|
| two settings missing | build fails, both names printed |
| `EMAIL_SERVER_PORT` = 465 | implicit TLS (`secure: true`) |
| port 587, server without STARTTLS | send refused, nothing sent in clear text |
| valid cert, wrong host name | send refused (`servername` = host) |
| self-signed cert | send refused (`rejectUnauthorized` stays on) |
| `pnpm dev` with incomplete `.env` | unaffected (only `build` runs the check) |

## Definition of Done

- [ ] `pnpm build` with one required setting unset exits non-zero and names it (unit test of the script)
- [ ] the list ↔ `env.example` test passes
- [ ] transport tests show no clear-text send without TLS or with a wrong-host certificate
- [ ] user confirmed the new settings exist in Vercel production and preview
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
