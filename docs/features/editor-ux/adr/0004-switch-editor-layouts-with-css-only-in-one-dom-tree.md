---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-09"
feature_size: "M"
ticket: "editor-ux"
---

# 0004 — Switch the editor's layouts with CSS only, in one DOM tree

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`hooks/use-mobile.tsx` starts as `undefined` and returns `!!isMobile`, so the server and the browser's first render take the desktop branch; after the effect measures the width, `invoice-editor-resize-panels.tsx`, `invoice-editor-form.tsx` and `items-section.tsx` render a different tree and the whole form is rebuilt on a phone (spec §1). Because the two layouts are different trees, a width change (a tablet rotating across the 768 px breakpoint) unmounts the focused field and loses its unfinished text.

## Decision drivers

- AC-13: the phone layout from the first display, without drawing the desktop layout first.
- AC-14: rotating a tablet keeps the typed text and the focus.
- Spec §6 NFR "Layout stability on phones": cumulative layout shift ≤ 0.1 at p75 on the editor for phone-width visits.
- AC-06: the invoice itself from the first display.

## Considered options

1. **CSS-only layouts in one DOM tree** — the same elements serve both layouts; Tailwind breakpoints decide arrangement and visibility; no JavaScript width check decides what renders.
2. **Server-side device guess** — choose the layout from the User-Agent or Client Hints; Safari sends no Client Hints and tablets guess wrong, and rotation still swaps trees, so AC-14 needs extra focus and draft preservation.

## Decision outcome

**Chosen:** Option 1. The editor's form, line rows and preview are rendered once; breakpoints rearrange them (stacked on phones, side by side with a resize handle on desktop). Elements meant for one layout only (the resize handle, the phone's form/preview switch) are hidden with `hidden`/`display: none` at the other breakpoint, so a screen reader never reads them twice. `useIsMobile` is no longer used to choose what the editor renders; it may remain for behaviour that cannot be expressed in CSS, and must then not change the DOM structure.

## Consequences

**Positive**
- The phone layout is in the server's HTML: no rebuild, no layout shift from the switch.
- Rotation restyles the same elements, so focus and unfinished input survive without extra code.

**Negative**
- The desktop resizable panels and the phone arrangement must be expressed as one markup; the existing panel component may need replacing by a CSS grid with a drag handle.
- Some markup for the other layout stays in the DOM, hidden.

**Neutral**
- Other pages keep `useIsMobile` until they need the same guarantee.

## Links

- Spec: [[../spec.md]] US-07, AC-13, AC-14
- SAD: [[../sad.md]] §4
