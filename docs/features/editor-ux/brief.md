# Brief — editor-ux

> Input for `/sdd:specify editor-ux`. Written 2026-10-03 from the read-only frontend / testing / DX audit,
> re-checked against branch `security-patch` @ `ad462a7`. Invoice *correctness* rules (snapshots, statuses,
> currency) are out of scope here — they live in `docs/features/invoice-integrity/brief.md`.

## Why

The invoice editor and the lists around it are the part of the app a Freelancer touches every day, and
the part a portfolio visitor sees first. Today the app ships a 1.6 MB PDF library to pages that never print,
the editor can silently lose edits, dates can be off by a day near midnight, several controls are unusable
with a screen reader, and phones get a layout jump on every editor load. On top of that the repo carries
dead UI components and a README that sends a new developer to files that don't exist. None of this changes
business rules; it is the "make the product feel solid" pass before the app is shown publicly.

## Findings in scope

### A. Performance

| ID | Problem | Where | Why it matters | Direction |
|---|---|---|---|---|
| U1 | `@react-pdf/renderer` (~1.6 MB chunk incl. yoga/fontkit) loads on the dashboard and every list page | `lib/helpers/invoice-pdf-helpers.tsx:1` (top-level `import { pdf }`), imported by `components/invoices/invoice-row-actions.tsx:39`, `components/invoices/related-invoices-list.tsx:37`, `components/modals/invoice/invoice-pdf-preview-modal.tsx:19`, `hooks/use-invoice-pdf.tsx:18` | Every signed-in landing page downloads and parses ~1.6 MB of JS that is only needed on Download / Print; `dynamic()` on the modals doesn't help because of these static imports | Load the library on click: `await Promise.all([import('@react-pdf/renderer'), import('@/components/invoice-editor/invoice-pdf-document')])` inside the download / print helpers; verify with the build manifest that list pages no longer reference the chunk |

### B. Editor correctness (client side)

| ID | Problem | Where | Why it matters | Direction |
|---|---|---|---|---|
| U2 | Edits made while a save is in flight are marked saved but never sent | `store/invoice-editor-store/use-invoice-editor-store.ts:95` (`applySavedInvoice`), `:420-443` (`saveInvoice`) | The save sends the form as it was on click; on response the store keeps the newer `formData` but sets `hasUnsavedChanges: false` and takes the server totals for the old payload. Inputs aren't disabled while saving, so totals stop matching the items and leaving the page drops the edit without a warning | Snapshot a revision when the save starts; after it, clear "unsaved" and adopt server totals only if nothing changed, otherwise recompute locally and stay dirty |
| U3 | A late next-number response for the previous sender profile overwrites the hint for the current one | `store/invoice-editor-store/use-invoice-editor-store.ts:248` (`generateInvoiceNumber` in `selectSenderProfile`) | Switching profile A → B quickly can show A's number as B's hint | Ignore the response unless `formData.senderProfileId` still equals the requested id |
| U4 | The editor store is a module-level singleton initialised in `useEffect` | `components/invoice-editor/invoice-editor.tsx:70` (`initialize(data)`), store created at module scope | SSR and the first paint of `/invoices/[id]/edit` show a blank invoice (with `new Date()`-based defaults → hydration differences), then the real one pops in; fast back/forward can share state | zustand-in-Next pattern: create the store per editor instance in a context provider with the initial data; optionally collapse the ~10 repeated "copy → recalc → set" blocks into one `commitFormData` helper |

### C. Dates and money display

| ID | Problem | Where | Why it matters | Direction |
|---|---|---|---|---|
| U5 | Issue and due dates are formatted without a time zone in components rendered on the server and the client | `components/invoices/invoices-data-table.tsx:40` (receives `timeZone` but its `formatDate` ignores it), `components/dashboard/recent-invoices/dashboard-recent-invoices.tsx:35`, `components/invoices/related-invoices-list.tsx`, `components/products/product-custom-prices.tsx:173` (bare `toLocaleDateString()`) | Server renders in UTC, browser in local time → hydration warnings and a date one day off near midnight on the most-viewed tables (same bug class the hardening work fixed for the paid date only) | One `formatDate(date, timeZone)` helper in `lib/helpers/format-helpers.ts`, fed from the `tz` cookie as `invoice-status-badge` already is |
| U6 | Two hand-maintained invoice renderers, and money formatted differently from the rest of the app | `components/invoice-editor/pdf-preview-document.tsx` (HTML) vs `components/invoice-editor/invoice-pdf-document.tsx` (react-pdf); `toFixed(2) + ' ' + currency` in `invoice-pdf-document.tsx:299-324`, `invoice-item-fields.tsx:27`, `summary-section.tsx`; dashboard Debtors uses bare `toLocaleString()` | The customer's PDF says "1234.50 USD" while the app shows "$1,234.50"; every wording change has to be made twice; output depends on server locale | Shared `formatMoney` / `formatInvoiceDate` used by both renderers and the editor; a small parity test that renders both and compares text |

### D. Accessibility and mobile

| ID | Problem | Where | Why it matters | Direction |
|---|---|---|---|---|
| U7 | Editor labels aren't linked to their inputs; icon-only buttons have no accessible name | `<Label>` without `htmlFor` in `invoice-details-section.tsx`, `summary-section.tsx`, `notes-section.tsx`, `sender-section.tsx`, `customer-section.tsx`, `invoice-item-card.tsx`, `invoice-item-fields.tsx`; desktop item inputs have only a placeholder; `FieldError` not tied via `aria-describedby`; zoom buttons in `pdf-preview-panel.tsx`, the row "more" trigger in `related-invoices-list.tsx`, the preview dialog close, item duplicate / delete (`title` only) and the drag handle | Screen readers announce unlabeled fields and nameless buttons; Print / Download become icon-only on mobile (`hidden sm:inline`) | Use the existing `components/ui/field.tsx` primitives or `useId()` + `htmlFor`; `aria-label` on every icon button; `sr-only` instead of `hidden` for responsive text |
| U8 | Phones get the desktop layout first, then the whole form remounts; numeric inputs open the text keyboard | `hooks/use-mobile.tsx` (returns `false` until an effect runs), used by `invoice-editor-resize-panels.tsx`, `items-section.tsx`, `invoice-editor-form.tsx`; 0 uses of `inputMode` | Layout jump on every editor load on a phone; rotating a tablet across 768 px remounts inputs and loses unparsed drafts and focus | Switch layouts with CSS (`md:`) or keep `FormComponent` at a stable tree position; `inputMode="decimal"` on price / quantity / amount inputs |

### E. Repo hygiene (folded in on request)

| ID | Problem | Where | Direction |
|---|---|---|---|
| U9 | 17 shadcn components are never imported, and three packages exist only for them | `components/ui/`: accordion, aspect-ratio, breadcrumb, carousel, combobox, context-menu, drawer, hover-card, input-otp, item, kbd, menubar, navigation-menu, progress, radio-group, slider, toggle-group. Packages: `embla-carousel-react` (only `ui/carousel.tsx`), `input-otp` (only `ui/input-otp.tsx`), `vaul` (only `ui/drawer.tsx`) | Delete the unused components and the three packages; re-run lint, `tsc` and build. They can be re-added with the shadcn CLI when needed |
| U10 | `@types/uuid` is deprecated (uuid ships its own types); `uuid` itself is used in only two places | `package.json`; `store/invoice-editor-store/helpers.ts:22`, `store/invoice-editor-store/use-invoice-editor-store.ts:28` | Remove `@types/uuid`; replace `uuidv4()` with the built-in `crypto.randomUUID()` and drop `uuid` (check first whether `security-patch` T24 already bumped or removed it) |
| U11 | Two theme toggles with a misspelled file name, and they have drifted apart | `components/teheme-toggle.tsx` (used by `components/landing/landing-nav.tsx:4`, trigger styled with `buttonVariants`) and `components/layout/teheme-toggle.tsx` (used by `components/layout/site-header.tsx:3`, trigger via `render={<Button/>}`) | Keep one `components/theme-toggle.tsx` (the `render` variant matches the base-ui pattern used elsewhere), update both imports, delete the other |
| U12 | README sends new developers to files that don't exist | `README.md:24` (`cp .env.example .env`, the file is `env.example`), `README.md:78` (links `TODO.md`, which doesn't exist); no section on tests although `tests/README.md` exists | Fix the `cp` path, drop or replace the TODO link (e.g. link `docs/roadmap.md` if it exists by then), add a short "Running tests" section linking `tests/README.md` |

## Out of scope

- Server-side invoice rules (snapshots, status matrix, OVERDUE, currency checks) — `invoice-integrity`.
- Security headers, rate limits, dependency advisories — `security-patch`.
- Server-side paging / search UI for customers, products and custom prices (follow-up noted in `service-layer` §3).
- A visual redesign or new editor features.
- Prettier-formatting the whole repo (252 files) — do it as a standalone "format everything" commit so it doesn't bury this feature's diff.

## Open questions for specify

1. **U2 — while a save is in flight:** keep inputs editable (and track revisions) or disable them? Editable is friendlier but needs the revision logic.
2. **U4 — store refactor depth:** only fix SSR / initialisation (provider + initial data), or also collapse the repeated update blocks? The second is a larger diff with no visible change.
3. **U6 — money format on the PDF:** match the app (`$1,234.50`) or keep ISO code style (`1,234.50 USD`, common on invoices)? Either way, one helper for both renderers.
4. **U7 — accessibility bar:** fix the listed issues only, or adopt a target (e.g. axe-clean on the editor, invoices list and dashboard, checked in e2e)?
5. **U8 — breakpoint strategy:** pure CSS layout switch vs a server-provided device hint.

## Success criteria (draft)

- Dashboard and list pages no longer reference the PDF chunk in the build manifest; Download / Print still work.
- An edit typed during a pending save stays marked unsaved and is sent by the next save; totals always match the items on screen.
- The same invoice shows the same issue / due date on the server render and after hydration in any time zone; no hydration warnings on lists.
- The PDF and the HTML preview print identical text for the same invoice (parity test).
- Every editor field has a programmatic label and every icon-only button an accessible name.
- Opening the editor on a 390 px viewport shows the mobile layout on first paint, without a remount.
- `components/ui` contains no unused component; `embla-carousel-react`, `input-otp`, `vaul`, `@types/uuid` are gone from `package.json`; one `theme-toggle.tsx`; README commands work as written.

## Notes for the pipeline

- Independent of `invoice-integrity`; can run in parallel after `security-patch` merges.
- Likely size **M**; no schema change; touches UI → run `ux-flows` / `screens` only for the editor save states (U2) and the mobile editor (U8).
- Suggested route: `specify → clarify → design → plan-tests → tasks → implement → review → ship`.
- Good split for implementation waves: (1) U1 + U9–U12 (quick, low risk), (2) U5–U6, (3) U2–U4, (4) U7–U8.
