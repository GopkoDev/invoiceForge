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
| T21 | Keep the session when the session check fails: clear cookies only on a confirmed missing account, and add the AC-04/AC-06 e2e cases | ports | Dmytro Hopko | M | T4, T20 | done |
| T22 | Scan every 'use server' module for the session guard and cover all anonymous-mutation request shapes in e2e | tests | Dmytro Hopko | S | T5 | done |
| T23 | Never load a legacy non-web profile image in the navigation avatar | ui | Dmytro Hopko | S | T17 | done |
| T24 | Clear the remaining production advisory, enforce the audit in CI and harden the required-settings build check | wiring | Dmytro Hopko | M | T10, T20 | done |
| T25 | Run the CSP gate over the full page sweep and on preview, and pass Sentry rate limits through the tunnel | tests | Dmytro Hopko | M | T18, T20 | done |
| T26 | Make the sign-in limiter resilient: send outside the lock, admit sources before token creation, fix shared buckets and purge contention | app | Dmytro Hopko | M | T8, T11, T15 | done |
| T27 | Prove Google sign-in ignores email limits end to end, tag SMTP failure causes and test the TLS host-name check | tests | Dmytro Hopko | S | T11 | done |
| T28 | Test the five-year period rule through the dashboard loader | tests | Dmytro Hopko | S | T6 | done |
| T29 | Show the export-limit alert inside the delete-account dialog | ui | Dmytro Hopko | S | T14 | done |
| T30 | Close the TD-3 gate in the ship checklist, fix the source-key docs, task statuses and new lint warnings | docs | Dmytro Hopko | S | T11 | done |
| T31 | Stop Auth.js's session endpoint from ending the session on a failed check, and prove it with a real-cookie e2e | ports | Dmytro Hopko | M | T21 | todo |
| T32 | Render a designed check-unavailable response from clear-session and amend AC-04, sad §6, ux-flows and screens | ui | Dmytro Hopko | S | T21 | todo |
| T33 | Fail the sign-in-email path closed when limits or the database cannot be checked, and tighten the Google test | app | Dmytro Hopko | M | T26, T27 | todo |
| T34 | Tag real TLS failures, clamp the response floor from below with equal start points, and stop abandoned pooled sends | app | Dmytro Hopko | M | T26, T27 | todo |
| T35 | Send every anonymous-action shape to public pages in e2e and close the guard-scan gaps | tests | Dmytro Hopko | S | T22 | todo |
| T36 | Test the reverse env.example rule and pin the Node major across engines, CI and the SAD | wiring | Dmytro Hopko | S | T24 | todo |
| T37 | Align contracts and data-model with the code, tighten the loader and preview Sentry tests, refresh ship-notes | docs | Dmytro Hopko | S | T25, T26, T28 | todo |

**Total:** 37 tasks (T21–T30 from review-2026-10-03, T31–T37 from review-2026-10-03-rereview), ~15 person-days (S ≈ 0.25–0.5 d, M ≈ 0.5–1 d, L ≈ 1 d). That fits sad.md §2's one-sprint budget.
