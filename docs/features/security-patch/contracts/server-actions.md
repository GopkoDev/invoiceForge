---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-03"
feature_size: "M"
---

# Server actions and business layer — security-patch

This is the typed RPC surface of the `backend-service` container:
- `'use server'` actions, which the Browser UI and RSC pages call directly;
- the business functions in `lib/services` (`ActingFreelancer` in, `ActionResult` out), which the future Assistant will also call.

HTTP route handlers are in [`openapi.yaml`](./openapi.yaml). Only actions and functions whose contract this feature changes are listed. Every other action keeps its signature.

Derived from:
- `data-model.md` (`LimitEvent`), plus the existing schema (`prisma/schema/*.prisma`) and `lib/validations/*.ts` for unchanged entities;
- sad.md §6 flows 1–7 and 9;
- spec §5.

Field origins are in [`api-sync-report.md`](./api-sync-report.md).

## ActionResult (amended by ADR-0005)

```ts
type ActionErrorCode =
  | 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED'
  | 'RATE_LIMITED';                                                          // ★ ADR-0005

type ActionErrorDetails =
  | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }
  | { kind: 'HAS_INVOICES'; invoiceCount: number }
  | { kind: 'RETRY_AT'; retryAt: string };                                   // ★ ISO 8601 UTC instant
```

- `RATE_LIMITED` always carries `details.kind === 'RETRY_AT'`. Route handlers map it to `429` + `Retry-After` (seconds until `retryAt`, rounded up).
- Exhaustive `switch`es over `ActionErrorCode` must handle the new case, and TypeScript flags each one (ADR-0005 consequence). The client's code → destination map sends `RATE_LIMITED` to an inline message on the current screen, never to `error.tsx`.
- No other code or `details` kind is added. The sign-in email failures stay `FAILED` with fixed messages (decision D-1).

## Session rule for every action (AC-04, AC-18, ADR-0003)

- **Proxy.** Without a verified session, the proxy refuses any non-`GET`/`HEAD`/`OPTIONS` request with `401` `UNAUTHORIZED` before an action runs, whatever its headers or body encoding (`openapi.yaml` §NotSignedIn). The only exceptions are `/api/auth/*` and `/login`.
- **Backstop guard.** Every `'use server'` export except `signInWithEmail` and `signInWithGoogle` resolves the session first, through `getAuthenticatedUser()` or a known wrapper, and returns `fail('UNAUTHORIZED', 'Not signed in.')` before reading input. A CI scan asserts this for every action file, so a new action without the guard fails the build. This is also what refuses a non-sign-in action posted to `/login`.
- **Verified means one predicate.** `isVerifiedSession(x)` is true only when `x?.user?.id` is a non-empty string. The proxy, `requireSession()` and `getAuthenticatedUser()` all use it. A thrown or malformed check is a Visitor and never clears cookies.

## Sign-in actions — `lib/actions/login-actions.ts`

### `signInWithEmail(email: string)` ✎ (US-05, US-06; sad.md §6 flow 1)

| Outcome | Result | Notes |
|---|---|---|
| sent | redirect to `/verify-request` (the action calls `redirect()` on the URL `signIn` returns) | a `SENT` reservation is committed before the send and counts at once. A definitely failed send (refused, TLS or auth error) deletes it by id, so a failed send never counts (AC-11). A send that hits the time bound is an unknown outcome (it may still be delivered), so its reservation stays and counts, and the shared SMTP pool is not closed (AC-11, AC-12; T39) |
| limited (address or source) | **identical** redirect to `/verify-request`, after the same response floor | nothing sent. A `REFUSED` event is recorded only when the address limit refused, and only once per UTC hour (AC-12, AC-13) |
| address invalid | `fail('VALIDATION', 'Enter a valid email address.', { fieldErrors: { email: ['Enter a valid email address.'] } })` | nothing sent or counted (AC-17) |
| limits unavailable | `fail('FAILED', EMAIL_SIGNIN_UNAVAILABLE)` | fail-closed (AC-15). Covers a source or address check that cannot run, a database the user lookup cannot reach, and, on Vercel, a request with no platform address. Nothing is sent or counted |
| no TLS / invalid certificate / authentication error | `fail('FAILED', EMAIL_SEND_FAILED)` | the `SENT` reservation is released; reported to Sentry with value-free tags (AC-16) |
| send timed out | `fail('FAILED', EMAIL_SEND_FAILED)` | the outcome is unknown, so the `SENT` reservation stays and counts (AC-11; T39); reported to Sentry with `code=SEND_TIMEOUT` (AC-16) |

```ts
export const EMAIL_SIGNIN_UNAVAILABLE =
  'Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google.';
export const EMAIL_SEND_FAILED = "We couldn't send the sign-in email. Try again.";
```

- **Mapping.** The action calls `signIn('nodemailer', { redirect: false })`. Two kinds of refusal come back, and both are matched by type or code, never by message text (ADR-0001):
  - **Thrown.** The typed provider errors are Auth.js `AuthError`s (`CredentialsSignin` subclasses, OQ-2), which `signIn()`'s raw mode rethrows as-is; the action matches them with `instanceof`. An `AuthError` of type `AdapterError` (the database is down before the hooks run) maps to `EMAIL_SIGNIN_UNAVAILABLE`.
  - **Returned.** `callbacks.signIn` refuses an uncheckable request by returning `/error?error=CredentialsSignin&code=<code>`. `signInRefusalCode` (`lib/auth/sign-in-messages.ts`) reads a known code back, and the action returns that code's message from `SIGN_IN_CODE_MESSAGES`, the same table the `/error` page uses. Any other URL (sent or limited) is followed with `redirect()`.

  The login form keeps toasting `result.error`. Tests assert against the exported constants.
- **Validation.** `loginEmailSchema` (`lib/validations/auth.ts`) changes from `.max(100)` to **`.max(254)` + ASCII only**. Both messages are `Enter a valid email address.`. The same rule runs again in `normalizeIdentifier`, which is authoritative for direct calls.
- **Limited is never an error.** No result, message, timing or status distinguishes limited from sent (spec §6.1 enumeration).

### `signInWithGoogle()` (unchanged)

The sign-in-email limits are never consulted (AC-14, flow 9).

## Dashboard — business layer `lib/services/dashboard/` (US-03, US-04; ADR-0004)

`parseDashboardInput(currency, period)` gains the shared five-year rule `isWithinMaxCustomPeriod` from `lib/validations/dashboard-period.ts`. It runs **before any query** (AC-10, flow 5).

| Function | `period` | Over-long custom period |
|---|---|---|
| `getSummaryStats(actor, currency, period?)` | `{ from, to }` local `YYYY-MM-DD`, inclusive; omitted = all time | `fail('VALIDATION', 'Please fix the highlighted fields.', { fieldErrors: { period: [PERIOD_TOO_LONG] } })` |
| `getChartData(actor, currency, period?)` | same | same |
| `getSenderAccounts(actor, currency, period?)` | same | same |

```ts
export const MAX_CUSTOM_PERIOD_YEARS = 5;
export const PERIOD_TOO_LONG =
  'A custom period can be at most 5 years. Choose "All time" to see your full history.';
```

- **Boundary (AC-08).** The period is allowed when `to ≤ addCalendarYears(from, 5)` on calendar dates, independent of time zone. A 29 February start maps to 28 February. Examples: `2021-01-01 → 2026-01-01` is allowed; `→ 2026-01-02` is refused.
- **All time.** `period` omitted is not a custom period, and the cap never applies to it (AC-09).
- **Server actions.** `getDashboardSummaryStats`, `getDashboardChartData` and `getDashboardSenderAccounts` (`lib/actions/dashboard-actions.ts`) pass the refusal through unchanged. A browser can't reach the cap through the link, because the link reader below falls back first.

### Link parameters, Dashboard (`/dashboard?from=&to=&preset=`) ✎ (AC-07, AC-08)

`dashboardParamsSchema` (`lib/validations/search-params.ts`) applies the same `isWithinMaxCustomPeriod`:

| Link | Applied |
|---|---|
| `preset=all-time` | full history (unchanged) |
| `preset=this-month`, `last-month`, `next-month`, `this-year` or `last-year` | that period, resolved on the server in the account zone; it takes priority over any `from`/`to` pair |
| valid `from ≤ to` within 5 calendar years | that custom period (unchanged) |
| valid `from ≤ to` **longer than 5 years** | ★ current local month, the same as a malformed link; no error, no notice |
| missing, malformed or inverted | current local month (unchanged) |

### Dashboard filter (browser, AC-07b, flow 4)

The filter applies `isWithinMaxCustomPeriod` before navigating. An over-long range is not applied, and the filter shows `PERIOD_TOO_LONG`. The rule module is dependency-free, so it can be imported by the client.

## Account — business layer `lib/services/account/account.ts` (US-09; ADR-0005)

### `getAccountExport(actor)` ✎

| Outcome | Result |
|---|---|
| fewer than 3 counted starts in the past hour | `ok(AccountExport)` (unchanged shape, `exportVersion: '2.0'`) after recording `EXPORT`/`STARTED` |
| 3 counted starts | `fail('RATE_LIMITED', "You've reached the export limit. You can export again later.", { details: { kind: 'RETRY_AT', retryAt } })`; nothing read or recorded |
| a read fails | the reserved row flips to `FAILED` (place freed), then `fail('FAILED', …)` |
| limit store unavailable | `fail('FAILED', …)`. The export never runs unlimited (ADR-0002) |
| account gone | `fail('NOT_FOUND', …)` (unchanged) |

- `retryAt` is `min(at) + 1 h` over this Freelancer's `STARTED` rows in the window (data-model.md).
- The settings screen (SCR-06) shows "You can export again at {retryAt in local time}". The key is the Freelancer id, never the network (AC-25).

### `deleteAccount(actor)` ✎ (spec §6.1, ADR-0007)

The signature and outcomes are unchanged. The transaction gains the `LimitEvent` delete for the account's address digest (data-model.md §User). `EXPORT` rows go by cascade.

## Web-address rule — `lib/validations/web-address.ts` (US-08, AC-21)

One shared refine, `isWebAddress(value)`. It is true only when `new URL(value).protocol` is `http:` or `https:`. It is used by the forms (zod resolver) and again by the business layer. A bypassed form gets `VALIDATION` with field errors and nothing is saved (flow 7).

| Action / function | Field | Rule | Message |
|---|---|---|---|
| `createCustomer` / `updateCustomer` | `website`, `image` | ★ `isWebAddress`, replacing `.url()` (which accepts `javascript:` and `data:`) | `The address must start with http:// or https://.` |
| `createSenderProfile` / `updateSenderProfile` | `website` | ★ `isWebAddress` | same |
| `createSenderProfile` / `updateSenderProfile` | `logo` | **unchanged: https only** (architecture-hardening AC-04, stricter than AC-21) | `The link must be a secure web address (https://…).` |
| `updateProfile` | `image` | ★ `isWebAddress` (decision D-3, beyond AC-21's literal fields) | `The address must start with http:// or https://.` |

- Empty stays allowed where it is today (`optionalString`).
- **Display rule.** A stored value that fails `isWebAddress`, including the snapshot on an issued invoice, is rendered as plain text, never as `href` or `src`, on SCR-09 and in the invoice PDF (SCR-10). Stored data is not rewritten.
