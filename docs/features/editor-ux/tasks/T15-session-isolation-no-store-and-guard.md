---
id: T15
title: "Send signed-in pages no-store, reload back/forward-cache restores, and prove AC-07 in Chromium and WebKit"
layer: "wiring"
deps: ["T11"]
blocks: []
acs: ["AC-07"]
files_hint: ["proxy.ts", "components/session-restore-guard.tsx", "app/(protected)/layout.tsx", "app/(invoice-editor)/layout.tsx", "tests/unit/security-headers.test.ts", "tests/unit/proxy.test.ts", "playwright.config.ts", "tests/e2e/session-isolation.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T15 — Send signed-in pages no-store, reload back/forward-cache restores, and prove AC-07 in Chromium and WebKit

## Place in the sequence

- **Blocked by:** T11 — Turn the editor store into a per-mount factory provided by context and built from server data · **Blocks:** nothing · **Wave:** DAG wave 5; delivery wave 3 of spec §1.
- **Lane:** shares files with T3 (`playwright.config.ts`); T8 (`app/(protected)/layout.tsx`); T11 (`app/(invoice-editor)/layout.tsx`); T19 (`playwright.config.ts`) — serialized by `implement` on the overlap.

## Why (user story)

> **As a** Freelancer
> **I want** the editor to show the invoice I opened from its first display
> **So that** I never see a blank or a different invoice flash before mine
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

Ensures a later Visitor or Freelancer in the same tab never sees an earlier Freelancer's invoice.

## Inlined context

> The header makes the cache ineligible in the browsers that honour it; the guard covers those that don't. The guard runs before paint on a restored page: it sets the document hidden (`visibility: hidden` on the root) in the `pageshow` handler and calls `location.reload()`, so a restored page is never shown, not even for the frame before the reload. The header is set in `proxy.ts`, which already decides which pages are signed-in, on page responses only (route handlers keep their own headers). `security-headers.test.ts` gains a case for it; an e2e test signs A out, signs B in and goes Back.
>
> — `adr/0007-mark-signed-in-pages-no-store-and-reload-pages-restored-from-the-back-forward-cache.md §Decision outcome, ADR-0007, verbatim` · full text: [adr/0007-mark-signed-in-pages-no-store-and-reload-pages-restored-from-the-back-forward-cache.md](../adr/0007-mark-signed-in-pages-no-store-and-reload-pages-restored-from-the-back-forward-cache.md)

> U->>UI: a Visitor presses Back or Forward
> opt the browser restores a page from its back/forward cache → the restore guard hides the page before it shows and reloads it
> UI->>S: requests the signed-in page again
> S-->>UI: no session, redirect to sign in
> …
> alt the address of A's invoice → S->>D: reads the invoice, scoped to B → invoice not found
>
> — `sad.md §6, Flow 6, abridged` · full text: [sad.md](../sad.md)

> The AC-07 isolation is proven by a Playwright test in the Chromium and WebKit projects: A signs out, a Visitor goes Back, B signs in and goes Back and Forward, and no frame shows A's invoice number.
>
> — `sad.md §10, No regressions, verbatim` · full text: [sad.md](../sad.md)

> **AuthZ/AuthN impact:** no new roles, credentials or capabilities, and no server-side check changes.
>
> — `spec.md §6.1, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-07 — authorization

> **Given** Freelancer A had an invoice open in the editor in a browser tab, then signed out, and Freelancer B signed in in the same tab
> **When** Freelancer B opens the editor, or moves back and forward through the tab's history
> **Then** Freelancer B never sees any part of Freelancer A's invoice, not even for a moment, including a page the browser restores from its own back/forward cache. Opening the address of Freelancer A's invoice shows Freelancer B the same "invoice not found" result as any invoice that isn't theirs. A Visitor who presses Back or Forward after Freelancer A signed out, before anyone signs in, sees none of A's data and is taken to sign in. Within one Freelancer's visit, moving back and forward between two invoices never shows one invoice's lines, Customer or totals in the other's editor
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `proxy.ts`: on signed-in page responses (not route handlers) set `Cache-Control: private, no-store`.
- [ ] `components/session-restore-guard.tsx`: inline script / early effect adding a `pageshow` listener; `if (e.persisted) { document.documentElement.style.visibility = 'hidden'; location.reload(); }`; mount in `app/(protected)/layout.tsx` and `app/(invoice-editor)/layout.tsx`.
- [ ] `tests/unit/security-headers.test.ts` + `tests/unit/proxy.test.ts`: header present on a signed-in page, absent on public pages and route handlers; CSP test unchanged.
- [ ] `playwright.config.ts`: add `chromium` and `webkit` projects.
- [ ] `tests/e2e/session-isolation.spec.ts`: A opens an invoice, signs out; Visitor Back/Forward → sign-in, A's number never visible (poll frames); B signs in, Back/Forward and opens A's invoice URL → not found; within one visit, Back/Forward between two invoices never mixes data.

## Edge cases

| Case | Behaviour |
|---|---|
| Safari restores a no-store page from bfcache | guard hides and reloads it before paint |
| B opens A's invoice address | same «invoice not found» as any foreign invoice |
| public pages | keep their caching; header only on signed-in pages |

## Definition of Done

- [ ] unit header tests pass; CSP test unchanged and green
- [ ] `session-isolation.spec.ts` passes in chromium and webkit
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
