---
status: draft
feature_size: "M"
tool: "code"
updated_at: "2026-10-07"
---

# Screens — invoice-integrity

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code. `docs/design-system.md` is the code-only canon ("no Figma/Pencil MCP is configured"), so this is the canon's mode and not a degradation.
- **File:** the wireframes are inline below.
- **Component inventory:** the canon's registered components (`LoadError`, `ConfirmationModal`, `CopyButton`), plus the code's de-facto inventory that earlier manifests use:
  - the `components/ui/*` primitives: `Alert`, `Badge`, `Button`, `Checkbox`, `DropdownMenu`, `Field`/`FieldError`/`FieldDescription`, `Input`, `Select`, `Textarea`, `Spinner`, `Sonner` toasts
  - the app components: `InvoicesDataTable`, `InvoiceRowActions`, `InvoicesEmptyState`, `InvoicesTableSkeleton` (`components/invoices/`); `InvoiceEditor`, `InvoiceEditorHeader`, `InvoiceEditorLoading`, `EditorSaveStatus`, `PDFPreviewPanel`, `InvoicePDFDocument` (`components/invoice-editor/`); `InvoicePdfPreviewModal` (`components/modals/invoice/`); `BankAccountModal` (`components/modals/sender-profile/`); `CurrencyChangeWarningModal` (`components/modals/product/`); `SenderProfileForm`, `SenderProfilesList`, `SenderProfileBankAccountsList` (`components/sender-profiles/`); `ProductForm`, `ProductsList` (`components/products/`); `CustomerForm` (`components/customers/`); `ContentAreaNotFound`, `EmptyState` (`components/layout/content-area/`); each route's existing `loading.tsx` skeleton.
- **Posture:** responsive-both (from `ux-flows.md`). Every refusal below reads at phone width. Dialogs are the existing `Dialog`-based `ConfirmationModal`, and field errors sit under their field.
- **Strings:** inline, because the app has no i18n layer. Where `contracts/server-actions.md` fixes a message, the UI shows it **verbatim** from the result's `error` / `fieldErrors`. It never rewrites it.
- **Error routing** (ADR-0009, contract "Code → meaning in this feature"):
  - `VALIDATION` shows a `FieldError` under the field named by its key. A key with no rendered field falls back to `toast.error` (the existing F-41 rule).
  - `CONFLICT` is routed by `details.kind`. `CHANGED_ELSEWHERE` opens SCR-05. `HAS_INVOICES` shows a `FieldError` on currency. `TOTALS_CHANGED` opens architecture-hardening SCR-15 (unchanged). A default race or a taken number shows the result's `error`.
  - `STATUS_NOT_ALLOWED` in the list: `toast.error` with `error`, then the row is redrawn at `currentStatus`.
  - `UNAUTHORIZED` or a rejected call goes to sign-in, as before. `NOT_FOUND` on a page goes to SCR-13; on an action, it shows `toast.error`. `FAILED` shows `toast.error`, with Retry where it exists today.
- **Decisions taken at this stage** (owner, 2026-10-07):
  1. **Issuing from the editor:** yes. A saved draft gets a **Save and issue** button. It calls `updateInvoice` with `status: PENDING` (SAD §4). A new, unsaved invoice has no such button, because a new invoice always starts as a draft (AC-04b).
  2. **The "issued invoices are locked" note** (spec §8 open question, due before `tasks`): a **permanent** info `Alert` in the editor's issued mode, on every issued invoice. It replaces the current `EditSentedInvoiceAlert` text. Nothing is stored and there is no schema change. This replaces the one-time-note default.
  3. **Make default:** stays the existing **"Set as default" `Checkbox`** in the sender profile form (SCR-09) and the bank account form (SCR-10). The lists (SCR-07, SCR-08) get no new action. This narrows the "make-default actions" wording in the `ux-flows.md` inventory.
  4. **A draft's PDF in the editor:** the editor's preview, Download and Print render the **form as it stands**, which is what the next save will store (as today). The "last save" rule of AC-02 applies to the PDF of the stored invoice: View, Download and Print from the list, and the details frozen when the draft is issued.
- **Retired:** the `ItemSectionInvalidItems` alert and the `InvalidItemsWarningDialog` ("…will be removed when you save"), for both reasons, currency and custom price. A mismatching line is now a field error that blocks the save (AC-12), and a line is never removed automatically (AC-15).

## Screens

### SCR-01 — Invoice list

`InvoiceRowActions` is shared by the invoice list and the dashboard's recent invoices, so every row state below applies to both.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | List request in flight | `InvoicesTableSkeleton` (existing) | existing |
| empty | The Freelancer has no invoices | `InvoicesEmptyState` (existing) | existing |
| error | Load fails → architecture-hardening SCR-17 | `LoadError` | existing |
| default — row actions by status | Each row's menu offers only the moves that the shared transition table (ADR-0002) allows from the row's **stored** status. The badge still shows the derived status, so a past-due pending row reads Overdue but offers the pending moves (AC-04, AC-05, AC-06; flow 5) | `InvoicesDataTable`, `InvoiceRowActions`, `DropdownMenu`, `Badge` | wireframe A |
| default — draft row | View, Download, Print, Edit, Duplicate, Mark as Pending, Delete. **No Cancel** (AC-04) | `DropdownMenu` | wireframe A |
| default — pending row | View, Download, Print, Edit, Duplicate, Mark as Paid, Mark as Overdue, Cancel Invoice. No Delete, no way back to draft (AC-05, AC-06) | `DropdownMenu` | wireframe A |
| default — overdue row (stored) | View, Download, Print, Edit, Duplicate, Mark as Paid, Cancel Invoice. **Mark as Pending** appears only while the due date is today or later in the Freelancer's time zone (AC-04) | `DropdownMenu` | wireframe A |
| default — paid row | View, Download, Print, Edit, Duplicate, Mark as Pending (undoes a mistaken payment, clears the paid date). No Cancel (AC-04) | `DropdownMenu` | wireframe A |
| default — cancelled row | View, Download, Print, Duplicate only. No Edit, no status move, no Delete. The number link still opens the read-only editor (SCR-02 `cancelled`) (AC-06) | `DropdownMenu` | wireframe A |
| cancel-requested | Cancel Invoice → opens SCR-04. Nothing changes until the Freelancer confirms | see SCR-04 | SCR-04 |
| status-changed | `updateInvoiceStatus` success: `toast.success` "Invoice marked as {status}". The row's badge and paid date refresh. Entering paid records the paid date, and paid → pending clears it (AC-04; flow 5) | `Sonner`, `Badge` | existing |
| status-refused | `VALIDATION` + `STATUS_NOT_ALLOWED`: the status changed elsewhere since the list loaded, or a hand-marked overdue went past due. `toast.error` with the result's `error` verbatim (e.g. "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft."), then the row is redrawn at `details.currentStatus` with that status's menu. Nothing changed (AC-10; flow 2, flow 5) | `Sonner`, `InvoicesDataTable` | wireframe B |
| issue-refused | Mark as Pending on a draft that breaks a draft rule → `VALIDATION` with the editor's messages joined in `error`. `toast.error` with that text. The row stays a draft (AC-14; flow 5) | `Sonner` | wireframe B |
| delete-refused | Delete on a row that stopped being a draft elsewhere → `VALIDATION` + `STATUS_NOT_ALLOWED`. `toast.error` with `error`, and the row is redrawn at `currentStatus` (AC-06; flow 6) | `Sonner` | — |
| duplicated | `duplicateInvoice` success, any source status including cancelled: `toast.success` "Duplicated as {invoiceNumber}". The new draft appears in the list (AC-04b, AC-06; flow 3) | `Sonner`, `InvoicesDataTable` | existing |
| duplicate-refused | `duplicateInvoice` → `VALIDATION`, a legacy source whose currencies no longer match: `toast.error` with "This invoice can't be duplicated. {reasons}" verbatim (it was a generic failure before) | `Sonner` | — |
| row-action-not-found | Any row action → `NOT_FOUND`: `toast.error` with `error` (unchanged; AC-23) | `Sonner` | existing |

```text
A — row menus by stored status (the "..." DropdownMenu)
 Draft            Pending           Overdue (stored)       Paid             Cancelled
 View             View              View                   View             View
 Download         Download          Download               Download         Download
 Print            Print             Print                  Print            Print
 ----             ----              ----                   ----             ----
 Edit             Edit              Edit                   Edit             Duplicate
 Duplicate        Duplicate         Duplicate              Duplicate
 ----             ----              ----                   ----
 Mark as Pending  Mark as Paid      Mark as Paid           Mark as Pending
 ----             Mark as Overdue   Mark as Pending *      
 Delete           Cancel Invoice    Cancel Invoice
                                    * only while the due date is today or later

B — refused status change (row was stale)
+--------------------------------------------------------------+
| INV-2026-0042  Acme   10 Mar   1,200.00  [Cancelled]  [...]  |  <- redrawn at currentStatus
+--------------------------------------------------------------+
                 +--------------------------------------------+
                 | (x) A cancelled invoice is final and can't |  <- toast.error, verbatim
                 |     be changed. Duplicate it to make a new |
                 |     draft.                                 |
                 +--------------------------------------------+
```

### SCR-02 — Invoice editor

The mode follows the invoice's stored status: **draft** (fully editable), **issued** (pending, overdue, paid: four fields editable) or **cancelled** (read-only).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Editor data in flight | `InvoiceEditorLoading` (existing) | existing |
| not-found | Unknown or another Freelancer's invoice id → SCR-13 (AC-23) | see SCR-13 | SCR-13 |
| error | Load fails → architecture-hardening SCR-17 | `LoadError` | existing |
| empty | N/A: the editor always renders a form | — | — |
| default-new | New invoice. It starts from the default sender profile and its default bank account (AC-17b). The header shows **Save** only, with no Save and issue (AC-04b) | `InvoiceEditor`, `InvoiceEditorHeader` | existing layout |
| draft | Saved draft. Every field is editable. The header shows **Save** and **Save and issue**. The product picker for a new line offers only active products. A line whose product was deactivated shows exactly as saved, including its custom-price marking. A line whose product was deleted shows as free text (description, quantity, price, amount). No line is ever flagged for removal (AC-15, AC-16) | `InvoiceEditor`, `InvoiceEditorHeader`, `Button` | wireframe A |
| draft — validation | Save or Save and issue → `VALIDATION`. All failing rules come back together, and each `FieldError` shows the contract text under its field. Edits are kept and nothing is stored. Keys: `bankAccountId` → under the bank account select (AC-11); `items.<i>.productId` → under that line, naming the product (AC-12); `items.<i>.total` → under that line's amount; `shipping` → shipping; `subtotal` / `taxAmount` / `total` → under the totals (AC-19); `discount` → discount (AC-20b); `dueDate` → due date (AC-09). Every one of these keys becomes a rendered field-error key, so none falls back to a toast. A draft saved before the release with mismatching currencies hits the same state on any save, even a notes-only one (AC-14) | `FieldError`, `Field` | wireframe B |
| saving | Save or Save and issue in flight; both buttons disabled | `EditorSaveStatus`, `Spinner` | existing |
| saved | Success. `SavedInvoice` replaces the form values, and the new `version` becomes the next `loadedVersion`. A draft now shows the current Customer, sender profile and bank account details (AC-02) | `EditorSaveStatus` | existing |
| issued-from-editor | Save and issue succeeds: `toast.success` "Invoice issued". The badge reads Pending, and the editor switches to `issued` in place without a reload. The details saved in this call are now fixed (AC-02; flow 4) | `Sonner`, `Badge` | wireframe C |
| issued | Pending, overdue or paid. Editable: **due date, notes, payment terms, PO number**. Everything else is read-only (AC-08): the number, issue date, currency, tax, discount, shipping and terms inputs are disabled; the line add, remove and reorder controls are hidden; the sender, Customer and bank account blocks show the **issued details** as text, not a picker over the current records (AC-01). A permanent info `Alert` at the top (decision 2) reads: "This invoice is issued. You can change only the due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it." The header shows **Save** only | `Alert`, `Input` (disabled), `InvoiceEditorHeader` | wireframe C |
| issued — validation | Save → `VALIDATION` on `dueDate`: "The due date can't be before the issue date ({issueDate})." under the due date. Edits are kept (AC-09; flow 1) | `FieldError` | wireframe C |
| issued — saved | Success. Only the four fields changed (AC-01, AC-07). The badge follows the derived status: a pending invoice whose due date moved into the future reads Pending, while a hand-marked overdue one still reads Overdue (AC-07) | `EditorSaveStatus`, `Badge` | existing |
| issued — locked-field refusal | `VALIDATION` + `ISSUED_INVOICE_LOCKED`. It is reachable only from a tampered or stale form, because the fields are read-only. The result's `error` shows in a destructive `Alert` above the form. Each changed key gets a `FieldError` where it is rendered, and the rest go to the toast fallback. Nothing is stored (AC-08, AC-25) | `Alert`, `FieldError` | — |
| cancelled | Fully read-only. Every input is disabled and **Save is hidden**. Download and Print stay. An info `Alert` reads "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft." Duplicate is in the list (AC-06) | `Alert`, `InvoiceEditorHeader` | wireframe D |
| refused | Save → `VALIDATION` + `STATUS_NOT_ALLOWED` (e.g. a lifecycle refusal on Save and issue): `toast.error` with `error` verbatim. Edits are kept (AC-04, AC-25) | `Sonner` | — |
| changed-elsewhere | Save or Save and issue → `CONFLICT` + `CHANGED_ELSEWHERE` → opens SCR-05. Nothing is stored (AC-10; flows 1, 2, 4) | see SCR-05 | SCR-05 |
| stale | SCR-05 was closed without reloading. The edits stay on screen. A warning `Alert` above the form reads "This invoice was changed elsewhere. Reload it to continue." and has a **Reload** `Button`, which does the same as SCR-05's Reload. Save stays enabled, and any save re-opens SCR-05 (AC-10; flow US-05 E6) | `Alert`, `Button` | wireframe E |
| legacy-totals / number-taken / relation-not-found / save-failed | Drafts only, unchanged from architecture-hardening SCR-03 (SCR-15 dialog, `FieldError` on the number, `toast.error`, Retry toast) | as before | existing |
| preview / download / print | `PDFPreviewPanel`, Download and Print render the **form as it stands** (decision 4). In issued and cancelled modes that form *is* the issued details, so they match the stored PDF → SCR-03 | `PDFPreviewPanel` | SCR-03 |

```text
A — draft header (saved draft)                     C — issued (pending)
+------------------------------------------+       +------------------------------------------+
| <- INV-2026-0042 [Draft]          Saved  |       | <- INV-2026-0042 [Pending]        Saved  |
|            [Save] [Save and issue] [v][P]|       |                       [Save] [v][P]      |
|------------------------------------------|       |------------------------------------------|
| Line 1  Consulting 2025 (inactive         |       | (i) This invoice is issued. You can      |  <- Alert (info), permanent
|         product, kept as saved)          |       |     change only the due date, notes,     |
|   Qty 10   Price 150.00   Amount 1500.00 |       |     payment terms and PO number. To      |
| Line 2  Old workshop (free text)         |       |     correct anything else, cancel it and |
|   Qty 1    Price 300.00   Amount 300.00  |       |     duplicate it.                        |
| [+ Add line]  (active products only)     |       |------------------------------------------|
+------------------------------------------+       | From  Old Legal Name Ltd   (issued)      |  <- text, not a picker
                                                   | To    Acme, Old Street 1   (issued)      |
B — draft validation (all rules at once)           | Bank  Bank X, acct 123, IBAN …           |
+------------------------------------------+       | Issue date [10 Mar 2026]  (disabled)     |
| Bank account [ USD account v ]           |       | Due date   [ 05 Mar 2026 ]               |
| ! This account is in USD while the       |       | ! The due date can't be before the issue |  <- FieldError (AC-09)
|   invoice is in EUR.                     |       |   date (10 Mar 2026).                    |
| Line 1  Consulting [Qty 10] [150.00]     |       | Lines (read-only, no add/remove/reorder) |
| ! "Consulting" is priced in USD while    |       | Payment terms [ Net 14        ]          |
|   the invoice is in EUR.                 |       | PO number     [ PO-77         ]          |
| Line 2  [Qty 1000] [150000.00]           |       | Notes         [ ...           ]          |
| ! The line amount can't exceed           |       +------------------------------------------+
|   99,999,999.99.                         |
| Subtotal 150,001,500.00                  |       D — cancelled
| ! The subtotal can't exceed              |       +------------------------------------------+
|   99,999,999.99.                         |       | <- INV-2026-0040 [Cancelled]     [v][P]  |  <- no Save
| Discount [ 1250.00 ]                     |       | (i) A cancelled invoice is final and     |
| ! Discount can't exceed the subtotal     |       |     can't be changed. Duplicate it to    |
|   plus shipping.                         |       |     make a new draft.                    |
+------------------------------------------+       | ...every field disabled...               |
                                                   +------------------------------------------+
E — stale (SCR-05 closed)
+------------------------------------------+
| (!) This invoice was changed elsewhere.  |  <- Alert (warning)
|     Reload it to continue.     [Reload]  |
|------------------------------------------|
| ...the Freelancer's edits, still shown...|
+------------------------------------------+
```

### SCR-03 — Invoice PDF

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| generating | PDF being rendered | `Spinner` in `PDFPreviewPanel` / `InvoicePdfPreviewModal` (existing) | existing |
| default — issued | View, Download or Print of a pending, overdue, paid or cancelled invoice. The sender, Customer and bank blocks are built from the **issued details** (snapshot columns), never from the current records. Only the logo comes from the current sender profile (AC-01, AC-26 parity; flow 7) | `InvoicePDFDocument`, `InvoicePdfPreviewModal` | wireframe |
| default — draft | From the list: the stored draft, so the issued details of its **last save** (AC-02). From the editor: the form as it stands (decision 4) | as above | wireframe |
| bank block — no IBAN | The issued details have an account number and no IBAN: bank name, account holder, account number. No empty IBAN or SWIFT rows (AC-03) | `InvoicePDFDocument` | wireframe |
| bank block — with IBAN | Bank name, account holder, account number, then IBAN and SWIFT, each only when it is not empty (AC-03) | `InvoicePDFDocument` | wireframe |
| retired-product lines | A deactivated product's line prints as saved. A deleted product's line prints as free text (description, quantity, price, amount). The total is unchanged (AC-15, AC-16) | `InvoicePDFDocument` | — |
| logo states | Unchanged from architecture-hardening SCR-04 (with-logo, no-logo-set, warn-specific, warn-generic) | as before | existing |
| empty | N/A: a PDF always has an invoice behind it | — | — |
| error | N/A: PDF rendering failures are unchanged by this feature. Opening a missing or foreign invoice goes to SCR-13 before any PDF (flow 7) | — | — |

```text
+------------------------------------------------+
| [logo: current]                      INVOICE   |
| Old Legal Name Ltd          INV-2025-0031      |  <- issued details, not the current profile
| Acme, Old Street 1          Issued 12 Nov 2025 |
| ...lines and totals as saved...                |
|------------------------------------------------|
| Payment details                                |
| Bank            Bank X                         |
| Account holder  Old Legal Name Ltd             |
| Account number  123456789                      |  <- always
| IBAN            UA12 3456 ...                  |  <- only when present
| SWIFT           BANKUAUX                       |  <- only when present
+------------------------------------------------+
```

### SCR-04 — Cancel invoice confirmation

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Cancel Invoice on a pending or overdue row. Title "Cancel invoice {invoiceNumber}?". The description says it is final: "A cancelled invoice is final. It stays in your list and can still be viewed, downloaded, printed and duplicated, but it can't be changed or deleted." Buttons: **Keep invoice** and **Cancel invoice** (destructive) (AC-06; flow 5) | `ConfirmationModal` | wireframe |
| kept | Keep invoice or Esc: the dialog closes and the row is unchanged | `ConfirmationModal` | — |
| submitting | Confirm → async `onConfirm` (`updateInvoiceStatus(id, 'CANCELLED')`). The confirm button shows a `Spinner` and both buttons are disabled. The dialog is never auto-closed | `ConfirmationModal`, `Spinner` | — |
| success | The caller closes the dialog. `toast.success` "Invoice marked as cancelled", and the row reads Cancelled with the cancelled menu (SCR-01) | `Sonner` | — |
| refused | `VALIDATION` + `STATUS_NOT_ALLOWED` (e.g. paid or cancelled in another tab): the caller closes the dialog, then SCR-01 `status-refused` (toast verbatim, row redrawn at `currentStatus`) (AC-10) | `Sonner` | SCR-01 |
| not-found | `NOT_FOUND`: the caller closes the dialog and shows `toast.error` with `error` (AC-23) | `Sonner` | — |
| rejected | The promise rejects: `ConfirmationModal` sends the device to sign-in (its built-in rule) | `ConfirmationModal` | — |
| empty | N/A: the dialog always concerns one invoice | — | — |

```text
+--------------------------------------------+
| Cancel invoice INV-2026-0042?              |
|                                            |
| A cancelled invoice is final. It stays in  |
| your list and can still be viewed,         |
| downloaded, printed and duplicated, but it |
| can't be changed or deleted.               |
|                                            |
|            [Keep invoice] [Cancel invoice] |  <- destructive
+--------------------------------------------+
```

### SCR-05 — Invoice changed elsewhere

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | An editor save → `CONFLICT` + `CHANGED_ELSEWHERE`. Title "This invoice changed elsewhere". The body shows the result's `error` verbatim ("This invoice was changed elsewhere after you opened it. Reload it to see the latest version.") and adds "Reloading discards your unsaved changes." Buttons: **Close** and **Reload invoice** (AC-10; flows 1, 2, 4) | `ConfirmationModal` (`body` slot) | wireframe |
| reloading | Reload invoice → re-fetch the editor data. The confirm button shows a `Spinner` and both buttons are disabled. The unsaved-changes guard does not fire, because discarding is the point | `ConfirmationModal`, `Spinner` | — |
| reloaded | The caller closes the dialog. The editor re-initialises from the current invoice and its `version`, in the mode of its current status. For example, it reopens as paid with its paid date, in issued mode (flow US-05 E5) | `InvoiceEditor` | SCR-02 |
| closed | Close or Esc: the dialog closes and SCR-02 enters `stale`, with the edits still on screen (flow US-05 E6) | — | SCR-02 `stale` |
| reload-not-found | The invoice is gone (deleted elsewhere) → SCR-13 | see SCR-13 | SCR-13 |
| reload-error | The reload fails → architecture-hardening SCR-17 | `LoadError` | existing |
| empty | N/A: the dialog always follows a refused save | — | — |

```text
+--------------------------------------------+
| This invoice changed elsewhere             |
|                                            |
| This invoice was changed elsewhere after   |  <- result.error, verbatim
| you opened it. Reload it to see the latest |
| version.                                   |
| Reloading discards your unsaved changes.   |
|                                            |
|                   [Close] [Reload invoice] |
+--------------------------------------------+
```

### SCR-06 — Customer form

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / loading / saved / validation / not-found / error | Unchanged. Saving a Customer still changes only the Customer. The new behaviour is elsewhere: a draft picks the change up on its next save (SCR-02 `saved`), and an issued invoice never does (SCR-02 `issued`, SCR-03) (AC-01, AC-02) | `CustomerForm` (existing) | existing |
| empty | N/A: a form for one record | — | — |

No wireframe: the screen is unchanged. It is listed because the US-01 flow starts here.

### SCR-07 — Sender profiles list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | List request in flight | existing `loading.tsx` skeleton | existing |
| empty | No profiles yet. The existing `EmptyState` with its create action. The first profile created becomes the default automatically (AC-17b; flow US-08 H7 → H9) | `EmptyState` | existing |
| default | Exactly one card has the **Default** badge (AC-17, AC-18). There is no make-default action here (decision 3). Switching happens in SCR-09 | `SenderProfilesList`, `Badge` | existing |
| default-promoted | After the default is deleted through SCR-14, the list refreshes, and the earliest-created remaining profile has the Default badge (AC-17b) | `SenderProfilesList`, `Badge` | — |
| error | Load fails → architecture-hardening SCR-17 | `LoadError` | existing |

No wireframe: the layout is unchanged. Only which card carries the badge follows the new rule.

### SCR-08 — Sender profile page

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | The profile's bank accounts, exactly one with the **Default** badge within this profile (AC-17). Add and edit open SCR-10, and delete opens SCR-14 | `SenderProfileBankAccountsList`, `Badge` | existing |
| empty | No bank accounts yet. The existing empty state with its add action. The first account added becomes the default automatically (AC-17b; flow US-08 H14 → H15) | `EmptyState` | existing |
| default-promoted | After the default account is deleted, the earliest-created remaining account has the Default badge (AC-17b) | `Badge` | — |
| not-found | Unknown or foreign profile → SCR-13 (unchanged) | `ContentAreaNotFound` | existing |
| error | Load fails → architecture-hardening SCR-17 | `LoadError` | existing |

No wireframe: the layout is unchanged.

### SCR-09 — Sender profile form

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default — first profile | Creating the Freelancer's first profile: "Set as default sender profile" is checked and disabled, with the `FieldDescription` "Your first sender profile is the default." (AC-17b) | `SenderProfileForm`, `Checkbox`, `FieldDescription` | wireframe |
| default — not the default | Another profile is the default. The checkbox is enabled and unchecked. Checking it and saving makes this profile the only default (AC-17) | `Checkbox` | existing |
| default — current default | This profile is the default. The checkbox is **checked and disabled**, with the `FieldDescription` "This is your default sender profile. To change it, make another profile the default." (AC-17b; flow US-08 H4) | `Checkbox`, `FieldDescription` | wireframe |
| saving / saved | Unchanged: in flight, then `toast.success` and back to SCR-07 or SCR-08 | `Sonner` | existing |
| default-switch-failed | Save → `CONFLICT` "Couldn't change the default sender profile. Please try again.": `toast.error` verbatim. The form keeps its values, and the previous default is unchanged (AC-17) | `Sonner` | — |
| validation — isDefault | `VALIDATION` with `fieldErrors.isDefault`, reachable only from a tampered request: a `FieldError` under the checkbox with the contract text | `FieldError` | — |
| validation / not-found / error (other) | Unchanged | as before | existing |
| empty | N/A: a form for one record | — | — |

```text
+------------------------------------------------+
| [x] Set as default sender profile   (disabled) |
|     This is your default sender profile. To    |  <- FieldDescription
|     change it, make another profile the        |
|     default.                                   |
+------------------------------------------------+
```

### SCR-10 — Bank account form

The form is the existing `BankAccountModal` dialog, opened from SCR-08.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default — first account | The profile's first account: "Set as default bank account for this sender profile" is checked and disabled, with the `FieldDescription` "The first account of a sender profile is its default." (AC-17b) | `BankAccountModal`, `Checkbox`, `FieldDescription` | as SCR-09 wireframe |
| default — not the default | The checkbox is enabled. Checking it and saving makes this account the profile's only default (AC-17) | `Checkbox` | existing |
| default — current default | The checkbox is checked and disabled, with "This is the default account. To change it, make another account the default." (AC-17b) | `Checkbox`, `FieldDescription` | as SCR-09 wireframe |
| saving / saved | Unchanged: in flight, then close and refresh SCR-08 | `BankAccountModal`, `Sonner` | existing |
| currency-locked | Save with a changed currency on an account that N invoices use → `CONFLICT` + `HAS_INVOICES`. A `FieldError` under currency reads "The currency of an account used by {N} invoice(s) can't change." The dialog stays open with every value kept, and nothing is stored. Restoring the currency lets the other changes save (AC-13; flow 9). The currency is not locked up front: the refusal comes on save, as `ux-flows.md` decided | `FieldError`, `Select` | wireframe |
| default-switch-failed | `CONFLICT` "Couldn't change the default account. Please try again.": `toast.error` verbatim, the dialog stays open, and the previous default is unchanged (AC-17) | `Sonner` | — |
| validation — isDefault | Tampered `isDefault = false` on the default: a `FieldError` under the checkbox with the contract text | `FieldError` | — |
| not-found | `NOT_FOUND`: `toast.error` with `error` (unchanged) | `Sonner` | existing |
| empty | N/A: a form for one record | — | — |

```text
+------------------------------------------------+
| Currency *                                     |
| [ USD                                    v ]   |
| ! The currency of an account used by 3         |  <- FieldError (CONFLICT, HAS_INVOICES)
|   invoice(s) can't change.                     |
| IBAN [ UA12 3456 ...                     ]     |  <- other edits kept
|                          [Cancel] [Save]       |
+------------------------------------------------+
```

### SCR-11 — Products list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / loading / empty / error | Unchanged. Deactivating or deleting a product never touches invoice lines. The effect shows in SCR-02 `draft` and SCR-03 `retired-product lines` (AC-15, AC-16) | `ProductsList`, `EmptyState` (existing) | existing |

No wireframe: the screen is unchanged. It is listed because the US-07 flow starts here.

### SCR-12 — Product form

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading / default / saved | Unchanged | `ProductForm` (existing) | existing |
| validation — price | The price breaks the strict format, in the form and on save (`VALIDATION`). A `FieldError` under price shows the contract text: "Price must be a number." for `12abc`, "Price can have at most 2 decimal places." for `12.345`, "Price can't be negative.", "Price is too large." Values are kept (AC-20; flow 9) | `FieldError` | wireframe |
| currency-locked | Save with a changed currency on a product that N invoices use → `CONFLICT` + `HAS_INVOICES`. A `FieldError` under currency reads "The currency of a product used on {N} invoice(s) can't change." Other values are kept and nothing is stored (AC-13b; flow 9). If the product also has custom prices, the existing `CurrencyChangeWarningModal` still shows first (unchanged), and this refusal follows its confirm | `FieldError`, `CurrencyChangeWarningModal` | wireframe |
| not-found / error | Unchanged | as before | existing |
| empty | N/A: a form for one record | — | — |

```text
+------------------------------------------------+
| Price *                                        |
| [ 12.345                                 ]     |
| ! Price can have at most 2 decimal places.     |  <- FieldError (AC-20)
| Currency *                                     |
| [ USD                                    v ]   |
| ! The currency of a product used on 2          |  <- FieldError (AC-13b)
|   invoice(s) can't change.                     |
+------------------------------------------------+
```

### SCR-13 — Not found

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | An invoice that doesn't exist **or** belongs to another Freelancer, opened by link or address. The page is identical in both cases and reveals nothing about the other invoice (AC-23; flow 7) | `ContentAreaNotFound` (existing) | existing |
| loading / empty / error | N/A: a static page | — | — |

No wireframe: the page is unchanged. The new guarantee is that the foreign case renders it identically.

### SCR-14 — Delete confirmation

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default / submitting / blocked / rejected | Unchanged: the existing confirm-or-cancel dialog for deleting a sender profile or a bank account, including the existing refusal when invoices use the record | `ConfirmationModal` (existing) | existing |
| deleted-default | Confirmed on the current default while others remain: the caller closes the dialog, and SCR-07 or SCR-08 shows `default-promoted` (AC-17b; flow 10) | `ConfirmationModal` | SCR-07 / SCR-08 |
| empty | N/A: the dialog always concerns one record | — | — |

No wireframe: the dialog is unchanged.

## New components

None — all screens compose the existing inventory. The issued and cancelled notices reuse `Alert` (`EditSentedInvoiceAlert` is rewritten, not added). The cancel and changed-elsewhere dialogs reuse `ConfirmationModal`. Save and issue is a `Button` in the existing `InvoiceEditorHeader`. Nothing new is registered in `docs/design-system.md`.

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| — | — | — |
