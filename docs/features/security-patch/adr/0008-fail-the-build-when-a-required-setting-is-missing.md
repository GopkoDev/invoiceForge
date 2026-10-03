---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-02"
feature_size: "M"
ticket: "security-patch"
---

# 0008 — Fail the build when a required setting is missing

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Dmytro Hopko (with Claude during the design walk)

## Context

`getEmailServerConfig()` returns `undefined` when any `EMAIL_*` variable is missing. The Nodemailer provider then throws at module load, which also breaks Google sign-in (brief S5). The spec keeps a missing mail setting a configuration error, with no "email sign-in disabled" mode (§1, §3). AC-26 requires every deploy environment, production and preview, to fail before it takes any traffic and to name the missing setting. Spec §6 also requires every environment variable the app reads to be listed in the example env file under the exact name the app reads. Today `env.example` still says `GOOGLE_CLIENT_*` where Auth.js reads `AUTH_GOOGLE_*`, and it lacks `NEXT_PUBLIC_SENTRY_DSN`.

## Decision drivers

- AC-26: fail before traffic, name the setting, in every deploy environment.
- Spec §6 NFR: configuration documentation matches the names the app reads.
- §2: Vercel builds each PR as a preview deploy and does not promote a failed build. CI does not run `next build`.

## Considered options

1. **Build-time check.** One list of required settings lives in `lib/env/required-settings.ts`: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, the four `EMAIL_SERVER_*`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET` and the limit-digest key. A script run as the first step of `pnpm build` fails and prints every missing name. Runtime code reads the same list, so `auth.ts` has no "undefined" branch. A unit test asserts that the list and `env.example` match.
2. **Runtime check at start-up.** `instrumentation.ts` → `register()` throws with the missing names and reports to Sentry.

## Decision outcome

**Chosen:** Option 1. Vercel never promotes a failed build, so a deploy missing a setting never takes traffic, which is what AC-26 asks. Option 2 fails only after the deployment is live and receiving requests.

## Consequences

**Positive**
- A misconfigured preview or production deploy stops at build, with the missing names in the build log.
- One list drives the check, the runtime reads and the `env.example` test, so names cannot drift.

**Negative**
- A local `pnpm build` without a complete `.env` fails too (development with `pnpm dev` is unaffected).
- On Vercel, every listed setting must be available to the Build step, which is the default for environment variables.

**Neutral**
- `env.example` is updated as part of this change (`AUTH_GOOGLE_*`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, the digest key), and the test keeps it honest afterwards.

## Links

- Spec: [[../spec.md]] AC-26, §1 decisions, §3, §6
- SAD: [[../sad.md]] §7
- Related ADR: [[0007-purge-limit-records-daily-with-a-vercel-cron-job-behind-a-bearer-secret]]
