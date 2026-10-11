---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-10"
feature_size: "M"
---

# Spec — editor-ux

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (project-wide; this feature adds the *Contributor* role)
> **Reference module / docs / channels used:** [`brief.md`](./brief.md) (the idea baseline and findings U1–U14; U13 and U14 were added on 2026-10-09), [`docs/design-system.md`](../../design-system.md) (the code-only design canon and registered components), [`invoice-integrity/spec.md`](../invoice-integrity/spec.md) (the save, refusal and issued-invoice rules this feature must not change), [`docs/architecture-map.md`](../../architecture-map.md), and a read-only check of each finding against the current code on `main` @ `6d25e98`.

## 1. Context

The invoice editor and the lists around it are what a Freelancer uses every day, and what someone evaluating the product sees first. Today they let the Freelancer down in small but visible ways. Every signed-in page downloads the toolkit that builds PDFs, although only Download and Print need it. A line changed while a save is running leaves totals that no longer match the lines on screen. Retrying a failed save skips part of the normal save: a new invoice saved this way stays on the create page, and a conflict or totals change on the retried save shows no dialog. The editor first shows a blank invoice, and then the real one replaces it. Issue and due dates can differ by a day between the server's first render and the browser, and between the lists and the editor. The PDF the Customer receives formats money differently from the app ("1234.50 USD" vs "$1,234.50"), and its wording is kept in two places by hand. Several editor fields and icon buttons have no name a screen reader can announce. On a phone the editor first draws the desktop layout and then rebuilds the whole form. A Contributor opening the repository finds 15 unused UI components (plus one used only by another of them), packages only those components need, a deprecated type package, two drifting copies of the theme switcher and a README whose setup command and links point at files that don't exist. One confirmation dialog in the editor is placed differently from every other dialog in the app.

Why now: the app is about to be shown publicly. The integrity work (`invoice-integrity`) fixed the server-side rules, so the remaining gaps are in what the Freelancer sees and touches. None of them changes a business rule, and together they decide whether the product feels solid.

Committed approach: one "make it solid" pass over five areas — page weight, editor correctness, dates and money display, accessibility and mobile, repository hygiene — delivered in four low-risk waves: (1) PDF toolkit on demand and repository hygiene, (2) one date and money format everywhere, PDF and preview in step, (3) editor save, retry and first-display correctness, (4) accessibility and mobile. Business rules, data and server-side checks stay exactly as `invoice-integrity` left them; this feature changes only how the existing behaviour is loaded, shown and announced. (Interview depth: easy — the approach and the brief's five open questions were decided as defaults and accepted by the owner as one batch on 2026-10-09.)

Traceability and scope notes:
- Brief finding U3 (a late "next number" hint for the previous sender profile) is **already fixed on `main`**: the hint is applied only while the same sender profile is still selected. It is out of scope here.
- Brief finding U2 is **partly fixed on `main`**: a change typed during a save already keeps the invoice marked unsaved. What remains is that totals are taken from the server's answer for the older form, so they can disagree with the lines on screen. This spec covers that remainder (US-02).
- Finding U13 (Retry after a failed save bypasses the editor's save flow) was deferred to this feature by `mcp-server` spec §8 and is covered by US-02 (AC-05c, AC-05d).
- Finding U14 (the editor's confirmation dialog is placed outside the editor's dialog host) is repository hygiene and is covered by US-08 (AC-16).
- The **Freelancer time zone** from the glossary (saved on the account, UTC until saved) decides "today" and how moments in time are shown, such as a custom price's creation date. An invoice's issue and due dates are calendar days and are shown as stored, with no time-zone conversion (AC-08). The brief's "time-zone cookie" direction is a design detail and gives way to the glossary.

## 2. Goals

- Pages that never print stop paying for printing: the PDF toolkit is fetched only when the Freelancer asks for a PDF, and Download and Print keep working.
- What the editor shows is always true: the right invoice from the first display, totals that match the lines on screen, and no change lost or wrongly marked as saved.
- One way to show dates and money: the same calendar day and the same money format in every list, the editor, the preview and the PDF, for any Freelancer time zone and any device language.
- The editor and the lists work for everyone: they can be used with a screen reader, and on a phone without the layout jumping.
- A clean repository for a Contributor: no unused UI components or packages, one theme switcher, and a README that works as written.

## 3. Non-goals

- **Changing invoice rules** (statuses, issued details, currency, numbering, freshness checks) — owned by `invoice-integrity`; this feature must leave every one of its acceptance criteria passing.
- **A visual redesign or new editor features** — the layout, wording and flows stay as they are, except where an accessibility or mobile fix needs a small change.
- **Server-side paging and search for customers, products and custom prices** — a separate follow-up noted in `service-layer` §3; mixing it in would blur this feature's diff.
- **Formatting the whole repository** — reformatting 252 files would bury this feature's changes; it belongs in its own commit.
- **Accessibility of pages beyond the editor, invoices list and dashboard** — those three carry the daily work and the first impression; other pages get the shared fixes (icon button names, labels) only where they reuse the same components.

## 4. User stories

### US-01: Lists open without printing tools

**As a** Freelancer
**I want** the dashboard and list pages to load without the PDF toolkit
**So that** the pages I open most appear quickly, and printing still works when I ask for it

### US-02: Nothing typed during a save is lost

**As a** Freelancer
**I want** to keep typing while an invoice is saving
**So that** my change is never lost or marked saved by mistake, the totals always match the lines I see, and retrying a failed save behaves exactly like saving

### US-03: The editor opens on the right invoice

**As a** Freelancer
**I want** the editor to show the invoice I opened from its first display
**So that** I never see a blank or a different invoice flash before mine

### US-04: Dates agree everywhere

**As a** Freelancer
**I want** every list, the editor, the preview and the PDF to show the same calendar day for an invoice's dates
**So that** I don't send or chase an invoice based on a date that is off by one

### US-05: The PDF matches what I see

**As a** Freelancer
**I want** the PDF my Customer receives to show the same wording, dates and money format as the preview in the app
**So that** what I checked on screen is exactly what my Customer reads

### US-06: The editor works with a screen reader

**As a** Freelancer
**I want** every editor field, error and icon button to have a name my screen reader announces
**So that** I can create and send invoices without seeing the screen

### US-07: The editor works on a phone

**As a** Freelancer
**I want** the editor to open in its phone layout and offer a numeric keypad for amounts
**So that** I can fix an invoice on the go without the form jumping or losing what I typed

### US-08: A repository that works as written

**As a** Contributor
**I want** a README whose steps work verbatim and a codebase without unused components or duplicate files
**So that** I can run, test and change the app without chasing dead ends

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** a signed-in Freelancer with issued invoices
**When** they open any signed-in page other than the invoice editor (the dashboard, the invoices list, the customers, products and sender profiles pages, and a Customer's or sender profile's page with its related invoices), and then choose Download, Print or the invoice preview on one invoice
**Then** none of those pages fetches the PDF toolkit when it opens. The invoice preview shows that invoice with the content and format AC-09 and AC-10 define without fetching the PDF toolkit. Choosing Download or Print fetches it, shows that the PDF is being prepared, and then downloads or prints that invoice's PDF, with the same content and format. Later Download or Print actions in the same visit don't fetch it again. The invoice editor may fetch the toolkit in the background once it has opened, so its Download and Print rarely wait

<!-- changed 2026-10-10 by review-2026-10-10 D9 (owner: Dmytro Hopko): the preview is built from the invoice document model as HTML (ADR-0002) and never fetches the PDF toolkit; only Download and Print do. -->

### AC-02 (US-01) — error

**Given** a signed-in Freelancer whose connection drops before the PDF toolkit has been fetched
**When** they choose Download or Print on an invoice
**Then** the system tells them in plain language that the PDF could not be prepared and offers to try again. The page stays usable, nothing else on it changes, and trying again once the connection is back produces the PDF

### AC-02b (US-01) — error

**Given** a signed-in Freelancer whose page was opened before a newer version of the app was released, or whose PDF fails while it is being generated
**When** they choose Download or Print on an invoice
**Then** if the PDF toolkit can no longer be fetched because the app was updated, the system says in plain language that a newer version is available and offers to reload the page, instead of a try-again that keeps failing. If generating the PDF fails, the system shows the same plain-language message as AC-02 with an offer to try again, and the failure is recorded for the team. In both cases the page stays usable and nothing else on it changes

<!-- changed 2026-10-10 by review-2026-10-10 D9: the invoice preview no longer fetches the toolkit (AC-01), so only Download and Print can meet a missing toolkit. -->

### AC-03 (US-02) — happy path

**Given** a Freelancer editing a draft invoice who clicks Save (not Save and issue)
**When** they change a line's quantity before the save completes
**Then** the save is confirmed and the invoice stays marked as having unsaved changes. The totals on screen add up the lines as they are now, including the new quantity. Leaving the page warns about unsaved changes, and the next Save stores the new quantity

### AC-04 (US-02) — domain invariant

**Given** a Freelancer editing any invoice the editor lets them change
**When** a save completes, whether or not they changed something while it was running
**Then** the subtotal, tax and total on screen always equal what the lines on screen add up to, under the invoice's tax and discount. The totals on screen are calculated by the same rule as the stored totals (rounding, and the order of discount and tax), so for the same lines they agree to the cent. If nothing changed during the save, the figures the system calculated and stored are shown, and the invoice is marked saved. Any edit made after the save started counts as a change, even one that puts a value back as it was, so the invoice stays marked unsaved. The editor never shows totals that belong to an older version of the form

### AC-05 (US-02) — error

**Given** a Freelancer who changes a line while a save is running
**When** the system refuses that save, because a field is invalid or the invoice was changed elsewhere (the `invoice-integrity` refusals)
**Then** the system explains the refusal in plain language as it does today. Every change the Freelancer typed, including the one made during the save, is still on screen and marked unsaved. Nothing from the refused save is stored

### AC-05b (US-02) — cross-context

**Given** a Freelancer who clicks Save and issue on a draft and changes a line's quantity before that save completes
**When** the save completes and the invoice is now issued
**Then** the editor shows the invoice as issued, with the lines locked as they were issued, as for any issued invoice. A plain-language warning says that the quantity change was not saved because the invoice is now issued, and lets the Freelancer dismiss it, so the change is never silently dropped. The issued invoice keeps the lines it was issued with. Changes to the fields an issued invoice still allows (due date, notes, payment terms, PO number) save as usual

### AC-05c (US-02) — happy path

**Given** a Freelancer creating a new invoice whose save failed, with the failure message offering Retry
**When** they choose Retry and the save succeeds
**Then** Retry repeats the action that failed (Save, or Save and issue) with the form as it is when Retry is chosen, including any change made after the failure. The editor treats it exactly like a successful Save: the invoice is confirmed as created, and the browser's address becomes the saved invoice's own editing address. Reloading the page opens that invoice, not a blank new one, and the next Save updates it instead of creating a second invoice

### AC-05d (US-02) — error

**Given** a Freelancer whose save failed, with the failure message offering Retry
**When** they choose Retry and the system refuses the retried save because the invoice was changed elsewhere, or asks them to confirm changed totals
**Then** they see the same changed-elsewhere explanation or totals confirmation that Save shows, and can reload or confirm from there. A retried save never fails silently, and Retry while a save is running or after the editor moved to another invoice does nothing, as today

### AC-06 (US-03) — happy path

**Given** a signed-in Freelancer opening an existing invoice in the editor, or starting a new one
**When** the editor first appears, before they interact with it
**Then** an existing invoice shows its own number, Customer, lines, dates and totals from the very first display, and they stay the same once the page becomes interactive. A new invoice shows its defaults from the first display, and they don't change once the page becomes interactive: the default sender profile, its default bank account, an issue date of today in the Freelancer time zone (UTC until one is saved) and the due date that follows from the payment terms. The proposed invoice number may appear after the first display; until it does, its field shows that it is loading, and the layout doesn't move when it arrives

### AC-07 (US-03) — authorization

**Given** Freelancer A had an invoice open in the editor in a browser tab, then signed out, and Freelancer B signed in in the same tab
**When** Freelancer B opens the editor, or moves back and forward through the tab's history
**Then** Freelancer B never sees any part of Freelancer A's invoice, not even for a moment, including a page the browser restores from its own back/forward cache. Opening the address of Freelancer A's invoice shows Freelancer B the same "invoice not found" result as any invoice that isn't theirs. A Visitor who presses Back or Forward after Freelancer A signed out, before anyone signs in, sees none of A's data and is taken to sign in. Within one Freelancer's visit, moving back and forward between two invoices never shows one invoice's lines, Customer or totals in the other's editor

### AC-08 (US-04) — cross-context

**Given** a Freelancer whose saved Freelancer time zone is far from UTC, and an invoice with a given issue date and due date
**When** they view the invoice in the invoices list, the dashboard's recent invoices, the related invoices of a Customer, the editor, the preview, the PDF and every other place that shows an invoice's issue or due date (such as the dashboard's expected payments), at any time of day, from a browser set to any time zone
**Then** every place shows the issue and due dates as the calendar day stored on the invoice, whatever the Freelancer time zone or the browser's time zone, and it is the same on the first display and after the page becomes interactive. A custom price's creation date is shown as the day it was created in the Freelancer time zone. Until a Freelancer time zone is saved, every place uses UTC, as the glossary requires

### AC-09 (US-05) — happy path

**Given** a Freelancer with two invoices without unsaved changes, one in a currency that has a symbol and one that doesn't (a US dollar invoice and a hryvnia invoice)
**When** they open the preview and download the PDF of each, from a device set to any language
**Then** the preview and the PDF show identical wording, dates and amounts, in the money format the rest of the app uses ("$1,234.50", "UAH 1,234.50"), with the same separators and two decimal places. The editor's line amounts and totals, and the dashboard's Debtors amounts, use the same format, independent of device language. For a draft with unsaved changes the PDF follows `invoice-integrity` AC-02 and prints its last save

### AC-10 (US-05) — domain invariant

**Given** an issued invoice whose sender profile, Customer and bank account were changed after it was issued
**When** the Freelancer opens its preview and downloads its PDF
**Then** both show the issued details and amounts the invoice was issued with, as `invoice-integrity` requires, and they match each other line by line. A wording change made to the invoice layout appears in both, never in only one of them

### AC-11 (US-06) — happy path

**Given** a Freelancer using a screen reader in the invoice editor
**When** they move through every field (sender, Customer, invoice details, each line, summary and notes) and every icon-only button (zoom in, zoom out, close preview, duplicate line, delete line, reorder line, more actions)
**Then** each field announces its visible label and each button announces its action. A line field without a visible label of its own announces its column name and the line's position, such as "Quantity, line 3", and the position stays correct after lines are reordered, added or deleted. Print and Download keep an announced name on narrow screens where their text is hidden. The row actions button in the invoices list and in a Customer's or sender profile's related invoices announces its action and the invoice number

### AC-12 (US-06) — error

**Given** a Freelancer using a screen reader who saves an invoice with an invalid field
**When** the system refuses the save
**Then** the field is announced as invalid together with its plain-language error message, and the message is tied to that field, not only shown near it

### AC-13 (US-07) — happy path

**Given** a Freelancer on a phone-width screen (390 px wide)
**When** they open the editor for a new or an existing invoice and tap a line's price or quantity, or the summary's discount, tax rate or shipping field
**Then** the editor appears in its phone layout from the first display, without first drawing the desktop layout. Those fields open a numeric keypad on which a decimal point "." can be typed. The decimal point "." is the only decimal separator these fields accept. A comma typed or pasted into one of them is not entered, and the field says next to itself, also to a screen reader, that a decimal point "." is the separator to use

<!-- changed 2026-10-10 by review-2026-10-10-r2 N3: the owner chose to reject every comma and to tell the Freelancer, so a dropped comma can't silently turn "12,5" into 125. -->

### AC-14 (US-07) — happy path

**Given** a Freelancer on a tablet who has typed an unfinished amount (such as "12.") in a line and the field still has focus
**When** they rotate the tablet so that the editor switches between its phone and desktop layouts
**Then** the typed text and the focus stay where they were, and no line, change or draft text is lost

### AC-15 (US-08) — happy path

**Given** a Contributor with a fresh clone of the repository, their own empty PostgreSQL database, and the settings from the example environment file filled in as the README describes
**When** they follow the README's setup and test steps word for word
**Then** every command completes successfully and every file or document the README points to exists. The README says what the Contributor must provide (a database and the listed settings), which tests need the database, shows how to run the automated tests and links the testing guide. The README contains no real secret and no shared database address

### AC-16 (US-08) — happy path

**Given** a Contributor reading the codebase after this change
**When** they look for UI components, packages and the theme switcher
**Then** every UI component in the shared component folder is used by the app, no package is installed only for a removed component, the deprecated identifier type package is removed, and the identifier helpers rely on the platform rather than a separate package. There is exactly one theme switcher; the landing page and the signed-in app both use it and it behaves the same in both. Every dialog in the invoice editor, the save confirmation included, is placed with the editor's other dialogs, as dialogs are in every other part of the app, and still behaves as before. The app builds, and lint and every automated test pass

<!-- clarified 2026-10-10 by review-2026-10-10 T37 (owner: Dmytro Hopko): the phone "View PDF" sheet is the narrow-screen form of the preview panel (ADR-0004), part of the layout, not an editor dialog. -->

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| PDF toolkit on non-printing pages | 0 bytes of the PDF toolkit in the code every signed-in page except the invoice editor loads before any interaction | build-output check run in CI against the per-page asset list |
| First PDF after page load | ≤ 3 s p95 from choosing Download or Print to the file or print dialog, on a 10 Mbit/s connection | browser test with network throttling, 20 runs |
| Lost edits during save | 0 changes lost or marked saved by mistake across 50 runs of an edit raced against a save | automated editor test |
| Retry parity | 100 % of Save and Save-and-issue outcomes (created, updated, issued, changed elsewhere, totals changed, field error) produce the same address, dialog and saved state when reached through Retry | automated editor test per outcome |
| Totals consistency | 100 % of sampled moments show subtotal, tax and total equal to the lines on screen, across the 50 race runs above | same automated editor test |
| Server/browser date agreement | 0 render-mismatch warnings and 0 differing dates on the invoices list, dashboard, related invoices and editor, with the Freelancer time zone set to UTC−10, UTC and UTC+14 and the browser in a different zone, 5 minutes either side of midnight | browser test matrix, run locally with the full e2e suite before ship |
| PDF / preview parity | 100 % identical text between preview and PDF over the fixture set (draft, issued, USD, UAH, discount, tax, multiple lines) | automated parity test in CI |
| Accessibility | 0 serious or critical violations reported by an automated accessibility checker on the editor (new and existing invoice), the invoices list and the dashboard | browser test, run locally with the full e2e suite before ship |
| Layout stability on phones | cumulative layout shift ≤ 0.1 at p75 on the editor for phone-width visits | real-user web-vitals monitoring, 14 days after release |
| No regressions | 100 % of existing automated tests pass, including every `invoice-integrity` acceptance test | CI run (unit, integration) plus the local full e2e run before ship |

<!-- changed 2026-10-11 by ship (owner: Dmytro Hopko): CI runs no e2e; the full `pnpm test:e2e` runs locally before each ship. -->

## 6.1 Security / privacy

- **Data classification:** Confidential. The editor and lists show invoices with Customers' names, addresses and bank details.
- **Personal data touched:** none new. No field is added or stored; only how existing data is loaded and displayed changes. One value is sent anywhere new: the browser's time-zone name, in the functional `tz` cookie, which the sign-in pages now write for every Visitor, including one who never finishes signing in. The private layouts refresh after writing it only while the account has no saved zone (architecture-hardening ADR-0010, amendments of 2026-10-10). The privacy page names the cookie.
- **AuthZ/AuthN impact:** no new roles, credentials or capabilities, and no server-side check changes. The editor must keep each Freelancer's invoice inside their own session in the browser: nothing from one signed-in visit may show in another (AC-07).
- **Abuse cases:**
  - **Data left behind between sessions on a shared browser:** a later Freelancer in the same tab never sees an earlier one's invoice, even briefly (AC-07).
  - **On-demand code from an untrusted place:** the PDF toolkit is fetched only from the app's own origin, under the existing content-security rules; the check added by `security-patch` keeps passing.
  - **Smaller dependency surface:** removing packages used only by unused components removes code that could carry future advisories; nothing new is installed for this feature beyond test-only tooling.
  - **Hidden wording drift in the PDF:** a Customer-facing document can no longer differ from what the Freelancer reviewed, because preview and PDF share their wording and formats (AC-09, AC-10).
- **Security review:** Required (size M). Light: confirm the per-session editor isolation (AC-07), including the one-time store hand-over after a create ([[adr/0003-create-one-editor-store-per-mounted-editor-from-server-data]], Amendment 2026-10-10), and that on-demand loading stays within the content-security rules.

## 7. Metrics / KPIs

- **PDF toolkit weight on the dashboard:** baseline: about 1.6 MB of PDF toolkit code loaded by every signed-in list page (brief audit, 2026-10-03). Target: 0 on those pages from the release onward.
- **Render-mismatch errors in production:** baseline: TBD — counted in error tracking over the 14 days before release. Target: 0 from the invoices list, dashboard and editor within 14 days after release.
- **Phone-width editor layout shift:** baseline: TBD — p75 cumulative layout shift for phone-width editor visits in real-user monitoring over the 14 days before release. Target: ≤ 0.1 within 14 days after release.
- **Automated accessibility violations:** baseline: TBD — serious and critical counts on the editor, invoices list and dashboard, measured once before implementation starts. Target: 0 at release, held at 0 in CI for 90 days.
- **Unused code in the repository:** baseline: 15 unused UI components (accordion, aspect-ratio, breadcrumb, carousel, context-menu, drawer, hover-card, input-otp, kbd, menubar, navigation-menu, progress, radio-group, slider, toggle-group) plus toggle, which only toggle-group uses; 3 packages used only by them and 1 deprecated type package. (`item` and `combobox`, listed as unused in the brief, are now in use and stay.) Target: 0 at release.

## 8. Open questions

- [x] Should currencies that share a symbol (US, Canadian and Australian dollars) show their code on the PDF instead of "$"? Default now: the app's existing money format everywhere, identical on screen and in the PDF. **Resolved 2026-10-10 (review r6 F4):** no change is needed. The format module already tells them apart: `formatMoney` uses `Intl.NumberFormat('en-US', { style: 'currency' })` (`lib/format/index.ts:9-16`), which prints "CA$" and "A$", and only USD prints a bare "$". The screen and the PDF share it (AC-09). — owner: Dmytro Hopko
- [x] Should the automated accessibility check also cover the customers, products and sender profiles pages? **Resolved 2026-10-09 (plan-tests):** no — the check covers the editor, invoices list and dashboard only, as §3 and §6 set. — owner: Dmytro Hopko
- [x] The Linux e2e proof for AC-15 (`_audit/T53-linux-e2e-2026-10-10.log`) ran on Node 24, while `package.json` engines and `.nvmrc` say Node 22. Deferred by review 2026-10-10-r4: re-run once on Node 22, or record the first green nightly (which uses `.nvmrc`) as the AC-15 evidence. **Resolved 2026-10-10 (T58):** `_audit/T58-linux-e2e-2026-10-10.log` ran plain `CI=1 pnpm test:e2e` twice on Node 22.23.3, green. — owner: Dmytro Hopko
- [ ] The NFRs "PDF toolkit on non-printing pages" (build-output check run in CI) and "No regressions" (CI run) have no CI run yet, because the branch has never been pushed and `.github/workflows/test.yml` runs only on `pull_request` and pushes to main. Local runs are green: `pnpm check:pdf-chunks` printed "30 routes checked, no toolkit leak", and vitest passed 2 016 of 2 016 at 47969a0. **Deferred by review 2026-10-11-r18 (N3):** the green `unit` and `integration` jobs on the PR that `/sdd:ship` opens (#9) are the recorded evidence; the per-PR `e2e` job was removed at ship (owner decision 2026-10-11), and the full `pnpm test:e2e` ran locally at ship: 113 passed, 3 skipped at dff223d. — owner: Dmytro Hopko; due: `/sdd:ship editor-ux` (before merge)
- [x] Owner actions O1 (real-iPhone keypad check with the Ukrainian region, T25) and O2 (owner review of the Linux layout baselines, T53) for AC-13, carried by review 2026-10-11-r18 as blockers before ship. **Skipped by the owner on 2026-10-11:** AC-13 rests on the component tests (decimal keypad request, comma refused) and the e2e phone-layout tests. — owner: Dmytro Hopko
