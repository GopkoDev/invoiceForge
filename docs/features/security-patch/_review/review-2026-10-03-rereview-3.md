# Third re-review — security-patch — 2026-10-03

**Gate result: CHANGES REQUESTED**

Follows [review-2026-10-03-rereview-2.md](review-2026-10-03-rereview-2.md). That review returned S-01 – S-11 and follow-up tasks T38–T42.

## Scope

- **Changed surface:** `f77f7ca..HEAD` (`a6fa599`) on `security-patch`, covering T38–T42. That is 6 commits, 22 files, 349 insertions and 73 deletions.
- **Cross-cutting pass:** the whole-chain US/AC trace over the feature diff `4cba009..HEAD`.
- **Baseline read:**
  - `spec.md` §4/§5/§8 and `sad.md` §6/§11
  - `data-model.md`, `contracts/openapi.yaml` and `contracts/server-actions.md`
  - `adr/`
  - `ux-flows.md`, `screens.md`, `test-plan.md`, `tasks.json` and `ship-notes.md`
- **Reviewers:** two clean-context `sdd:reviewer` passes, both on opus:
  - A: T38 and T40. The return path, the Auth.js session endpoint and the `/login` anonymous-action e2e.
  - B: T39, T41 and T42. The timeout reservation, the env scan, AdapterError reporting and the doc alignment. B also ran the whole-chain re-trace.
- **Orchestrator re-checks:** T-01, N-01, N-02, N-03 and N-05 were re-checked against the code and docs, and all five hold.
  - T-01: the wrapper compares `pathname === '/api/auth/session'`. `@auth/core` 0.41.3 `lib/utils/web.js:96` parses the action with `split("/").filter(Boolean)`.
  - N-01: `openapi.yaml:143-145` still says a timeout releases the reservation.
  - N-02: `server-actions.md:57` says the same.
  - N-03: `spec.md:190` says failed requests do not count.
  - N-05: `auth.ts:59` sets `pages.error = authRoutes.error`.

### Gates run during review

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors. 6 warnings, all in files this feature does not touch. |
| `pnpm tsc --noEmit` | clean |
| `pnpm test:unit` | 1039/1039 tests in 125 files |
| `pnpm test:integration` (testcontainers, `DATABASE_URL` unset) | 63 files. 503 passed, 32 skipped as container/env placeholders. |
| Scoped re-runs | Reviewer A's unit files: 51/51. Reviewer B's email-provider and login-actions integration files: 60/60. The T39 tests run 3 times on their own: all passed. |
| `pnpm audit --prod --audit-level=high` | no known vulnerabilities |
| `pnpm test:e2e` | Not run. The last recorded run predates T38–T40, and T40 changed `route-sweep.spec.ts`. The re-run is in T45. |

**Security sweep:**
- `safeReturnPath` was tested with adversarial inputs and a 400k-case random fuzz. None produced an off-site, protocol-relative or `/api` result.
- `captureException` on the AdapterError path carries no address, host or SMTP text.
- No new dependencies.
- No test-only hooks were added to production code.

## Status of the earlier findings

| Status | Findings |
|---|---|
| Resolved | S-01, S-03, S-05, S-06, S-08, S-09, S-10, S-11, R-06, R-10 |
| Resolved in code, docs partial | S-02 (→ N-01, N-02), S-07 (→ N-05) |
| Partial | S-04 (→ T-01) |
| Still carried to ship | F-31 is the preview gates for AC-02 and AC-20 (ship-notes items 1–5, **Blocking**). TD-3 is ship-notes item 8 (**Blocking**). |

Notes:
- **S-05** is resolved by narrowing what the test claims.
- The `/login` e2e can now fail if either proxy refusal is removed.
- It still cannot fail on a missing action guard alone. Its comment says so, and `tests/unit/action-session-guard-scan.test.ts` covers the guard.
- This matches the T40 DoD.

## End-to-end trace summary

- Every story from US-01 to US-09 has at least one AC and a sad §6 flow, or an explicit N/A for build-time ACs (`sad.md:584-594`).
- All 28 ACs (AC-01 … AC-27, plus AC-07b) are in `tasks.json`.
- Every AC has at least one test that tags it, and a test-plan row.
- `spec.md` has no `added-by-fix` ACs.
- AC-02, AC-03 and AC-19 reach ux-flows but not screens. They change behaviour on existing pages and add no new screen. Every other UI AC reaches both ux-flows and screens.

| AC | Gap | Finding(s) |
|---|---|---|
| AC-11 | The timeout counting rule is recorded in data-model, server-actions and sad, but not in the AC text or ADR-0002. The contract text still says a timeout releases the reservation. | N-03, N-01, N-02 |
| AC-04 | The session-endpoint strip matches only the exact path. test-plan has no row for it. | T-01, T-02 |
| AC-15 | openapi gives the wrong redirect path for the direct endpoint's AdapterError. | N-05 |
| AC-18 | The T40 assert change is not recorded, and e2e has not been re-run. | T-02 |
| AC-26 | The forward scan misses `?.` and destructuring reads. None exist today. | N-06 |
| AC-02, AC-20 | The preview gates are carried to ship and are **Blocking**. | F-31 |
| AC-17 | TD-3 waits on the owner's production check. This is by design. | ship-notes item 8 |

## Findings

All verdicts were confirmed by the owner on 2026-10-03, and every one is **Fix now**.

### Stage 1 — AC compliance

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| N-03 | Low | After T39, a timed-out send stays counted even when it truly failed. The Visitor still sees "could not send, try again". AC-11 and ADR-0002 say failed requests do not count. Five slow-SMTP timeouts in an hour therefore lock the address, and later requests get a silent "check your inbox" with no email. The trade-off was the owner's choice for S-02, but it is recorded only in data-model, server-actions and sad, not in the spec or ADR of record. | spec.md:190; adr/0002-…:24; lib/auth/email-provider.ts:509-513; lib/actions/login-actions.ts:58-59 | Fix now (T43). Amend AC-11, ADR-0002 Consequences and the sad §11 risk table. No code change. |

### Stage 2 — quality, security and contract fidelity

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| T-01 | Low (keeps S-04 open) | The wrapper strips the session-cookie expiry only when `pathname === '/api/auth/session'`. Auth.js drops empty path segments, so `/api/auth//session` and `/api/auth/session/` still run the `session` action unwrapped. In the DB-down case the session callback throws, Auth.js sends `sessionStore.clean()`, and a crafted top-level link ends the session. Whether this can be exploited depends on whether the platform edge collapses `//`. No Auth.js GET legitimately clears the session cookie in this config, because sign-out clears it on POST. | app/api/auth/[...nextauth]/route.ts:10,14; @auth/core lib/utils/web.js:96; proxy.ts:61; lib/helpers/session-callback.ts:37 | Fix now (T44). Wrap every GET, and add unit cases for `//` and a trailing `/`. |
| N-01 | Low | openapi still says "No TLS or invalid certificate, or the send timed out … The `SENT` reservation is released". This contradicts the file's own step 5 and the code. | contracts/openapi.yaml:143-145; lib/auth/email-provider.ts:509-512 | Fix now (T45) |
| N-02 | Low | The server-actions.md row for "no TLS / invalid certificate / send timed out" says the reservation is released. This contradicts line 53 of the same table. | contracts/server-actions.md:57 | Fix now (T45) |
| N-05 | Low | openapi documents the direct-endpoint AdapterError redirect as `/api/auth/error?error=Configuration`. `pages.error` is `/error`, so the real target is `/error?error=Configuration`. | contracts/openapi.yaml:148; auth.ts:59 | Fix now (T45) |
| T-02 | Low | test-plan has no AC-04 row for the session-route strip or the no-client-session scan. The T40 DoD asked for "401 + UNAUTHORIZED_BODY", but the code asserts 200 with `{}`, which is correct because Next drops non-RSC forwarded replies (`action-handler.js:205-226`). That change is not recorded. e2e has not been re-run since T38–T40. | test-plan.md:37-41; tasks.json T40 `dod`; tests/e2e/route-sweep.spec.ts:407-411; ship-notes.md:15-20 | Fix now (T45) |
| N-04 | Low (optional) | The comment on `maxRequeues: 0` says the hook "may have given up on it and released its reservation". After T39 that no longer happens. | lib/get-email-server-config.ts:31-33 | Fix now (T46) |
| N-06 | Low (optional) | The forward env scan misses `process.env?.X`, `env?.X` and `const { X } = process.env`. None appear in app code today. | tests/unit/lib/env/required-settings.test.ts:29-46 | Fix now (T46) |

## Follow-up tasks

Each task is appended to `tasks.json` with `source: review-2026-10-03-rereview-3` and added to `tasks/tracker.md`.

| Task | Findings | ACs |
|---|---|---|
| T43 | N-03 | AC-11 |
| T44 | T-01 (closes S-04) | AC-04 |
| T45 | N-01, N-02, N-05, T-02 | AC-04, AC-11, AC-15, AC-16, AC-18 |
| T46 | N-04, N-06 | AC-11, AC-26 |

## Next

1. Run `/sdd:implement security-patch` for T43–T46.
2. Re-review the changed surface.

The gate stays **CHANGES REQUESTED** until N-03 is recorded in the spec and ADR. F-31 and TD-3 are still closed at ship.
