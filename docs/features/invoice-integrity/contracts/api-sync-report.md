---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
---

# API sync report — invoice-integrity

**Inputs:**
- `data-model.md` ✓. Schema change: `Invoice.version`, `Invoice_bankAccountId_idx`, and two partial unique default indexes.
- `sad.md` §6 flows 1–11 ✓. Flows 3–11 are in the working tree and not yet committed.
- `spec.md` §4/§5 ✓.
- ADR-0001…0005 ✓.
- `ux-flows.md` (the SCR ids) ✓.
- `CONTEXT.md` ✓.
- For unchanged fields, the existing schema: `prisma/schema/invoice.prisma`, `lib/validations/{invoice,product,bank-account,sender-profile,custom-price}.ts` and `types/result.ts`.

**Interface kind:** sad.md has `target_surfaces: [backend-service, web-frontend]`. The backend surface this feature changes is the server-action RPC only, so the contract is [`server-actions.md`](./server-actions.md); `web-frontend` consumes it.
- **No `openapi.yaml`:** no route handler is added or changed. The MCP `get_invoice` already returns the snapshot columns (`mcp-server/contracts/openapi.yaml` → `InvoiceSenderDetails` and `InvoiceCustomerDetails`, "as copied onto the invoice"), so AC-26 needs no shape change, and the tool list stays read-only (AC-24).
- **No `events.md`:** no §6 flow has an async actor.

The precedent for a contract with no HTTP part is `service-layer` (`public-api.md` only).

**Size / route:** M / standard (from `.size` / `.route`).

## A. Field origins

| schema_path | origin | confidence |
|---|---|---|
| InvoiceFormInput.loadedVersion | data-model → `Invoice.version` INTEGER NOT NULL DEFAULT 0 (ADR-0004) | high |
| InvoiceFormInput.status (create = DRAFT only) | data-model → `Invoice.status` enum; "Create accepts only `DRAFT`" (AC-04b) | high |
| InvoiceFormInput.dueDate (≥ issueDate) | existing schema — `Invoice.dueDate` / `issueDate` calendar days (mcp-server ADR-0009); AC-09 | high |
| InvoiceFormInput.bankAccountId (currency) | existing schema — `BankAccount.currency` enum `Currency` vs `Invoice.currency`; AC-11 | high |
| InvoiceFormInput.items[].productId (currency) | existing schema — `Product.currency`, `InvoiceItem.productId` nullable; AC-12, AC-15 | high |
| computed amounts ≤ 99 999 999.99 | existing schema — `DECIMAL(10,2)` on `InvoiceItem.amount`, `Invoice.subtotal/taxAmount/total/shipping`; AC-19 | high |
| fieldErrors keys `subtotal` / `taxAmount` / `total` / `items.<i>.total` | derived — form paths and totals panel (spec AC-19 "on the line… on the totals") | medium |
| SavedInvoice.version | data-model → `Invoice.version` after `+ 1` (ADR-0004 "returns the new version") | high |
| initialData.version | data-model → `Invoice.version` | high |
| details.CHANGED_ELSEWHERE.currentVersion | data-model → the locked row's `Invoice.version` | high |
| details.STATUS_NOT_ALLOWED.currentStatus | data-model → the locked row's `Invoice.status`; flow 5 "row refreshed to its current status" | high |
| details.STATUS_NOT_ALLOWED.suggestion | derived — AC-05 (cancel and duplicate), AC-06 (duplicate) | medium |
| details.ISSUED_INVOICE_LOCKED | derived — ADR-0003 / AC-08 refusal kind; no column | medium |
| updateInvoice locked-field fieldErrors keys | data-model "Locked on an issued invoice" list → the `InvoiceFormInput` paths | high |
| updateInvoiceStatus transition table | ADR-0002 + spec AC-04; `OVERDUE → PENDING` guard uses `Invoice.dueDate` and `User.timeZone` | high |
| updateInvoiceStatus same-status (no write, no bump) | data-model "Same-status request: no write and no version bump"; AC-04 | high |
| deleteInvoice → VALIDATION | SAD §8 (lifecycle → VALIDATION) + owner decision D-1 | high |
| duplicateInvoice issued details from current records | data-model "Written from the current records by create, duplicate"; flow 3 | high |
| duplicateInvoice refusal → VALIDATION | SAD §8 "never a generic FAILED for user input"; flow 3 "field errors, the same as in flow 4" | high |
| editor products incl. inactive referenced | existing schema — `Product.isActive`; data-model "inactive products included"; AC-15 | high |
| PDF bank block fields | data-model → `bankName`, `accountName`, `bankAccountNumber`, `bankIban`, `bankSwift`; AC-03 | high |
| generateInvoiceNumber hint year | derived — AC-22 (no server clock). A hint has no issue date, so it uses today in `User.timeZone` | medium |
| updateBankAccount currency lock count | data-model → `count(*) FROM "Invoice" WHERE "bankAccountId"` (`Invoice_bankAccountId_idx`); AC-13 | high |
| details.HAS_INVOICES.invoiceCount (bank account / product) | data-model → the AC-13 / AC-13b counts | high |
| updateProduct count = DISTINCT invoiceId | data-model → `count(DISTINCT "invoiceId") FROM "InvoiceItem"`; AC-13b "how many invoices" | high |
| create/update/delete isDefault rules | data-model → `SenderProfile.isDefault` / `BankAccount.isDefault` + partial unique indexes; ADR-0005; AC-17, AC-17b | high |
| fieldErrors.isDefault (unset refused) | existing schema — `isDefault` in `bank-account.ts` / `sender-profile.ts`; AC-17b | high |
| default P2002 → retryable CONFLICT | data-model "maps to a retryable `CONFLICT`" | high |
| ProductFormValues.price pattern | existing schema — `Product.price` DECIMAL(10,2) → `^\d{1,8}(\.\d{1,2})?$`; messages from `custom-price.ts` (AC-20) | high |
| Field-error message texts | spec AC wording, rephrased as stable UI strings; the existing texts are kept where present | medium |

## B. Drift checklist

1. **Endpoint ↔ data-model** *(core)* ✓. Every changed action reads or writes a data-model entity:
   - `createInvoice`, `updateInvoice`, `updateInvoiceStatus`, `deleteInvoice` and `duplicateInvoice` → `Invoice` and `InvoiceItem` (`version`, `status`, `paidAt`, snapshot columns).
   - The bank-account and sender-profile actions → `isDefault` and the partial indexes. `updateBankAccount` → `Invoice_bankAccountId_idx`.
   - `updateProduct` → `InvoiceItem_productId_idx`.
   - The editor reads → `Product.isActive`.
2. **Error code ↔ repo error definition** *(core)* ✓. Every code used (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `FAILED`) is in `ActionErrorCode` in `types/result.ts`. The repo's registry is that union. It doesn't use the skill's `module.error_name` form; see §C. The three new `details.kind` values are an additive amendment to `ActionErrorDetails` (D-4). `implement` adds them to `types/result.ts`.
3. **Validation ↔ constraint** *(core)* ✓.
   - The amount bounds match `DECIMAL(10,2)`.
   - The product price pattern matches `Product.price DECIMAL(10,2)`.
   - The currency enums match `Currency`.
   - "At most one default" matches the partial unique indexes.
   - `loadedVersion ≥ 0` matches `INTEGER DEFAULT 0` with only `+ 1` writes.
   - No conflict found between spec and model.
4. **Contract ↔ sequence** *(supporting)* ✓ after D-2. Every `alt` branch of flows 1–7 and 9–10 has an outcome row. Flow 8 (MCP) and flow 11 (release) need no action: see the coverage notes below. Flow 4 draws `cancelled` before the version check, while the contract follows ADR-0004 (owner decision D-2). The diagram is out of step → OQ-1.

### Back-feed (coverage cross-check)

- **Every §5 AC → ≥ 1 outcome:**
  - AC-01, AC-02, AC-03 → updateInvoice steps 6/7, the PDF read side.
  - AC-04, AC-04b, AC-05, AC-06 → the transition table, createInvoice #3, deleteInvoice.
  - AC-07, AC-08, AC-09 → updateInvoice step 6.
  - AC-10 → `CHANGED_ELSEWHERE`.
  - AC-11, AC-12, AC-14 → the draft rules and the issued-invoice scope.
  - AC-13, AC-13b → the currency locks.
  - AC-15, AC-16 → the editor products and the PDF.
  - AC-17, AC-17b → the default rules.
  - AC-18 → no action: release migration 03/04 (Accepted as internal).
  - AC-19, AC-20, AC-20b → bounds, price, discount.
  - AC-21, AC-21b, AC-22 → createInvoice #6, updateInvoice step 7.
  - AC-23 → `NOT_FOUND` everywhere.
  - AC-24, AC-26 → the MCP contract, unchanged.
  - AC-25 → the service-side rules (shape-only parse before the lock).
- **Every operation → a §4 story:**
  - `createInvoice` → US-03, US-10.
  - `updateInvoice` → US-01, US-04, US-05, US-06, US-09.
  - `updateInvoiceStatus` → US-03, US-05.
  - `deleteInvoice` → US-03.
  - `duplicateInvoice` → US-03, US-04.
  - The editor and PDF reads → US-01, US-02, US-07.
  - Bank accounts and sender profiles → US-06, US-08.
  - Products → US-06, US-09.
  - MCP → US-11.
- **Orphan sequences:** flow 11 (release report + migration) is an operator step, not an endpoint. Accepted (`# orphan-sequence`, internal job: `scripts/invoice-integrity-report.ts`).
- **Sequence gaps:** only branch order (OQ-1). The missing-`loadedVersion` refusal is shape validation and needs no flow.
- **Derived, not flagged:** the `architecture-hardening` legacy checks (shared number, `TOTALS_CHANGED`) are limited to drafts. On an issued invoice those fields are locked, and AC-14 says only the rules of changed fields run. Without this limit, a legacy issued invoice with a shared number could never save its notes.

### Findings and resolutions

| # | Finding | Points | Resolution |
|---|---|---|---|
| D-1 | SAD §8 says lifecycle refusals → `VALIDATION`; `deleteInvoice` returns `CONFLICT` for a non-draft today | 2 (core) | **Fix the contract** (owner 2026-10-07): `VALIDATION` + `STATUS_NOT_ALLOWED`. The changed test expectation goes into the PR list (spec §6 NFR) |
| D-2 | Flow 4 checks `cancelled` before the version; ADR-0004 says the version check comes "before any other rule" | 4 | **Fix the contract to ADR-0004** (owner 2026-10-07). The diagram fix → **OQ-1**, owner `sequences` |
| D-3 | SAD §8 lists "currency" refusals under `VALIDATION`; the existing product currency lock is `CONFLICT` | 2 (core) | **Accept as `CONFLICT` + `HAS_INVOICES` + `fieldErrors.currency`** for the bank-account and product locks (owner 2026-10-07). `VALIDATION` stays for the invoice's own currency (AC-11, AC-12). The SAD §8 wording → **OQ-2**, owner `design` |
| D-4 | The editor can't tell an outdated-view `CONFLICT` from other `CONFLICT`s, and the list needs the current status after a refusal | 2 | **Fix the contract:** an additive `details.kind` amendment (`CHANGED_ELSEWHERE`, `STATUS_NOT_ALLOWED`, `ISSUED_INVOICE_LOCKED`), the same pattern as `TOTALS_CHANGED` |
| D-5 | The product currency lock counts lines (`_count.invoiceItems`), but AC-13b asks for invoices | 1 | **Fix the contract** to `count(DISTINCT invoiceId)`, per data-model. Code change in `implement` |

## C. Deviations from the api-skill defaults

These are inherited from the earlier contracts, deliberately, by ADR:
- **Not HTTP/OpenAPI.** The surface is typed server actions, the repo's RPC (SAD §2, §5).
- **Errors** are `ActionResult { success: false, code, error, fieldErrors?, details? }` with UPPER_SNAKE codes (architecture-hardening ADR-0009), not `{code, message, details?}` with `module.error_name`.
- **Auth** is the next-auth session cookie resolved to `ActingFreelancer` (service-layer ADR-0001), not Bearer.
- **No idempotency key.** No flow has a retry note or an async actor. Repeating a default switch is idempotent by design (flow 10, "a repeated request finds B already default"). A same-status request is a no-op (AC-04).
- **No pagination change.**
- **Examples** use placeholder ids (`clx000…`) and no PII.

## Open questions

- [ ] **OQ-1** — Reorder sad.md §6 flow 4 so that "loadedVersion differs" comes before "status is cancelled", matching ADR-0004 and this contract. Owner: `sequences` (Dmytro Hopko). Due: before the contract is finalized (before `tasks`).
- [ ] **OQ-2** — Make SAD §8 "Error handling" precise. "Currency refusals → `VALIDATION`" covers the invoice's own currency (AC-11, AC-12). The lock on changing a bank account's or product's currency is `CONFLICT` + `HAS_INVOICES` (D-3). Owner: `design` (Dmytro Hopko). Due: before the contract is finalized (before `tasks`).

## Lint

There is no OpenAPI file, so `spectral` does not apply. The TypeScript shapes above become compile-checked when `implement` edits `types/result.ts`, `lib/validations/{invoice,product}.ts` and `SavedInvoice`.
