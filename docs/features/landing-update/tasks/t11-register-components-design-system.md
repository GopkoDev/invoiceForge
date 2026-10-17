---
id: T11
title: "Register LandingDemo, DemoDraftCard and AiSection in the design-system component inventory"
layer: "docs"
deps: ["T03", "T05", "T07"]
blocks: []
acs: ["AC-02", "AC-06"]
files_hint: ["docs/design-system.md", "docs/features/landing-update/screens.md"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T11 — Register LandingDemo, DemoDraftCard and AiSection in the design-system component inventory

## Place in the sequence

- **Blocked by:** T03 — DemoDraftCard, T05 — LandingDemo complete, T07 — AiSection · **Blocks:** — · **Wave:** 5 (parallel with T06).
- **Lane:** own lane. Docs-only — no tests.

## Why (user story)

> **As a** Visitor
> **I want** to see an example sentence turn into an invoice draft without signing up
> **So that** I believe the promise instead of taking it on trust
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task records the components built for it so the inventory matches the code.

## Inlined context

> | `LandingDemo` (`components/landing/landing-demo/landing-demo.tsx`) | A play-once, visibility-started scripted demo with CSS-only fallbacks (ADR-0002) exists nowhere … | pending |
> | `DemoDraftCard` (`components/landing/landing-demo/demo-draft-card.tsx`) | The real `DraftCard` imports server actions and chat contexts and cannot run on a public page; a presentational replica on the same primitives is the decided path (ADR-0001) | pending |
> | `AiSection` (`components/landing/ai-section.tsx`) | A new landing section; it composes the existing `SectionContainer`, `IconBadge` and `ContentCard` … | pending |
>
> — `screens.md §New components, abridged` · full text: [screens.md](../screens.md)

> Accepted debt: The demo card duplicates the chat card's look instead of sharing a component (ADR-0001).
>
> — `sad.md §11, accepted debt, verbatim` — note it on the `DemoDraftCard` inventory row (temporary; public-redesign replaces it).

**Fallback:** read `docs/design-system.md` for the inventory table's format. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-02 — happy path

> **Given** a Visitor whose device does not ask for reduced motion
> **When** at least half of the demo becomes visible on screen
> **Then** the Landing demo plays once per page view: a fixed example sentence appears in a chat box and turns into a draft proposal card showing a Customer, at least one invoice line, the total with its currency and a Create button that the demo does not press, laid out like the in-app chat's draft proposal card; the demo is labelled as an example, stops on that card, and offers a Replay control that plays it again from the start; scrolling away and back does not restart it
>
> — `spec.md §5, AC-02, verbatim` (traceability only — the inventory row names the component that satisfies it)

### AC-06 — happy path

> **Given** a Visitor who scrolls past the first screen **When** they reach the new AI section **Then** they read, in plain words: … the section comes directly after the first screen and has its own account button
>
> — `spec.md §5, AC-06, abridged` (traceability only)

## Checklist

- [ ] Add three rows to the component inventory in `docs/design-system.md` (path, purpose, primitives composed, "landing-only, temporary — replaced by public-redesign")
- [ ] Flip "Registered in design-system" from `pending` to `yes` in `docs/features/landing-update/screens.md` §New components

## Edge cases

| Case | Behaviour |
|---|---|
| Inventory has no "temporary" marker | add a short note in the row's purpose cell, not a new column |

## Definition of Done

- [ ] `docs/design-system.md` lists all three components with their real paths (each path exists)
- [ ] `screens.md` §New components shows `yes` for all three
- [ ] docs-only: no test run needed
