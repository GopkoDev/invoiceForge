---
id: T17
title: "Render the editor's phone and desktop layouts from one DOM tree switched by CSS only"
layer: "ui"
deps: ["T11"]
blocks: []
acs: ["AC-13", "AC-14"]
files_hint: ["components/invoice-editor/invoice-editor.tsx", "components/invoice-editor/invoice-editor-resize-panels.tsx", "components/invoice-editor/invoice-editor-form.tsx", "components/invoice-editor/items-section.tsx", "components/invoice-editor/invoice-editor-selected-preview.tsx", "tests/e2e/editor-layout.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T17 — Render the editor's phone and desktop layouts from one DOM tree switched by CSS only

## Place in the sequence

- **Blocked by:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Blocks:** nothing · **Wave:** DAG wave 5; delivery wave 4 of spec §1.
- **Lane:** shares files with T5 (`components/invoice-editor/invoice-editor.tsx`); T11 (`components/invoice-editor/invoice-editor-form.tsx`, `components/invoice-editor/invoice-editor-resize-panels.tsx` +3); T16 (`components/invoice-editor/invoice-editor-form.tsx`, `components/invoice-editor/invoice-editor-resize-panels.tsx` +3) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the editor to open in its phone layout and offer a numeric keypad for amounts
> **So that** I can fix an invoice on the go without the form jumping or losing what I typed
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

Opens the editor in its phone layout from the first display and keeps typing intact across a rotation.

## Inlined context

> The editor's form, line rows and preview are rendered once; breakpoints rearrange them (stacked on phones, side by side with a resize handle on desktop). Elements meant for one layout only (the resize handle, the phone's form/preview switch) are hidden with `hidden`/`display: none` at the other breakpoint, so a screen reader never reads them twice. `useIsMobile` is no longer used to choose what the editor renders; it may remain for behaviour that cannot be expressed in CSS, and must then not change the DOM structure.
>
> — `adr/0004-switch-editor-layouts-with-css-only-in-one-dom-tree.md §Decision outcome, ADR-0004, verbatim` · full text: [adr/0004-switch-editor-layouts-with-css-only-in-one-dom-tree.md](../adr/0004-switch-editor-layouts-with-css-only-in-one-dom-tree.md)

> Replacing the desktop resizable panels with one CSS-only layout (ADR-0004) can change the desktop editor's look or resizing | Medium | Visual-regression snapshots of the desktop and phone editor before and after; keep the drag handle's behaviour
>
> — `sad.md §11, risk «CSS-only layout», verbatim` · full text: [sad.md](../sad.md)

> U->>UI: rotates the tablet across the layout breakpoint
> UI->>UI: CSS restyles the same elements, nothing remounts
> UI-->>U: the typed text, the focus and every line stay
>
> — `sad.md §6, Flow 10, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-13 — happy path

> **Given** a Freelancer on a phone-width screen (390 px wide)
> **When** they open the editor for a new or an existing invoice and tap a line's price or quantity, or the summary's discount, tax rate or shipping field
> **Then** the editor appears in its phone layout from the first display, without first drawing the desktop layout. Those fields open a numeric keypad on which a decimal point "." can be typed. The decimal point "." is the only decimal separator these fields accept
>
> — `spec.md §5, AC-13, verbatim` · full text: [spec.md](../spec.md)

### AC-14 — happy path

> **Given** a Freelancer on a tablet who has typed an unfinished amount (such as "12.") in a line and the field still has focus
> **When** they rotate the tablet so that the editor switches between its phone and desktop layouts
> **Then** the typed text and the focus stay where they were, and no line, change or draft text is lost
>
> — `spec.md §5, AC-14, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Take Playwright screenshots of the desktop (1280) and phone (390) editor before changing anything (`tests/e2e/editor-layout.spec.ts`, `toHaveScreenshot`).
- [ ] Restructure `invoice-editor.tsx` / `invoice-editor-resize-panels.tsx` / `invoice-editor-form.tsx` / `items-section.tsx` so one tree renders; breakpoint classes stack it on phones and place form and preview side by side with the resize handle on desktop; one-layout-only elements use `hidden md:flex` / `md:hidden`.
- [ ] Remove `useIsMobile` from the editor's render decisions (cards vs rows in `items-section.tsx` included).
- [ ] e2e: load at 390 px with JS disabled → phone layout in HTML; type «12.» in a focused line price, resize 390↔1024, assert value and `document.activeElement` unchanged; compare screenshots.

## Edge cases

| Case | Behaviour |
|---|---|
| resize handle on phones | hidden, not read by a screen reader |
| drag handle on desktop | behaves as before |
| line rows vs cards | one element per line restyled, not two trees |

## Definition of Done

- [ ] `editor-layout.spec.ts` passes (first-display phone HTML, rotation keeps text and focus)
- [ ] visual snapshots reviewed and committed
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
