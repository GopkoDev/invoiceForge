---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
---

# Server actions — architecture-hardening

The typed RPC surface of the `backend-service` container: `'use server'` actions the Browser UI and RSC pages call directly (sad.md §2, §5). HTTP route handlers are in [`openapi.yaml`](./openapi.yaml). Only actions this feature adds or whose contract changes are listed. Every other action keeps its signature and only moves onto the shared `ActionResult` codes (ADR-0009, about ten files).

Derived from `data-model.md` (+ the existing schema `prisma/schema/*.prisma` and `lib/validations/*.ts` for unchanged entities), sad.md §6 flows 2–3 and 6–12, and spec §5. Field origins are in [`api-sync-report.md`](./api-sync-report.md).

## ActionResult (ADR-0009, amended)

```ts
type ActionErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED';

type ActionResult<T = void> =
  | { success: true; data: T }
  | {
      success: false;
      code: ActionErrorCode;
      error: string;                              // plain language, never raw DB/upstream text
      fieldErrors?: Record<string, string[]>;     // VALIDATION / CONFLICT on forms, keyed by form path
      details?: ActionErrorDetails;               // ★ amendment (this contract): structured context
    };

type ActionErrorDetails =
  | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }   // AC-17
  | { kind: 'HAS_INVOICES'; invoiceCount: number };                                 // AC-22

type DecimalString = string;   // /^-?\d{1,8}\.\d{2}$/ — exact 2-dp value from the shared decimal module (ADR-0006)
```

**Amendment to ADR-0009 (additive, decided in the `api` pass):** `details` is optional, so existing callers are unaffected. The code set stays closed at five. `details.kind` tells two `CONFLICT`s apart that need different UI: SCR-15 for `TOTALS_CHANGED`, and SCR-14's count for `HAS_INVOICES`.

**Code → destination (every action):**

| Code | When | Page caller | Form caller |
|---|---|---|---|
| `UNAUTHORIZED` | no session, or a token without a live account (ADR-0002). Checked **before any argument is parsed** (AC-23) | redirect to sign-in (SCR-01) | redirect to sign-in |
| `NOT_FOUND` | the record doesn't exist or isn't the caller's, with an identical message (AC-29) | `notFound()` (SCR-16) | toast / inline |
| `VALIDATION` | the shared zod schema failed, or a domain rule broke (AC-14/15/16/19) | — | `fieldErrors` next to the fields |
| `CONFLICT` | a uniqueness or state invariant (AC-08, AC-17, AC-22) | — | inline (`fieldErrors`) or a dialog (`details`) |
| `FAILED` | anything else. The detail goes to `console.error` + Sentry | throw → segment `error.tsx` (SCR-17) | toast with retry |

**Boundary (AC-05, ADR-0001):** a server-action POST without a session token never reaches the action. The proxy replies `401` with the `NotSignedIn` body (openapi.yaml), and the client call rejects. The UI treats a rejected action call like `UNAUTHORIZED`.

## Invoices — `lib/actions/invoice-actions/`

### Shared input: `InvoiceFormValues` (`lib/validations/invoice.ts`) ✎

| Field | Type / rule | Change | AC |
|---|---|---|---|
| `invoiceNumber` | `string`, trimmed. **Empty (`''` or whitespace only) = system-assigned**; anything else is manual | ✎ was `min(1)` | AC-06, AC-10 |
| `senderProfileId`, `customerId`, `bankAccountId` | `string min(1)`. Ownership checked in the action → `NOT_FOUND` | — | AC-29 |
| `status` | `enum InvoiceStatus` = `DRAFT \| PENDING \| PAID \| OVERDUE \| CANCELLED`. Unknown → `VALIDATION` "Unknown status" | message ✎ | AC-19 |
| `issueDate`, `dueDate` | date | — | — |
| `currency` | `enum Currency` | — | — |
| `items[]` | `min(1)` | — | — |
| `items[].quantity` | `number > 0`, ≤ 99 999 999.99, 2 dp | ★ max | AC-14 |
| `items[].price` | `number ≥ 0`, ≤ 99 999 999.99, 2 dp | ★ max | AC-14 |
| `items[].total` | **ignored by the server**. Kept in the type for the editor only | ✎ | AC-13 |
| `taxRate` | `0 ≤ n ≤ 100`, 2 dp | — | AC-14 |
| `shipping` | `number ≥ 0`, ≤ 99 999 999.99 | ★ max | AC-14 |
| `discount` | `number ≥ 0` **and ≤ subtotal + shipping** (recomputed). Equal is allowed → total 0 | ★ cap | AC-15 |
| `confirmedTotals` | `{ oldTotal: DecimalString; newTotal: DecimalString }`, optional, **update only** | ★ | AC-17 |

Stored amounts come only from the shared module (ADR-0006): `item.amount = roundHalfUp(quantity × price, 2)`, `subtotal = Σ amount`, `taxAmount = roundHalfUp((subtotal − discount + shipping) × taxRate / 100, 2)` (the tax base as today in `lib/helpers/invoice-calculations.ts`), `total = subtotal − discount + shipping + taxAmount`. Client-sent totals never reach the database.

**Field-error messages (plain language, stable text, the UI shows them verbatim):**

| `fieldErrors` key | Message |
|---|---|
| `invoiceNumber` | "This invoice number is already used in this sender profile." |
| `items.<i>.price` | "Price can't be negative." |
| `items.<i>.quantity` | "Quantity must be greater than zero." |
| `shipping` | "Shipping can't be negative." |
| `discount` | "Discount can't be negative." / "Discount can't exceed the subtotal plus shipping." |
| `taxRate` | "Tax rate must be between 0 and 100 %." |
| `status` | "Unknown status." |

### `createInvoice(data: InvoiceFormValues): Promise<ActionResult<SavedInvoice>>` ✎

Flow 2. The number, amounts and paid date are decided server-side in one transaction.

```ts
type SavedInvoice = {
  id: string;
  invoiceNumber: string;        // final number: as typed (manual) or allocated
  subtotal: number; taxAmount: number; total: number;   // stored figures (AC-13)
  status: InvoiceStatus;
  paidAt: string | null;        // ISO; set by applyStatusChange() (AC-18)
};
```

| Outcome | Result |
|---|---|
| number empty | allocate from the profile sequence under the row lock, skip keys taken by manual numbers, advance the counter (AC-06, AC-07, AC-09) → `success` |
| number filled, key free in the profile | keep it; counter untouched (AC-10) → `success` |
| number filled, key taken | `CONFLICT`, `fieldErrors.invoiceNumber`; rollback, counter untouched (AC-08) |
| unique violation (P2002) on the key despite the lock (allocator bug backstop) | `CONFLICT` as above + a Sentry alert (sad §7) |
| rule broken (AC-14, AC-15, AC-19) | `VALIDATION` + `fieldErrors`; nothing saved |
| profile / customer / bank account not owned | `NOT_FOUND` |
| `status = PAID` | `paidAt = now` |

### `updateInvoice(id: string, data: InvoiceFormValues): Promise<ActionResult<SavedInvoice>>` ✎

Flows 2, 6 (move), 7 (legacy), 8 (status from the editor). The checks run in this order, and the first failure wins:

1. `UNAUTHORIZED` → `VALIDATION` (schema) → `NOT_FOUND` (invoice, or new relations not owned).
2. **Move (AC-11):** if `senderProfileId` changed, the editor has already cleared the number field. Empty → allocate from **B's** sequence; typed → manual rules in B. A's counter is never touched.
3. **Number:** if the normalized key equals the invoice's own current key and the profile is unchanged → keep it. Otherwise → the manual rules of `createInvoice` (`CONFLICT` if taken).
4. **Legacy shared number (AC-17):** the invoice's key is `NULL` or shared with another invoice in the profile, and the number is unchanged → `CONFLICT`, `fieldErrors.invoiceNumber = ["This invoice number is also used by another invoice. Change it to a free one to save."]`.
5. **Legacy totals (AC-17, flow 7):** the recomputed `total` ≠ the stored `total`:
   - without `confirmedTotals`, or with values that no longer equal (stored, recomputed) → `CONFLICT`, `details: { kind: 'TOTALS_CHANGED', oldTotal, newTotal }`, `error: "The total of this invoice changes from {oldTotal} to {newTotal}. Confirm to save."`. Nothing saved; the UI opens SCR-15.
   - with `confirmedTotals` equal to both → saved.
6. **Status (AC-18, AC-19):** `applyStatusChange(prev, next)`: entering `PAID` → `paidAt = now`; `PAID → PAID` → unchanged; leaving `PAID` → `null`.

Example, legacy first save → confirmation → resubmit:

```json
{ "success": false, "code": "CONFLICT",
  "error": "The total of this invoice changes from 120.00 to 119.99. Confirm to save.",
  "details": { "kind": "TOTALS_CHANGED", "oldTotal": "120.00", "newTotal": "119.99" } }
```
```ts
updateInvoice('clx0000000000000000000002', { ...form, confirmedTotals: { oldTotal: '120.00', newTotal: '119.99' } })
```

### `updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>>` ✎

Flow 8, list branch. Touches **only** `status` and `paidAt`. It never runs the amount, number or legacy checks (AC-17 last sentence). Outcomes: `UNAUTHORIZED`; `VALIDATION` (`status` is not in the enum, AC-19); `NOT_FOUND`; `success` with the result of `applyStatusChange()`.

### `duplicateInvoice(id: string): Promise<ActionResult<{ id: string; invoiceNumber: string }>>` ✎

Flow 6, duplicate branch (AC-12). In one transaction: allocate from the original's sender-profile sequence (same allocator and format as create), insert the copy with recomputed amounts, `status = DRAFT`, `paidAt = null`. Outcomes: `UNAUTHORIZED`, `NOT_FOUND`, `FAILED`.

### `generateInvoiceNumber(senderProfileId: string): Promise<ActionResult<string>>` (semantics ✎)

Returns the **hint only** ("assigned on save", AC-06): the first free number from the current sequence, computed without a lock and **without side effects**. It is never sent back as the number. Outcomes: `UNAUTHORIZED`, `NOT_FOUND`, `FAILED`.

### `getInvoiceEditorData(invoiceId?: string)` / `getInvoice(id)` ✎ — legacy flags

For an existing invoice, `data.invoice` gains:

```ts
legacy: {
  storedTotal: DecimalString;       // Invoice.total
  recomputedTotal: DecimalString;   // shared module over the stored lines
  sharedNumber: boolean;            // key NULL, or another invoice in the profile has the same normalized key
} | null                            // null when nothing differs and the number is free
```

Load failure → `FAILED` (page throws to `error.tsx`, AC-28). Missing or foreign → `NOT_FOUND` (AC-29).

### `getPaginatedInvoices(params: InvoiceListParams): Promise<ActionResult<PaginatedInvoiceList>>` ✎

Takes **already-parsed** params from `lib/validations/search-params.ts` (see Link parameters). It no longer casts raw strings (L6). `PaginatedInvoiceList` gains `applied: InvoiceListParams`, so the controls show what was applied (AC-26).

## Account and profile — `lib/actions/account-actions.ts`, `profile-actions.ts`

### ★ `getAccountDeletionSummary(): Promise<ActionResult<{ invoiceCount: number }>>`

Flow 3 "asks how many invoices will be lost" (AC-20). `invoiceCount` = `count(Invoice WHERE senderProfile.userId = me)`. Outcomes: `UNAUTHORIZED`, `FAILED`.

### `deleteUserAccount(): Promise<ActionResult<void>>` ✎

Was `{ success, message }` (F3). One transaction (ADR-0007): delete the Freelancer's invoices (their items cascade), then `User`, which cascades Account, Session, EmailHistory, SenderProfile → BankAccount, Customer → CustomPrice, Product and LogoFetchWindow. All or nothing. Outcomes: `UNAUTHORIZED`; `FAILED` ("Your account couldn't be deleted. Nothing was removed."); `success` → the client signs out and lands on SCR-01. Other devices become Visitors on their next request (AC-21). <!-- carried from data-model TBD: whether VerificationToken rows for the email are also deleted (AC-20 "sign-in links") — see report OQ-2 -->

### `updateProfile(data: ProfileFormValues): Promise<ActionResult<void>>` ✎

F3 / AC-23: the session check runs **before** `profileFormSchema.parse`. `UNAUTHORIZED` → `VALIDATION` (`name ≤ 50`, `email` format, `image` URL or `''`) → `FAILED`. The shape moves from `{ success, message }` to `ActionResult`.

## Sender profiles and customers

### `updateSenderProfile(id, data)` / `createSenderProfile(data)` ✎

AC-04 / flow 5: `logo` must be an **`https:`** URL or empty. Otherwise `VALIDATION`, `fieldErrors.logo = ["The link must be a secure web address (https://…)."]`. The other fields are unchanged (`lib/validations/sender-profile.ts`). The session check runs first.

### `deleteSenderProfile(id)` / `deleteCustomer(id)`: `Promise<ActionResult<void>>` ✎

Flow 10 (AC-22). Outcomes:

| Outcome | Result |
|---|---|
| not found / not owned | `NOT_FOUND` |
| N ≥ 1 invoices reference it | `CONFLICT`, `details: { kind: 'HAS_INVOICES', invoiceCount: N }`, `error: "N invoices depend on this customer, so it can't be deleted."` (or "…this sender profile…") |
| an invoice was saved between the count and the delete (FK `Restrict` violation, P2003) | the same `CONFLICT`, with `invoiceCount` recounted. Never `FAILED` (sad §6 flag) |
| none | `success` |

## Custom prices — `lib/actions/custom-price-actions.ts`

### `createCustomPrice(data: CustomPriceInput): Promise<ActionResult<{ id: string }>>` ✎

```ts
type CustomPriceInput = {
  customerId: string;        // ★ explicit and required (L10: was context.customerId || data.productId)
  productId: string;
  name?: string;             // trimmed, ≤ 100
  price: number;             // > 0, ≤ 99 999 999.99, 2 dp
  notes?: string;            // trimmed, ≤ 500
};
```

Order: `UNAUTHORIZED` → `VALIDATION` (the shared schema, now **before** the lookups) → `NOT_FOUND` if the customer **or** product isn't the caller's (AC-31, one message: "Customer or product not found.") → `success`. No `as` casts (L8).

### `updateCustomPrice(id: string, data: Pick<CustomPriceInput, 'name' | 'price' | 'notes'>): Promise<ActionResult<void>>` ✎

The **same schema and messages as create** (AC-16): "Price must be a number.", "Price must be positive.", "Note must be 500 characters or fewer." The ownership chain `CustomPrice → Customer.userId`. The `customerId` / `productId` arguments are dropped, because the price keeps its link (flow 9). Outcomes: `UNAUTHORIZED`, `VALIDATION`, `NOT_FOUND`, `success`.

## Link parameters — `lib/validations/search-params.ts` ★

Page URLs, not an API, but a contract that bookmarked and shared links rely on (AC-25–27, flow 11). Every invalid value falls back to its default, and nothing throws.

### Invoice list (`/invoices`)

| Param | Accepted | Default |
|---|---|---|
| `page` | integer ≥ 1 (an out-of-range page falls back to 1) | `1` |
| `pageSize` | one of `10, 20, 30, 50, 100` | `10` |
| `sortField` | `createdAt \| issueDate \| dueDate \| total \| invoiceNumber` (`InvoiceSortField`) | `createdAt` |
| `sortDirection` | `asc \| desc` | `desc` |
| `status` | `all` or `InvoiceStatus` | `all` |
| `tab` | `all \| drafts \| final` (`InvoiceTab`) | `all` |
| `customerId`, `senderProfileId` | string (a foreign id simply matches nothing) | none |
| `search` | string, trimmed, ≤ 100 | `''` |
| `dateFrom`, `dateTo` | `YYYY-MM-DD`, with from ≤ to (otherwise both are dropped) | none |

Date bounds: `[startOfDay(dateFrom, tz), startOfDay(dateTo + 1 day, tz))`, so the end is exclusive at the next local midnight (AC-27). `tz` comes from the `tz` cookie (an IANA name validated with `Intl`), falling back to `UTC` (ADR-0010).

### Dashboard (`/dashboard`)

| Param | Accepted | Default |
|---|---|---|
| `from`, `to` | `YYYY-MM-DD`, both valid and from ≤ to | the current month in `tz` (AC-25) |
| `preset` | `all-time` (no range) or absent | absent |
| `currency` | enum `Currency`, among the Freelancer's currency tabs | the first currency tab (existing `validateCurrency`) |

The page returns `appliedRange` to the date filter (AC-25).

> Offset `page`/`pageSize` is deliberate here: it is the list's existing link format (SAD §8) and not an HTTP API, so it deviates from the skill's cursor default (report §C).
