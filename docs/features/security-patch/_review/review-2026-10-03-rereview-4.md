# Fourth re-review — security-patch — 2026-10-03

**Gate result: CHANGES REQUESTED**

Follows [review-2026-10-03-rereview-3.md](review-2026-10-03-rereview-3.md). That review returned N-01 – N-06, T-01 and T-02, and follow-up tasks T43–T46.

## Scope

- **Changed surface:** `45e0cc0..HEAD` (`91ce150`) on `security-patch`, covering T43–T46. That is 7 commits, 14 files, 186 insertions and 59 deletions.
- **Cross-cutting pass:** the whole-chain US/AC trace over the feature diff `4cba009..HEAD`.
- **Baseline read:**
  - `spec.md` §4/§5/§8 and `sad.md` §6/§8/§11
  - `data-model.md`, `contracts/openapi.yaml` and `contracts/server-actions.md`
  - `adr/`
  - `test-plan.md`, `tasks.json`, `tasks/tracker.md` and `ship-notes.md`
- **Reviewer:** one clean-context `sdd:reviewer` pass on opus. It covered all of T43–T46 and the whole-chain re-trace.
- **Orchestrator re-checks:** F-01 and F-02 were re-checked against `sad.md:641`, `test-plan.md:55-56` and `required-settings.test.ts:50-62`, and both hold.

### Gates run during review

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors. 6 warnings, all in files this feature does not touch. |
| `pnpm tsc --noEmit` | clean |
| `pnpm test:unit` | 1046/1046 tests in 125 files. That is 7 more than rereview-3. |
| `pnpm test:integration` (testcontainers, `DATABASE_URL`/`DIRECT_URL` unset) | 63 files. 503 passed, 32 skipped as container/env placeholders. |
| `pnpm test:e2e` (fresh `next build`, testcontainers Postgres) | 30/30 passed, including the route sweep and the CSP gate (13/13). This matches the ship-notes record. |
| openapi.yaml and tasks.json parse | both clean |

**Can the new tests fail if the fix is reverted?** Yes:
- `NextRequest` keeps `//session` and `session/` as written. Going back to the exact-path check fails all four `it.each` cases.
- Reverting `bdbb116` fails the rechunk case at `tests/unit/api/auth-session-route.test.ts:57-68`.

## Status of the earlier findings

| Status | Findings |
|---|---|
| Resolved | N-01, N-02, N-03, N-04, N-05, T-01 (closes S-04), T-02 |
| Resolved, with a small gap left | N-06 (→ F-02) |
| Still carried to ship | F-31 is the preview gates for AC-02 and AC-20 (ship-notes items 1–5, **Blocking**). TD-3 is ship-notes item 8 (**Blocking**). |

**T-01: why it is resolved**
- Every GET now goes through `withoutSessionCookieExpiry` (`app/api/auth/[...nextauth]/route.ts:15-17`), and POST goes straight to `handlers`.
- No Auth.js GET legitimately clears the session cookie in this config:
  - The callback cleans only when `jwt` returns null, and `auth.ts:81-87` never returns null.
  - Sign-out clears only on POST.
  - The CSRF, providers, error, verify-request and signin routes write no session cookie.
- **`bdbb116` is correct.** When a response writes any session cookie, the whole response is kept as is.
  - `SessionStore.chunk()` expires the stale chunk names in the same response that writes the new ones.
  - Before this fix, stripping those expiries would have joined an old `.1` chunk onto a new token. That bug was also latent in `proxy.ts`, and the fix covers it there too.
- The cookie's expiry attribute is never edited. A line is either dropped or passed through as is, so a persistent cookie never turns into a session cookie.

## End-to-end trace summary

- Every story from US-01 to US-09 still has at least one AC and a sad §6 flow.
- All 28 ACs (AC-01 … AC-27, plus AC-07b) are in `tasks.json`.
- Every AC has at least one tagged test and a test-plan row.
- `spec.md` has no `added-by-fix` ACs.
- The UI ACs reach ux-flows and screens as in rereview-3.

| AC | Change since rereview-3 | Gap |
|---|---|---|
| AC-11 | spec, ADR-0002, sad §6/§11, data-model, server-actions and openapi now agree on the timeout rule, and an integration test backs it. | sad §8 wording and test-plan row (F-01) |
| AC-04 | The session-route strip covers every GET. It has unit tests and a test-plan row. | none |
| AC-15 | The openapi AdapterError redirect is corrected. | none |
| AC-16 | Contracts and code agree on the TLS/auth versus timeout split. | none |
| AC-18 | The T40 assert change is recorded, and e2e passes 30/30. | none |
| AC-26 | The scan is wider. | F-02 |
| AC-02, AC-20 | The preview gates are carried to ship and are **Blocking**. | F-31 |
| AC-17 | TD-3 waits on the owner's production check, by design. | ship-notes item 8 |

## Findings

All verdicts were confirmed by the owner on 2026-10-03, and both are **Fix now**.

### Stage 1 — AC compliance

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| F-01 | Low | T43 amended AC-11 so that a send that hits the time bound counts, but two places were not updated. The sad §8 "Rate limiting" row still says "a refused or failed request never counts towards the address limit". The Visitor sees a timed-out send as failed, so this contradicts `spec.md:190`, `sad.md:725` and ADR-0002:58. The test-plan AC-11 rows cover only the happy path. The integration test at `tests/integration/auth/email-provider.test.ts:949-981` already asserts the timeout clause, but no test-plan row maps it. | sad.md:641; test-plan.md:55-56 | Fix now (T47). Docs only. |

### Stage 2 — quality

| ID | Severity | Finding | Cite | Verdict |
|---|---|---|---|---|
| F-02 | Low (optional) | The forward env scan still misses two destructuring shapes. No app code uses either today. (1) A typed destructure, `const { X }: NodeJS.ProcessEnv = process.env`, matches nothing, because the pattern needs `}` to be followed directly by `=`. (2) A `//` comment inside a multi-line destructure drops the next name, because the comment text stays glued to that name. | tests/unit/lib/env/required-settings.test.ts:50-62 | Fix now (T48). Allow `\}\s*(?::[^=]+)?=`, strip comments before splitting, and add both shapes to the fixture. |

## Follow-up tasks

Each task is appended to `tasks.json` with `source: review-2026-10-03-rereview-4` and added to `tasks/tracker.md`.

| Task | Findings | ACs |
|---|---|---|
| T47 | F-01 | AC-11 |
| T48 | F-02 | AC-26 |

## Next

1. Run `/sdd:implement security-patch` for T47–T48.
2. Re-review the changed surface.

The gate stays **CHANGES REQUESTED** until F-01 is fixed. F-31 and TD-3 are still closed at ship.
