---
id: T01
title: "Add the new landing copy and demo sample to landingContent and pin its claims with a truth-guard unit test"
layer: "domain"
deps: []
blocks: ["T03", "T04", "T06", "T07", "T08"]
acs: ["AC-05", "AC-06", "AC-07"]
files_hint: ["constants/public-pages-content.ts", "tests/unit/landing-claims.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T01 — Add the new landing copy and demo sample to landingContent and pin its claims with a truth-guard unit test

## Place in the sequence

- **Blocked by:** — · **Blocks:** T03 — DemoDraftCard, T04 — demo player, T06 — hero rewrite, T07 — AI section, T08 — metadata · **Wave:** 1 (the copy every component renders; starts in parallel with T02).
- **Lane:** shares `constants/public-pages-content.ts` with T06 and T07 — serialized.

## Why (user story)

> **As a** Visitor who is cautious about AI near my financial documents
> **I want** to read plainly that the AI only uses my own data, only prepares drafts I review, never issues or sends an invoice, and is not trained on my invoices
> **So that** I can trust it enough to try it
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Visitor who already uses an AI tool
> **I want** to read in plain words that I can ask about my invoices and create drafts from the AI tools I already use, and which tools those are
> **So that** I know it fits the way I already work
>
> — `spec.md §4, US-04, verbatim`

This task writes every new word (hero, demo sample, AI section, metadata) and narrows the beta wording, and makes the claims a failing test the moment they become untrue.

## Inlined context

> **Copy and sample content** live in `landingContent` (`constants/public-pages-content.ts`): new hero copy, the AI section, the new navigation link, the demo's fixed sample, and the narrowed beta wording ("unlimited" kept only for invoices and clients, AC-05). The terms page text is not touched.
>
> — `sad.md §4, supporting choices, verbatim` · full text: [sad.md](../sad.md)

> A unit test over `landingContent` pins the claims: exactly Claude Desktop, Claude Code and Cursor are named; "MCP" appears at most once and never in a heading; "unlimited" only for invoices and clients; no link to developer documentation; the daily message limit and "not used to train AI models" are stated; the AI "asks instead of guessing" and "never issues or sends" an invoice; drafts from an external tool need "a permission chosen when connecting it"; "Claude" alone, ChatGPT and "any AI tool" never appear
>
> — `sad.md §8, Claim truthfulness, verbatim`

> Every visible word and the demo's fixed sample come from `landingContent`; components take props, hold no copy
>
> — `sad.md §8, Content / copy, verbatim`

> Default now: "Invoice Acme for 20 hours of design at $50" → Customer "Acme Corp", one line "Design — 20 h × $50.00", total $1,000.00 USD, marked draft · Default now: "Your next invoice is one sentence away" / "Type what you billed. The AI prepares a draft — you review it before anything is sent."
>
> — `spec.md §8, open questions 1–2 (defaults), abridged` — still open with the owner; use the defaults, the words live only here so they change in one place.

> AI section blocks — **What it does** — answers about your own invoices, drafts from one sentence you review, asks when something is missing; **What it never does** — never issues, sends, edits or deletes an invoice, never creates a Customer; the chat has a daily message limit; invoices are not used to train AI models; **From your own AI tools** — ask about invoices and create drafts from Claude Desktop, Claude Code and Cursor; drafts need a permission you choose when connecting; small-print line naming the connection (MCP) at most once. Privacy link; own account button.
>
> — `screens.md SCR-02, state default, abridged` · full text: [screens.md](../screens.md)

Today `betaPricing.description` says "In exchange: unlimited usage, free forever during beta." (`constants/public-pages-content.ts:122`) — must be narrowed; `betaPricing.benefits` "Unlimited invoices & clients" is allowed. `termsContent` (line ~648) is out of scope (spec §3).

**Fallback:** insufficient or contradicted by the code → read [spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) in full. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-05 — domain invariant

> **Given** the Landing demo and every text on the landing page
> **When** a Visitor reads or watches them
> **Then** nothing shows or says that the AI issues, sends or emails an invoice, edits an issued invoice or creates a Customer, and no text promises unlimited use of the AI; the demo ends on a draft proposal whose Create button is not pressed, in line with the rule that an Assistant only prepares Draft invoices and a human issues every one
>
> — `spec.md §5, AC-05, verbatim`

### AC-06 — happy path

> **Given** a Visitor who scrolls past the first screen
> **When** they reach the new AI section
> **Then** they read, in plain words: the AI answers questions about their own invoices (for example who owes them money and what is overdue); it prepares an invoice draft from one sentence and asks when a detail is missing instead of guessing; it never issues or sends an invoice; the AI chat has a daily message limit; their invoices are not used to train AI models; and a link takes them to the privacy page for how AI messages are processed; the section links to no developer documentation; the section comes directly after the first screen and has its own account button
>
> — `spec.md §5, AC-06, verbatim` (this task: the copy; placement and button are T07)

### AC-07 — cross-context

> **Given** the AI tools that can connect to a Freelancer's account today through a Personal key
> **When** a Visitor reads the part of the AI section about using Invoice Forge from their own AI tool
> **Then** it says in plain words that they can ask about their invoices and create drafts from the AI tools they already use; it names exactly the tools that can connect today — Claude Desktop, Claude Code and Cursor — and never "Claude" on its own, Claude on the web, ChatGPT or "any AI tool"; it says that creating drafts from such a tool needs a permission the Freelancer chooses when connecting it; and the connection's technical name appears at most once, in small print, never as a heading
>
> — `spec.md §5, AC-07, verbatim`

## Checklist

- [ ] Add `landingContent.hero` new fields (`headline` single line, `supportingLine`, `ctaButton`) **alongside** the old ones — do not remove `stats` / `line1`/`line2` here (T06 removes them with the component, so the build stays green) — `constants/public-pages-content.ts`
- [ ] Add `landingContent.demo`: `sentence`, `customer`, `lines[]` (`description`, `quantityLabel`, `amount`), `total`, `currency`, `exampleLabel`, `createLabel`, `replayLabel`, `srSummary`; export its type (`LandingDemoSample`)
- [ ] Add `landingContent.aiSection`: badge, `h2`, three blocks (`does`, `never`, `ownTools`), `smallPrint` (the only "MCP"), `privacyLink` (`legalRoutes.privacy`), `ctaButton`
- [ ] Add `landingContent.metadata`: `description`, `openGraph`/`twitter` title + description carrying "an invoice draft from one sentence with AI"
- [ ] Narrow `betaPricing.description` so "unlimited" applies only to invoices and clients
- [ ] Write `tests/unit/landing-claims.test.ts` walking every string in `landingContent` (recursive) and asserting each rule from sad §8 Claim truthfulness, plus AC-05's forbidden verbs (AI issues / sends / emails / edits an issued invoice / creates a Customer)

## Edge cases

| Case | Behaviour |
|---|---|
| "Claude" appears inside "Claude Desktop" / "Claude Code" | allowed; a bare "Claude" (not followed by Desktop/Code) fails the test |
| "Unlimited invoices & clients" in `betaPricing.benefits` | allowed (invoices and clients); any other "unlimited" fails |
| "MCP" in a field used as a heading (`h2`, block titles, badge) | fails, even if it appears only once |
| An href to `/docs`, a developer docs host, or `connect-ai` setup | fails ("links to no developer documentation") |
| Old hero text still present (until T06) | passes — it makes no AI claim |

## Definition of Done

- [ ] `tests/unit/landing-claims.test.ts` passes, and fails when any one rule is broken (checked by temporarily inserting "ChatGPT" / a second "MCP")
- [ ] `tsc` + lint clean; existing landing renders unchanged (no consumer changed yet)
- [ ] terms and privacy content untouched
