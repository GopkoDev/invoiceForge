# Re-review — security-patch — 2026-10-03

**Gate result: CHANGES REQUESTED**

Follow-up to [review-2026-10-03.md](review-2026-10-03.md), which returned F-01 – F-31 and follow-up tasks T21–T30.

## Scope

- **Changed surface:** `ad462a7..HEAD` on `security-patch` (T21–T30). That is 14 commits, 71 files, 3 111 insertions and 430 deletions.
- **Cross-cutting pass:** the whole feature diff `4cba009..HEAD`.
- **Baseline read:** `spec.md` §4/§5/§6/§8, `sad.md` §6/§11/§12, `data-model.md`, `contracts/openapi.yaml`, `contracts/server-actions.md`, `adr/0001`–`0008`, `ux-flows.md`, `screens.md`, `test-plan.md`, `tasks.json`, `ship-notes.md`.
- **Reviewers:** three clean-context `sdd:reviewer` passes, all on opus:
  - A: T21, T22, T23, T28, T29. Session survival, request boundary, avatar, loader test, export dialog.
  - B: T26, T27. Sign-in limiter resilience, Google path, SMTP observability.
  - C: T24, T25, T30 and F-31, plus the whole-chain US/AC re-trace, contract drift, a security sweep and the gate commands.
- **Orchestrator re-checks:** R-01 and R-02 were re-checked against the code, and both hold:
  - R-01: `app/layout.tsx:107` and `@auth/core` `lib/actions/session.js` (the `catch` branch calls `sessionStore.clean()`).
  - R-02: `lib/auth/email-provider.ts:249-254`.

### Gates run during review

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors, 6 warnings, all in files this feature does not touch |
| `pnpm tsc --noEmit` | clean |
| `pnpm test:unit` | 969/969 tests in 121 files |
| `pnpm test:integration` (testcontainers) | 63 files, 488 passed, 32 skipped as container/env placeholders |
| `pnpm test:e2e` | 27/27 |
| `pnpm audit --prod` and `pnpm audit --prod --audit-level=high` | no known vulnerabilities, exit 0 |
| `pnpm audit` (full graph) | 0 critical, 41 high, 50 moderate, 7 low; matches ship-notes |

**Security sweep of the follow-up:** clean.
- No test-only hooks were added to production code. The AC-04/AC-06 e2e forces a failed check with a second server that uses a different `AUTH_SECRET`.
- The TLS fixture keys are used only by tests.
- No new direct dependencies.

## Status of the first review's findings

| Status | Findings |
|---|---|
| Resolved | F-02, F-04, F-06, F-07, F-08, F-09, F-10, F-13, F-14, F-15, F-16, F-17, F-18, F-19, F-20, F-22, F-24, F-25, F-26, F-27, F-28, F-29, F-30 |
| Partial | F-01 and F-03 (→ R-01), F-05 (→ R-05), F-11 (→ R-06), F-12 (→ R-13), F-21 (→ R-09, R-10), F-23 (→ R-08) |
| Still carried to ship | F-31: the preview gates for AC-02 and AC-20. R-17 marks them as blocking items. |

## End-to-end trace summary

- `spec.md`, `test-plan.md`, the ADRs and the contracts have not changed since `ad462a7`. `sad.md` §6 flows 1 and 10 were amended, and no flow was removed.
- Every story from US-01 to US-09 still has at least one AC and a §6 flow.
- Every AC that the first review marked clean still reaches code and a test, which unit, integration and e2e all exercise.
- `tasks.json`: T21–T30 carry `source: review-2026-10-03`, and their `acs` match.

| AC | Gap | Finding(s) |
|---|---|---|
| AC-04 | Two gaps. Auth.js `/api/auth/session` still ends the session on a failed check. When the Node-side check fails, the user sees an undesigned plain-text 503. | R-01, R-04 |
| AC-13, AC-15 | The source limit lets requests through when the store is unavailable. When the whole database is down, the AC-15 message is not shown. | R-02, R-03 |
| AC-18 | The new request shapes are not sent to public pages. | R-05 |
| AC-26 | The reverse env.example rule is untested. | R-06 |
| AC-11, AC-22 | The contracts and data-model disagree with the code. | R-07 |
| AC-17 | TD-3 waits on the owner's production check. This is by design: ship-notes item 8 blocks merge on it. | — |
| AC-02, AC-20 | The preview gates are carried to ship. | F-31, R-16, R-17 |

## Findings

All verdicts were confirmed by the owner on 2026-10-03. Each finding is handed to `implement` as the follow-up task in the last column.

### Stage 1 — AC compliance

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| R-01 | High | `SessionProvider` in the root layout makes next-auth/react fetch `GET /api/auth/session` on every mount and every `visibilitychange`. When that action cannot verify the session (an undecodable token, or the session callback's Prisma lookup throws), its `catch` sends `sessionStore.clean()`. The proxy's `withoutSessionCookieExpiry` does not filter route-handler responses. So a DB blip or a rotated secret still signs the Freelancer out as soon as a page hydrates. Nothing calls `useSession`. Includes the F-03 remainder: the e2e never loads a page on the failing server with the genuine cookie. | app/layout.tsx:107; components/session-provider.tsx:6; app/api/auth/[...nextauth]/route.ts; @auth/core lib/actions/session.js:56-58; tests/e2e/route-sweep.spec.ts:490-527 | Fix now (T31) |
| R-02 | Medium | Callback `admitSignInRequest` returns `true` when `admitSource` throws `LimitStoreUnavailable`, so the source limit lets the request through. Under a one-source flood across many addresses, requests that time out queuing on the shared `SIGNIN_SOURCE` lock are admitted. Their uncontended address locks then send the link. This breaks AC-13 and the "fail-closed" rule in spec §6 and ADR-0002. It also makes sad §11's token-bound statement false under load. No test covers the branch. | lib/auth/email-provider.ts:249-254; sad.md:710 | Fix now (T33) |
| R-03 | Medium | When the whole database is down, `adapter.getUserByEmail` fails before `callbacks.signIn`. Auth.js wraps the failure as `AdapterError`, and `login-actions` rethrows it, so the Visitor gets an unhandled error or `error=Configuration` instead of the AC-15 message. This predates T26. | @auth/core lib/actions/signin/send-token.js; lib/actions/login-actions.ts:52; components/auth/login-form.tsx:42 | Fix now (T33) |
| R-04 | Medium | When the Node-side check fails, `clear-session` returns a bare `text/plain` 503: no styling and no retry link. The 503 itself is right, because a redirect would loop. But AC-04, the sad §6 US-02 flow, ux-flows A3/A4 and screens.md still describe a redirect to SCR-01, and the state is not a designed screen. | app/api/auth/clear-session/route.ts:37-38,49-61; screens.md:108,131; ux-flows.md:66,162 | Fix now (T32) |
| R-05 | Medium | The AC-18 shapes T22 added post only to private pages (`/dashboard`, `/customers`): the no-marker JSON and the form-encoded `$ACTION_ID_`. Test-plan row 70 asks for a POST to a *public* page, which is the hole ADR-0003 closed. Two `/login` checks are weak: the form-encoded case only asserts the absence of `"success":true`, and the action is picked by manifest order. | tests/e2e/route-sweep.spec.ts:252-334; test-plan.md:70 | Fix now (T35) |
| R-06 | Medium | F-11 remainder. The test checks only the forward rule: every `process.env.X` read appears in env.example. The reverse is never checked: that each env.example name is a setting the app reads. Adding `GOOGLE_CLIENT_ID=` back passes every test. The scan also misses `process.env['X']` reads and injected-record reads. | tests/unit/lib/env/required-settings.test.ts:46-89; test-plan.md:88 | Fix now (T36) |

### Stage 2 — quality and contract fidelity

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| R-07 | Medium | Contracts and data-model have drifted from the code and sad.md in two places. The `/monitoring` contract does not list 413 or 429, nor the `Retry-After` and `X-Sentry-Rate-Limits` headers that pass through. openapi, data-model and server-actions still describe "SENT recorded after SMTP accepted", but SENT is now reserved before the send and released if it fails. They also never mention the daily purge of expired `VerificationToken` rows. | contracts/openapi.yaml:98-99,213-226,290-301; data-model.md:98,125,179-184; contracts/server-actions.md:53 | Fix now (T37) |
| R-08 | Medium-low | nodemailer 10 replaces TLS error codes with `ESOCKET`/`CONN`, so a certificate failure is tagged the same as a refused connection. The test throws `ERR_TLS_CERT_ALTNAME_INVALID` from a fake transport, a shape production never produces. The F-23 / AC-16 goal is therefore unmet. | lib/auth/email-provider.ts:71-92; tests/integration/auth/email-provider.test.ts | Fix now (T34) |
| R-09 | Low | Two timing gaps. `SIGNIN_RESPONSE_FLOOR_MS=0` passes validation and turns the floor off. The source-limited floor starts in the callback, but the sent floor starts after the callback's transaction, so the two outcomes differ in timing. No timing test compares source-limited with sent. | lib/auth/email-provider.ts:145-147,237,308 | Fix now (T34) |
| R-10 | Low | Two pool gaps. `socketTimeout: 10_000` is also the pool's idle timeout, so pooled connections rarely survive, and sad.md:311 overstates the benefit. A send abandoned by `withTimeout` stays in the pool queue (requeues up to 5). It can be delivered after its reservation is released, which leaves a sent mail uncounted. | lib/get-email-server-config.ts:29; lib/auth/email-provider.ts:174-179,296-301 | Fix now (T34) |
| R-11 | Low | A request with no platform IP skips the source limit, and every such request sends one Sentry `captureMessage` with no rate limit. Only sad records this exception. Spec §6 and ADR-0002 say fail-closed. | lib/auth/email-provider.ts:239-247; sad.md:248,706 | Fix now (T33) |
| R-12 | Low | The Google at-limit test sends no `x-real-ip`. A regression that applied the source limit to OAuth would therefore take the missing-IP path and still pass. | tests/integration/auth/email-provider.test.ts (`googleSignIn`) | Fix now (T33) |
| R-13 | Low | F-12 remainder. `engines.node ">=22.18"` lets Vercel pick Node 24, while CI pins `node-version: 22` and sad.md:36 says Node 22. There is no `.nvmrc`. | package.json:6-8; .github/workflows/test.yml:20,39 | Fix now (T36) |
| R-14 | Low | Guard-scan gaps. It walks only `app/`, `lib/` and `components/`, reads only `.ts` and `.tsx`, and matches the guard by name rather than by the module it is imported from. | tests/unit/action-session-guard-scan.test.ts:11,29-31,90-91 | Fix now (T35) |
| R-15 | Low | The loader test re-implements the page's `period` glue instead of driving it, and it skips `getDashboardSenderAccounts`. | tests/integration/services/dashboard/period-cap-loader.test.ts:128-136; app/(protected)/dashboard/page.tsx:84,146 | Fix now (T37) |
| R-16 | Low | The preview "error reaches Sentry" check accepts the first POST to `/monitoring` of any kind: session, replay, trace or log envelopes. | tests/e2e/csp-gate.spec.ts:33-41 | Fix now (T37) |
| R-17 | Low | ship-notes still says the e2e suite has 17 tests (it now has 27). Preview checklist items 1–5, the F-31 gates, are not labelled **Blocking** the way item 8 is. | ship-notes.md:11-16,102-129 | Fix now (T37) |

## Follow-up tasks

Each task is appended to `tasks.json` with `source: review-2026-10-03-rereview` and added to `tasks/tracker.md`.

| Task | Findings | ACs |
|---|---|---|
| T31 | R-01 (+ F-03 remainder) | AC-04 |
| T32 | R-04 | AC-04 |
| T33 | R-02, R-03, R-11, R-12 | AC-13, AC-14, AC-15 |
| T34 | R-08, R-09, R-10 | AC-12, AC-13, AC-16 |
| T35 | R-05, R-14 | AC-18 |
| T36 | R-06, R-13 | AC-26 |
| T37 | R-07, R-15, R-16, R-17 | AC-07, AC-08, AC-11, AC-20, AC-22 |

## Next

1. Run `/sdd:implement security-patch` for T31–T37.
2. Re-review the changed surface.

The gate stays **CHANGES REQUESTED** until R-01 – R-06 are fixed. F-31 and TD-3 (ship-notes item 8) are still closed at ship.
