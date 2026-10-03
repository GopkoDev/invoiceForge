# Ship notes — security-patch (T20 release gate)

Measured on the release candidate on 2026-10-03 (pnpm 10.25.0, lockfile frozen). Nothing here was run
against production or a preview; those items are the user's checklist at the end.

## Release gate status

| Gate | Criterion | Measured | Status |
|---|---|---|---|
| Advisory audit, production packages (AC-01) | 0 critical, 0 high | 0 critical, 0 high, 1 moderate, 1 low | met |
| Local CSP gate, `tests/e2e/csp-gate.spec.ts` (AC-20) | zero policy violations | zero on every flow, including invoice PDF download and print | met (local) |
| Local genuine-session sweep, `tests/e2e/route-sweep.spec.ts` (AC-02, AC-05) | every private page opens directly | passes | met (local) |
| Database toolkit (AC-27) | latest 7.x, no accelerate extension | Prisma 7.10.0 (`prisma` and `@prisma/client`) | met |

Local e2e: `pnpm test:e2e` 17/17 passed in five consecutive runs on the production build. The preview
checklist at the end is still required before production.

## Advisory audit (AC-01)

Command: `pnpm audit --prod`. Target: 0 critical / 0 high. Baseline 2026-10-02: 6 critical, 75 high.

What closed the gap (commit `chore(security-patch): clear high production advisories for the release gate`):

- `shadcn` moved to `devDependencies`. It is a scaffolding CLI; the app only uses its build-time CSS import
  (`app/globals.css`), and devDependencies are installed for the build.
- `@sentry/nextjs` bumped within major 10 (^10.36.0 → ^10.76.0).
- `pnpm-workspace.yaml` overrides pin patched versions of transitive packages reached through the Sentry
  build plugins and the optional `prisma` CLI peer of `@prisma/client`: `browserslist`, `deepmerge-ts`,
  `fast-uri`, `lodash`, `mysql2`, `serialize-javascript`.
- T1 bumped `@auth/prisma-adapter` so the only `@auth/core` is the patched 0.41.3.

### Remaining production-graph advisories (not gate-failing)

| Package | Severity | Advisory | Path |
|---|---|---|---|
| `uuid` | moderate | GHSA-w5hq-g745-h8pq | direct dependency |
| `@babel/core` | low | GHSA-4x5r-pxfx-6jf8 | `@sentry/nextjs > @sentry/bundler-plugin-core` (build time) |

### Development-only advisories (40 high, listed, not gate-failing)

`pnpm audit` over everything: 0 critical, 40 high, 51 moderate, 8 low. Every high comes through a
`devDependency` that runs only on a developer machine, in CI or during the build, never in the server or
browser bundle, and never on untrusted input:

| Dev dependency | Packages carrying high advisories | Why unreachable in production |
|---|---|---|
| `shadcn` (CLI) | `hono`, `@hono/node-server`, `@modelcontextprotocol/sdk`, `path-to-regexp`, `minimatch`, `@isaacs/brace-expansion`, `picomatch` | Run by hand to scaffold components; its MCP/HTTP server is never started by the app. |
| `eslint`, `eslint-config-next` | `minimatch`, `brace-expansion`, `flatted`, `js-yaml`, `picomatch` | Lints this repository's own source only. |
| `@testcontainers/postgresql` | `minimatch`, `brace-expansion` | Integration tests only. |
| `@tailwindcss/postcss` | `postcss`, `nanoid` | Build-time CSS compilation of this repository's own stylesheets. |

## Database toolkit (AC-27)

- `prisma` 7.10.0 and `@prisma/client` 7.10.0, the latest 7.x at the time of writing (`8.0.0-rc` is a major
  release candidate and out of scope).
- `@prisma/extension-accelerate` is absent from `package.json` and the lockfile (pinned by
  `tests/unit/release-gate-t20.test.ts`).

## CSP gate (AC-20)

Run: `pnpm exec playwright test tests/e2e/csp-gate.spec.ts` on the local production build with the enforced
policy from `next.config.ts`. Zero violations on: Sign-in link sign-in, dashboard chart, invoice PDF preview,
download and print, client-side error through the tunnel (403 locally because no DSN is set), settings and
profile avatar, logo and customer-image previews, data export, legal pages.

Policy changes made during implement, approved by the user and recorded in `sad.md`:

- `script-src` gains `'wasm-unsafe-eval'`: the PDF layout engine (yoga-layout in `@react-pdf/renderer`)
  compiles WebAssembly. JS `eval()` stays blocked.
- `connect-src` gains `data:`: the same engine fetches its WebAssembly from a `data:` URL.
- The PDF fonts (Roboto) are served from `/fonts/roboto/` instead of cdnjs, so no third-party host enters
  the policy.
- Under `next dev` only, `script-src` also allows `'unsafe-eval'` and `https://va.vercel-scripts.com`
  (React dev tooling and the analytics debug scripts). Preview and production keep the exact policy.

## Preview checklist for the user (not run by the agent)

1. Run both specs against the preview: `BASE_URL=https://<preview> E2E_EXPECT_SENTRY=1 pnpm exec playwright test tests/e2e/csp-gate.spec.ts tests/e2e/route-sweep.spec.ts`.
   The seeded-data flows need the local throwaway database, so against a preview they skip; walk the same
   flows by hand with the browser console open. For the Sign-in link, set `E2E_SIGNIN_LINK_FILE=/some/path`
   and paste the link from your real mailbox into that file while the helper waits (120 s).
2. Sign in with Google on the preview with a real Google account (not automated).
3. Confirm the Sign-in link arrives in a real mailbox and opens every private page (AC-02).
4. Download and print an invoice PDF on the preview and confirm the browser console shows no CSP violation.
5. Throw a synthetic client error on the preview and confirm it reaches Sentry within 5 minutes, and that
   Sentry shows zero CSP reports for the run (AC-20).
6. Before deploying, set every required setting in Vercel (the build fails without them): `DATABASE_URL`,
   `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`,
   `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`, `LIMIT_KEY_SECRET`.
7. Measure the sign-in response floor on the preview (sad.md §6, §10 QG-2): send at least 50 Sign-in
   link requests to fresh addresses, read the p90 of the `auth.signin.email` spans with outcome `sent`,
   and set `SIGNIN_RESPONSE_FLOOR_MS` to it in Vercel (values above 1200 are clamped to 1200; unset means
   1000). Then send 50 more to fresh addresses and 50 to addresses already at their limit, and compare the
   `auth.signin.email` span medians by outcome in Sentry: `sent` and `limited` must differ by ≤ 150 ms.
   Repeat this comparison over the first 7 days after release.
8. Apply the `LimitEvent` migration to production with `prisma migrate deploy` against the production URL.
9. Only then release to production.
