# Sixth re-review — security-patch — 2026-10-03

**Gate result: PASS**

Follows [review-2026-10-03-rereview-5.md](review-2026-10-03-rereview-5.md). That review returned G-01 (Low, Fix now) and follow-up task T49.

The reviewer found no stage-1 finding. It found one new stage-2 Info finding, H-01, and the owner ruled it **Not an issue**. No finding is left open, so the gate is **PASS**. F-31 and TD-3 are still **Blocking at ship**.

## Scope

- **Changed surface:** `ba24876..HEAD` on `security-patch`. That is 1 commit, `2513ecb` (T49). It changes 2 files with 13 insertions and 1 deletion:
  - `tests/unit/lib/env/required-settings.test.ts`
  - `tasks/tracker.md`
- **Cross-cutting pass:** the whole-chain US/AC trace over the feature diff `4cba009..HEAD`.
- **Baseline read:**
  - `spec.md` §4/§5 and `sad.md` §6 plus `target_surfaces`
  - `data-model.md`, `contracts/openapi.yaml` and `contracts/server-actions.md`
  - `adr/`
  - `test-plan.md`, `tasks.json`, `tasks/tracker.md` and `ship-notes.md`
- **Reviewer:** one clean-context `sdd:reviewer` pass on opus.
- **Mutation runs:** done on a scratchpad copy of the env scan. The repo was not touched.

### Gates run during review

| Gate | Result |
|---|---|
| `pnpm lint` | 0 errors. 6 warnings, all in files this feature does not touch (same as rereview-5). |
| `pnpm tsc --noEmit` | clean |
| `pnpm test:unit` (`DATABASE_URL`/`DIRECT_URL` unset) | 1048/1048 passed. That is +1 test, the T49 case. |
| `tests/unit/lib/env/required-settings.test.ts` | 18/18 passed |
| `pnpm test:integration` | Not run, because only one unit test file and the tracker changed. Rereview-5 recorded 503 passed, 32 skipped. |
| `pnpm test:e2e` | Not run, because no UI or runtime code changed. Rereview-4 recorded 30/30. |

**Real-DB safety.** No command used `.env` or `.env.prod`.

## Status of the earlier findings

| ID | Status |
|---|---|
| G-01 (AC-26) | Resolved by T49 (`2513ecb`). |
| G-02 | Not an issue. Unchanged: the task briefs are frozen. |
| F-31 (AC-02/AC-20 preview gates) | Still carried to ship as `ship-notes.md` items 1–5, **Blocking**. `ship-notes.md` did not change. |
| TD-3 (AC-17) | Still carried to ship as `ship-notes.md` item 8, **Blocking**. |

### G-01: why it is resolved

In `tests/unit/lib/env/required-settings.test.ts`:
- line 62 blanks the `'…'`, `"…"` and `` `…` `` literals;
- line 63 then strips the comments;
- the new case at lines 240-248 asserts single-quoted, double-quoted and template URL defaults that contain `//` or `/*`, and expects all 6 names.

These mutation runs used scratchpad copies:

| Variant | T49 input | T48 input | T46 input |
|---|---|---|---|
| Current code | all 6 names | all 4 names | all 9 names |
| String blanking removed | 3 names lost, so the test fails | passes | passes |
| Comment strip removed | passes | names lost, so the test fails | passes |
| Blank and strip in the opposite order | 3 names lost, so the test fails | passes | passes |

Other checks:
- Escaped quotes and commas inside string defaults are handled.
- No new false positive: `{ FP } == process.env` matches nothing.

**AC-26 on the real app code.** The scan finds the same 12 names with or without the T49 step. A plain grep for `process.env.X`, `process.env?.X` and `process.env['X']` found nothing the scan misses. No app file destructures `process.env`.

## End-to-end trace summary

- Every story from US-01 to US-09 still has at least one AC and a sad §6 flow.
- All 28 ACs (AC-01 … AC-27, plus AC-07b) have:
  - a task in `tasks.json`;
  - a test-plan row;
  - a tagged test;
  - sad coverage;
  - a ux-flows reference.
- `screens.md` has no state for AC-02, AC-03 or AC-19. These are framework, dependency and auth-boundary ACs that have no screen of their own, the same as in rereview-5.
- `target_surfaces` is `[backend-service, web-frontend]`. The UI ACs still reach ux-flows, screens, the ui-layer tasks and component or e2e-through-UI tests.
- `spec.md` has no `added-by-fix` ACs.
- None of these changed in `ba24876..HEAD`: spec, sad, test-plan, `tasks.json`, contracts, data-model, ADRs, ux-flows, screens, `ship-notes.md`, `app/`, `components/` and `lib/`.
- T49 has `source: review-2026-10-03-rereview-5` and `acs: [AC-26]`, and it is `done` at `tasks/tracker.md:56`. Commit `2513ecb` carries the `SDD-Task: T49` and `SDD-AC: AC-26` trailers.

## Findings

The owner confirmed the verdict on 2026-10-03.

### Stage 1 — AC compliance

None.

### Stage 2 — quality

**H-01 · Info · Not an issue**

- **Finding:** strings are blanked in one pass and comments are stripped in a second pass. A quote that opens inside a comment can therefore pair with a quote in later code, and the destructured names in between are lost.
- **Examples:**
  - `A, /* don't */ B = 'x', C` loses `B`.
  - A `` ` `` inside a `//` comment loses the names up to the next template literal.
- **Cite:** `tests/unit/lib/env/required-settings.test.ts:62-63`
- **Reason for the verdict:** no app code destructures `process.env`. The scan finds all 12 real names, and the failing inputs are unusual. This is an accepted limit of a regex scan, in the same class as the known `{`/`}`-inside-braces gap and the regex-literal gap. The optional single-pass fix is recorded here in case the scan is ever hardened:

  ```
  .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (t) => (t[0] === '/' ? '' : "''"))
  ```

## Follow-up tasks

None.

## Next

1. Run `/clear`, then `/sdd:ship security-patch`.
2. F-31 (`ship-notes.md` items 1–5) and TD-3 (item 8) are **Blocking** at ship. They need the preview gates and the owner's production check.
