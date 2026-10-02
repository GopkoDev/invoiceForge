# Tracker — security-patch

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change | wiring | Dmytro Hopko | M | — | done |
| T2 | Upgrade Prisma to the latest 7.x and remove @prisma/extension-accelerate | wiring | Dmytro Hopko | S | T1 | done |
| T3 | Promote the LimitEvent migration with its Prisma model, factory and test cleanup | migration | Dmytro Hopko | S | T2 | done |
| T4 | Make "signed in" mean a verified session in the proxy, requireSession and getAuthenticatedUser | ports | Dmytro Hopko | M | T1 | done |
| T5 | Refuse anonymous non-GET requests in the proxy and fail CI on any server action without a session guard | ports | Dmytro Hopko | M | T4 | done |
| T6 | Add the shared five-year Dashboard period rule and apply it in the link reader and the business layer | domain | Dmytro Hopko | M | T1 | done |
| T7 | Show the five-year notice in the dashboard filter and refuse to apply an over-long range | ui | Dmytro Hopko | S | T6 | done |
| T8 | Build the LimitEvent limit store with per-key advisory locks, limit keys and the opportunistic purge | infra | Dmytro Hopko | M | T3 | done |
| T9 | Record address refusals per UTC hour and raise the targeted-lockout alert | infra | Dmytro Hopko | S | T8 | done |
| T10 | Fail the build on a missing required setting and send mail only over verified TLS | wiring | Dmytro Hopko | M | T1 | done |
| T11 | Enforce the address rule, sign-in-email limits, response floor and TLS-only send in the Auth.js email provider hooks | app | Dmytro Hopko | L | T8, T9, T10 | done |
| T12 | Map sign-in provider outcomes to the fixed messages on the sign-in, check-inbox and error pages | ui | Dmytro Hopko | M | T11 | done |
| T13 | Limit data exports per Freelancer in the business layer and return RATE_LIMITED with a retry time | app | Dmytro Hopko | M | T8 | done |
| T14 | Show "you can export again at …" as an inline alert on the privacy settings screen | ui | Dmytro Hopko | S | T13 | done |
| T15 | Add the daily limit-record purge job behind the Vercel Cron secret | ports | Dmytro Hopko | S | T8, T10 | done |
| T16 | Accept only http(s) web addresses for website and image fields, in forms and the business layer | domain | Dmytro Hopko | S | T1 | done |
| T17 | Render legacy non-web addresses as plain text and never load them as images | ui | Dmytro Hopko | M | T16 | done |
| T18 | Replace the open Sentry rewrite with an app-owned tunnel that forwards only the configured DSN | ports | Dmytro Hopko | S | T1 | done |
| T19 | Serve the enforced content-security policy and transport headers from next.config.ts | wiring | Dmytro Hopko | S | T18 | done |
| T20 | Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit | tests | Dmytro Hopko | M | T2, T5, T7, T12, T14, T15, T17, T19 | done |

**Total:** 20 tasks, ~12 person-days (S ≈ 0.25–0.5 d, M ≈ 0.5–1 d, L ≈ 1 d). That fits sad.md §2's one-sprint budget.
