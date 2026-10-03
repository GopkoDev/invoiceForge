# Second re-review — security-patch — 2026-10-03

**Gate result: CHANGES REQUESTED**

Follows [review-2026-10-03-rereview.md](review-2026-10-03-rereview.md). That review returned R-01 – R-17 and follow-up tasks T31–T37.

## Scope

- **Changed surface:** `701cf03..HEAD` (`f0e77d0`) on `security-patch`, covering T31–T37. That is 7 commits, 44 files, 2 280 insertions and 344 deletions.
- **Cross-cutting pass:** the whole feature diff `4cba009..HEAD`.
- **Baseline read:**
  - `spec.md` §4/§5/§6/§8 and `sad.md` §6/§11
  - `data-model.md`, `contracts/openapi.yaml` and `contracts/server-actions.md`
  - `adr/0001`–`0008`
  - `ux-flows.md`, `screens.md`, `test-plan.md`, `tasks.json` and `ship-notes.md`
- **Reviewers:** three clean-context `sdd:reviewer` passes, all on opus:
  - A: T31, T32 and T35. Session survival, the check-unavailable page and the anonymous-action shapes.
  - B: T33 and T34. Sign-in limiter fail-closed behaviour, the database-down path, TLS tagging, the response floor and the SMTP pool.
  - C: T36 and T37. The env.example rule, the Node pin and contract drift, plus the whole-chain US/AC re-trace and the gate commands.
- **Orchestrator re-checks:** S-01 and S-02 were re-checked against the code, and both hold.
  - S-01: in Node, `new URL('/.//evil.com', origin).pathname` returns `//evil.com`.
  - S-02: in nodemailer 10.0.13, `smtp-pool/index.js` `close()` removes only *available* connections. A message that is already being sent goes on and is delivered.

### Gates run during review

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors. 6 warnings, all in files this feature does not touch. |
| `pnpm tsc --noEmit` | clean |
| `pnpm test:unit` | 1016/1016 tests in 123 files |
| `pnpm test:integration` (testcontainers, `DATABASE_URL` unset) | 63 files. 502 passed, 32 skipped as container/env placeholders. |
| Scoped re-runs | reviewer A's unit files: 109/109. Reviewer B's email-provider and login-actions integration files: 59/59. |
| `pnpm audit --prod --audit-level=high` | no known vulnerabilities, exit 0 |
| `pnpm test:e2e` | Not run. `playwright --list` shows 30 tests, 13 of them CSP, which matches ship-notes. |

**Security sweep:**
- No test-only hooks were added to production code.
- No new direct dependencies.
- Error tags take only fixed values.
- No address, host or SMTP reply text reaches Sentry.
- Open item: the open redirect in the "Try again" link (S-01).

## Status of the earlier findings

| Status | Findings |
|---|---|
| Resolved | R-01, R-02, R-03, R-04, R-05, R-07, R-08, R-09, R-11, R-12, R-13, R-14, R-15, R-16, R-17 |
| Partial | R-06 (→ S-06), R-10 (→ S-02) |
| Still carried to ship | F-31 is the preview gates for AC-02 and AC-20, now marked **Blocking** in ship-notes items 1–5. TD-3 is ship-notes item 8. |

## End-to-end trace summary

- Every story from US-01 to US-09 has at least one AC and a sad §6 flow (`sad.md:584-594`).
- All 28 ACs (AC-01 … AC-27, plus AC-07b) are in `tasks.json`.
- Every AC has at least one test that tags it.
- Each UI AC reaches both ux-flows and screens.
- `spec.md` has no `added-by-fix` ACs.
- The AC-04 amendment is consistent across spec, screens (SCR-05 "check unavailable"), ux-flows A8, sad flow 2 and the code. test-plan was not updated (S-08).

| AC | Gap | Finding(s) |
|---|---|---|
| AC-04 | Open redirect in the "Try again" link. Auth.js `/api/auth/session` still clears the cookie on a direct visit. test-plan has no row for the check-unavailable branch. | S-01, S-04, S-08 |
| AC-11, AC-12 | A send that times out mid-flight is still delivered after its reservation is released. Closing the pool fails other Visitors' queued sends. | S-02, S-03 |
| AC-18 | The `/login` getCustomers e2e cannot fail on a missing action guard. | S-05 |
| AC-26 | The forward scan misses settings read from an injected record. | S-06 |
| AC-15 | The `AdapterError` branch is not reported to Sentry. The direct endpoint behaves differently from the action. | S-07 |
| AC-02, AC-20 | The preview gates are carried to ship and are now Blocking. | F-31 |
| AC-17 | TD-3 waits on the owner's production check. This is by design. | ship-notes item 8 |

## Findings

All verdicts were confirmed by the owner on 2026-10-03, and every one is **Fix now**.

### Stage 1 — AC compliance

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| S-02 | Low (keeps R-10 open) | On `SEND_TIMEOUT`, `abandonTransport()` calls the pool's `close()`, which closes only available connections. A message already in progress on a slow but live connection is delivered, and then its SENT reservation is deleted. The delivered link is never counted, so the address cap can be passed while SMTP is slow. If the timeout fires while `makeTransport()` is still pending, nothing is closed at all. The test server's stall drops the connection instead of delivering slowly, so the test covers only the easy case. The docs say "only an accepted send counts". Reproduced with a 600 ms DATA reply and `close()` at 300 ms: delivered 1. | lib/auth/email-provider.ts:484-489,498-503; tests/support/smtp-server.ts:72-75; contracts/server-actions.md:53; data-model.md:98 | Fix now (T39). Treat a timeout as an unknown outcome: keep the reservation and do not close the pool. |
| S-05 | Low | `getCustomers` is not in the `/login` worker. The Next-Action shape is forwarded to a `/customers` worker and stopped by the proxy's 401. The form shape fails with "Failed to find Server Action". The action body never runs, and the asserts are only `status < 500` and "name absent". The test passes with or without the guard. | tests/e2e/route-sweep.spec.ts:385-420 | Fix now (T40) |
| S-06 | Low (R-06 remainder) | `envReadsIn` sees only `process.env.X` and `process.env['X']`. `responseFloorMs(env = process.env)` reads `env.SIGNIN_RESPONSE_FLOOR_MS`, and the scan never sees it. A new `env.FOO` read would pass the forward rule. | tests/unit/lib/env/required-settings.test.ts:28-34; lib/auth/email-provider.ts:235-237 | Fix now (T41) |

### Stage 2 — quality, security and contract fidelity

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| S-01 | Medium | Open redirect. `safeReturnPath` checks for `//` on the raw input but returns the normalised `url.pathname`. `/.//evil.com`, `/%2e%2e//evil.com` and the Referer `https://<origin>/.//evil.com` all come back as `//evil.com`. So `/api/auth/clear-session?next=/.//evil.com` renders "Try again" with `href="//evil.com"`. The route and screens.md promise "never an open redirect". `return-path.ts` has no unit test of its own. | lib/helpers/return-path.ts:20,32; app/api/auth/clear-session/route.ts:57-66; tests/unit/api/clear-session.test.ts:280-294 | Fix now (T38) |
| S-03 | Low | One timeout closes the shared pool and rejects every queued message from other Visitors with `EMAIL_SEND_FAILED`. The test asserts this as expected. | lib/auth/email-provider.ts:484-489; tests/integration/auth/email-provider.test.ts:949 | Fix now (T39). This goes away with the S-02 fix. |
| S-04 | Low | Auth.js `GET /api/auth/session` still sends `sessionStore.clean()` on an undecodable token or a throwing session callback. A direct top-level visit, including a crafted link, ends the session while the check is failing. The no-client-session scan misses `instrumentation-client.ts`, `config/` and `constants/`. | app/api/auth/[...nextauth]/route.ts:1-2; tests/unit/no-client-session-fetch.test.ts:12 | Fix now (T40) |
| S-07 | Low | The `AdapterError` branch in login-actions, now reached only when `createVerificationToken` fails, returns the AC-15 message without `captureException`. The direct `POST /api/auth/signin/nodemailer` still redirects to `error=Configuration`, and openapi does not document that. | lib/actions/login-actions.ts:59-61; contracts/openapi.yaml | Fix now (T41) |
| S-08 | Low | test-plan has no row for the amended AC-04 check-unavailable branch. The tests exist. | test-plan.md:37-40; spec.md:144 | Fix now (T42) |
| S-09 | Low | sad flow 8 says the 413 fires "before anything is read". A chunked body is read up to 1 MiB first. openapi has it right. | sad.md:507; app/monitoring/route.ts:31-43 | Fix now (T42) |
| S-10 | Low | The ship-notes gate row says the genuine-session sweep "passes". In the recorded full run it timed out at 240 s, and it passed only when run alone. | ship-notes.md:13,15-19; tests/e2e/route-sweep.spec.ts:488 | Fix now (T42) |
| S-11 | Low | sad §11 and env.example describe the floor as "max 1200". The code and sad.md:325 say 300–1200. | sad.md:723; env.example:34; lib/auth/email-provider.ts:240 | Fix now (T42) |

## Follow-up tasks

Each task is appended to `tasks.json` with `source: review-2026-10-03-rereview-2` and added to `tasks/tracker.md`.

| Task | Findings | ACs |
|---|---|---|
| T38 | S-01 | AC-04 |
| T39 | S-02, S-03 (closes R-10) | AC-11, AC-12 |
| T40 | S-04, S-05 | AC-04, AC-18 |
| T41 | S-06 (closes R-06), S-07 | AC-15, AC-26 |
| T42 | S-08, S-09, S-10, S-11 | AC-02, AC-04, AC-12, AC-22 |

## Next

1. Run `/sdd:implement security-patch` for T38–T42.
2. Re-review the changed surface.

The gate stays **CHANGES REQUESTED** until S-01 and S-02 are fixed. F-31 and TD-3 are still closed at ship.
