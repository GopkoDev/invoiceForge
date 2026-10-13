---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-13"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0012 — Render replies as safe Markdown with react-markdown and an in-app link allowlist

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Dmytro Hopko (owner decision F10 of 2026-10-13; renderer chosen by the spec-revision agent, open to owner veto)
- **Amends:** ADR-0010 (`MessageResponse` renders formatted text instead of plain text). **Supersedes for the in-app chat:** the plain-text rendering of ai-assistant AC-07 and ai-assistant SAD §8 "Links" (links only from structured parts); the parent documents are not edited.

## Context

The owner decided (F10) that assistant replies render as Markdown: lists, bold, tables, code and links to the app's own pages, never raw HTML or outside links, and safely while streaming. The first iteration rendered plain text so that the model could never place a link (ai-assistant AC-07), and ADR-0010 kept `streamdown` out for that reason. The model was also told it cannot link (screenshot 24). A renderer is now needed that is safe by construction, handles half-written text, and stays small.

## Decision drivers

- Spec §6 "Safe formatting": 0 executed scripts, 0 rendered HTML elements, 0 links outside the app's page list over ≥ 30 hostile inputs (AC-43).
- Spec §6 "Formatting while streaming" (AC-44) and "Formatting renderer size" ≤ 60 kB gzip.
- SAD §2: exact version pins, versions at least two weeks old; no Radix; CSP without `unsafe-eval` (the app already ships `zod-csp-safe`).
- ai-assistant AC-07 "only ever links to pages that exist" must still hold.

## Considered options

1. **`react-markdown@10.1.0` + `remark-gfm@4.0.1` (chosen).** The unified/micromark parser renders to React elements, never to an HTML string; raw HTML is not parsed into elements unless `rehype-raw` is added (it is not); `urlTransform` and a custom `a` component gate every link; GFM adds tables and strike-through. Released 2025-03-07 and 2025-02-10.
2. **`streamdown`** (Vercel, what AI Elements uses). Built for streaming, but brings Shiki, KaTeX and Mermaid weight, renders through `react-markdown` anyway, and its link hardening targets outside origins, not an in-app allowlist; it was excluded by ADR-0010.
3. **`marked` + `DOMPurify` into `dangerouslySetInnerHTML`.** Small and fast, but safety rests on sanitizing an HTML string after the fact, a second dependency, and `innerHTML` in the chat.
4. **An in-house parser for a small subset.** No dependency, but tables, nested lists and code spans are easy to get wrong, and a hand-rolled parser is a security surface the team would own alone.

## Decision outcome

**Chosen:** Option 1. Elements-not-HTML makes "no HTML ever renders" structural (driver 1), the link gate is one component, and the pair stays within the size budget. Rules:

- `skipHtml` on; no `rehype-raw`; `img` and every element outside the subset (p, strong, em, del, ul, ol, li, table parts, code, pre, a, blockquote, br, hr) mapped to plain text via `allowedElements` + `unwrapDisallowed`.
- **Links:** `urlTransform` keeps only a relative path that matches the in-app allowlist built from `config/routes.config.ts` (`/dashboard`, `/invoices`, `/invoices/{id}/edit`, `/invoices/new`, `/customers`, `/customers/{id}`, `/customers/new`, `/products`, `/products/{id}/edit`, `/products/new`, `/sender-profiles`, `/sender-profiles/{id}`, `/sender-profiles/{id}/edit/bank-accounts`, `/settings/profile`, `/settings/privacy`, `/settings/assistants`, `/ai`, `/ai/{id}`; `{id}` = 1–64 characters of `[A-Za-z0-9_-]`, no query or fragment except none). Anything else (absolute, protocol-relative, `javascript:`, `mailto:`, unknown path) renders the link text as plain text. Allowed links render through `next/link`.
- **Streaming:** the visible text is passed through a small `closeUnfinished` step that hides a trailing unclosed emphasis/code marker run until it closes, so a half mark never renders as an empty element; saved replies render the same way.
- Read tools return a `path` per invoice row (built by code) so the model writes correct links; the instructions say to link with those paths.

## Consequences

**Positive**
- Lists, tables and bold make long answers readable (AC-42); the model can link invoices (AC-48).
- No `innerHTML`; a stored `<script>` or outside link in Customer text is inert (AC-43).

**Negative**
- Two new runtime dependencies (+ their unified/micromark tree, ~40–55 kB gzip on the AI section only).
- An allowed in-app link may point to another Freelancer's id; it opens a "not found" page, never data (pages are owner-scoped) — accepted.
- The parser re-parses the whole reply on each streamed update; fine at the reply sizes of the chat (≤ a few kB), a candidate for memoising per block if replies grow.

**Neutral**
- ai-assistant AC-07 and its SAD §8 row stay as written for the parent feature; this ADR is their superseding record for the in-app chat. MCP answers are unaffected.
- Swapping the renderer later only touches `MessageResponse` and its tests.

## Links

- Spec: [[../spec.md]] §1 F10, US-13, AC-42–AC-44, AC-48, §6 "Safe formatting", "Formatting while streaming", "Formatting renderer size"
- SAD: [[../sad.md]] §2, §5 "Presentation", §8 "Links", "Untrusted text"
- Related ADR: [[0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui]] (amended); parent `../../ai-assistant/spec.md` AC-07 (superseded for the chat)
