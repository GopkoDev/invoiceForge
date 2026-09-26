---
status: draft
feature_size: "M"
tool: "code"
updated_at: "2026-09-27"
---

# Screens — architecture-hardening

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code. `docs/design-system.md` doesn't exist yet, so there is no canon `tool`. This run uses the default code mode and isn't a degradation.
- **File:** the wireframes are inline below.
- **Component inventory:** with no canon, components are named from the code's de-facto inventory. That is the `@base-ui/react` primitives wrapped in `components/ui/*` (`Alert`, `Button`, `Combobox`, `Empty`, `Field`/`FieldError`/`FieldDescription`, `Input`, `Skeleton`, `Spinner`, `Textarea`, `Badge`, `Tabs`, `Select`, `Pagination`, `Sonner` toasts), plus these app components:
  - `ConfirmationModal` (`components/modals/global-modals/confirmation-modal/`)
  - `ContentAreaNotFound`, `EmptyState` (`components/layout/content-area/`)
  - `InvoicesEmptyState`, `InvoicesDataTable` (`components/invoices/`)
  - `InvoiceEditor`, `InvoiceEditorLoading`, `EditorSaveStatus`, `PDFPreviewPanel` (`components/invoice-editor/`)
  - `InvoicePdfPreviewModal` (`components/modals/invoice/`)
  - `CustomPriceModal` (`components/modals/customer/`)
  - `GdprSettings` (`components/settings/`)
  - `LoginForm`
  - each route's existing `loading.tsx` skeletons
- **Posture:** responsive-both (from `ux-flows.md`). Every state below works at desktop and phone widths, and dialogs are the existing `Dialog`-based modals.
- **Strings:** inline, because the app has no i18n layer. Where the contract fixes a message (`contracts/server-actions.md`, `contracts/openapi.yaml`), the UI shows it **verbatim** from the result's `error` / `fieldErrors`. It never rewrites it and never shows raw database or upstream text (spec §6.1).
- **Error routing** (ADR-0009, contract "Code → destination"):
  - `UNAUTHORIZED` or a rejected call goes to SCR-01.
  - `NOT_FOUND` on a page goes to SCR-16. On a form, it shows as a toast or inline.
  - `VALIDATION` shows a `FieldError` next to the field.
  - `CONFLICT` shows a `FieldError`, or a dialog chosen by `details.kind`.
  - `FAILED` on a page goes to SCR-17. On a form, it shows `toast.error`.

## Screens

### SCR-01 — Sign-in

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Visitor opens sign-in | `LoginForm` (unchanged) | existing page |
| redirected | A private page opened without a session, or with a session whose account no longer exists (AC-05, AC-21; flow 4). After sign-in, the Freelancer returns to the page they came from | `LoginForm` | existing page |
| after-deletion | Account deletion succeeded (AC-20; flow 3) | `LoginForm` | existing page |
| loading | N/A: sign-in is unchanged by this feature | — | — |
| empty | N/A: no Freelancer data on this page | — | — |
| error | N/A: sign-in errors are unchanged, and the existing `(auth)/error` route is out of scope | — | — |

Wireframe: the existing page is unchanged. This feature changes only who is sent here.

### SCR-02 — Invoice list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Loaded. Every control (`Tabs`, status `Select`, page-size `Select`, sort, `Pagination`, date filter) shows `PaginatedInvoiceList.applied`, not the raw link. A date range includes invoices issued any time on its last day, in the browser's time zone (AC-26, AC-27; flow 11) | `InvoicesDataTable`, `Tabs`, `Select`, `Pagination` | wireframe below |
| default (link fallback) | A link value is malformed or unknown. It is replaced by its default **silently** (no notice), and the controls show the default (AC-26) | as default | wireframe below |
| empty | Loaded and the Freelancer truly has no invoices | `InvoicesEmptyState` (existing) | existing |
| status-changed | Row status changed. The row's `Badge` and paid date update from the result (AC-18, AC-19; flow 8). Never blocked by legacy checks (AC-17) | `Badge`, `toast.success` | wireframe below |
| status-rejected | `updateInvoiceStatus` → `VALIDATION` (tampered status): `toast.error` "Unknown status." (AC-19) | `Sonner` | — |
| duplicated | `duplicateInvoice` → success: `toast.success` "Duplicated as {invoiceNumber}". The copy appears in the list, and the list doesn't navigate (AC-12; flow 6) | `Sonner`, `InvoicesDataTable` | — |
| row-action-failed | A row action returns `NOT_FOUND` or `FAILED`: `toast.error` with the result's `error` | `Sonner` | — |
| error | Load fails → SCR-17 (AC-28; flow 12) | see SCR-17 | SCR-17 |
| PDF actions | View, download or print → SCR-04 | see SCR-04 | SCR-04 |

```text
+--------------------------------------------------------------+
| Invoices                                     [+ New invoice] |
| [All | Drafts | Final]  Status [All v]  Dates [01.09-30.09]  |
|--------------------------------------------------------------|
| No.        Customer      Issued     Total     Status   ...   |
| INV-0043   Acme          26.09      120.00    [Draft]  [...] |
| INV-0042   Acme          20.09      119.99    [Paid 21.09]   |
|--------------------------------------------------------------|
| Rows [10 v]                          < 1 2 3 >   (applied)   |
+--------------------------------------------------------------+
  link ?page=abc&sortField=foo  ->  page 1, sort createdAt desc,
  and the controls show exactly those values. No notice.
```

### SCR-03 — Invoice editor

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Editor data in flight | `InvoiceEditorLoading` (existing) | existing |
| default-new | New invoice. The number `Input` is **empty**, its placeholder is the hint from `generateInvoiceNumber`, and `FieldDescription` reads "Assigned on save" (AC-06; flow 2) | `InvoiceEditor`, `Field`, `Input`, `FieldDescription` | wireframe A |
| default-edit | Existing invoice with its stored number and stored totals. The totals use the shared calculation module, so they match what will be stored (AC-13) | `InvoiceEditor` | existing layout |
| profile-changed | Sender profile changed on an existing invoice. The number field is cleared, the new profile's hint is shown, and the new-invoice rules apply (AC-11; flow 6) | `Input`, `FieldDescription` | wireframe A |
| saving | Save in flight | `EditorSaveStatus` (existing) | existing |
| saved | Success. The final number and the stored totals from `SavedInvoice` replace the form values, whatever the browser had computed (AC-06, AC-13) | `InvoiceEditor`, `EditorSaveStatus` | existing layout |
| validation | `VALIDATION`: a `FieldError` next to each offending field or line, with the contract's verbatim text (price, quantity, shipping, discount ≥ 0, discount ≤ subtotal + shipping, tax rate 0–100 %). The entered values are kept (AC-14, AC-15) | `FieldError` | wireframe B |
| number-taken | `CONFLICT` with `fieldErrors.invoiceNumber`: "This invoice number is already used in this sender profile." (AC-08) | `FieldError` | wireframe B |
| legacy-shared-number | `legacy.sharedNumber` on load: `Alert` (warning) above the form saying the number is also used by another invoice and must be changed before saving. The invoice stays viewable. On save, the `CONFLICT` `FieldError` on number shows the contract text (AC-17; flow 7) | `Alert`, `FieldError` | wireframe C |
| legacy-totals | `CONFLICT` with `details.kind = 'TOTALS_CHANGED'` → opens SCR-15 (AC-17) | see SCR-15 | SCR-15 |
| unknown-status | `VALIDATION` on `status`: `FieldError` "Unknown status." (AC-19). This is only reachable through a tampered request | `FieldError` | — |
| relation-not-found | Save → `NOT_FOUND` (sender profile, Customer or bank account not owned): `toast.error` with the result's `error`, and the form is kept | `Sonner` | — |
| save-failed | `FAILED`: `toast.error` with a "Retry" action that resubmits. The form is kept | `Sonner` | — |
| not-found | Unknown or foreign invoice id → SCR-16 (AC-29) | see SCR-16 | SCR-16 |
| error | Load fails → SCR-17 through `(invoice-editor)/error.tsx` (AC-28) | see SCR-17 | SCR-17 |
| empty | N/A: the editor always renders a form | — | — |

```text
A — number field (default-new / profile-changed)
+------------------------------------------+
| Invoice number                           |
| [ INV-0044                          ]    |  <- placeholder (grey), value is ''
| Assigned on save                         |  <- FieldDescription
+------------------------------------------+

B — blocked save (validation / number-taken)
+------------------------------------------+
| Invoice number                           |
| [ INV-0042                          ]    |
| ! This invoice number is already used    |  <- FieldError
|   in this sender profile.                |
| Line 2  Qty [ 0 ]  Price [ -5.00 ]       |
| ! Quantity must be greater than zero.    |
| ! Price can't be negative.               |
| Discount [ 500.00 ]                      |
| ! Discount can't exceed the subtotal     |
|   plus shipping.                         |
+------------------------------------------+

C — legacy shared number (on open)
+------------------------------------------+
| (!) This invoice number is also used by  |  <- Alert (warning)
|     another invoice. Change it to a free |
|     one to save.                         |
|------------------------------------------|
| ...editor form, viewable...              |
+------------------------------------------+
```

### SCR-04 — PDF output

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| generating | PDF being rendered | `Spinner` in `PDFPreviewPanel` / `InvoicePdfPreviewModal` (existing) | existing |
| with-logo | Logo fetched, or reused from the session cache (AC-01; flow 1) | `PDFPreviewPanel`, `InvoicePdfPreviewModal` | existing layout |
| no-logo-set | The sender profile has no logo. No fetch is made, the PDF has no logo, and **no warning** is shown | as above | existing layout |
| warn-specific | `/api/convert-image` returns `NOT_HTTPS`, `NOT_IMAGE`, `TOO_LARGE` or `RATE_LIMITED`. The PDF is produced without the logo, and the warning shows the response's `error` verbatim (AC-03) | preview: `Alert` (warning) above the PDF; download/print: `toast.warning` | wireframe below |
| warn-generic | `UNAVAILABLE` (unreachable, timeout, internal address, or the rate-limit store is down). The same placement as warn-specific, with the text "The logo could not be loaded from this link." (AC-03) | `Alert` / `toast.warning` | wireframe below |
| unauthorized | 401 `NotSignedIn` → SCR-01 (AC-05, AC-21) | — | SCR-01 |
| empty | N/A: a PDF always has an invoice behind it | — | — |
| error | N/A: failures of PDF rendering itself are unchanged by this feature. A logo failure never blocks the PDF | — | — |

```text
Preview (editor panel or list modal)
+------------------------------------------+
| (!) The logo file is larger than 512 KB. |  <- Alert (warning), stays
|     The PDF was made without it.         |
|------------------------------------------|
|  +------------------------------------+  |
|  |  [no logo]            INVOICE      |  |
|  |  ...                               |  |
|  +------------------------------------+  |
+------------------------------------------+

Download / print (no surface stays open)
                      +--------------------------------+
                      | (!) The logo could not be      |  <- toast.warning
                      |     loaded from this link.     |
                      +--------------------------------+
```

### SCR-05 — Sender profile editor

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Owned profile loaded | existing sender-profile form, `Field`, `Input` | existing layout |
| validation (logo) | `VALIDATION` with `fieldErrors.logo`: "The link must be a secure web address (https://…)." shown next to the logo field. Nothing is saved and the values are kept (AC-04; flow 5) | `FieldError` | wireframe below |
| saved | Success → back to SCR-19 / SCR-13 with the existing `toast.success` | `Sonner` | existing |
| save-not-found | Save → `NOT_FOUND`: `toast.error` with the result's `error` | `Sonner` | — |
| not-found | Unknown or foreign id on load → SCR-16 (AC-29) | see SCR-16 | SCR-16 |
| error | Load fails → SCR-17 (AC-28) | see SCR-17 | SCR-17 |
| empty | N/A: a form for one record | — | — |

```text
+------------------------------------------+
| Logo link                                |
| [ http://example.com/logo.png       ]    |
| ! The link must be a secure web address  |  <- FieldError
|   (https://…).                           |
+------------------------------------------+
```

### SCR-06 — Dashboard

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Sections streaming | existing per-section `Suspense` skeletons (e.g. `DashboardStatsCardsSkeleton`) | existing |
| default | The date filter shows the range actually applied (`appliedRange`) (AC-25; flow 11) | existing dashboard sections, date filter (`Popover` + `Calendar`) | wireframe below |
| default (range fallback) | The link range is malformed, or its start is after its end. The page shows the current month in the browser's time zone, the filter shows that month, and no notice appears (AC-25) | as default | wireframe below |
| empty | No data yet: the existing `DashboardSetupAlert` or zero figures | existing | existing |
| error | Any section's load fails → SCR-17. The failure goes to the segment boundary, so the whole content area is replaced (AC-28) | see SCR-17 | SCR-17 |

```text
+--------------------------------------------------------------+
| Dashboard                    Dates [01.09.2026 - 30.09.2026] |  <- appliedRange
|  link ?from=2026-10-05&to=2026-10-01  ->  current month shown |
|--------------------------------------------------------------|
| [ Revenue ] [ Outstanding ] [ Paid ] [ Overdue ]             |
| [ chart ...................................... ]             |
+--------------------------------------------------------------+
```

### SCR-07 — Privacy & data settings

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | `GdprSettingsLoading` (existing) | existing |
| default | Export card and Delete-account card | `GdprSettings`, `Card`, `Button` | existing layout |
| exporting | Export requested: the export `Button` shows a `Spinner` and is disabled | `Button`, `Spinner` | — |
| exported | 200: the file "Invoice Forge export YYYY-MM-DD.json" downloads, with the existing `toast.success` (AC-24) | `Sonner` | — |
| export-failed | 500 `FAILED`: `toast.error` "Your data couldn't be exported. Try again." | `Sonner` | — |
| delete-failed | SCR-08 → `deleteUserAccount` `FAILED`. Back on SCR-07 with `toast.error` "Your account couldn't be deleted. Nothing was removed." (AC-20; flow 3) | `Sonner` | — |
| unauthorized | 401 or `UNAUTHORIZED` → SCR-01 (AC-21, AC-23) | — | SCR-01 |
| empty | N/A: a settings page with no data list | — | — |
| error | N/A: the page loads no Freelancer data; action failures are the toast states above | — | — |

Wireframe: the existing page is unchanged. The added states are toasts and a button spinner.

### SCR-08 — Delete-account confirmation

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| counting | Dialog opened, `getAccountDeletionSummary` in flight. A `Skeleton` fills the count line, and Confirm is disabled | `ConfirmationModal` (✎ extended), `Skeleton` | wireframe below |
| default | `invoiceCount` ≥ 1: "{N} invoices will be permanently lost." plus a `Button` "Export my data first" (AC-20; flow 3) | `ConfirmationModal` ✎, `Button` | wireframe below |
| zero-invoices | `invoiceCount` = 0: the general permanence warning, without a count line | `ConfirmationModal` ✎ | — |
| count-failed | `getAccountDeletionSummary` → `FAILED`: `Alert` (destructive) "Couldn't count your invoices." with a Retry `Button`. **Confirm stays disabled** until a count loads | `Alert`, `Button` | wireframe below |
| exporting | "Export my data first" pressed. That button shows a `Spinner`, and the dialog stays open. After the file downloads, the Freelancer is back in this dialog (AC-24) | `Button`, `Spinner` | — |
| export-failed | Export 500: `toast.error` "Your data couldn't be exported. Try again." The dialog stays open | `Sonner` | — |
| deleting | Confirmed: Confirm shows a `Spinner`, every button is disabled, and the dialog stays open until the result arrives | `ConfirmationModal` ✎, `Spinner` | — |
| delete-failed | `FAILED` → the dialog closes, and SCR-07 shows `toast.error` (see SCR-07). Nothing was removed | `Sonner` | SCR-07 |
| deleted | Success → sign out → SCR-01 (AC-20, AC-21) | — | SCR-01 |

```text
+------------------------------------------------+
| Delete your account?                           |
|------------------------------------------------|
| 42 invoices will be permanently lost.          |  <- counting: [#########] Skeleton
| This can't be undone.                          |
| [ Export my data first ]                       |
|                                                |
| count-failed:                                  |
| (x) Couldn't count your invoices.  [ Retry ]   |  <- Alert (destructive)
|------------------------------------------------|
|                    [ Cancel ] [ Delete account ]|  <- disabled while counting,
+------------------------------------------------+     count-failed, deleting
```

### SCR-09 — Customer detail

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Customer, custom prices, related invoices | existing `CustomerDetailView` | existing layout |
| empty (custom prices) | The Customer truly has no custom prices: the existing inline empty state for the prices block | existing | existing |
| price-saved | Back from SCR-11 with the new or updated price listed (AC-31) | existing | — |
| not-found | Unknown or foreign id → SCR-16 (AC-29) | see SCR-16 | SCR-16 |
| error | Load fails → SCR-17, never not-found or empty (AC-28) | see SCR-17 | SCR-17 |
| delete | → SCR-14. If deleted, go to SCR-12 | see SCR-14 | SCR-14 |

Wireframe: the existing page is unchanged. The added states are SCR-16 and SCR-17.

### SCR-10 — Product custom prices

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | The product's custom prices across Customers | existing custom-prices component with `CustomerInfo` cells (`components/custom-prices/custom-price-entity-cell.tsx`) | existing layout |
| empty | The product truly has no custom prices: the existing inline empty state | existing | existing |
| price-saved | Back from SCR-11 with the price listed (AC-31) | existing | — |
| not-found | Unknown or foreign product id → SCR-16 | see SCR-16 | SCR-16 |
| error | Load fails → SCR-17 (AC-28) | see SCR-17 | SCR-17 |

Wireframe: the existing page is unchanged. The added states are SCR-16 and SCR-17.

### SCR-11 — Custom price dialog

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default-create | Opened with "Add". From SCR-09 the Freelancer picks a product; from SCR-10, a Customer (`Combobox`). The form also has a price `Input`, a name `Input` and a note `Textarea` (AC-31) | `CustomPriceModal` (existing), `Combobox`, `Field`, `Input`, `Textarea` | wireframe below |
| default-edit | Opened with "Edit". Customer and product are shown **read-only**, because `updateCustomPrice` no longer takes their ids (flow 9) | `CustomPriceModal`, `Field` | wireframe below |
| validation | `VALIDATION`: a `FieldError` with the contract text ("Price must be a number.", "Price must be positive.", "Note must be 500 characters or fewer."). Create and update use **the same** messages (AC-16) | `FieldError` | wireframe below |
| not-found | `NOT_FOUND`: `Alert` (destructive) inside the dialog, "Customer or product not found." The dialog stays open (AC-31) | `Alert` | wireframe below |
| saving | Save in flight: the Save `Button` shows a `Spinner` | `Button`, `Spinner` | — |
| saved | Success → the dialog closes, `toast.success` shows, and the price is listed on SCR-09 / SCR-10 | `Sonner` | — |
| save-failed | `FAILED`: `toast.error`, and the dialog stays open with the values kept | `Sonner` | — |
| empty / loading | N/A: a form dialog; the pickers load with the existing modal | — | — |

```text
+------------------------------------------+
| Custom price                             |
|------------------------------------------|
| (x) Customer or product not found.       |  <- Alert, only in not-found
| Customer  [ Acme Ltd              v ]    |  <- read-only in default-edit
| Product   [ Logo design (fixed)     ]    |
| Price     [ -10                     ]    |
| ! Price must be positive.                |  <- FieldError (create = update)
| Note      [ ......................  ]    |
| ! Note must be 500 characters or fewer.  |
|------------------------------------------|
|                     [ Cancel ] [ Save ]  |
+------------------------------------------+
```

### SCR-12 — Customers list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Customers loaded | existing `CustomersList` | existing layout |
| empty | The Freelancer truly has no Customers | `EmptyState` (existing) | existing |
| deleted | Back from SCR-14 with the row removed and `toast.success` | `Sonner` | — |
| error | Load fails → SCR-17, never the empty state (AC-28) | see SCR-17 | SCR-17 |
| delete | → SCR-14 (AC-22) | see SCR-14 | SCR-14 |

Wireframe: the existing page is unchanged. The added states are SCR-14 and SCR-17.

### SCR-13 — Sender profiles list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Sender profiles loaded | existing sender-profiles list | existing layout |
| empty | The Freelancer truly has no sender profiles | `EmptyState` (existing) | existing |
| deleted | Back from SCR-14 with the row removed and `toast.success` | `Sonner` | — |
| error | Load fails → SCR-17 (AC-28) | see SCR-17 | SCR-17 |
| delete | → SCR-14 (AC-22) | see SCR-14 | SCR-14 |

Wireframe: the existing page is unchanged. The added states are SCR-14 and SCR-17.

### SCR-14 — Delete-record confirmation

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | "Delete {name}?" with Cancel and Delete (destructive) | `ConfirmationModal` (✎ extended) | wireframe below |
| deleting | Confirmed: Delete shows a `Spinner`, and the dialog **stays open** until the result arrives | `ConfirmationModal` ✎, `Spinner` | — |
| blocked | `CONFLICT` with `details.kind = 'HAS_INVOICES'`: `Alert` (destructive) with the result's `error`, e.g. "3 invoices depend on this customer, so it can't be deleted." The Delete button is hidden and only "Close" remains. Nothing is removed. The race case (an invoice saved between the count and the delete) looks the same (AC-22; flow 10) | `Alert`, `Button` | wireframe below |
| not-found | `NOT_FOUND` (already gone): the dialog closes, `toast.error` shows, and the list refreshes | `Sonner` | — |
| deleted | Success: the dialog closes and `toast.success` shows. From a list (SCR-12/13) the row is gone. From a detail page (SCR-09/19) the Freelancer goes to its list | `Sonner` | — |
| failed | `FAILED`: the dialog closes and `toast.error` shows | `Sonner` | — |

```text
+------------------------------------------------+
| Delete "Acme Ltd"?                             |
|------------------------------------------------|
| This can't be undone.                          |
|                                                |
| blocked:                                       |
| (x) 3 invoices depend on this customer, so it  |  <- Alert (destructive)
|     can't be deleted.                          |
|------------------------------------------------|
| default:           [ Cancel ] [ Delete ]       |
| blocked:                      [ Close ]        |
+------------------------------------------------+
```

### SCR-15 — Legacy-invoice confirmation

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Save → `CONFLICT` with `details.kind = 'TOTALS_CHANGED'`. The dialog shows the old total next to the new total (`details.oldTotal` / `newTotal`), with Cancel and "Confirm and save" (AC-17; flow 7) | `ConfirmationModal` (✎ extended) | wireframe below |
| saving | Confirmed: the form is resubmitted with `confirmedTotals`. Confirm shows a `Spinner`, and the dialog stays open | `ConfirmationModal` ✎, `Spinner` | — |
| totals-changed-again | The resubmit returns `TOTALS_CHANGED` again with different figures. The same dialog shows the fresh figures | `ConfirmationModal` ✎ | — |
| confirmed | Success → the dialog closes, and SCR-03 is in its `saved` state | — | SCR-03 |
| cancelled | Cancel → back to SCR-03. Nothing is saved and the form is kept | — | SCR-03 |
| failed | `FAILED` → the dialog closes and `toast.error` shows | `Sonner` | — |
| validation | N/A: a rule-breaking legacy invoice is stopped by SCR-03 `validation` before it can reach this dialog (flow 7 order) | — | — |

```text
+------------------------------------------------+
| Confirm the new total                          |
|------------------------------------------------|
| This invoice was saved before totals were      |
| recalculated.                                  |
|   Old total   120.00                           |
|   New total   119.99                           |
|------------------------------------------------|
|               [ Cancel ] [ Confirm and save ]  |
+------------------------------------------------+
```

### SCR-16 — Not found

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | The page action returns `NOT_FOUND` → `notFound()`. There is one text per record type (invoice, Customer, sender profile, product), **identical** for a missing and a foreign record. It has Back and Dashboard links (AC-29; flow 12). The editor group reuses the same component | `ContentAreaNotFound` (existing) | wireframe below |
| loading / empty / error | N/A: a terminal page with no data of its own | — | — |

```text
+------------------------------------------+
|                  (i)                     |
|         Invoice not found                |
|  It doesn't exist or you can't open it.  |  <- same text: missing = foreign
|        [ <- Back ] [ Dashboard ]         |
+------------------------------------------+
```

### SCR-17 — Load error with retry

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | A page load throws `FAILED` into the new segment boundary (`(protected)/error.tsx`, `(invoice-editor)/error.tsx`). It renders inside the app shell (the sidebar stays) and reports to Sentry. The text is plain language only, "We couldn't load your data", and never the raw error (AC-28; flow 12; ADR-0009) | `Empty` (primitive), `Button` | wireframe below |
| retrying | "Try again" pressed: the `Button` shows a `Spinner` and is disabled, then `reset()` + `router.refresh()` run | `Button`, `Spinner` | — |
| still-failing | The retry fails again → back to default. The failure is reported again | `Empty`, `Button` | wireframe below |
| empty / not-found | N/A, **by design**: AC-28 forbids showing a load failure as either | — | — |

```text
+---------+----------------------------------------+
| sidebar |                (!)                     |
|  ...    |      We couldn't load your data        |
|         |  Something went wrong on our side.     |
|         |  Your data is safe. Try again.         |
|         |           [ Try again ]                |  <- retrying: [ (o) Try again ]
+---------+----------------------------------------+
```

### SCR-18 — Products list

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Products loaded | existing products list | existing layout |
| empty | The Freelancer truly has no products | `EmptyState` (existing) | existing |
| error | Load fails → SCR-17 (AC-28) | see SCR-17 | SCR-17 |

Wireframe: the existing page is unchanged. The added state is SCR-17.

### SCR-19 — Sender profile detail

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `loading.tsx` skeleton | existing |
| default | Profile details and related invoices | existing sender-profile view | existing layout |
| not-found | Unknown or foreign id → SCR-16 (AC-29) | see SCR-16 | SCR-16 |
| error | Load fails → SCR-17 (AC-28) | see SCR-17 | SCR-17 |
| delete | → SCR-14. If deleted, go to SCR-13 | see SCR-14 | SCR-14 |
| empty | N/A: a detail page for one existing record. Missing is SCR-16 | — | — |

Wireframe: the existing page is unchanged. The added states are SCR-14, SCR-16 and SCR-17.

## New components

None. Every screen composes the existing inventory. SCR-17 builds its boundary from the `Empty` primitive plus a `Button`. `ErrorPageLayout` was ruled out because it is full-screen, has no retry and links home. `ContentAreaNotFound` was ruled out because AC-28 forbids showing a load failure as "not found".

**One existing component is extended (✎, not new):**

| Component | Change | Why | Used by | Registered in design-system |
|---|---|---|---|---|
| `ConfirmationModal` | Adds a `body` (ReactNode) slot for counts, totals and alerts. `onConfirm` may be async: the confirm button shows a `Spinner`, the dialog stays open until the promise settles, and the caller decides whether to close. Adds `confirmDisabled` and a hideable confirm button | Today it calls `onClose()` right after `onConfirm()` (`confirmation-modal.tsx`), so it can't show a pending state, the SCR-14 `blocked` block, or SCR-15's figures | SCR-08, SCR-14, SCR-15 | pending (no `docs/design-system.md` yet) |
