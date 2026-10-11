# Changelog — editor-ux

## editor-ux — a faster, truthful and accessible invoice editor, and a repository that works as written

**What:** the invoice editor and the lists around it now behave the way a Freelancer expects. No business rule changed. These parts are new:

- **Printing tools load only for printing.** The dashboard, the lists and the Customer and sender profile pages no longer download the PDF toolkit (about 1.6 MB before). Download and Print fetch it once per visit and show that the PDF is being prepared. If the connection drops, the Freelancer sees a plain "the PDF could not be prepared" message with Try again. If the app was updated since the page opened, they see "a newer version is available" with Reload. The invoice preview never needs the toolkit. The editor warms the toolkit in the background once it is open.
- **What the editor shows is always true.** A change typed while a save runs is never lost or marked saved. The totals on screen always add up the lines on screen, by the same rounding rule as the stored totals. If Save and issue wins over an edit made during the save, a warning says that the edit was not saved. Retry after a failed save is now the same as Save: a new invoice lands on its own editing address, and a changed-elsewhere refusal or a totals confirmation shows the same dialog as Save.
- **The right invoice from the first display.** The editor draws the opened invoice, or a new invoice's defaults, from the server's first HTML. Nothing flashes or changes on hydration. On a shared browser, Back and Forward never show an earlier Freelancer's invoice, also in Safari's back/forward cache.
- **One date and money format everywhere.** An invoice's issue and due dates show the stored calendar day in every list, the editor, the preview and the PDF, in any time zone. Money shows as "$1,234.50" or "UAH 1,234.50" on every device language. The preview and the PDF are built from one document model, so their wording cannot drift apart.
- **Screen reader and phone.** Every editor field, error and icon button has an announced name ("Quantity, line 3"), and errors are tied to their fields. At phone width the editor is in its phone layout from the first display. Amount fields open a decimal keypad and accept only "." as the decimal point; a comma is refused with a note next to the field.
- **Repository hygiene.** 16 unused UI components and the packages only they needed are gone (`embla-carousel-react`, `input-otp`, `vaul`), as are `uuid` and the deprecated `@types/uuid` (ids now come from the platform). There is one theme switcher. The editor's save confirmation sits with the other editor dialogs. The README's setup and test steps work word for word on a fresh clone.

**Why:** the app is about to be shown publicly, and the editor is what a Freelancer uses every day and what an evaluator sees first ([spec](../spec.md) §1–§2, [brief](../brief.md) findings U1–U14). The key decisions:

- [ADR-0001](../adr/0001-load-the-pdf-toolkit-on-demand-through-one-lazy-module.md): the PDF toolkit loads on demand through one lazy module.
- [ADR-0002](../adr/0002-render-preview-and-pdf-from-one-invoice-document-model.md): the preview and the PDF render from one invoice document model.
- [ADR-0003](../adr/0003-create-one-editor-store-per-mounted-editor-from-server-data.md): one editor store per mounted editor, built from server data.
- [ADR-0004](../adr/0004-switch-editor-layouts-with-css-only-in-one-dom-tree.md): phone and desktop layouts switch with CSS only, in one DOM tree.
- [ADR-0005](../adr/0005-route-every-save-and-retry-through-one-store-save-command.md): every save and retry goes through one store save command.
- [ADR-0006](../adr/0006-format-money-and-dates-in-one-module-with-a-fixed-en-us-locale.md): money and dates are formatted in one module with a fixed `en-US` locale.
- [ADR-0007](../adr/0007-mark-signed-in-pages-no-store-and-reload-pages-restored-from-the-back-forward-cache.md): signed-in pages are `no-store`, and a page restored from the back/forward cache reloads.

**How to use:** nothing to learn. The editor, lists, Download, Print and the preview work as before, only faster and more consistently. No endpoint, server action or business function was added.

**Operational notes:**

- **Migration:** none. The feature adds no table, column or index ([data-model](../data-model.md)).
- **Feature flag / config:** none. No new required setting.
- **Cookie:** the sign-in pages now write the functional `tz` cookie (the browser's time-zone name) for every Visitor. The privacy page names it.
- **Caching:** signed-in pages are sent `Cache-Control: private, no-store`.
- **CI:** the `test` workflow now runs the PDF chunk check (`pnpm check:pdf-chunks`) and an `e2e` job (accessibility suite and the server/browser date matrix) on every PR.
- **Before the release:** record the 14-day baselines for the two KPIs that are still TBD: render-mismatch errors in error tracking and the p75 phone-width editor layout shift ([spec](../spec.md) §7).
- **Rollback:** revert the deploy. Nothing is stored, so there is nothing to undo in the database.

**Open before merge:**

- **O1 (AC-13):** the owner checks the decimal keypad on a real iPhone in the Ukrainian region (task T25, `blocked`).
- **O2 (AC-13):** the owner reviews the Linux layout baselines (task T53, `review`).
- **N3:** the PR's green `unit`, `integration` and `e2e` jobs are the CI evidence for the "PDF toolkit on non-printing pages" and "No regressions" NFRs ([spec](../spec.md) §8).

**Acceptance criteria delivered:** AC-01 to AC-16, including AC-02b and AC-05b to AC-05d. For AC-13, the code and the automated tests are done; the real-iPhone keypad check (O1) and the baseline review (O2) are still open.
