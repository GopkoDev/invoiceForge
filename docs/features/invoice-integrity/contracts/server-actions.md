---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-07"
feature_size: "M"
---

# Server actions — invoice-integrity

This is the typed RPC surface of the `backend-service` container: the `'use server'` actions that the invoice list, the editor and the sender-profile, bank-account and product forms call (sad.md §4, §5). Each action is a thin wrapper. It resolves the `ActingFreelancer` from the session, calls the matching `lib/services` function and revalidates on success. Every rule below lives in the service, so a stale tab or a script using the Freelancer's session gets the same answer as the editor (AC-25).

This file lists only the actions whose contract this feature changes. Every other action keeps its signature and outcomes from earlier contracts (`architecture-hardening`, `mcp-server`).

**No HTTP contract in this feature.** No route handler is added or changed. The MCP endpoint's `get_invoice` already answers from the issued details: its `InvoiceSenderDetails` and `InvoiceCustomerDetails` schemas are described as "copied onto the invoice", in `mcp-server/contracts/openapi.yaml`. AC-26 therefore holds with no shape change. What changes is that those columns stop moving once an invoice is issued (ADR-0001). The tool list is unchanged and read-only (AC-24). There is no async flow, so there is no `events.md`.

This contract is derived from `data-model.md`, the existing schema (`prisma/schema/invoice.prisma`, `lib/validations/*.ts`) for unchanged fields, sad.md §6 flows 1–10 and spec §4/§5. Field origins and the drift check are in [`api-sync-report.md`](./api-sync-report.md).

Legend: ★ new · ✎ changed · — unchanged.

## ActionResult (ADR-0009, amended again)

```ts
type ActionErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FAILED' | 'RATE_LIMITED'; // —

type ActionErrorDetails =
  | { kind: 'TOTALS_CHANGED'; oldTotal: DecimalString; newTotal: DecimalString }   // — (drafts only now, see updateInvoice)
  | { kind: 'HAS_INVOICES'; invoiceCount: number }                                 // — reused by the currency lock (AC-13, AC-13b)
  | { kind: 'RETRY_AT'; retryAt: string }                                          // —
  | { kind: 'PAGE_OUT_OF_RANGE'; total: number; lastPage: number }                 // —
  | { kind: 'AMBIGUOUS_REFERENCE'; /* … */ }                                       // —
  | { kind: 'CHANGED_ELSEWHERE'; currentVersion: number }                          // ★ AC-10 → SCR-05
  | { kind: 'STATUS_NOT_ALLOWED'; currentStatus: InvoiceStatus;                    // ★ AC-04..06, AC-04b
      suggestion: 'CANCEL_AND_DUPLICATE' | 'DUPLICATE' | null }
  | { kind: 'ISSUED_INVOICE_LOCKED' };                                             // ★ AC-08 (the changed fields are in fieldErrors)
```

**Amendment (additive, decided in this `api` pass, the same way as the earlier `TOTALS_CHANGED` one):** there are three new `details.kind` values. The code set stays closed. These kinds let the UI tell refusals apart without parsing messages:
- `CHANGED_ELSEWHERE` opens SCR-05. `CONFLICT` is also used for a taken invoice number, a legacy total and a default race, and those need other UI.
- `STATUS_NOT_ALLOWED` tells the list to redraw the row at `currentStatus` (flow 5: "row refreshed to its current status") and which correction to offer.
- `ISSUED_INVOICE_LOCKED` tells the editor to show the "cancel and duplicate" explanation next to the field errors.

**Code → meaning in this feature** (SAD §8; owner decisions 2026-10-07 recorded in the report §C):

| Code | When (this feature) |
|---|---|
| `NOT_FOUND` | the invoice, sender profile, Customer, bank account or product doesn't exist or isn't the caller's. The message is identical either way (AC-23) |
| `VALIDATION` | a lifecycle refusal: status change, create as non-draft, edit or delete of a non-draft (**delete moves from `CONFLICT`**, owner decision). Also a locked-field difference, an invoice-currency mismatch, an amount, discount or date bound, a malformed price, or unsetting the default without a replacement. Always with the spec's explanation, and with `fieldErrors` when the call came from a form |
| `CONFLICT` | an outdated view (`CHANGED_ELSEWHERE`); the currency lock on a bank account or product used by invoices (`HAS_INVOICES` + `fieldErrors.currency`, owner decision); a default race on the partial unique index (retryable); a taken number or legacy total (unchanged) |
| `FAILED` | anything else. **Never** for user input (QG-3a) |

## Invoices — `lib/actions/invoice-actions/invoice-actions.ts`

### Shared input: `InvoiceFormInput` (`lib/validations/invoice.ts`) ✎

These rows are new or changed. Every other field keeps its rule from `architecture-hardening/contracts/server-actions.md`.

| Field | Type / rule | Change | AC |
|---|---|---|---|
| `loadedVersion` | `integer ≥ 0`. **Required by `updateInvoice`** (missing → `VALIDATION`, `fieldErrors.loadedVersion = ["Reload the invoice and try again."]`). Ignored by `createInvoice`. The `Invoice.version` the editor loaded | ★ | AC-10, AC-25 |
| `status` | `enum InvoiceStatus`. `createInvoice` accepts only `DRAFT` (the default). On `updateInvoice` it is judged by the lifecycle against the locked row | ✎ | AC-04, AC-04b |
| `issueDate`, `dueDate` | calendar days, as before. **New rule:** `dueDate ≥ issueDate` (same day allowed) | ✎ | AC-09 |
| `bankAccountId` | **new rule:** the account's `currency` must equal the invoice's `currency` | ✎ | AC-11 |
| `items[].productId` | **new rule:** when set, the catalogue product's `currency` must equal the invoice's `currency`. Inactive products are loaded and checked too. A line with no `productId` (free text) is not checked | ✎ | AC-12, AC-15 |
| computed amounts | **new rule:** each amount from `computeInvoiceAmounts` is checked on its own against `99 999 999.99`: every line `amount`, `subtotal`, `taxAmount`, `total`. `shipping` keeps its existing max | ✎ | AC-19 |
| `discount` | `≤ subtotal + shipping`. Equal is allowed. The rule exists already; it now also runs for every non-editor caller and on draft → pending from the list | — / ✎ scope | AC-20b |

**Where the rules run (ADR-0003, AC-14).** Before the transaction, the action parses the **shape only**: types, enums and calendar days. Every business rule in the table runs **inside** the save transaction, after the row lock, and only where AC-14 says so:
- **Draft** (stored status `DRAFT`, including a draft being issued): every rule.
- **Issued** (`PENDING`, `OVERDUE`, `PAID`): only `dueDate ≥ issueDate`, and only when `dueDate` changed. Currency, amount and discount rules are not evaluated for the locked fields. A legacy issued invoice that breaks them still saves its notes (AC-14).

**Field-error messages** (plain language, stable text; the UI shows them verbatim):

| `fieldErrors` key | Message | AC |
|---|---|---|
| `status` | "A new invoice always starts as a draft. Save it, then issue it by moving it to pending." | AC-04b |
| `dueDate` | "The due date can't be before the issue date ({issueDate})." The `{issueDate}` is in the app's display format, e.g. "10 Mar 2026" | AC-09 |
| `bankAccountId` | "This account is in {accountCurrency} while the invoice is in {invoiceCurrency}." | AC-11 |
| `items.<i>.productId` | "“{productName}” is priced in {productCurrency} while the invoice is in {invoiceCurrency}." | AC-12 |
| `items.<i>.total` | "The line amount can't exceed 99,999,999.99." | AC-19 |
| `shipping` | "Shipping can't exceed 99,999,999.99." (✎ wording aligned) | AC-19 |
| `subtotal` / `taxAmount` / `total` | "The subtotal can't exceed 99,999,999.99." / "The tax amount can't exceed 99,999,999.99." / "The total can't exceed 99,999,999.99." | AC-19 |
| `discount` | "Discount can't exceed the subtotal plus shipping." (—) | AC-20b |
| any locked field key (see `updateInvoice`) | "This field can't change on an issued invoice." | AC-08 |

The keys follow the form paths, and a failing save may carry several of them in one `fieldErrors` set. sad.md §6 notes leave open whether currency and bounds errors arrive together; this contract says they do, in a single `VALIDATION`.

### `SavedInvoice` ✎

```ts
type SavedInvoice = {
  // … every field from architecture-hardening / mcp-server, unchanged …
  version: number;   // ★ Invoice.version after the write (ADR-0004); the editor's next loadedVersion
  issuedDetails: IssuedDetails | null; // ★ T22: the details the row holds after the write, same shape the editor loads. Set whenever the saved row is not a draft (a draft just issued by Save and issue returns the details it froze; an issued invoice saved again returns them unchanged); null for a draft
};
```

### `createInvoice(data: InvoiceFormInput): Promise<ActionResult<SavedInvoice>>` ✎

Flow 3. Checks run in this order, and the first failure wins:

| # | Outcome | Result |
|---|---|---|
| 1 | no session | `UNAUTHORIZED` (—) |
| 2 | shape invalid | `VALIDATION` + `fieldErrors` (—) |
| 3 | `status ≠ DRAFT` | `VALIDATION`, `error` = the `status` message, `fieldErrors.status`, `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'DRAFT', suggestion: null }`. Nothing is stored (AC-04b) |
| 4 | sender profile, Customer, bank account or a line's product missing or foreign | `NOT_FOUND` (AC-23) |
| 5 | a draft rule fails (currency, amount bounds, discount cap, due date) | `VALIDATION` + `fieldErrors` from the table above |
| 6 | number empty | allocated under the sender-profile row lock. **The year is the UTC year of `issueDate`** (a calendar day at `T00:00:00Z`), not the server clock. The counter is not reset per year (AC-21, AC-22) |
| 7 | success | the issued details are copied from the current sender profile, Customer and bank account; `version = 0`; `paidAt = null` → `success` |

The manual-number outcomes (`CONFLICT` on a taken key) are unchanged. Example (AC-21: last number INV-2026-0041, created on 2 Jan 2027, issue date 28 Dec 2026):

```json
{ "success": true, "data": { "id": "clx0000000000000000000010", "invoiceNumber": "INV-2026-0042", "status": "DRAFT", "version": 0, "issueDate": "2026-12-28T00:00:00.000Z", "…": "…" } }
```

### `updateInvoice(id: string, data: InvoiceFormInput): Promise<ActionResult<SavedInvoice>>` ✎

Flows 1, 2 and 4. Everything after step 2 runs in one transaction on the invoice row, locked `FOR UPDATE` and scoped by the owner. Checks run in this order (owner decision 2026-10-07: the version check comes before the status checks, as ADR-0004 says), and the first failure wins:

1. `UNAUTHORIZED` → shape `VALIDATION` (`loadedVersion` included).
2. Lock the row. No row, or another Freelancer's invoice → `NOT_FOUND`, "Invoice not found." (AC-23).
3. **Freshness (AC-10):** `loadedVersion ≠ row.version` → `CONFLICT`. `error` = "This invoice was changed elsewhere after you opened it. Reload it to see the latest version." `details: { kind: 'CHANGED_ELSEWHERE', currentVersion }`. Nothing is stored; the editor opens SCR-05.
4. **Cancelled (AC-06):** `row.status = CANCELLED` → `VALIDATION`. `error` = "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft." `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' }`.
5. **Lifecycle (ADR-0002):** `data.status ≠ row.status` and the transition table refuses → `VALIDATION`, `fieldErrors.status`, `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus, suggestion }`. The messages are shared with `updateInvoiceStatus` (table below).
6. **Issued invoice** (`row.status ∈ PENDING, OVERDUE, PAID`):
   - **Locked fields (ADR-0003, AC-08):** each locked field is compared with the stored value using the write normalizers: amounts as 2-dp strings, dates as calendar days (an unedited legacy instant counts as unchanged), lines in order by `productId`, `productName`, `description`, `unit`, `quantity` and `price`, and the number by its normalized key. On any difference → `VALIDATION`. `error` = "An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it." `details: { kind: 'ISSUED_INVOICE_LOCKED' }`. There is one `fieldErrors` entry per changed key: `invoiceNumber`, `senderProfileId`, `customerId`, `bankAccountId`, `issueDate`, `currency`, `taxRate`, `discount`, `shipping`, `terms`, `items` (count or order changed), `items.<i>.<field>`.
   - **Changed editable fields:** only `dueDate ≥ issueDate` (AC-09).
   - **Write:** only `dueDate`, `notes`, `paymentTerms` and `poNumber` (and `status`/`paidAt` when step 5 allowed a change), plus `version + 1`. The issued details, lines and amounts are untouched (AC-01, AC-07).
   - The legacy checks from `architecture-hardening` (shared number, `TOTALS_CHANGED`) **do not run** on an issued invoice, because its number and amounts are locked (AC-14).
7. **Draft** (`row.status = DRAFT`, including `data.status = PENDING`, which is issuing from the editor):
   - The draft rules: bank-account currency → line-product currency (inactive included) → amount bounds and discount cap → due date, all returned together in `fieldErrors`.
   - The legacy checks from `architecture-hardening` (number move, shared number, `TOTALS_CHANGED`) run as before.
   - **Write:** the issued details are refreshed from the current sender profile, Customer and bank account. Fields and lines are written as sent, with inactive-product lines kept. The number is kept when only the issue date moved (AC-21b). `version + 1`. When `data.status = PENDING`, the refreshed issued details are the ones that freeze (AC-02).
8. `success` with the new `version`.

Example, an outdated save (AC-10):

```json
{ "success": false, "code": "CONFLICT",
  "error": "This invoice was changed elsewhere after you opened it. Reload it to see the latest version.",
  "details": { "kind": "CHANGED_ELSEWHERE", "currentVersion": 4 } }
```

Example, a locked field on a pending invoice (AC-08):

```json
{ "success": false, "code": "VALIDATION",
  "error": "An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.",
  "fieldErrors": { "items.0.price": ["This field can't change on an issued invoice."] },
  "details": { "kind": "ISSUED_INVOICE_LOCKED" } }
```

### `updateInvoiceStatus(id: string, status: string): Promise<ActionResult<{ status: InvoiceStatus; paidAt: string | null }>>` ✎

Flows 2 and 5 (the list). **No version check** (AC-10 last sentence). It runs in one transaction on the locked row:

| # | Outcome | Result |
|---|---|---|
| 1 | no session / `status` not in the enum | `UNAUTHORIZED` / `VALIDATION` "Unknown status." (—) |
| 2 | no row or foreign | `NOT_FOUND` (AC-23) |
| 3 | `status = row.status` | `success` with the stored `status` and `paidAt`. **No write, no version bump** (AC-04) |
| 4 | the transition table refuses | `VALIDATION`, the message from the table below, `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: row.status, suggestion }`. The invoice is unchanged |
| 5 | `DRAFT → PENDING` and the stored draft breaks a draft rule | `VALIDATION` with the editor's messages in `error` (joined), `fieldErrors` keyed as in the editor, still a draft (AC-14, AC-25) |
| 6 | allowed | write `status`. Entering `PAID` sets `paidAt = now`; `PAID → PENDING` clears it. `version + 1`. Issued details untouched → `success` |

**Transition table** (ADR-0002, AC-04 to AC-06). Any pair not listed is refused:

| From → To | Allowed when |
|---|---|
| `DRAFT → PENDING` | the stored draft passes every draft rule |
| `PENDING → PAID`, `PENDING → OVERDUE`, `PENDING → CANCELLED` | always |
| `OVERDUE → PENDING` | stored `OVERDUE` (marked by hand) **and** `dueDate ≥ today` in the Freelancer time zone |
| `OVERDUE → PAID`, `OVERDUE → CANCELLED` | always |
| `PAID → PENDING` | always (clears `paidAt`) |

**Refusal messages** (shared with `updateInvoice` step 5):

| Refused move | `error` | `suggestion` |
|---|---|---|
| any issued status → `DRAFT` | "An issued invoice can never return to draft. Cancel it and duplicate it instead." | `CANCEL_AND_DUPLICATE` |
| `CANCELLED → *` | "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft." | `DUPLICATE` |
| `OVERDUE → PENDING` past due | "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid." | `null` |
| `DRAFT → CANCELLED` | "A draft can't be cancelled. Delete it instead." | `null` |
| any other pair | "An invoice can't move from {from} to {to}." | `null` |

Example (AC-10: marking paid an invoice that was cancelled elsewhere):

```json
{ "success": false, "code": "VALIDATION",
  "error": "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
  "details": { "kind": "STATUS_NOT_ALLOWED", "currentStatus": "CANCELLED", "suggestion": "DUPLICATE" } }
```

### `deleteInvoice(id: string): Promise<ActionResult>` ✎

Flow 6. The service locks the row (as `updateInvoice` does) and then:

| Outcome | Result |
|---|---|
| no row or foreign | `NOT_FOUND` (AC-23) |
| `status ≠ DRAFT` | **`VALIDATION`** (was `CONFLICT`; owner decision 2026-10-07). `error` = "Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed." `details: { kind: 'STATUS_NOT_ALLOWED', currentStatus, suggestion: null }` (AC-06) |
| draft | delete the invoice and its lines → `success` |

### `duplicateInvoice(id: string): Promise<ActionResult<{ id: string; invoiceNumber: string }>>` ✎

Flow 3. It works for a source in **any** status, `CANCELLED` included (AC-06). The copy is always `DRAFT` with `paidAt = null` and `version = 0`, and it has no reference to its source (sad §4).
- **Issued details ✎:** copied from the **current** sender profile, Customer and bank account. Today they are copied from the source's snapshot (data-model "written … by create, duplicate"; flow 3).
- **Rules ✎:** the duplicate goes through the create rules (flow 3, "the same as in flow 4"). A failure returns **`VALIDATION`** (was `FAILED`). `error` = "This invoice can't be duplicated. {reasons}", where the reasons are the de-duplicated field messages, and `fieldErrors` is keyed as in the editor. This covers a legacy source whose bank account or product currency no longer matches. It is not reported to Sentry (SAD §8: never `FAILED` for user input).
- **Number:** allocated with the year of the copy's issue date. The copy's issue date is today in the Freelancer time zone, unchanged.

### `getInvoiceEditorData(invoiceId?: string)` / `getInvoice(id)` ✎ (read side, flow 7)

- `initialData` gains `version: number` ★, which the editor sends back as `loadedVersion`.
- `products` ✎: active products **plus every product referenced by the invoice's lines, active or not**, each with its `isActive`. The editor offers only `isActive` products for new lines and never removes a line automatically (AC-15).
- `SerializedInvoice` already carries every `Invoice` column. The issued details (`sender*`, `customer*`, `bank*`, `accountName`) are what the editor's read-only blocks and the PDF print (AC-01–AC-03). Only the logo comes from the related `senderProfile.logo` (spec §3). After `version` is promoted, it appears in `SerializedInvoice` through the Prisma payload, with no type edit.
- **PDF data (internal, `lib/helpers/invoice-pdf-helpers.tsx`) ✎:** the sender, Customer and bank blocks are built from the snapshot columns, not from `invoice.senderProfile`, `invoice.customer` or `invoice.bankAccount`. The bank block prints `bankName`, `accountName` and `bankAccountNumber`, plus `bankIban` and `bankSwift` when they are not empty (AC-03). A line whose product was deleted prints as free text (AC-16).

### Unchanged here

`generateInvoiceNumber` keeps its hint semantics. Its year now comes from today's calendar day in the Freelancer time zone, because the hint has no issue date yet. Because it is only a hint, the number assigned on save may carry a different year (AC-21). `getPaginatedInvoices`, `getInvoicesByCustomer` and `getInvoicesBySenderProfile`: —.

## Bank accounts — `lib/actions/bank-account-actions.ts`

Signatures are unchanged. Every default-changing write runs in one transaction that first locks the **sender profile** row (`FOR UPDATE`, scoped by the owner; ADR-0005).

### `createBankAccount(senderProfileId, data)` ✎

| Outcome | Result |
|---|---|
| profile missing or foreign | `NOT_FOUND` (—) |
| first account of the profile | stored with `isDefault = true`, whatever was sent (AC-17b) |
| `data.isDefault = true`, others exist | the previous default is cleared, then this one is set, in the same transaction (AC-17) |
| unique hit on `BankAccount_senderProfileId_isDefault_key` (P2002) | `CONFLICT`, "Couldn't change the default account. Please try again." Rolled back; the previous default stays (AC-17) |

### `updateBankAccount(id, data)` ✎

Checks run in this order:

| # | Outcome | Result |
|---|---|---|
| 1 | missing or foreign | `NOT_FOUND` (—) |
| 2 | `data.currency ≠ stored` and N ≥ 1 invoices (any status) use the account | **`CONFLICT`** ★. `error` = "The currency of an account used by {N} invoice(s) can't change." `fieldErrors.currency` holds the same text. `details: { kind: 'HAS_INVOICES', invoiceCount: N }`. Other fields in the same request are not saved; the form keeps them (AC-13) |
| 3 | `data.isDefault = false` on the current default | `VALIDATION` ★, `fieldErrors.isDefault = ["The default account can't be switched off. Make another account the default instead."]` (AC-17b) |
| 4 | `data.isDefault = true` on a non-default | clear and set under the lock (AC-17). A repeat finds it already the default → `success` |
| 5 | unique hit (P2002) | the retryable `CONFLICT` above |

### `deleteBankAccount(id)` ✎

When the deleted account was the default and others remain, the **earliest-created** remaining account (`createdAt`, then `id`) becomes the default in the same transaction (AC-17b). The other outcomes are unchanged, including the refusal when invoices use the account.

## Sender profiles — `lib/actions/sender-profile-actions.ts`

These follow the same four rules as bank accounts, under the **`User`** row lock (ADR-0005):
- `createSenderProfile`: first profile → default; `isDefault = true` → switch.
- `updateSenderProfile`: `isDefault = false` on the current default → `VALIDATION`, `fieldErrors.isDefault = ["The default sender profile can't be switched off. Make another profile the default instead."]`; `isDefault = true` → switch.
- `deleteSenderProfile`: promotes the earliest-created remaining profile.
- P2002 on `SenderProfile_userId_isDefault_key` → `CONFLICT`, "Couldn't change the default sender profile. Please try again."

The prefix conflict and every other outcome are unchanged.

## Products — `lib/actions/product-actions.ts`

### `ProductFormValues.price` ✎ (`lib/validations/product.ts`)

`string` (unchanged type, the form field). It now follows the rule custom prices use (AC-20): it must match `^\d{1,8}(\.\d{1,2})?$` with a value `≤ 99 999 999.99`.

| Input | `fieldErrors.price` |
|---|---|
| `"12abc"`, `""`, `"abc"` | "Price must be a number." (for `""`, "Price is required" stays) |
| `"12.345"` | "Price can have at most 2 decimal places." |
| `"-1"` | "Price can't be negative." |
| `"100000000"` | "Price is too large." |

These are the same texts as `lib/validations/custom-price.ts`. The rule runs in the form and in the service (`createProduct`, `updateProduct`) → `VALIDATION`.

### `updateProduct(id, data)` ✎

The currency lock (AC-13b) changes in three ways:
- **The count changes from lines to invoices:** `count(DISTINCT invoiceId)` over `InvoiceItem.productId`. Today it is `_count.invoiceItems`, which counts lines.
- **The message:** "The currency of a product used on {N} invoice(s) can't change."
- **The result:** `CONFLICT` with `fieldErrors.currency` and `details: { kind: 'HAS_INVOICES', invoiceCount: N }`.

The unit lock and every other outcome are unchanged. `toggleProductActive` is unchanged: deactivating never touches lines (AC-15).

## Assistant (MCP) — no change

`get_invoice` and the six other tools keep the `mcp-server` contract. They already read the issued details, and none can write (AC-24, AC-26). See the note at the top.
