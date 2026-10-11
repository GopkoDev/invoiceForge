---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-09"
feature_size: "M"
ticket: "editor-ux"
---

# 0001 — Load the PDF toolkit on demand through one lazy module

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

`@react-pdf/renderer` (about 1.6 MB, brief audit 2026-10-03) is imported statically by `lib/helpers/invoice-pdf-helpers.tsx` and `components/invoice-editor/invoice-pdf-document.tsx`. Those helpers are imported statically by the invoices list's row actions, the related invoices list, the PDF preview dialog and the editor header, so the toolkit is in the code of every signed-in page that shows an invoice row, although only Download, Print and the PDF preview need it (spec §1, US-01). No dynamic import of the toolkit exists today. AC-02 and AC-02b add three states every trigger must show: preparing, couldn't prepare (try again), and a newer version is available (reload).

## Decision drivers

- Spec §6 NFR "PDF toolkit on non-printing pages": 0 bytes of the PDF toolkit in the code every signed-in page except the invoice editor loads before any interaction.
- Spec §6 NFR "First PDF after page load": ≤ 3 s p95 from choosing Download or Print to the file or print dialog, on a 10 Mbit/s connection.
- Spec §6.1: the toolkit is fetched only from the app's own origin, under the existing content-security rules (`script-src 'self' … 'wasm-unsafe-eval'` already allows it).
- §2: the feature changes no server code and adds no endpoint.

## Considered options

1. **One lazy PDF module behind one hook** — the toolkit, the react-pdf invoice document and the generate/download/print helpers form one entry module reached only by `import()`; every trigger calls one `usePdfAction` hook that caches the module promise for the visit and owns the three states.
2. **Render the PDF on the server** — a route handler renders the PDF with react-pdf and the browser downloads it; no toolkit in any browser bundle, but a new guarded and rate-limited endpoint, function CPU and cold starts against the 3 s target, and server-side logo fetching under architecture-hardening ADR-0003.
3. **`next/dynamic` per component** — make each PDF-using component lazy on its own; four separate split points with no shared state, and the row actions menu is needed on first display anyway, so the toolkit would still have to be separated from it.

## Decision outcome

**Chosen:** Option 1. It meets the 0-byte target without adding a backend surface, keeps PDF generation exactly where `invoice-integrity` left it, and gives AC-02 and AC-02b one implementation instead of four. The entry module is the only file allowed to import `@react-pdf/renderer`; a lint rule (`no-restricted-imports`) enforces it, and a CI build-output check proves no non-editor page's initial chunks contain the toolkit. A failed `import()` is classified by probing the app's own origin: unreachable means the connection dropped (AC-02, try again); reachable while the chunk is missing means the app was updated (AC-02b, reload). A failure while generating is reported to Sentry and shown as AC-02. The editor's live preview is HTML (ADR-0002), so the editor needs no toolkit for its first display; it warms the module in the background once the page is idle (AC-01 allows the editor to fetch it when it opens), so its Download and Print rarely wait.

## Consequences

**Positive**
- Every list and dashboard page drops the toolkit from its initial code.
- One place to test the preparing, retry and reload states and the "fetched once per visit" rule.

**Negative**
- The first PDF of a visit waits for the toolkit download (about 1.3 s at 10 Mbit/s for 1.6 MB), inside the 3 s budget but noticeable.
- A version-skew probe adds one small request on the failure path only.

**Neutral**
- Moving to server-side rendering later reuses the same entry module behind a route handler; the hook's states stay.

## Links

- Spec: [[../spec.md]] US-01, AC-01, AC-02, AC-02b
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-render-preview-and-pdf-from-one-invoice-document-model]]
