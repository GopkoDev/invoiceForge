---
id: T62
title: "Render replies as safe Markdown with react-markdown 10.1.0 and remark-gfm 4.0.1 and an in-app link allowlist"
layer: "ui"
deps: []
blocks: ["T68", "T69"]
acs: ["AC-42", "AC-43", "AC-44"]
files_hint: ["package.json", "components/ai-elements/message.tsx", "lib/ai/in-app-links.ts", "components/ai-elements/NOTICE", "tests/component/"]
owner: "Dmytro Hopko"
estimate: "L"
context_budget: "M"
status: "todo"
---

# T62 — Render replies as safe Markdown with react-markdown 10.1.0 and remark-gfm 4.0.1 and an in-app link allowlist

Owner feedback revision 2026-10-13 (spec §1 F1–F13; ADR-0011, ADR-0012, ADR-0013). **To the executing agent:** work from what is inlined here; if a slice is insufficient, ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part.

## Place in the sequence

- **Blocked by:** — · **Blocks:** T68 — Add e2e-through-UI tests for forms, Markdown, aligned layout, stable skeletons and list-keeping switches, and retake Linux baselines, T69 — Register QuestionForm, ConversationListProvider and the Markdown MessageResponse in the design system and update ux-flows for the form · **Wave:** 1 (longest dependency chain inside T50+).
- **Lane:** shares `components/ai-elements/message.tsx`, `tests/component/` with T59, T67 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** replies shown with lists, bold text, tables and links to my invoices and pages
> **So that** longer answers are easy to scan and I can open what the chat talks about in one click
>
> — `spec.md §4, US-13, verbatim` · full text: [spec.md](../spec.md)

It makes replies readable and linkable without ever rendering HTML.

## Inlined context

> **F10.** A reply may use bold and italic text, bulleted and numbered lists, tables, inline code and code blocks, and links. A link is shown as a link only when its address is a path of one of this app's pages … checked by the page's address pattern … Any other address, including every outside site and a full address on the app's own domain, is shown as plain text … HTML written into a reply is shown as text … While a reply is being written, a formatting mark that is not yet closed is shown as typed and becomes formatting once it closes.
>
> — `spec.md §1, F10, abridged` · full text: [spec.md](../spec.md)

> `skipHtml` on; no `rehype-raw`; `img` and every element outside the subset … mapped to plain text via `allowedElements` + `unwrapDisallowed`. Links: `urlTransform` keeps only a relative path that matches the in-app allowlist built from `config/routes.config.ts` … Anything else … renders the link text as plain text. Allowed links render through `next/link`. Streaming: … `closeUnfinished` …
>
> — `adr/0012, Decision outcome, abridged` · full text: [ADR-0012](../adr/0012-render-replies-as-safe-markdown-with-react-markdown-and-an-in-app-link-allowlist.md)

> Formatting renderer size ≤ 60 kB gzip added to the AI section's client JavaScript.
>
> — `spec.md §6, row «Formatting renderer size», abridged` · full text: [spec.md](../spec.md)

> **Hard rule:** exact version pins, versions at least two weeks old; CSP without `unsafe-eval`.
>
> — `adr/0012, Decision drivers, abridged`

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-42 — happy path

> **Given** a Freelancer asking "which invoices are overdue?" with three overdue invoices
> **When** the reply is written and later reopened
> **Then** the answer is shown with its formatting — for example a bulleted list or a table with bold totals — and each invoice number the reply links opens that invoice in the editor; the same formatting shows while it is being written and after reopening
>
> — `spec.md §5, AC-42, verbatim` · full text: [spec.md](../spec.md)

### AC-43 — authorization

> **Given** a Customer note that reads `<img src=x onerror=alert(1)>` and "see [our site](https://evil.example)", and a reply that repeats both
> **When** the reply is shown
> **Then** the HTML appears as text and nothing runs; "our site" is shown as plain text, not a link; only links to pages of this app are shown as links
>
> — `spec.md §5, AC-43, verbatim` · full text: [spec.md](../spec.md)

### AC-44 — happy path

> **Given** a reply being written that contains "**Total:** 1,000.00 USD"
> **When** only "**Total" has arrived so far
> **Then** the unfinished part is shown as typed, and once the closing marks arrive it turns into bold text; no HTML, broken layout or empty element is shown at any moment
>
> — `spec.md §5, AC-44, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `pnpm add react-markdown@10.1.0 remark-gfm@4.0.1` with exact pins
- [ ] `lib/ai/in-app-links.ts`: route-pattern allowlist + unit tests
- [ ] `MessageResponse` (`children`, `streaming?`) with the screens.md styles; first block no top margin
- [ ] `closeUnfinished` tail rule + 1-character replay test
- [ ] ≥ 30 hostile fixtures component test
- [ ] record the change in `components/ai-elements/NOTICE` and the element header

## Edge cases

| Case | Behaviour |
|---|---|
| `javascript:` / `//evil` / `https://<own host>/x` | text only |
| `/invoices/abc/edit?x=1` | text only |
| `<script>` in text | literal text |

## Definition of Done

- [ ] RED first: the tests for this task are written and fail before the change
- [ ] unit + component tests pass
- [ ] bundle delta measured ≤ 60 kB gzip and noted in the commit
- [ ] lint, typecheck green
- [ ] existing AC tests stay green and are not weakened; tests of superseded ACs are rewritten, not deleted silently
- [ ] every Hard Rule inlined above still holds
- [ ] gate: unit (only the known env.example failures), lint and typecheck green; commit with `SDD-Task: T62`
