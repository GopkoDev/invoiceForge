# Fifth re-review — security-patch — 2026-10-03

**Gate result: CHANGES REQUESTED**

Follows [review-2026-10-03-rereview-4.md](review-2026-10-03-rereview-4.md). That review returned F-01 and F-02, and follow-up tasks T47–T48.

The reviewer returned `REVIEW_CLEAN` and found no stage-1 blocker. The gate stays **CHANGES REQUESTED** only because the owner chose **Fix now** for G-01, a stage-2 regression that T48 introduced. That fix goes to T49.

## Scope

- **Changed surface:** `2162589..HEAD` (`9c74a45`) on `security-patch`. That is 2 commits: `92eb9d4` = T47 and `9c74a45` = T48.
- **Cross-cutting pass:** the whole-chain US/AC trace over the feature diff `4cba009..HEAD`.
- **Baseline read:**
  - `spec.md` §4/§5/§8 and `sad.md` §6/§8/§11
  - `data-model.md`, `contracts/openapi.yaml` and `contracts/server-actions.md`
  - `adr/`
  - `test-plan.md`, `tasks.json`, `tasks/tracker.md` and `ship-notes.md`
- **Reviewer:** one clean-context `sdd:reviewer` pass on opus. It covered T47–T48 and the whole-chain re-trace.
- **Mutation runs:** done on a scratchpad copy of the env scan. The repo was not touched.

### Gates run during review

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors. 6 warnings, all in files this feature does not touch (same as rereview-4). |
| `pnpm tsc --noEmit` | clean |
| `pnpm test:unit` | 1047/1047 passed. That is +1 test, the T48 case. |
| `tests/unit/lib/env/required-settings.test.ts` | 17/17 passed |
| `pnpm test:integration` (testcontainers, `DATABASE_URL`/`DIRECT_URL` unset) | 63 files. 503 passed, 32 skipped. Exit 0. |
| `pnpm test:e2e` | Not run, because no UI or runtime code changed. Rereview-4 recorded 30/30. |
| `openapi.yaml` parse | OpenAPI 3.1.0, 4 paths, 0 errors |
| `tasks.json` parse | clean (48 tasks at review time) |

**Real-DB safety.** `.env` and `.env.prod` point at remote hosts, and neither was used:
- the integration config loads no dotenv;
- the suites use `PostgreSqlContainer`;
- `tests/support/db/env-guard.ts` refuses the `.env` URL.

## Status of the earlier findings

| ID | Status |
|---|---|
| F-01 (AC-11) | Resolved by T47 (`92eb9d4`). |
| F-02 (AC-26) | Resolved by T48 (`9c74a45`), but T48 introduced the regression G-01. |
| F-31 (AC-02/AC-20 preview gates) | Still carried to ship: `ship-notes.md:105-121`, items 1–5, **Blocking**. |
| TD-3 (AC-17) | Still carried to ship: `ship-notes.md:132-135`, item 8, **Blocking**. |

### F-01: why it is resolved

The sad §8 row (`sad.md:641`) now says two things:
- a refused or definitely failed request never counts;
- a send that hits the time bound does count (AC-11, ADR-0002).

That agrees with every other place that states the rule:
- `spec.md:190`
- ADR-0002:24 and :58
- `sad.md:725`
- `data-model.md:98`
- `contracts/server-actions.md:53,58`
- `contracts/openapi.yaml:104-109,146-148`

The new row at `test-plan.md:56` maps to `tests/integration/auth/email-provider.test.ts:949-982`. That test asserts all of the following:
- the send rejects with `{ code: 'SEND_TIMEOUT' }`;
- `smtp.state.delivered === 1`;
- the `SIGNIN_ADDRESS`/`SENT` count is 1.

A grep of the feature docs found no other contradiction in a living artifact. The AC-12 row at `test-plan.md:60` is consistent, because a timeout counts as an unknown outcome, not a failure.

### F-02: why it is resolved

These mutation runs used the T48 fixture:

| Variant | Names found | Test result |
|---|---|---|
| Current code | all 4 | passes |
| Type-annotation group reverted | `TYPED_ONE` missing | fails |
| Comment strip reverted | `COMMENTED_TWO` and `COMMENTED_THREE` missing | fails |
| Both reverted (pre-T48) | only `COMMENTED_ONE` | fails |

Other checks:
- `/* */` comments are handled, including ones that contain a comma.
- No new false positives:
  - `{ X } == process.env` matches nothing;
  - `const o = { FP }; let y: Foo = process.env` matches nothing.

## End-to-end trace summary

- Every story from US-01 to US-09 still has at least one AC and a sad §6 flow.
- All 28 ACs (AC-01 … AC-27, plus AC-07b) have:
  - a task in `tasks.json`;
  - a test-plan row;
  - a tagged test;
  - sad coverage.
- `target_surfaces` is `[backend-service, web-frontend]`. The UI ACs still reach ux-flows, screens, the ui-layer tasks and component or e2e-through-UI tests, as in rereview-4.
- `spec.md` has no `added-by-fix` ACs.
- spec, ux-flows, screens, data-model and contracts were not changed in `2162589..HEAD`.
- T47 and T48 both have `source: review-2026-10-03-rereview-4` and are `done` in the tracker. Their commits carry the `SDD-Task`/`SDD-AC` trailers.

| AC | Change since rereview-4 | Gap |
|---|---|---|
| AC-11 | sad §8 and the test-plan now state the timeout rule. | none in the living artifacts (G-02 is the frozen briefs) |
| AC-26 | The scan now catches the typed and commented destructure shapes. | G-01 |
| AC-02, AC-20 | The preview gates are carried to ship and are **Blocking**. | F-31 |
| AC-17 | TD-3 waits on the owner's production check, by design. | ship-notes item 8 |

## Findings

The owner confirmed both verdicts on 2026-10-03.

### Stage 1 — AC compliance

**G-02 · Info · Not an issue**

- **Finding:** the decomposition-time task briefs still quote the wording from before AC-11 was amended: "A refused or failed request never counts towards the address limit".
- **Cite:**
  - `tasks/_epic.md:148`
  - `tasks/t11-email-provider-hooks.md:91,120`
  - `tasks/t08-limit-store.md:68`
- **Reason for the verdict:** the task briefs are snapshots frozen at decomposition (`76043ac`), not contract documents. Every living artifact states the timeout rule.

### Stage 2 — quality

**G-01 · Low · Fix now (T49)**

- **Finding:** T48 introduced a regression. The comment strip `.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')` does not skip string literals. A `//` inside a string default cuts the rest of the line, including the comma, so the next destructured name is lost.
- **Example:** `const { BASE_URL = 'https://x.example', AFTER_URL } = process.env;` gives `["BASE_URL"]`. The pre-T48 scan gave `["BASE_URL","AFTER_URL"]`.
- **Impact:** none today. No app code destructures `process.env`, and plain `process.env.X` reads next to a URL string are still found.
- **Cite:** `tests/unit/lib/env/required-settings.test.ts:61`
- **Fix:**
  - blank out `'…'`, `"…"` and `` `…` `` literals before stripping comments;
  - add the URL-default shape to the fixture.

A smaller edge stays open: a comment that contains `{` or `}` inside the braces defeats `[^{}]*`. It is not a regression, because the scan missed it before T48 too, and it is not in T49's scope.

## Follow-up tasks

T49 is appended to `tasks.json` with `source: review-2026-10-03-rereview-5` and added to `tasks/tracker.md`.

| Task | Findings | ACs |
|---|---|---|
| T49 | G-01 | AC-26 |

## Next

1. Run `/sdd:implement security-patch` for T49.
2. Re-review the changed surface, which is `tests/unit/lib/env/required-settings.test.ts` only.

There are no open stage-1 findings. After T49 the gate can go to **PASS**. F-31 and TD-3 stay **Blocking** at ship.
