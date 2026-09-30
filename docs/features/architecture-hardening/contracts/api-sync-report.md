---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
---

# API sync report — architecture-hardening

**Inputs:** `data-model.md` ✓ (schema change: `LogoFetchWindow`, `Invoice.invoiceNumberKey`) · `sad.md` §6 flows 1–12 ✓ · `spec.md` §4/§5 ✓ · ADR-0001…0010 ✓ · `CONTEXT.md` ✓ · existing schema `prisma/schema/*.prisma` + `lib/validations/*.ts` for unchanged entities.
**Interface kind:** `target_surfaces: [backend-service, web-frontend]` (read from sad.md). The backend exposes two HTTP route handlers plus server actions, so the contract is split into [`openapi.yaml`](./openapi.yaml) (HTTP) and [`server-actions.md`](./server-actions.md) (typed RPC). `web-frontend` consumes both. **No `events.md`:** sad.md §8 marks events N/A, and no §6 flow has an async actor. Sentry in flow 12 is fire-and-forget reporting, not an event contract.
**Size / route:** M / standard (from `.size` / `.route`).

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| convertLogoImage.senderProfileId | existing schema — `SenderProfile.id` (cuid); ADR-0003 input | high |
| convertLogoImage.data.dataUrl | derived — safe fetcher output (ADR-0003), from `SenderProfile.logo` | high |
| convertLogoImage.data.contentType | derived — upstream `Content-Type`, restricted to `image/*` (ADR-0003) | high |
| convertLogoImage.data.size | derived — bytes read, ≤ 524288 (spec §6 NFR) | high |
| convertLogoImage.code (refusal) | ADR-0003 closed set; ↔ AC-03 warnings | high |
| convertLogoImage 429 Retry-After | derived — `LogoFetchWindow.windowStart` + 60 s (data-model, ADR-0008) | medium |
| exportUserData.* categories | existing schema — `User`, `Account`, `EmailHistory`, `SenderProfile`+`BankAccount`, `Customer`+`CustomPrice`, `Product`, `Invoice`+`InvoiceItem`; minus `Session` (AC-24) | high |
| exportUserData.exportVersion | derived — bumped 1.0 → 2.0 because `sessions` was removed | medium |
| exportUserData Content-Disposition | spec AC-24 ("starts with Invoice Forge"); date suffix is a contract choice | medium |
| getRobots body | spec AC-30 + `protectedRoutes` sections | high |
| ActionResult.code | ADR-0009 | high |
| ActionResult.details | ★ amendment chosen in this pass (finding D-1) | medium |
| details.TOTALS_CHANGED.oldTotal | data-model → `Invoice.total` DECIMAL(10,2) | high |
| details.TOTALS_CHANGED.newTotal | derived — shared decimal module (ADR-0006) | high |
| details.HAS_INVOICES.invoiceCount | data-model → count `Invoice` by `customerId` / `senderProfileId` (AC-22 access pattern) | high |
| InvoiceFormValues.invoiceNumber | data-model → `Invoice.invoiceNumber` TEXT; empty = system-assigned (AC-06) | high |
| (server) Invoice.invoiceNumberKey | data-model → `invoiceNumberKey` TEXT, UNIQUE (`senderProfileId`, key). Not in any request; derived by `normalizeInvoiceNumber()` | high |
| InvoiceFormValues.status | data-model → `Invoice.status` enum `InvoiceStatus` (5 values) | high |
| InvoiceFormValues.items[].quantity | existing schema — `InvoiceItem.quantity` DECIMAL(10,2); > 0 (AC-14) | high |
| InvoiceFormValues.items[].price | existing schema — `InvoiceItem.rate` DECIMAL(10,2); ≥ 0 (AC-14) | high |
| InvoiceFormValues.items[].total | existing schema — `InvoiceItem.amount`; **ignored on input** (AC-13) | high |
| InvoiceFormValues.taxRate | data-model → `Invoice.taxRate` DECIMAL(5,2); 0–100 | high |
| InvoiceFormValues.discount / shipping | data-model → DECIMAL(10,2); ≥ 0; discount ≤ subtotal + shipping (AC-15) | high |
| InvoiceFormValues.confirmedTotals | spec AC-17 + finding D-1; no column (request-only) | medium |
| SavedInvoice.{subtotal,taxAmount,total} | data-model → `Invoice.*` DECIMAL(10,2), recomputed (ADR-0006) | high |
| SavedInvoice.paidAt | data-model → `Invoice.paidAt` TIMESTAMP(3) NULL; `applyStatusChange()` | high |
| updateInvoiceStatus.{status,paidAt} | data-model → `Invoice.status`, `Invoice.paidAt` | high |
| editor.legacy.storedTotal | data-model → `Invoice.total` | high |
| editor.legacy.recomputedTotal | derived — shared decimal module over `InvoiceItem` rows | high |
| editor.legacy.sharedNumber | data-model → AC-17 access pattern on `invoiceNumberKey` / `Invoice_senderProfileId_idx` | high |
| getAccountDeletionSummary.invoiceCount | data-model → account-deletion invoice set (`SenderProfile_userId_idx` + `Invoice_senderProfileId_idx`) | high |
| updateSenderProfile.logo | data-model → `SenderProfile.logo` TEXT NULL; `https:` (AC-04) | high |
| CustomPriceInput.customerId / productId | data-model → `CustomPrice.customerId` / `productId` (FK) | high |
| CustomPriceInput.price | data-model → `CustomPrice.price` DECIMAL(10,2); > 0 (see D-4) | high |
| CustomPriceInput.name / notes | existing schema — `CustomPrice.name` / `notes` TEXT NULL; zod ≤ 100 / ≤ 500 | high |
| InvoiceListParams.* | existing `types/invoice/types.ts` (`InvoiceSortField`, `InvoiceTab`, `SortDirection`) + SAD §8 page sizes | high |
| PaginatedInvoiceList.applied | spec AC-26 ("controls match what is shown"); no column | medium |
| Dashboard.appliedRange | spec AC-25; no column | medium |

No `low` rows: every field traces to a column, an ADR or an AC.

## B. Drift checklist

1. **Endpoint ↔ data-model** *(core)* — ✓. Every operation reads or writes a data-model entity: `convertLogoImage` → `SenderProfile.logo` + `LogoFetchWindow`; `exportUserData` → all User-owned entities; invoice actions → `Invoice` (+ `invoiceNumberKey`, `SenderProfile.invoiceCounter`); deletes → `Customer` / `SenderProfile` / `User`; custom prices → `CustomPrice`. `getRobots` touches no entity (public config, AC-30); this is accepted as a config endpoint.
2. **Error code ↔ repo error definition** *(core)* — ✓ with a note. The repo form is the `ActionResult` type in `types/actions.ts`, which today has **no `code` field**. ADR-0009 defines the five codes, and ADR-0003 defines the logo set. The codes are therefore ADR-backed and the repo gains them in wave 3 (ADR-0009) and wave 1 (logo set). Reconcile once `types/actions.ts` is updated.
3. **Validation ↔ constraint** *(core)* — ✓ after the resolutions below (D-3, D-4, D-5). The contract takes the stricter value in each case.
4. **Contract ↔ sequence** *(supporting)* — ✓ with 2 gaps (D-6, D-7). Every §6 alt-branch has a response: flow 1 (no token → 401, not owned → 404, rate → 429, fetch refusals → 422/502), flow 2 (rule → VALIDATION, key taken → CONFLICT), flow 3 (fails → FAILED), flow 4 (401 / redirect / stale → UNAUTHORIZED), flow 5 (logo → VALIDATION, not owned → NOT_FOUND), flow 6 (taken in B → CONFLICT, dup not owned → NOT_FOUND), flow 7 (shared → CONFLICT, rules → VALIDATION, totals → CONFLICT+details), flow 8 (unknown → VALIDATION, not owned → NOT_FOUND), flow 9 (VALIDATION / NOT_FOUND), flow 10 (NOT_FOUND / CONFLICT, including the race), flows 11–12 (fallbacks, FAILED / NOT_FOUND).

**Back-feed coverage:** all 32 ACs (AC-01…AC-31 + AC-02b) map to ≥ 1 operation or response. AC-28 maps to `FAILED` on every read action → `error.tsx`. AC-30 maps to `getRobots`. Every operation maps to a §4 user story: convertLogoImage → US-01; invoice actions → US-02/03/04; account, profile, deletes and export → US-05; link params → US-06; read-failure codes → US-07; robots → US-08.

### Findings and resolutions

| # | Finding | Type | Resolution |
|---|---|---|---|
| D-1 | Flow 7's "needs confirmation with old and new totals" had no ADR-0009 code, and the resubmit proof was undecided (sad §6 flag for design, still open) | core | **Fix the contract** (user decision): `CONFLICT` + `details {kind:'TOTALS_CHANGED', oldTotal, newTotal}`; resubmit with `confirmedTotals`, saved only if both still match. Adds an optional `details` field to `ActionResult`, an **additive amendment to ADR-0009**. Record it in ADR-0009's Links/Consequences during `tasks` or via `/sdd:decide-adr` |
| D-2 | HTTP error body: skill default `{code,message,details?}` vs ADR-0009 | core | **Accept, deviation by ADR-0009** (user decision): route handlers and the proxy return the `ActionResult` error shape |
| D-3 | Money fields have no upper bound in zod; the column is DECIMAL(10,2), so an overflow surfaces as a DB error → `FAILED` | core (validation) | **Fix the contract:** `maximum 99 999 999.99` on quantity, price, shipping and custom price. The zod schemas must add it (tasks) |
| D-4 | Custom price: spec AC-16 says "negative" is blocked, and data-model says "non-negative"; existing zod is `.positive()` (0 is blocked too) | core (validation) | **Fix the contract, stricter:** `> 0`. AC-16 requires update to match create, and create is `positive` today. data-model's "non-negative" wording is loose |
| D-5 | Is a whitespace-only invoice number manual or empty? Spec AC-06 says "empty field" | supporting | **Contract choice:** trimmed-empty = system-assigned, consistent with the normalized key (a key of `''` can't be a real number) |
| D-6 | Flow 1 has no branch for "owned profile has no logo" | sequence gap | **Contract choice:** `404 NOT_FOUND`, same body, no quota. The browser shouldn't call it in that case. Optional: add the branch to flow 1 (owner: `sequences`) |
| D-7 | Flow 1 draws no branch for a malformed request body | sequence gap | **Contract choice:** `400 VALIDATION`, returned after the session check (flow 4 order) |
| D-8 | `createCustomPrice` sets `customerId = … \|\| data.productId` (L10) | code bug (known) | Contract makes `customerId` explicit and required; fixed in implementation |
| D-9 | data-model TBD: are `VerificationToken` rows for the account's email deleted on account deletion (AC-20 "sign-in links")? | carried OQ | **Save as OQ-2** below. The contract's `deleteUserAccount` outcomes don't change either way |
| D-10 | Existing export includes `sessions`; AC-24 excludes them | spec ↔ code | **Fix the contract:** `sessions` removed, `exportVersion` 2.0 |

## C. Deviations from the api-skill defaults

| Default | Here | Why |
|---|---|---|
| `{code, message, details?}`, `module.error_name` | `ActionResult` `{success:false, code, error, fieldErrors?, details?}`, UPPER_SNAKE | ADR-0009, ADR-0003 (D-2) |
| BearerAuth | `SessionCookie` (next-auth JWT cookie) | ADR-0001, ADR-0002. Same-origin browser app with no bearer tokens |
| `/api/v1/...` | unversioned `/api/convert-image`, `/api/user/export` | brownfield paths; the only consumer is same-origin code; renaming would break stale editor tabs (spec §8 Q4) |
| Cursor pagination | offset `page`/`pageSize` on the `/invoices` **page link** | the existing link format (SAD §8, AC-26); not an HTTP API |
| `Idempotency-Key` on retriable mutations | none | no §6 flow shows a retry note or async actor. Invoice saves are naturally deduped by the number key; the logo fetch is a read |

## Open questions

- [ ] **OQ-1** — Record the `ActionResult.details` amendment (D-1) in ADR-0009 (Consequences + Links). Owner: Dmytro Hopko (design); due: before `sdd:tasks`.
- [ ] **OQ-2** — On account deletion, delete `VerificationToken` rows for the account's email inside the ADR-0007 transaction? (from data-model TBD). Owner: Dmytro Hopko (design); due: before `sdd:tasks`.

## Lint

Run `pnpm dlx @stoplight/spectral-cli lint docs/features/architecture-hardening/contracts/openapi.yaml` (spectral isn't wired into the repo's checks yet).
