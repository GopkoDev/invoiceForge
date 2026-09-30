---
id: T06
title: "Request logos by sender-profile id with a per-session cache and show the PDF logo warning"
layer: "ui"
deps: ["T00", "T05"]
blocks: []
acs: ["AC-01", "AC-03"]
files_hint: ["lib/utils/image-to-base64.ts", "lib/helpers/invoice-pdf-helpers.tsx", "hooks/use-invoice-pdf.tsx", "components/invoice-editor/pdf-preview-panel.tsx", "components/modals/invoice/invoice-pdf-preview-modal.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T06 — Request logos by sender-profile id with a per-session cache and show the PDF logo warning

## Place in the sequence

- **Blocked by:** T05 — Rewrite /api/convert-image to fetch only an owned sender profile's logo · **Blocks:** — · **Wave:** wave 1 — the image-conversion security release, shipped alone first (spec §1).
- **Lane:** shares files with T08 (`components/invoice-editor/pdf-preview-panel.tsx`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers the browser half of US-01: the PDF keeps working without the logo and the Freelancer is told why in plain language.

## Inlined context

> The browser caches each fetched data URL per sender profile for the editor or export session, so reusing a logo doesn't count against the rate limit (§6 NFR).
>
> — `adr/0003, Decision outcome, verbatim` · full text: [ADR-0003](../adr/0003-fetch-logos-by-owned-profile-id-through-ip-pinning-fetcher.md)

> | with-logo | Logo fetched, or reused from the session cache (AC-01; flow 1) | `PDFPreviewPanel`, `InvoicePdfPreviewModal` | existing layout |
> | no-logo-set | The sender profile has no logo. No fetch is made, the PDF has no logo, and **no warning** is shown | as above | existing layout |
> | warn-specific | `/api/convert-image` returns `NOT_HTTPS`, `NOT_IMAGE`, `TOO_LARGE` or `RATE_LIMITED`. The PDF is produced without the logo, and the warning shows the response's `error` verbatim (AC-03) | preview: `Alert` (warning) above the PDF; download/print: `toast.warning` | wireframe below |
> | warn-generic | `UNAVAILABLE` (unreachable, timeout, internal address, or the rate-limit store is down). The same placement as warn-specific, with the text "The logo could not be loaded from this link." (AC-03) | `Alert` / `toast.warning` | wireframe below |
> | unauthorized | 401 `NotSignedIn` → SCR-01 (AC-05, AC-21) | — | SCR-01 |
>
> — `screens.md §SCR-04 PDF output, states, abridged` · full text: [screens.md](../screens.md)

```text
Preview (editor panel or list modal)
+------------------------------------------+
| (!) The logo file is larger than 512 KB. |  <- Alert (warning), stays
|     The PDF was made without it.         |
|------------------------------------------|
```

— `screens.md §SCR-04, wireframe, abridged` · full text: [screens.md](../screens.md)

> Any non-2xx reply means "produce the PDF without the logo and show the AC-03 warning".
>
> — `contracts/openapi.yaml, /api/convert-image description, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** New UI (error-with-retry, confirmations, field messages, the logo warning) is composed from the existing shadcn/ui primitives (`Empty`, `AlertDialog`, `Field`, `Sonner`) and modals go through `store/use-modal-store.ts` (architecture-map §Frontend). No new state or routing library.
>
> — `sad.md §4, UI architecture, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** **Strings:** inline, because the app has no i18n layer. Where the contract fixes a message (`contracts/server-actions.md`, `contracts/openapi.yaml`), the UI shows it **verbatim** from the result's `error` / `fieldErrors`. It never rewrites it and never shows raw database or upstream text (spec §6.1).
>
> — `screens.md §Source, Strings, verbatim` · full text: [screens.md](../screens.md)

> PDFs are rendered in the browser with `@react-pdf/renderer` 4 (`lib/helpers/invoice-pdf-helpers.tsx:133`). The server only supplies the logo as a data URL.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

Current state (code): `lib/utils/image-to-base64.ts` posts a URL to `/api/convert-image`; its only caller is `lib/helpers/invoice-pdf-helpers.tsx`.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Calls `POST /api/convert-image` with `{ senderProfileId }`; reads `data.dataUrl` on 200; on any non-2xx reads `code` + `error` and shows `error` verbatim (for `UNAVAILABLE` the text is "The logo could not be loaded from this link."); `401` → sign-in.

— `contracts/openapi.yaml, operationId convertLogoImage, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-01 — happy

> **Given** a signed-in Freelancer whose sender profile logo is a secure link to an image within the size limit
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF includes the logo
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** a signed-in Freelancer whose logo link is not secure, is unreachable, times out, returns something other than an image, exceeds the size limit, leads (directly or after redirects) to an internal or private network address, or whose logo fetch limit per minute is reached
> **When** the Freelancer generates an invoice PDF
> **Then** the PDF is still produced without the logo, and the Freelancer sees a plain-language warning: a specific reason only for "link is not a secure web address", "file is not an image", "file is larger than the size limit" and "too many requests, try again in a minute"; unreachable, timed-out and internal or private addresses all share one message, "the logo could not be loaded from this link", so the warning never reveals which addresses exist
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Replace the URL-based converter with `fetchLogoDataUrl(senderProfileId)` returning `{ dataUrl } | { warning: string } | { unauthorized: true }` — `lib/utils/image-to-base64.ts`
- [ ] Add a module-level `Map<senderProfileId, Promise<result>>` cache for the editor / export session (successful results only, so a retry after a transient error is possible) — same file
- [ ] Pass `senderProfileId` instead of the logo URL; skip the call when the profile has no logo — `lib/helpers/invoice-pdf-helpers.tsx`, `hooks/use-invoice-pdf.tsx`
- [ ] Preview: render an `Alert` (warning) above the PDF with the warning text + "The PDF was made without it." — `components/invoice-editor/pdf-preview-panel.tsx`, `components/modals/invoice/invoice-pdf-preview-modal.tsx`
- [ ] Download/print: `toast.warning(warning)`; 401 → `router.push('/login')` (SCR-01)

## Edge cases

| Case | Behaviour |
|---|---|
| Profile without a logo | No request, no warning, PDF without logo (SCR-04 no-logo-set) |
| Same profile rendered twice in one editor session | Second render uses the cached data URL; no request |
| `RATE_LIMITED` | PDF without logo + "Too many requests, try again in a minute." (verbatim) |
| Network error calling the endpoint | Treated as `UNAVAILABLE`: generic text, PDF still produced |

## Definition of Done

- [ ] in `pnpm dev`: an owned https logo appears in preview, download and print (AC-01); regenerating the preview makes no second request (Network tab)
- [ ] a profile with `http://` logo and one with a 1 MB image each produce the PDF without logo and show the verbatim warning (AC-03)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
