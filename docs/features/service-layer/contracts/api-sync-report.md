---
status: Draft
owner: "Dmytro Hopko"
updated_at: "2026-10-01"
---

# API sync report — service-layer

**Contract form:** `contracts/public-api.md`, the in-process signatures of `lib/services/`. The declared surface is `sad.md` `target_surfaces: [backend-service]`, and its sub-kind is an in-process function interface. The layer has no HTTP route and no events (sad.md §5, §8, ADR-0006), so OpenAPI and gRPC don't apply, and `events.md` is absent. The two route handlers touched keep their HTTP contract in `architecture-hardening/contracts/openapi.yaml`. This follows the precedent of `architecture-hardening/contracts/server-actions.md`.

**Inputs:** `data-model.md` ✓ (no schema change, owner paths + search fields + orders) · `sad.md` §4–§8 ✓, §6 flows 1–12 ✓ · `spec.md` §4/§5 ✓ · ADR-0001…0006 ✓ · `.size` M · `.route` standard · repo code `lib/actions/**`, `lib/validations/*.ts`, `types/**` (to confirm parity).

**Deviations by ADR** (from the skill defaults): the error envelope is the existing `ActionResult` `{ success, code, error, fieldErrors?, details? }` with the closed code set `UNAUTHORIZED | NOT_FOUND | VALIDATION | CONFLICT | FAILED`, not `{code, message, details?}` with `module.error_name` (ADR-0002, hardening ADR-0009). Paging is page-number `Page<T>`, not a cursor (ADR-0005: cursors can't express AC-14). Auth is an `ActingFreelancer` input, not BearerAuth (ADR-0001).

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| `ActingFreelancer.userId` | data-model.md → `User.id` (text, cuid) | high |
| `ActingFreelancer.timeZone` | ADR-0001 + sad.md §4 inline note (Intl ∩ `pg_timezone_names`, else UTC) | high |
| `ActionResult.*` / `ActionErrorDetails.*` | repo `types/actions.ts` (moved to `types/result.ts`, ADR-0002) | high |
| `ListQuery.search` (≤ 100, trimmed) | ADR-0005 + spec AC-13 + `search-params.ts` `MAX_SEARCH_LENGTH` | high |
| `ListQuery.page` / `pageSize` (int ≥ 1, no cap) | ADR-0005, spec AC-12/13, spec §3 | high |
| `Page.items/total/page/pageSize/totalPages/hasMore` | ADR-0005 | high |
| `Page.pageSize` for an unpaged full list = `total` | derived from AC-12 ("page 1, one page in all") | medium |
| `listCustomers` search fields / order | data-model.md §Entities (`name`, `companyName`, `email`); order = `customer-actions.ts:45` + `id` | high |
| `listProducts.onlyActive` | existing `getProducts({ onlyActive })` (`product-actions.ts:24`) | high |
| `listProducts` search / order | data-model.md (`name`); `product-actions.ts:49` + `id` | high |
| `listCustomerCustomPrices` / `listProductCustomPrices` search / order | data-model.md (product `name`, customer `name`); `custom-price-actions.ts:81/247` + `id` | high |
| `listSenderProfiles` search / order | data-model.md (`name`, `legalName`); `sender-profile-actions.ts:226` + `id` | high |
| `listBankAccounts` search / order | data-model.md (`bankName`, `accountName`, never `accountNumber`/`iban`); `bank-account-actions.ts:202` + `id` | high |
| `getSenderProfileLogo.logo` | existing schema: `SenderProfile.logo` (`convert-image/route.ts:64`) | high |
| `InvoiceListQuery.status/tab/sortField/sortDirection` enums | `lib/validations/search-params.ts` (SORT_FIELDS, TABS, SORT_DIRECTIONS) + `InvoiceStatus`; AC-26 | high |
| `InvoiceListQuery.customerId/senderProfileId` | data-model.md `Invoice.customerId`, `Invoice.senderProfileId` | high |
| `InvoiceListQuery.dateFrom/dateTo` (`LocalDate`, both or neither) | spec AC-13, AC-21; sad.md flow 5; `search-params.ts` `isValidIsoDate` | high |
| `InvoicePage.filterOptions` / `totalInvoices` | existing `PaginatedInvoiceList` (`types/invoice/types.ts:241`), ADR-0005 neutral note | high |
| `updateInvoiceStatus.status: string` | existing signature (`invoice-actions.ts:807`), AC-02 "unknown invoice status" | high |
| `duplicateInvoice` issueDate / dueDate | spec AC-24; sad.md flow 8 ("today in the actor's zone") | high |
| `DashboardPeriod.from/to` (`LocalDate`, inclusive) | decided in this pass (user: local dates); sad.md flows 5/12, AC-21 | medium |
| `period` omitted = all time | existing `appliedRange === undefined` (`dashboard-actions.ts:112`) | high |
| `getChartData` drops the `timeZone` argument | ADR-0001 (the zone comes from the actor) | high |
| dashboard DTOs | `types/dashboard/types.ts` (unchanged), sad.md §8 Money | high |
| `getAccountExport` → `AccountExport` | `app/api/user/export/route.ts` export object (`exportVersion 2.0`) | high |
| `deleteAccount` / `updateProfile` `NOT_FOUND` (tenant gone) | decided in this pass (user: NOT_FOUND + wrapper maps); ADR-0002 | medium |
| list-query `fieldErrors` messages (★) | proposed here; no parity oracle (pages correct links first) | medium |
| entity form inputs (`*FormValues`, `CustomPriceSchemaValues`, `UpdateCustomPriceValues`, `InvoiceFormValues`) | `lib/validations/*.ts` (unchanged) + hardening `server-actions.md` | high |

No `low` rows. No field was invented without an origin.

## B. Drift checklist

1. **Function ↔ data-model** *(core)* — ✓. Every §2 function reads or writes at least one `data-model.md` entity through its owner path. `getAccountExport` also reads `Account` and `EmailHistory` (auth schema), which are not in the data-model ER. They are read-only, owner-filtered by `userId`, and unchanged from today, so they are accepted as out of the ER scope.
2. **Error code ↔ repo error definition** *(core)* — ✓. The repo form is the `ActionErrorCode` union in `types/actions.ts`. Every code in the contract is one of its five. `details.kind` uses only `TOTALS_CHANGED` and `HAS_INVOICES`, both existing. Business functions never emit `UNAUTHORIZED` (ADR-0002), and the tenant-gone case was resolved as `NOT_FOUND` + wrapper mapping (§1.4).
3. **Validation ↔ constraint** *(core)* — ✓. The search limit of 100 equals `MAX_SEARCH_LENGTH` and AC-13. The enums equal `search-params.ts` and `InvoiceStatus`. Entity form rules are the unchanged zod schemas (which match `Decimal(10,2)` ≤ 99 999 999.99 per hardening). Page size has no cap, per spec §3 and ADR-0005, while the web page's `PAGE_SIZE_OPTIONS` stays a page-side correction. That difference is intended, not a conflict.
4. **Contract ↔ sequence** *(supporting)* — ⚠ Every `alt` branch of flows 1–12 has an outcome in the contract. The reverse direction found branches with no flow (next section).

### Back-feed (coverage cross-check)

- **Spec §5 → contract:** AC-01…AC-26 each map to at least one function or outcome. AC-05 is a non-runtime parity test with no contract surface (sad.md §6 note). AC-10 is the `actingFreelancerFromSession()` factory. AC-03 is wrapper obligation 3.
- **Contract → spec §4:** US-01 wrappers, US-02 dashboard, US-03 reads + editor data, US-04 lists, US-05 writes, US-06 owner paths, US-07 `LocalDate` + zone, US-08 factory. No function lacks a story.
- **§6 `alt` → contract:** all present.
- **Sequence gaps (contract outcomes that no §6 flow shows):**
  - G1 `deleteInvoice`: only drafts can be deleted → `CONFLICT`
  - G2 `deleteProduct`: product used in invoices → `CONFLICT`
  - G3 `deleteBankAccount`: bank account has invoices → `CONFLICT`
  - G4 `duplicateInvoice`: the source's legacy amounts break the rules → `FAILED` with reasons (missing from flow 8)
  - G5 `updateProfile`: email already in use → `CONFLICT`. There is no profile flow at all.

  → **Resolved as Save-as-OQ** (user, 2026-10-01): one row in spec §8, owner `sequences`, due before the contract is finalized. The contract keeps the branches (marked †) because the parity oracle requires them.

### Decisions taken in this pass (user-confirmed)

| # | Finding | Resolution |
|---|---|---|
| D1 | Sequence gaps G1–G5 | Save-as-OQ → spec §8, owner `sequences` |
| D2 | `updateProfile` / `deleteUserAccount` return `UNAUTHORIZED` today when the `User` row vanishes, but ADR-0002 forbids `UNAUTHORIZED` in the layer | The layer returns `NOT_FOUND`, and the wrapper maps it to today's outcome. ADR unchanged |
| D3 | The dashboard period is `Date` bounds computed by the page today, but flows 5/12 and AC-21 put zone math in the layer | `DashboardPeriod = { from, to }` as `LocalDate`, converted in `actor.timeZone`. `dashboardParamsSchema` returns local dates |
| D4 | The invoice list is `PaginatedInvoiceList` (`invoices`, no `hasMore`) vs ADR-0005's `Page<T>` | `InvoicePage = Page<InvoiceListItem> & { filterOptions, totalInvoices }`. `getPaginatedInvoices` maps `items → invoices` |

### Follow-up notes (non-blocking)

- `generateInvoiceNumber` stays: it is used by the editor store, as the component tests show. It now calls `peekNextInvoiceNumber`.
- `getInvoicesByCustomer` / `getInvoicesBySenderProfile` go through `listInvoices` with a filter. Today's `createdAt desc` order equals the list default, so parity holds. A foreign filter id yields an empty page, not `NOT_FOUND`, which matches a nonexistent id (AC-08). The detail pages already `NOT_FOUND` through `getCustomer` / `getSenderProfile`.
- Lint: no OpenAPI to `spectral lint`. The contract is enforced by `tsc --noEmit` on the signatures plus the §4 boundary checks.
