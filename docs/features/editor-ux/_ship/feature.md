# Editor UX — feature description

_Source: [`docs/features/editor-ux/_ship/feature.md`](docs/features/editor-ux/_ship/feature.md)_

> This document uses ASD-STE100 Simplified Technical English. The names of the people (Freelancer,
> Customer, Visitor, Contributor), the button names (Save, Save and issue, Retry, Download, Print,
> Try again, Reload) and the status names (draft, issued) are technical names.

## 1. Purpose

The Freelancer uses the invoice editor and the invoice lists each day. A person who examines the product also sees them first. This feature makes them fast, correct and accessible before the public release.

This feature does not change a business rule. The rules of `invoice-integrity` stay the same. The feature changes only how the app loads, shows and announces the data.

## 2. Terms

| Term | Meaning |
|---|---|
| PDF toolkit | The code that makes a PDF. It is large (approximately 1.6 MB). |
| Preview | The panel in the app that shows the invoice as the Customer will see it. |
| First display | The page that the server sends, before the page becomes interactive. |
| Freelancer time zone | The time zone that the Freelancer saved on the account. If there is no saved time zone, the app uses UTC. |
| Calendar day | The issue date or the due date of an invoice. It has no time and no time zone. |
| Phone layout | The editor layout for a screen that is 390 px wide or narrower. |

## 3. Rules

### 3.1 PDF toolkit

Only Download and Print load the PDF toolkit. The dashboard, the lists, the Customer pages and the sender profile pages do not load it.

The app loads the PDF toolkit one time in each visit. After that, Download and Print use the loaded toolkit.

The preview does not use the PDF toolkit.

The editor can load the PDF toolkit after it opens. Thus, Download and Print in the editor seldom wait.

### 3.2 PDF errors

If the connection stops, the app shows the message "the PDF could not be prepared". The message has a Try again button.

If a new version of the app was released after the page opened, the app shows the message "a newer version is available". The message has a Reload button.

If the PDF fails during its generation, the app shows the "could not be prepared" message. The app also sends an error report to the team.

In all of these cases, the page stays usable. Nothing else on the page changes.

### 3.3 Save

You can continue to type while the app saves the invoice.

A change that you make during a save is never lost. The app does not mark this change as saved. The next Save stores it.

The totals on the screen always agree with the lines on the screen. The app calculates them with the same rule as the stored totals.

If you click Save and issue and change a line during the save, the invoice becomes issued with its old lines. A warning tells you that the app did not save your change. You can close the warning.

### 3.4 Retry

If a save fails, the message has a Retry button.

Retry does the same action as the action that failed (Save, or Save and issue). It uses the form as it is when you click Retry.

Retry gives the same result as Save:

- A new invoice gets its own address. If you reload the page, the app opens this invoice.
- If the invoice changed in a different place, the app shows the same dialog as for Save.
- If the totals changed, the app asks you to confirm them, as for Save.

### 3.5 First display

The editor shows the correct invoice on the first display. The data does not change when the page becomes interactive.

A new invoice shows its default values on the first display:

- the default sender profile and its default bank account
- the issue date: today in the Freelancer time zone
- the due date that the payment terms give.

The invoice number can show after the first display. Until then, the field shows that it is loading. The layout does not move when the number shows.

### 3.6 Shared browser

The app does not keep signed-in pages in the browser cache.

If the browser shows a signed-in page again from its back/forward cache, the app hides the page and reloads it.

Thus, after Freelancer A signs out, a Visitor or Freelancer B cannot see the invoices of Freelancer A. This rule also applies when they click Back or Forward.

### 3.7 Dates

Each place shows the issue date and the due date as the calendar day that the invoice stores. The time zone of the Freelancer and the time zone of the browser do not change this day.

The creation date of a custom price shows in the Freelancer time zone.

### 3.8 Money

Each place shows money in one format: for example, "$1,234.50" and "UAH 1,234.50". The language of the device does not change this format.

The preview and the PDF use the same document model. Thus, they always show the same words, dates and amounts.

### 3.9 Amount fields

The price, quantity, discount, tax rate and shipping fields open a numeric keypad.

These fields accept only a point "." as the decimal separator. If you type or paste a comma, the field does not accept it. A note next to the field tells you to use a point.

## 4. What the Freelancer sees

| Place | Change |
|---|---|
| Dashboard and lists | The pages open faster. They do not load the PDF toolkit. |
| Download and Print | The button shows that the PDF is being prepared. Then the PDF downloads or prints. |
| Editor | The correct invoice shows immediately. The totals always agree with the lines. |
| Editor on a phone | The phone layout shows immediately. The form does not move. |
| Screen reader | Each field, error and icon button has a name. A line field also gives its line number, for example "Quantity, line 3". |
| Invoice list row menu | The button gives its action and the invoice number. |

The Contributor sees these changes:

- The repository does not contain unused UI components or their packages.
- The repository has one theme switcher.
- The README steps work as written on a new clone.

## 5. Release procedure

> **NOTE:** This feature has no migration. It does not add a table, a column or an index.

> **NOTE:** This feature has no new required setting and no feature flag.

1. Make sure that the owner did check O1: the decimal keypad on a real iPhone, with the Ukrainian region.
2. Make sure that the owner did check O2: the Linux layout baselines.
3. Make sure that the `unit` and `integration` jobs of this pull request are green.
4. Before the release, record the 14-day baselines for these two values:
   - the render-mismatch errors in error tracking
   - the p75 layout shift of the editor at phone width.
5. Merge the pull request. Then, deploy the code.

## 6. Rollback procedure

1. Deploy the previous build.

> **NOTE:** The feature stores no new data. You do not have to change the database.

## 7. Checks after the release

1. After 14 days, make sure that the error tracking shows 0 render-mismatch errors from the invoice list, the dashboard and the editor.
2. After 14 days, make sure that the p75 layout shift of the editor at phone width is 0.1 or less.
3. For 90 days, make sure that the accessibility check in CI shows 0 serious or critical violations.

## 8. Related documents

- Specification: [`spec.md`](docs/features/editor-ux/spec.md)
- Architecture: [`sad.md`](docs/features/editor-ux/sad.md)
- Decisions: [`adr/`](docs/features/editor-ux/adr/)
- Data model (no schema change): [`data-model.md`](docs/features/editor-ux/data-model.md)
- Test plan: [`test-plan.md`](docs/features/editor-ux/test-plan.md)
- Changelog: [`changelog.md`](docs/features/editor-ux/_ship/changelog.md)
