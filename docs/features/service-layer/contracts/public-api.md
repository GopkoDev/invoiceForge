---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-01"
feature_size: "M"
version: "1.0.0"
---

# Business-layer public API — service-layer

The typed in-process interface of the `backend-service` container's new core, `lib/services/` (sad.md §5). Its callers are the web wrappers today (`'use server'` actions, RSC page loaders, route handlers), request-free tests, and later the Assistant's own authenticating adapter. Every business function is a plain `async` TypeScript function. It is **not** browser-callable: it has no HTTP route and no `'use server'` marker (ADR-0006). **No OpenAPI change:** the two route handlers this feature touches (`GET /api/user/export`, `POST /api/convert-image`) keep the HTTP contract in [`architecture-hardening/contracts/openapi.yaml`](../../architecture-hardening/contracts/openapi.yaml), and only their internals move onto the layer. **No events:** every call is an in-process function call (sad.md §8 Events: N/A).

Derived from `data-model.md` (owner paths, search fields, list orders), sad.md §4 choices 1–5 and §6 flows 1–12, spec §4/§5, ADR-0001…0006, and, for rules that parity preserves unchanged, the current `lib/actions/**`, `lib/validations/*.ts` and [`architecture-hardening/contracts/server-actions.md`](../../architecture-hardening/contracts/server-actions.md). Field origins and the drift check are in [`api-sync-report.md`](./api-sync-report.md).

**Legend:** ★ new shape · ✎ changed from today's action · = today's DTO or rule, unchanged (parity). "Web wrapper" names the `'use server'` action that keeps today's export name and signature and now calls the business function.

## 1. Shared contract

### 1.1 ActingFreelancer (ADR-0001) ★

```ts
// lib/services/_shared/acting-freelancer.ts
declare const actingFreelancerBrand: unique symbol;

export type ActingFreelancer = {
  readonly userId: string;          // User.id (cuid)
  readonly timeZone: string;        // IANA zone known to BOTH Intl and pg_timezone_names, else 'UTC'
  readonly [actingFreelancerBrand]: true;
};
```

| Factory | Where | Input | Output |
|---|---|---|---|
| `actingFreelancerFromSession()` | `lib/helpers/session-actor.ts` (web only; `server-only`, **not** `'use server'`: `auth-helpers.ts` is a `'use server'` file, so an export there would be browser-callable) | the next-auth session + the `tz` cookie | `ActionResult<ActingFreelancer>`. `UNAUTHORIZED` "Not signed in." when there is no session or the account no longer exists (AC-10). Built **before** any argument is parsed (hardening AC-23 order) |
| `actingFreelancerForRoute()` | `lib/helpers/session-actor.ts` (route handlers only) | `requireSession()` + the `tz` cookie | `{ ok: true; actor: ActingFreelancer } \| { ok: false; response: Response }`. The `response` is today's `requireSession()` 401 body, unchanged; if the one-time time-zone lookup fails, the error is reported once to Sentry and `response` is the route's own documented failure body (passed in as `failureResponse`: `/api/user/export` → 500 `EXPORT_FAILED` body, `/api/convert-image` → 502 `UNAVAILABLE` "The logo could not be loaded from this link."). `actingFreelancerFromSession()` likewise reports once and returns `FAILED` — neither factory falls back to UTC on a failed lookup |
| `actingFreelancerForTest(userId, timeZone?)` | `tests/support/` | raw values | `Promise<ActingFreelancer>` |
| *(later)* the Assistant factory | the Assistant feature | its own authentication | — (not built here, spec §3) |

- Every factory resolves the zone with `resolveTimeZone(raw)` (`lib/services/_shared/time-zone.ts`): kept only if `Intl` **and** PostgreSQL know it (the PostgreSQL set is read once per process), otherwise `'UTC'`. A missing zone is `'UTC'` (AC-22, spec §8 OQ-2 default).
- The object is built only inside `acting-freelancer.ts`. `as ActingFreelancer` elsewhere fails lint (sad.md §8).
- **First parameter of every business function.** No business function reads the session, a cookie, a header, `revalidatePath`, `unstable_cache` or `redirect` (QG-3).

### 1.2 Result (ADR-0002) ✎ moved

`types/result.ts` holds today's union from `types/actions.ts` verbatim, and `types/actions.ts` re-exports it (`ActionResult` stays as a name):

```ts
type ActionErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; code: ActionErrorCode; error: string;
      fieldErrors?: Record<string, string[]>; details?: ActionErrorDetails };

type ActionErrorDetails =
  | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }
  | { kind: 'HAS_INVOICES'; invoiceCount: number };

type DecimalString = string;   // /^-?\d{1,8}\.\d{2}$/ (hardening ADR-0006)
type LocalDate = string;       // ★ 'YYYY-MM-DD', a real calendar date, read in actor.timeZone
```

**Codes a business function may return:**

| Code | When | Web wrapper does |
|---|---|---|
| `NOT_FOUND` | the record, a parent of a list, or a referenced record is missing **or belongs to another Freelancer**. Same message for both (AC-08, AC-09, AC-19). Also: the acting Freelancer's own `User` row vanished mid-call (§1.4) | today's not-found outcome (`notFound()` / toast) |
| `VALIDATION` | the input failed the entity's zod schema, a list query, or a filter (AC-02, AC-13, AC-26). `fieldErrors` names the value, and the message says what is allowed | passes it through |
| `CONFLICT` | a uniqueness or state rule: number taken, totals changed, has invoices, draft-only delete, email in use | passes it through |
| `FAILED` | anything unexpected. `failed()` inside the business function reports the cause to Sentry **once**, and the message is plain language (AC-04, QG-5) | passes it through and never reports again |

**A business function never returns `UNAUTHORIZED`** (ADR-0002). Only `actingFreelancerFromSession()` produces it.

### 1.3 Lists: ListQuery and Page (ADR-0005) ★

```ts
// lib/services/_shared/list-query.ts
type ListQuery = {
  search?: string;    // trimmed; '' = no search; ≤ 100 characters; case-insensitive substring (ILIKE)
  page?: number;      // integer, 1 to 2147483647
  pageSize?: number;  // integer, 1 to 2147483647 (the 32-bit limit of skip/take)
};

type Page<T> = {
  items: T[];
  total: number;       // records matching the search, all pages
  page: number;        // the page actually returned
  pageSize: number;
  totalPages: number;  // 0 for an empty list
  hasMore: boolean;    // page < totalPages
};
```

| Input | Result (AC-11, AC-12, AC-14) |
|---|---|
| no `page` and no `pageSize` | the full matching list in today's order: `page: 1`, `pageSize: total`, `totalPages: total > 0 ? 1 : 0`, `hasMore: false` |
| `page` without `pageSize` | `pageSize: 10` |
| `pageSize` without `page` | `page: 1` |
| `page > totalPages` | page 1 is returned, and `page: 1` is reported. An empty list answers `page: 1`, `totalPages: 0` |
| every order | today's order, then `id` ascending as the final tiebreak (spec §1 change 4) |

**List-query validation (`VALIDATION`, no records, AC-13):**

| `fieldErrors` key | Refused when | Message ★ |
|---|---|---|
| `page` | not an integer, or < 1 | "Page must be a whole number of at least 1." |
| `page` | > 2147483647 | "Page must be a whole number from 1 to 2147483647." |
| `pageSize` | not an integer, or < 1 | "Page size must be a whole number of at least 1." |
| `pageSize` | > 2147483647 | "Page size must be a whole number from 1 to 2147483647." |
| `search` | longer than 100 characters | "Search text can be at most 100 characters." |

The `error` of a `VALIDATION` result from a list is "Invalid list request." Messages marked ★ are new (they have no parity oracle, since web pages correct links before calling, per hardening AC-25/26).

**Consistency (sad.md §6 flow 4 flag):** `total` and `items` are two reads outside a transaction. A concurrent change may make them disagree by one, which is accepted for a read.

### 1.4 Tenant gone mid-call ✎ (decided in the `api` pass)

Today `updateProfile`, `deleteUserAccount` and the export route re-read the `User` row, and they answer `UNAUTHORIZED` (or the export's `FAILED` 500) if it vanished after the session check. In the layer, such a function returns **`NOT_FOUND` "Account not found."**, and the **web wrapper maps it to today's outcome** (`UNAUTHORIZED` "Not signed in." for the two actions, and the `EXPORT_FAILED` 500 body for the route). ADR-0002 stays as written.

## 2. Business functions

Signature form: `fn(actor: ActingFreelancer, …): Promise<ActionResult<T>>`. Every read and every write carries the owner path of `data-model.md` §Entities in its own `where` clause or SQL join (ADR-0003). A write that misses (Prisma `P2025`, or `count === 0` on the `updateMany`/`deleteMany` fallback) returns `NOT_FOUND`.

Input schemas are the existing ones in `lib/validations/` (=), and the business function parses them itself (sad.md §8 Input validation). Field-error messages are today's, byte for byte (AC-02).

### 2.1 Customers — `lib/services/customers/` (owner: `Customer.userId = A`)

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listCustomers(actor, query?: ListQuery)` ★ | `Page<CustomerWithRelations>` = | search on `name`, `companyName`, `email`. Order `createdAt desc, id` | `getCustomers()` → `data.items` |
| `getCustomer(actor, id)` | `CustomerWithRelations` = | `NOT_FOUND` "Customer not found." | `getCustomer(id)` |
| `createCustomer(actor, input: CustomerFormValues)` | `{ id: string }` | `VALIDATION` | `createCustomer(data)` + today's revalidations |
| `updateCustomer(actor, id, input: CustomerFormValues)` | `void` | `VALIDATION` → `NOT_FOUND` (flow 1) | `updateCustomer(id, data)` |
| `deleteCustomer(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` + `details: { kind: 'HAS_INVOICES', invoiceCount }`, also after the restrict-race recount (flow 9, AC-17) | `deleteCustomer(id)` |

### 2.2 Products — `lib/services/products/` (owner: `Product.userId = A`)

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listProducts(actor, query?: ListQuery & { onlyActive?: boolean })` ★ | `Page<SerializedProduct>` = | search on `name`. Order: today's (`isActive desc, …`), then `id` | `getProducts({ onlyActive })` → `data.items` |
| `getProduct(actor, id)` | `SerializedProduct` = | `NOT_FOUND` "Product not found." | `getProduct(id)` |
| `createProduct(actor, input: ProductFormValues)` | `{ id: string }` | `VALIDATION` | `createProduct(data)` |
| `updateProduct(actor, id, input: ProductFormValues)` | `void` | `VALIDATION` → `NOT_FOUND` | `updateProduct(id, data)` |
| `deleteProduct(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` "Cannot delete product used in {n} invoice(s). Consider deactivating it instead." (=, no `details`) † | `deleteProduct(id)` |
| `toggleProductActive(actor, id)` | `void` | `NOT_FOUND` | `toggleProductActive(id)` |

### 2.3 Custom prices — `lib/services/custom-prices/` (owner: `customer.userId = A`, and on writes also `product.userId = A`)

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listCustomerCustomPrices(actor, customerId, query?: ListQuery)` ★ | `Page<SerializedCustomPrice>` = | parent `NOT_FOUND` "Customer not found." (flow 4). Search on product `name`, customer `name`. Order `product.name asc, id` | `getCustomerCustomPrices(customerId)` → `data.items` |
| `listProductCustomPrices(actor, productId, query?: ListQuery)` ★ | `Page<SerializedCustomPrice>` = | parent `NOT_FOUND` "Product not found.". Same search. Order `customer.name asc, id` | `getProductCustomPrices(productId)` → `data.items` |
| `createCustomPrice(actor, input: CustomPriceSchemaValues)` | `{ id: string }` | `VALIDATION` → `NOT_FOUND` (customer or product missing or foreign, AC-19 by analogy) | `createCustomPrice(data)` |
| `updateCustomPrice(actor, id, input: UpdateCustomPriceValues)` ✎ | `{ customerId: string; productId: string }` (for the wrapper's revalidation) | `VALIDATION` → `NOT_FOUND` | `updateCustomPrice(id, data)` |
| `deleteCustomPrice(actor, id, customerId)` ✎ | `{ customerId: string; productId: string }` | `NOT_FOUND` "Customer not found." (customer missing or foreign) → `NOT_FOUND` "Custom price not found." (no price with this id under that customer), as today | `deleteCustomPrice(id, customerId, productId?)`. `productId?` stays in the wrapper signature and is no longer needed for revalidation |

### 2.4 Sender profiles — `lib/services/sender-profiles/` (owner: `SenderProfile.userId = A`)

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listSenderProfiles(actor, query?: ListQuery)` ★ | `Page<SenderProfileWithRelations>` = | search on `name`, `legalName`. Order `isDefault desc, updatedAt desc, id` | `getSenderProfiles()` → `data.items` |
| `getSenderProfile(actor, id)` | `SenderProfileWithRelations` = | `NOT_FOUND` "Sender profile not found." | `getSenderProfile(id)` |
| `getSenderProfileLogo(actor, id)` ★ | `{ logo: string \| null }` | `NOT_FOUND` | `POST /api/convert-image` (it answers 404 on `NOT_FOUND` **or** `logo: null`, as today) |
| `createSenderProfile(actor, input: SenderProfileFormValues)` | `SenderProfile` = | `VALIDATION` | `createSenderProfile(data)` |
| `updateSenderProfile(actor, id, input: SenderProfileFormValues)` | `SenderProfile` = | `VALIDATION` → `NOT_FOUND` | `updateSenderProfile(id, data)` |
| `deleteSenderProfile(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` + `HAS_INVOICES`, also after the race recount (flow 9, AC-17) | `deleteSenderProfile(id)` |

### 2.5 Bank accounts — `lib/services/bank-accounts/` (owner: `senderProfile.userId = A`)

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listBankAccounts(actor, senderProfileId, query?: ListQuery)` ★ | `Page<BankAccountWithRelations>` = | parent `NOT_FOUND` "Sender profile not found.". Search on `bankName`, `accountName` (**never** `accountNumber` or `iban`). Order `isDefault desc, createdAt desc, id` | `getBankAccounts(id, limit?)` → `limit` becomes `{ page: 1, pageSize: limit }`, then `data.items` |
| `createBankAccount(actor, senderProfileId, input: BankAccountFormValues)` | `BankAccount` = | `VALIDATION` → `NOT_FOUND` (profile) | `createBankAccount(senderProfileId, data)` |
| `updateBankAccount(actor, id, input: BankAccountFormValues)` | `BankAccount` = | `VALIDATION` → `NOT_FOUND` | `updateBankAccount(id, data)` |
| `deleteBankAccount(actor, id)` ✎ | `{ senderProfileId: string }` (for the wrapper's revalidation) | `NOT_FOUND` · `CONFLICT` "Cannot delete bank account with existing invoices. Please delete or reassign invoices first." (=, no `details`) † | `deleteBankAccount(id)` |

### 2.6 Invoices — `lib/services/invoices/` (owner: `senderProfile.userId = A`. On writes, the referenced `customer`, `bankAccount` and every item `product` must also belong to A)

#### InvoiceListQuery ★ (flow 5, AC-13, AC-21, AC-26)

```ts
type InvoiceListQuery = ListQuery & {
  status?: InvoiceStatus | 'all';                 // default 'all'
  tab?: 'all' | 'drafts' | 'final';               // default 'all'
  customerId?: string;
  senderProfileId?: string;
  dateFrom?: LocalDate;                           // both or neither; dateFrom <= dateTo
  dateTo?: LocalDate;                             // inclusive; bound = next local midnight, exclusive
  sortField?: 'createdAt' | 'issueDate' | 'dueDate' | 'total' | 'invoiceNumber';  // default 'createdAt'
  sortDirection?: 'asc' | 'desc';                 // default 'desc'
};

type InvoicePage = Page<InvoiceListItem> & {       // InvoiceListItem =
  filterOptions: InvoiceFilterOptions;            // = customers + sender profiles for the dropdowns
  totalInvoices: number;                          // = count without filters (empty-state detection)
};
```

- Search on `invoiceNumber`, `customerName`, `senderName` (=). Order `[sortField] [sortDirection], id`.
- Dates: `issueDate ∈ [startOfLocalDay(dateFrom, actor.timeZone), startOfLocalDay(dateTo + 1, actor.timeZone))`. The AC-21 Kyiv invoice counts in October.
- A foreign or unknown `customerId` / `senderProfileId` filter matches nothing, so it returns an empty page. That is the same answer as for an id that never existed (AC-08).
- The **invoices page wrapper always passes `pageSize`** (10 by default, from the corrected link), so its first page still shows 10 (spec §1).

| `fieldErrors` key | Refused when | Message ★ |
|---|---|---|
| `status` | not `'all'` and not an `InvoiceStatus` | "Unknown status." (= hardening wording) |
| `tab` | not one of the three tabs | "Unknown tab. Allowed: all, drafts, final." |
| `sortField` | not one of the five fields | "Unknown sort option. Allowed: createdAt, issueDate, dueDate, total, invoiceNumber." |
| `sortDirection` | not `asc`/`desc` | "Unknown sort direction. Allowed: asc, desc." |
| `dateFrom` / `dateTo` | not a real `YYYY-MM-DD` date, only one end given, or `dateFrom > dateTo` | "Give both dates as YYYY-MM-DD, with the start on or before the end." |

#### Functions

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `listInvoices(actor, query?: InvoiceListQuery)` ★ | `InvoicePage` | `VALIDATION` (list + filters) | `getPaginatedInvoices(params)` ✎ maps `items → invoices` and adds its own `applied` (the corrected link params), so the page sees today's `PaginatedInvoiceList & { applied }`. `getInvoicesByCustomer(id, limit)` / `getInvoicesBySenderProfile(id, limit)` → `{ customerId \| senderProfileId }` (plus `page: 1, pageSize: limit` only when a limit is given) → `data.items`; a `FAILED` result keeps the old "Failed to fetch customer invoices." / "Failed to fetch sender profile invoices." messages |
| `getInvoice(actor, id)` | `SerializedInvoice` = | `NOT_FOUND` "Invoice not found." | `getInvoice(id)` |
| `getInvoiceEditorData(actor, invoiceId?)` | `InvoiceEditorData` = (customers, products, sender profiles with bank accounts, custom prices, and the invoice + legacy info when `invoiceId` is given) | `NOT_FOUND` (invoice) · `FAILED` (flow 11, AC-25) | `getInvoiceEditorData(invoiceId?)` |
| `peekNextInvoiceNumber(actor, senderProfileId)` | `string` | `NOT_FOUND` "Sender profile not found." No lock, no side effect | `generateInvoiceNumber(senderProfileId)` |
| `createInvoice(actor, input: InvoiceFormValues)` | `SavedInvoice` = | `VALIDATION` (schema + amount rules) → `NOT_FOUND` (profile, customer, bank account or product missing or foreign, AC-19) → `CONFLICT` `fieldErrors.invoiceNumber` "This invoice number is already used in this sender profile." (typed number, AC-16) · `CONFLICT` + `captureMessage('invoice_number_conflict')` (system number clash, backstop) → success: number from the sequence under the row lock when empty (AC-15). `status = PAID` sets `paidAt` (flow 6) | `createInvoice(data)` |
| `updateInvoice(actor, id, input: InvoiceFormValues)` | `SavedInvoice` = | order unchanged from hardening: `VALIDATION` → `NOT_FOUND` (invoice or new reference) → number rules / legacy shared number `CONFLICT` → `CONFLICT` + `details: { kind: 'TOTALS_CHANGED', oldTotal, newTotal }` unless `input.confirmedTotals` echoes both (AC-18) → paid-date rule (AC-23) (flow 7) | `updateInvoice(id, data)` |
| `updateInvoiceStatus(actor, id, status: string)` | `{ status: InvoiceStatus; paidAt: string \| null }` = | `VALIDATION` "Unknown status." → `NOT_FOUND`. Reads the current status and writes inside one transaction, with the owner in both `where` clauses (ADR-0003 read-then-write fallback, flow 7 flag). Entering `PAID` sets `paidAt`, `PAID → PAID` keeps it, leaving `PAID` clears it (AC-23) | `updateInvoiceStatus(id, status)` |
| `duplicateInvoice(actor, id)` | `{ id: string; invoiceNumber: string }` = | `NOT_FOUND` (invoice, or its sender profile) · `FAILED` "This invoice can't be duplicated. {reasons}" (the source's legacy amounts break the rules; not reported to Sentry) † · `FAILED` "Failed to duplicate invoice." + `captureMessage('invoice_number_conflict')` (number clash backstop). Success: a `DRAFT` with the same customer, sender profile and lines, `issueDate` = today in `actor.timeZone`, due in 30 days, and the next number from the sequence (flow 8, AC-24) | `duplicateInvoice(id)` |
| `deleteInvoice(actor, id)` | `void` | `NOT_FOUND` · `CONFLICT` "Only draft invoices can be deleted. Consider cancelling instead." † | `deleteInvoice(id)` |

`InvoiceFormValues`, `SavedInvoice`, the amount rules, the field-error messages and the numbering behaviour are exactly as in [`architecture-hardening/contracts/server-actions.md`](../../architecture-hardening/contracts/server-actions.md) §Invoices (=). **Deleted:** `getInvoices()` (the unused list-all function) and its test (spec §1 change 5).

### 2.7 Dashboard — `lib/services/dashboard/` (every query owner-joined through `SenderProfile.userId`, ADR-0004)

```ts
type DashboardPeriod = { from: LocalDate; to: LocalDate };   // ★ inclusive local dates, read in actor.timeZone
```

- **`period` omitted = all time** (today's `appliedRange === undefined`). The page wrapper still computes its current-month fallback, but as local dates: `dashboardParamsSchema` also returns `period: { from, to }` next to today's `appliedRange` (kept, so its existing tests' expected values stay unchanged).
- The layer turns `period` into `[startOfLocalDay(from), startOfLocalDay(to + 1))` in `actor.timeZone`, and SQL buckets use `AT TIME ZONE` with that same zone (AC-21, AC-22).
- `VALIDATION` `fieldErrors.period` "Give both dates as YYYY-MM-DD, with the start on or before the end." for a malformed or reversed period · `fieldErrors.currency` "Unknown currency." for a value outside `Currency` ★.
- Return types are today's DTOs in `types/dashboard/types.ts`, unchanged (=). Every amount is `SUM(numeric)` converted to `number` once (sad.md §8 Money). Each section runs in the Sentry span `dashboard.<section>`.

| Function | Returns | Rows read (QG-4) | Web wrapper |
|---|---|---|---|
| `getCurrencyTabs(actor)` | `CurrencyTab[]` | ≤ currencies | `getDashboardCurrencyTabs()`, inside `unstable_cache` 60 s (wrapper only) |
| `getSummaryStats(actor, currency, period?)` | `DashboardSummaryStats` | 1 | `getDashboardSummaryStats(currency, period?)` ✎ |
| `getChartData(actor, currency, period?)` ✎ | `ChartDataPoint[]` | ≤ buckets shown | `getDashboardChartData(currency, period?)` ✎. The explicit `timeZone` argument is dropped, because the zone comes from `actor` |
| `getSenderAccounts(actor, currency, period?)` | `SenderAccountMetrics[]` | ≤ accounts shown | `getDashboardSenderAccounts(currency, period?)` ✎. Profiles by `name`, accounts by `bankName`, then `accountName` (spec §1 change 3) |
| `getRecentInvoices(actor, currency)` | `RecentInvoice[]` | ≤ items shown | `getDashboardRecentInvoices(currency)` |
| `getDebtors(actor, currency)` | `DebtorInfo[]` (≤ 3) | ≤ 3 | `getDashboardDebtors(currency)`. The name comes from the latest overdue invoice (issue date, then created). Ties on the exact total are ordered by name (AC-06) |
| `getExpectedPayments(actor, currency)` | `ExpectedPaymentGroup[]` | ≤ items shown | `getDashboardExpectedPayments(currency)` |
| `checkSetup(actor)` | `SetupCheckResult` = | 4 counts | `checkDashboardSetup()`. Lives in `lib/services/profile/` (sad.md §5), listed here for its caller |

Every section also answers `FAILED` (reported once), per flow 2.

### 2.8 Profile and account — `lib/services/profile/`, `lib/services/account/` (owner: `User.id = A`)

| Function | Returns | Outcomes | Web wrapper |
|---|---|---|---|
| `updateProfile(actor, input: ProfileFormValues)` | `void` | `VALIDATION` → `NOT_FOUND` (tenant gone, §1.4) → `CONFLICT` "This email is already in use by another account." † | `updateProfile(data)`, mapping `NOT_FOUND` to `UNAUTHORIZED` |
| `getAccountDeletionSummary(actor)` | `{ invoiceCount: number }` = | `FAILED` | `getAccountDeletionSummary()` |
| `deleteAccount(actor)` | `void` | `NOT_FOUND` (tenant gone, §1.4) · `FAILED` "Your account couldn't be deleted. Nothing was removed." (all or nothing, reported once, flow 10, AC-20) | `deleteUserAccount()`, mapping `NOT_FOUND` to `UNAUTHORIZED`. **Only a session-verified wrapper may call it** (spec §6.1) |
| `getAccountExport(actor)` ★ | `AccountExport` = today's export object (`exportVersion: '2.0'`: user, accounts, emailHistory, senderProfiles, customers, products, invoices) | `NOT_FOUND` (tenant gone) · `FAILED` | `GET /api/user/export`. The route keeps the filename, headers and the 500 `EXPORT_FAILED` body, which it also uses for `NOT_FOUND` |

† This branch is preserved from today's code but drawn in no sad.md §6 flow. It is parked as a spec §8 open question owned by `sequences` (see the report).

## 3. Web-wrapper obligations (unchanged behaviour, AC-01, AC-03, AC-10)

1. `actingFreelancerFromSession()` first. On `UNAUTHORIZED`, return it (actions) or redirect to sign-in (pages), and never call a business function.
2. Call the business function, then return its result **untouched**. The only exceptions are the documented shape mappings: `data.items` for today's array-returning actions, `items → invoices` + `applied` for `getPaginatedInvoices`, and `NOT_FOUND → UNAUTHORIZED` for the tenant-gone case (§1.4).
3. On `success` only, call today's `revalidatePath(protectedRoutes.*)` list, verbatim.
4. Never report to Sentry. The business function already has.
5. `login-actions.ts` is unchanged, and `lib/services` is never imported from a `'use client'` file (ADR-0006).

## 4. Boundary checks (ADR-0006, QG-3)

- Every `lib/services/**` file imports `'server-only'` and contains no `'use server'`.
- ESLint `no-restricted-imports` in `lib/services/**`: `next/headers`, `next/cache`, `next/navigation`, `@/auth`, `next-auth`.
- `tests/unit/service-layer-boundary.test.ts`, plus `pnpm build` in CI.
- Every business function in §2 has a request-free integration test. Every function that takes an id (or a parent id) has a foreign-record test with two Freelancers, asserting `NOT_FOUND` and an unchanged row for B (QG-1).
