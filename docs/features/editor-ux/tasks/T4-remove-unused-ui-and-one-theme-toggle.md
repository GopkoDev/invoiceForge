---
id: T4
title: "Remove the unused UI components and their packages, drop uuid, and keep one theme switcher"
layer: "wiring"
deps: []
blocks: []
acs: ["AC-16"]
files_hint: ["components/ui/", "package.json", "pnpm-lock.yaml", "components/teheme-toggle.tsx", "components/layout/teheme-toggle.tsx", "components/theme-toggle.tsx", "components/landing/landing-nav.tsx", "components/layout/site-header.tsx", "store/invoice-editor-store/helpers.ts", "store/invoice-editor-store/use-invoice-editor-store.ts", "lib/helpers/prisma-error-scrub.ts", "tests/unit/repository-hygiene.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T4 — Remove the unused UI components and their packages, drop uuid, and keep one theme switcher

## Place in the sequence

- **Blocked by:** nothing (can start at once) · **Blocks:** nothing · **Wave:** DAG wave 1; delivery wave 1 of spec §1.
- **Lane:** shares files with T3 (`package.json`); T11 (`store/invoice-editor-store/helpers.ts`, `store/invoice-editor-store/use-invoice-editor-store.ts`); T19 (`package.json`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Contributor
> **I want** a README whose steps work verbatim and a codebase without unused components or duplicate files
> **So that** I can run, test and change the app without chasing dead ends
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Gives the Contributor a codebase with no dead components, packages or duplicate theme switcher.

## Inlined context

> **Unused code in the repository:** baseline: 15 unused UI components (accordion, aspect-ratio, breadcrumb, carousel, context-menu, drawer, hover-card, input-otp, kbd, menubar, navigation-menu, progress, radio-group, slider, toggle-group) plus toggle, which only toggle-group uses; 3 packages used only by them and 1 deprecated type package. (`item` and `combobox`, listed as unused in the brief, are now in use and stay.) Target: 0 at release.
>
> — `spec.md §7, KPI «Unused code in the repository», verbatim` · full text: [spec.md](../spec.md)

> `components/teheme-toggle.tsx` (used by `components/landing/landing-nav.tsx:4`, trigger styled with `buttonVariants`) and `components/layout/teheme-toggle.tsx` (used by `components/layout/site-header.tsx:3`, trigger via `render={<Button/>}`) | Keep one `components/theme-toggle.tsx` (the `render` variant matches the base-ui pattern used elsewhere), update both imports, delete the other
>
> — `brief.md, finding U11, abridged` · full text: [brief.md](../brief.md)

> `components/ui` contains no unused component; `embla-carousel-react`, `input-otp`, `vaul`, `@types/uuid` are gone from `package.json`; one `theme-toggle.tsx`
>
> — `brief.md §Success, abridged` · full text: [brief.md](../brief.md)

> | ID strategy | Unchanged `cuid()` on the server; the editor's client-side line keys use `crypto.randomUUID()` instead of the `uuid` package | §2; repo hygiene |
>
> — `sad.md §8, row «ID strategy», verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-16 — happy path

> **Given** a Contributor reading the codebase after this change
> **When** they look for UI components, packages and the theme switcher
> **Then** every UI component in the shared component folder is used by the app, no package is installed only for a removed component, the deprecated identifier type package is removed, and the identifier helpers rely on the platform rather than a separate package. There is exactly one theme switcher; the landing page and the signed-in app both use it and it behaves the same in both. Every dialog in the invoice editor, the save confirmation included, is placed with the editor's other dialogs, as dialogs are in every other part of the app, and still behaves as before. The app builds, and lint and every automated test pass
>
> — `spec.md §5, AC-16, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Re-verify each of the 16 files is unused (`grep -r "@/components/ui/<name>"`), then delete them from `components/ui/`.
- [ ] Remove from `package.json` the packages only they used (expected: `embla-carousel-react`, `input-otp`, `vaul` — confirm with grep), plus `uuid` and `@types/uuid`; `pnpm install` to update the lockfile.
- [ ] Replace `uuid` imports (`store/invoice-editor-store/helpers.ts`, `use-invoice-editor-store.ts`, `lib/helpers/prisma-error-scrub.ts`) with `crypto.randomUUID()`.
- [ ] Create `components/theme-toggle.tsx` from the `render={<Button/>}` variant; point `landing-nav.tsx` and `site-header.tsx` at it; delete both `teheme-toggle.tsx` copies.
- [ ] Extend `tests/unit/repository-hygiene.test.ts`: every file in `components/ui/` is imported somewhere outside `components/ui/` (or by a used ui file); no `teheme-toggle`; `uuid` absent from `package.json`.

## Edge cases

| Case | Behaviour |
|---|---|
| a ui file is only used by another ui file (toggle ← toggle-group) | removed together; the hygiene test treats transitive-only use as unused |
| `crypto.randomUUID` in a server-only file | available in Node ≥ 19 — no import needed |
| theme switcher on the landing page vs the app | same component, same behaviour in both (AC-16) |

## Definition of Done

- [ ] `pnpm build`, `pnpm lint`, `pnpm test` pass
- [ ] the extended repository-hygiene test passes and fails if an unused ui file is re-added
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
