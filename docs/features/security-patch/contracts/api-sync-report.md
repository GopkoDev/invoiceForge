---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
---

# API sync report — security-patch

**Inputs:**
- `data-model.md` ✓ (schema change: `LimitEvent` + 2 enums)
- `sad.md` §5, §6 flows 1–10, §8 ✓
- `spec.md` §4/§5 ✓
- ADR-0001…0008 ✓
- existing schema `prisma/schema/*.prisma` + `lib/validations/*.ts` + `types/result.ts` for unchanged entities

**Interface kind:** `target_surfaces: [backend-service, web-frontend]` (read from sad.md). The backend exposes:
- HTTP route handlers, the Auth.js email endpoint and the error tunnel → [`openapi.yaml`](./openapi.yaml);
- server actions and business functions → [`server-actions.md`](./server-actions.md).

`web-frontend` consumes both.

**No `events.md`.** sad.md §8 marks events N/A. The cron trigger and the Sentry reports are fire-and-forget platform calls, not app message contracts.

**Size / route:** M / standard (from `.size` / `.route`).

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| requestSignInLink.email | spec AC-17 (≤ 254, ASCII) + ADR-0001; existing `VerificationToken.identifier` TEXT; stored only as `LimitEvent.key` digest (data-model) | high |
| requestSignInLink.csrfToken / callbackUrl | Auth.js email endpoint (existing framework surface) | high |
| requestSignInLink 302 Location (check inbox) | existing `authRoutes.verifyRequest`; AC-11/12/13 identical outcome | high |
| requestSignInLink 302 Location (error) | existing `authRoutes.error` = `/error`; Auth.js `?error=<type>` (see OQ-2) | medium |
| exportUserData 200 body | existing schema (unchanged from architecture-hardening `exportVersion` 2.0) | high |
| exportUserData 429 details.retryAt | data-model → `min(LimitEvent.at) + 1 h` over `EXPORT`/`STARTED` | high |
| exportUserData 429 Retry-After | derived — seconds until `retryAt`, ≤ 3600 (1 h window, AC-24) | high |
| purgeLimitRecords.data.deleted | data-model → `DELETE FROM "LimitEvent" WHERE at < cutoff` row count | medium |
| purgeLimitRecords security | ADR-0007 (`CRON_SECRET` bearer) | high |
| forwardErrorEnvelope body / dsn | ADR-0006 (envelope header `dsn` vs `NEXT_PUBLIC_SENTRY_DSN`) | high |
| ActionErrorCode.RATE_LIMITED | ADR-0005, sad.md §8 | high |
| ActionErrorDetails.RETRY_AT | ADR-0005, sad.md §8 | high |
| signInWithEmail outcomes | sad.md §6 flow 1 branches + ADR-0001 outcome list | high |
| loginEmailSchema.email max 254 / ASCII | spec AC-17, sad.md §8 (replaces the existing `.max(100)`) | high |
| EMAIL_SIGNIN_UNAVAILABLE / EMAIL_SEND_FAILED | spec AC-15 / AC-16 wording; D-1 | high |
| dashboard `period` {from,to} | existing `lib/services/dashboard/period.ts` `DashboardPeriod` (local `YYYY-MM-DD`) | high |
| PERIOD_TOO_LONG, MAX_CUSTOM_PERIOD_YEARS | spec AC-07b, AC-08, AC-10; ADR-0004 | high |
| dashboard link `from`/`to`/`preset` | existing `dashboardParamsSchema` (`lib/validations/search-params.ts`) | high |
| Customer.website / image rule | existing schema `Customer.website`/`image` TEXT NULL; AC-21 | high |
| SenderProfile.website rule | existing schema `SenderProfile.website` TEXT NULL; AC-21 | high |
| SenderProfile.logo rule (https only) | existing `lib/validations/sender-profile.ts` (architecture-hardening AC-04) | high |
| User.image rule (profile) | existing schema `User.image` TEXT NULL; D-3 | medium |

There are no `low` rows: every field traces to a column, an ADR or an AC.

## B. Drift checklist

1. **Endpoint ↔ data-model** *(core)* — ✓.
   - `requestSignInLink` reads and writes `LimitEvent` (`SIGNIN_SOURCE`, `SIGNIN_ADDRESS`) and `VerificationToken`.
   - `exportUserData` reads and writes `LimitEvent` (`EXPORT`) and reads every User-owned entity.
   - `purgeLimitRecords` deletes from `LimitEvent`.
   - The dashboard functions read `Invoice`. The web-address rule writes `Customer`, `SenderProfile` and `User`.
   - `forwardErrorEnvelope` touches no entity. This is **accepted**: it is a relay, and flow 8 says "nothing persisted".
2. **Error code ↔ repo error definition** *(core)* — ✓ with a note.
   - The repo form is `ActionErrorCode` in `types/result.ts`, re-exported from `types/actions.ts`, with 5 codes today.
   - `RATE_LIMITED` and `RETRY_AT` are backed by ADR-0005 and land in `types/result.ts` with the export task. Reconcile once added.
   - `RATE_LIMITED` already exists as a *logo refusal* code (architecture-hardening `LogoRefusalCode`) with the same meaning, so the names don't clash.
3. **Validation ↔ constraint** *(core)* — ✓ after D-2 and D-4. The contract takes the stricter value where artifacts disagreed, except D-2, where spec and SAD deliberately widen the code.
4. **Contract ↔ sequence** *(supporting)* — ✓ with 3 gaps (D-5, resolved as OQ-1).
   - Flow 1: invalid → VALIDATION / `/error`; store down → FAILED unavailable; limited → identical redirect; no TLS → FAILED send.
   - Flow 2: verified → pass; anonymous non-GET → 401; data → 401; private page → redirect; action on `/login` → UNAUTHORIZED.
   - Flow 3: fallbacks in the link table. Flow 4: filter notice. Flow 5: VALIDATION before any query.
   - Flow 6: under limit → 200; system failure → FAILED + release; limited → 429 RETRY_AT.
   - Flow 7: form and server VALIDATION; display as plain text.
   - Flow 8: own DSN → forward; other or unreadable → 403.
   - Flow 9: Google is not limited (no contract change).
   - Flow 10: wrong secret → 401; purge → 200.

**Back-feed coverage.** Every §5 AC maps to ≥ 1 operation, response or rule.
- Contract-mapped:
  - AC-04, AC-05, AC-06 → the edge boundary + `NotSignedIn`;
  - AC-07, AC-07b, AC-08, AC-09, AC-10 → dashboard;
  - AC-11 – AC-17 → `requestSignInLink` + `signInWithEmail`;
  - AC-18, AC-19 → the session rule + sign-in actions;
  - AC-21 → web-address rule;
  - AC-22 → `forwardErrorEnvelope`;
  - AC-23 – AC-25 → `exportUserData` / `getAccountExport`.
- N/A for the contract: AC-01, AC-02, AC-03 and AC-27 are dependency, audit and regression checks with no interface change (AC-03 keeps identity normalization unchanged). AC-20 maps to the global security headers in `openapi.yaml` `info`, and its zero-violation gate is a test. AC-26 is a build gate (ADR-0008).

Every operation maps to a §4 user story:
- requestSignInLink → US-05, US-06
- exportUserData → US-09
- purgeLimitRecords → US-05, US-09 (spec §6 retention)
- forwardErrorEnvelope → US-08
- dashboard → US-03, US-04
- session rule → US-02, US-07
- web-address rule → US-08

### Findings and resolutions

| # | Finding | Type | Resolution |
|---|---|---|---|
| D-1 | AC-15 vs AC-16 from `signInWithEmail`: no code in the closed set says "unavailable" | core (error code) | **User decision:** `FAILED` with two fixed exported message constants; no new `details` kinds. `ActionResult` grows only by `RATE_LIMITED` + `RETRY_AT`, as sad.md §8 lists |
| D-2 | `loginEmailSchema` has `.max(100)` today; AC-17 / sad.md §8 say ≤ 254 | validation (code ↔ spec) | **Follow spec + SAD:** `.max(254)` + ASCII-only. The code is the thing being changed. Taking the stricter 100 would refuse valid 101–254-character addresses that `normalizeIdentifier` accepts, so the form and the provider would disagree (ADR-0001 neutral consequence) |
| D-3 | `User.image` (profile settings) accepts any URL scheme and is not named in AC-21 | scope | **User decision:** included under `isWebAddress`, traced to AC-21's "any other web address or image address they type". `tasks` should note it as a contract addition |
| D-4 | `SenderProfile.logo` is https-only today; AC-21 allows http or https | validation | **Keep the stricter rule** (architecture-hardening AC-04, the safe-fetch path needs https). `website` fields get http(s) |
| D-5 | Three error branches no §6 flow draws: the purge DB failure (→ 500 + Crons error check-in), Sentry unreachable from the tunnel (→ 502), and the limit store down during export (→ 500 FAILED, ADR-0002 neutral) | sequence gap | **User decision:** in the contract now, plus **OQ-1** for `sequences` |
| D-6 | `LimitEvent` rows are not in the data export | contract choice | **Accept:** short-lived security records. Address rows hold only a keyed digest, and spec §6.1 says they are "never shown to anyone". `exportVersion` stays 2.0 |
| D-7 | `/api/cron/purge-limits` must be on the public allowlist, or the proxy returns 401 to Vercel Cron | integration note | Recorded in `openapi.yaml` `info` (ADR-0007). `tasks` adds it to `config/routes.config.ts` |
| D-8 | Auth.js may surface every provider error as one type (`EmailSignin`) on the direct endpoint, which would collapse AC-15 / AC-16 / AC-17 into one `/error` message for direct callers | beta-API risk | **Save as OQ-2** (implement spike). The `/login` path is unaffected, because the action reads `AuthError.cause` server-side |

## C. Deviations from the api-skill defaults

| Default | Here | Why |
|---|---|---|
| `{code, message, details?}`, `module.error_name` | `ActionResult` `{success:false, code, error, fieldErrors?, details?}`, UPPER_SNAKE | architecture-hardening ADR-0009, ADR-0005 here (same as the architecture-hardening contract) |
| BearerAuth | `SessionCookie` (next-auth JWT cookie); `CronSecret` bearer on the purge job; `security: []` on the Auth.js endpoint and the tunnel | same-origin browser app; Vercel Cron's own auth (ADR-0007) |
| `/api/v1/...` | unversioned | brownfield paths; Auth.js, Vercel Cron and the Sentry SDK call fixed paths |
| JSON request/response everywhere | form-encoded + `302` on the Auth.js endpoint; `application/x-sentry-envelope` and empty error bodies on the tunnel | framework and SDK wire formats, not app APIs |
| `Idempotency-Key` on retriable mutations | none | no §6 flow shows a retry note or async actor. The purge is naturally idempotent, the tunnel is deduped by Sentry event id, and a repeated sign-in or export request is a new counted request by design |

## Open questions

- [ ] **OQ-1** — Add the D-5 branches to sad.md §6: flow 10 (delete fails → error check-in, 500), flow 8 (Sentry unreachable → 502) and flow 6 (limit store unavailable → FAILED, nothing read). Owner: `sequences` (Dmytro Hopko); due: before `sdd:tasks`.
- [ ] **OQ-2** — Pin which Auth.js error type the direct `POST /api/auth/signin/nodemailer` redirect carries for an invalid address, limits unavailable and a send failure on next-auth 5.0.0-beta.32. Map each on the `/error` page. If they collapse into one type, decide whether direct callers get one generic message (the `/login` path is unaffected). Owner: Dmytro Hopko (implement spike); due: before the sign-in-provider task is closed.

## Lint

Run `pnpm dlx @stoplight/spectral-cli lint docs/features/security-patch/contracts/openapi.yaml` (spectral isn't wired into the repo's checks yet).
