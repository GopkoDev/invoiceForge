---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-05"
feature_size: "M"
---

# Server actions and business layer — mcp-server

This is the typed RPC surface of the `backend-service` container that the `web-frontend` surface uses:
- `'use server'` actions, which the Browser UI and RSC pages call;
- the business functions in `lib/services` (`ActingFreelancer` in, `ActionResult` out), which both the web app and the MCP adapter call.

The Assistant connection (`/api/mcp`) is in [`openapi.yaml`](./openapi.yaml). Only actions and functions whose contract this feature adds or changes are listed. Every other action keeps its signature.

Derived from:
- `data-model.md` (`PersonalKey`, `PersonalKeyUsageWeek`, `User.timeZone`, `User.overdueNoticeDismissedAt`, `LimitScope`), plus the existing schema (`prisma/schema/*.prisma`) for unchanged entities;
- sad.md §5 and §6 flows 3, 4, 12, 13, 14, 15, and critical flow 2;
- spec §5 AC-01 to AC-06, AC-22 to AC-26.

Field origins are in [`api-sync-report.md`](./api-sync-report.md).

## ActionResult (unchanged)

No new `ActionErrorCode` and no new `ActionErrorDetails` kind for the web surface. The two new detail kinds used by the Assistant connection (`PAGE_OUT_OF_RANGE`, `AMBIGUOUS_REFERENCE`) live in the MCP adapter's own `ToolError` type (`lib/mcp/answers.ts`), not in `types/result.ts`. The business functions behind the tools return them as `fail('NOT_FOUND' | 'VALIDATION', message, { details })`, so `ActionErrorDetails` gains those two kinds:

```ts
type ActionErrorDetails =
  | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }
  | { kind: 'HAS_INVOICES'; invoiceCount: number }
  | { kind: 'RETRY_AT'; retryAt: string }
  | { kind: 'PAGE_OUT_OF_RANGE'; total: number; lastPage: number }                       // ★
  | { kind: 'AMBIGUOUS_REFERENCE'; reference: 'invoice' | 'customer' | 'senderProfile';  // ★
      candidates: AmbiguousCandidate[] };
```

Exhaustive `switch`es over `details.kind` must handle both. The web UI never receives them (no web action returns them).

## Personal keys — `lib/actions/personal-key-actions.ts` ★ new, over `lib/services/personal-keys/`

Every action resolves the session first (security-patch backstop guard) and calls the service with the session `ActingFreelancer`.

```ts
type PersonalKeySummary = {
  id: string;            // PersonalKey.id — the revoke handle, not secret
  name: string;          // PersonalKey.name, trimmed, 1–50
  createdAt: string;     // ISO 8601 UTC
  lastFour: string;      // PersonalKey.lastFour
  lastUsedAt: string | null; // null = "never used" (AC-05)
};
type RevokedPersonalKeySummary = PersonalKeySummary & { revokedAt: string };

type PersonalKeyList = {
  active: PersonalKeySummary[];          // createdAt DESC
  revoked: RevokedPersonalKeySummary[];  // createdAt DESC
};
```

`digest` and `activeNameKey` never leave the service.

### `createPersonalKey(input: { name: string })` ★ (US-01; flow 4)

Returns `ActionResult<{ key: PersonalKeySummary; fullKey: string }>`.

| Outcome | Result | Notes |
|---|---|---|
| created | `ok({ key, fullKey })` | `fullKey` matches `^ifk_[0-9A-Za-z]{49}$` (ADR-0004). It is returned **only here, once**, and never stored readable. The page shows it with a copy action and a will-not-be-shown-again warning (AC-02) |
| name empty / > 50 characters after trimming | `fail('VALIDATION', KEY_NAME_MESSAGE, { fieldErrors: { name: [KEY_NAME_MESSAGE] } })` | AC-03 |
| same name as another active key, ignoring case | the **same** `VALIDATION` result | AC-03; flow 4 "same message as for an invalid name". Also the mapping of a P2002 on `PersonalKey_userId_activeNameKey_key` |
| already 10 active keys | `fail('CONFLICT', KEY_LIMIT_MESSAGE)` | AC-04. Checked under the per-Freelancer advisory lock (data-model) |
| unexpected failure | `fail('FAILED', 'Could not create the key. Try again.')` | |

```ts
export const KEY_NAME_MESSAGE =
  'The name must be 1 to 50 characters and different from your other active keys.';
export const KEY_LIMIT_MESSAGE =
  'At most 10 keys can be active at once. Revoke one to make room.';
```

Validation: `personalKeyNameSchema = z.string().trim().min(1).max(50)` (`lib/validations/personal-key.ts`), both messages `KEY_NAME_MESSAGE`. Order: name rule → lock → count (AC-04) → name match (AC-03) → insert. With both a duplicate name and 10 active keys, the name refusal wins (flow 4 draws the name branch first).

### `revokePersonalKey(id: string)` ★ (US-02; critical flow 2)

Returns `ActionResult<void>`.

| Outcome | Result | Notes |
|---|---|---|
| revoked | `ok()` | sets `revokedAt` and clears `activeNameKey` in one owner-scoped `UPDATE`. The next key check refuses (AC-06, 0 s). Revalidates the connect page |
| not the Freelancer's key, unknown id, or already revoked | `fail('NOT_FOUND', 'Key not found.')` | `notFoundIfNoneAffected`; never reveals another Freelancer's key. No reactivation path exists (AC-06) |

The confirm step is UI-only (AC-06 "revokes and confirms").

### Read functions (RSC, no action) ★

- `listPersonalKeys(actor): Promise<ActionResult<PersonalKeyList>>` — flow 3, AC-05.
- `hasUsedAnyPersonalKey(actor): Promise<ActionResult<boolean>>` — AC-01: true once any key, active or revoked, has `lastUsedAt`. The dashboard shows the Connect your AI entry point while it is false; Settings always shows it.

### Adapter-only functions (called by `lib/mcp`, never by the web app) ★

```ts
authenticatePersonalKey(fullKey: string, now: Date):
  Promise<{ ok: true; actor: ActingFreelancer; keyId: string } | { ok: false } | { ok: false; unavailable: true }>;
recordPersonalKeyUsage(keyId: string, outcome: 'success' | 'assistant_error' | 'server_failure', now: Date): Promise<void>;
```

- `authenticatePersonalKey` checks format and checksum before any query, then looks up the digest among active keys (data-model "Authenticate"), records last use (≤ once a minute), and builds the `ActingFreelancer` through `actingFreelancerFromPersonalKey` with the account time zone, or `UTC`. `{ ok: false }` carries **no reason**: the caller cannot tell unknown from revoked from malformed (AC-07). A store failure during the key check returns `{ ok: false, unavailable: true }` instead: the adapter answers `503` (`LimitStoreUnavailable`) and records no refused key check against the source. A failed last-use stamp never refuses a valid key.
- `recordPersonalKeyUsage` runs the weekly upsert (`attempts + 1`, plus `successes` or `assistantErrors`), and sets `firstSuccessAt` on the first success. Called once per `tools/call` (openapi `info.description` step 5).

## Limits — `lib/security/limits/` (ADR-0007)

```ts
checkMcpSource(sourceKey: string, now: Date): Promise<{ allowed: true } | { allowed: false; retryAt: Date } | { unavailable: true }>;
recordRefusedKeyCheck(sourceKey: string, now: Date): Promise<void>;     // MCP_SOURCE / REFUSED
takeMcpKeyCall(keyId: string, userId: string, now: Date): Promise<{ allowed: true } | { allowed: false; retryAt: Date } | { unavailable: true }>; // MCP_KEY / REQUESTED
```

`unavailable` maps to `503` (fail closed). A refused key check is recorded for a missing header too (decided at `api`, 2026-10-04). If recording a refused key check fails, the call is still refused with the uniform `401`.

## Freelancer time zone — `lib/actions/profile-actions.ts`, `lib/services/profile/` (US-07; flow 12; ADR-0006)

### Session `ActingFreelancer` factory ✎

`getActingFreelancer()` (session) reads `User.timeZone`:
- saved → use it; the browser value is ignored;
- not saved, and the browser reports a zone that `resolveTimeZone` accepts (the existing architecture-hardening `tz` cookie, now only a seed) → save it with the conditional `updateMany … WHERE timeZone IS NULL` and use it (AC-22);
- not saved, no valid browser zone → `UTC`, nothing saved.

Both factories (session and Personal key) resolve the same column, so the dashboard and every Assistant answer use the same zone from the next request.

### `updateTimeZone(timeZone: string)` ★

Returns `ActionResult<void>`.

| Outcome | Result |
|---|---|
| saved | `ok()`; revalidates every private page |
| not a zone both `Intl` and `pg_timezone_names` know | `fail('VALIDATION', TIME_ZONE_MESSAGE, { fieldErrors: { timeZone: [TIME_ZONE_MESSAGE] } })` — never saved as UTC |

```ts
export const TIME_ZONE_MESSAGE = 'Choose a time zone from the list.';
```

`getProfile` adds `timeZone: string | null` to its result (`null` = not saved yet, shown as UTC). There is no action that clears the zone.

## Overdue-rule notice — `lib/actions/dashboard-actions.ts` (spec §8, resolved at data-model)

- `getDashboardNoticeState(): ActionResult<{ showOverdueRuleNotice: boolean }>` — true while `User.overdueNoticeDismissedAt` is NULL.
- `dismissOverdueRuleNotice(): ActionResult<void>` ★ — `updateMany` by id where it is still NULL; repeat calls return `ok()`.

Notice copy is owned by `screens`.

## Shared overdue rule — every invoice read (US-08; flow 13; ADR-0005)

Additive shape changes only: `SavedInvoice` gains `derivedOverdue`, `issueDate` and `dueDate`, and the `updateInvoice` input gains the optional `loadedIssueDate` / `loadedDueDate` (both recorded in the architecture-hardening contract). These results change meaning:

- **Derived status.** Every read DTO that returns an invoice's `status` (invoice list, recent invoices, customer page, invoice page, `getPaginatedInvoices`, `getInvoicesByCustomer`, `getInvoicesBySenderProfile`, `getInvoice`) returns `OVERDUE` when the shared rule says so, `PENDING` otherwise. The stored column is never written by a read. Display code reads one field.
- **Editor status.** The editor is the exception. `getInvoiceEditorData` returns the **stored** status in `initialData` plus `derivedOverdue: boolean`, and `createInvoice` / `updateInvoice` return the stored `status` plus `derivedOverdue` in `SavedInvoice`, together with the stored `issueDate` / `dueDate` as ISO instants. After a save the editor shows those dates and sends them as the loaded instants of its next save. The editor shows the overdue badge from `derivedOverdue`, so a save echoes the stored status back. If a save still submits `OVERDUE` for a derived-overdue invoice (stored `PENDING`, due date passed), `updateInvoice` stores `PENDING`. A submitted `OVERDUE` on any other invoice, including one not yet due, is stored as sent (`statusToStoreOnSave`, ADR-0005).
- **Status filters.** `status=OVERDUE` / `status=PENDING` filters use the rule's Prisma condition, never the stored status alone (AC-24).
- **Dashboard.** `getSummaryStats`, `getDebtors`, `getExpectedPayments`, `getChartData`, `getRecentInvoices` apply the rule with "today" in the account zone. `getDashboardCurrencyTabs` returns the union of bank-account and issued-invoice currencies (ADR-0008).
- **Paged reads for the Assistant.** New service functions back the tools: `listOverdueInvoices`, `listDebtorsPage`, `listExpectedPaymentsPage`, `getSummaryFiguresAllCurrencies`, `listCustomersForAssistant`, `searchInvoicesForAssistant`, `findInvoiceByReference`. They return `Page<T>` plus totals over every match. Unlike `paginate`, they return `fail('NOT_FOUND', …, { details: { kind: 'PAGE_OUT_OF_RANGE', … } })` for a page past the last one, and never fall back to page 1 (AC-18b). They cap `pageSize` at 50 and report `pageSizeCapped`.

- **Invoice dates.** `issueDate` and `dueDate` are calendar days (ADR-0009). The server action and the service accept only `yyyy-MM-dd` strings; a `Date` or any other string is `VALIDATION` "Invalid date". The day is stored at `T00:00:00Z`. On `updateInvoice`, the payload may carry `loadedIssueDate` / `loadedDueDate` (optional ISO datetimes: the stored instants the editor loaded; anything else is `VALIDATION`). An unedited legacy date (a loaded value that is not a UTC midnight, whose UTC day equals the submitted day) is kept, re-read under `FOR UPDATE` in the update transaction (joined to the owner's `SenderProfile`) so a concurrent zone normalisation is not overwritten.

### `updateInvoiceStatus(id, status)` ✎ (AC-24)

| New case | Result |
|---|---|
| `status` is `OVERDUE` or `PENDING`, and the invoice is overdue only because its due date has passed | `fail('VALIDATION', 'This invoice is overdue because its due date has passed. You can still mark it paid.')` |

Marking it `PAID` works as before. This is the server form of "Mark as overdue / back to pending are not offered" (the UI also hides both actions).

## Data export — `getAccountExport` / `GET /api/user/export` ✎ (US-10; flow 14; AC-25)

`exportVersion` goes from `'2.0'` to `'2.1'` (additive only). Added:

```ts
user: { /* existing */ timeZone: string | null; overdueNoticeDismissedAt: string | null };
personalKeys: Array<{
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  usageWeeks: Array<{ weekStart: string; attempts: number; successes: number; assistantErrors: number }>;
}>;
```

The export **never** contains `digest`, `lastFour`, `activeNameKey`, `id` or the key itself (AC-25). The existing per-Freelancer export limit is unchanged.

## Account deletion — `deleteUserAccount()` (unchanged signature; US-10; flow 15; AC-26)

The existing `prisma.user.delete` cascades `PersonalKey` → `PersonalKeyUsageWeek` and the `MCP_KEY` limit rows in the same transaction (data-model, verified). From the commit on, every key's check fails like an unknown key: the uniform `401`. `getAccountDeletionSummary` is unchanged.
