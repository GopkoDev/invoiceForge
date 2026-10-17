---
id: T07
title: "Build AiSection, place it right after the hero and add the #ai navigation link"
layer: "ui"
deps: ["T01", "T02"]
blocks: ["T09", "T11"]
acs: ["AC-06", "AC-07", "AC-08"]
files_hint: ["components/landing/ai-section.tsx", "components/landing/index.ts", "app/(public)/landing-page.tsx", "constants/public-pages-content.ts", "tests/component/landing-ai-section.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T07 — Build AiSection, place it right after the hero and add the #ai navigation link

## Place in the sequence

- **Blocked by:** T01 — landing content, T02 — JS baseline · **Blocks:** T09 — e2e behaviour, T11 — design-system registration · **Wave:** 2 (parallel with T03/T08).
- **Lane:** shares `constants/public-pages-content.ts`, `app/(public)/landing-page.tsx`, `components/landing/index.ts` with T06 — serialized.

## Why (user story)

> **As a** Visitor who is cautious about AI near my financial documents
> **I want** to read plainly that the AI only uses my own data, only prepares drafts I review, never issues or sends an invoice, and is not trained on my invoices
> **So that** I can trust it enough to try it
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Visitor
> **I want** a clear way from the first screen and from the AI section to create an account
> **So that** I can try it on my own invoices right away
>
> — `spec.md §4, US-05, verbatim` (US-04 is carried by the "own AI tools" block — copy in T01)

This task renders the AI section, puts it in place and makes it reachable from the nav.

## Inlined context

> `ai-section.tsx` new section id="ai": what the AI does / doesn't, own AI tools (3 named), privacy link, own account button · `landing-page.tsx` inserts `<AiSection>` right after the hero, before `<FeatureGrid>` · `landing-nav.tsx` unchanged code; renders the new #ai link from content
>
> — `sad.md §5, internal decomposition, abridged` · full text: [sad.md](../sad.md)

> **Navigation:** one new in-page link `#ai` added to `landingContent.navigation.links` (shown on tablet and desktop by the existing `LandingNav`); the footer is unchanged.
>
> — `sad.md §4, supporting choices, verbatim`

> | default | Reached by scrolling at any width or by the nav `AI` link on tablet/desktop (Flow 4). Three blocks … Privacy link; own account button. No developer-documentation link … | `SectionContainer`, `IconBadge` (section badge), `ContentCard` ×3, `Button` (account), text link (`buttonVariants` link) to `legalRoutes.privacy`, NEW `AiSection` |
> | navigate | Privacy link → SCR-04; account button → SCR-03 |
>
> — `screens.md SCR-02, states default + navigate, abridged` · wireframes E (desktop, 3 cards in a row) and F (phone, stacked) in [screens.md](../screens.md)

> **Hard rule:** Every visible word … come[s] from `landingContent`; components take props, hold no copy · the landing page imports no server action, route handler or service
>
> — `sad.md §8, Content / copy + Data access, abridged`

**Fallback:** read [screens.md](../screens.md) SCR-02 and [sad.md](../sad.md) §6 Flow 4. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 — happy path

> **Given** a Visitor who scrolls past the first screen
> **When** they reach the new AI section
> **Then** they read, in plain words: the AI answers questions about their own invoices (for example who owes them money and what is overdue); it prepares an invoice draft from one sentence and asks when a detail is missing instead of guessing; it never issues or sends an invoice; the AI chat has a daily message limit; their invoices are not used to train AI models; and a link takes them to the privacy page for how AI messages are processed; the section links to no developer documentation; the section comes directly after the first screen and has its own account button
>
> — `spec.md §5, AC-06, verbatim`

### AC-07 — cross-context

> **Given** the AI tools that can connect to a Freelancer's account today through a Personal key
> **When** a Visitor reads the part of the AI section about using Invoice Forge from their own AI tool
> **Then** it says in plain words that they can ask about their invoices and create drafts from the AI tools they already use; it names exactly the tools that can connect today — Claude Desktop, Claude Code and Cursor — and never "Claude" on its own, Claude on the web, ChatGPT or "any AI tool"; it says that creating drafts from such a tool needs a permission the Freelancer chooses when connecting it; and the connection's technical name appears at most once, in small print, never as a heading
>
> — `spec.md §5, AC-07, verbatim`

### AC-08 — happy path

> **Given** a Visitor on the first screen or in the new AI section
> **When** they press its account button, or (on tablet and desktop) the new navigation link and then the button in the section it jumps to
> **Then** they reach the sign-in page, where their first sign-in creates their account, exactly as the landing page's existing buttons do
>
> — `spec.md §5, AC-08, verbatim`

## Checklist

- [ ] `components/landing/ai-section.tsx`: `<SectionContainer id="ai">`, `IconBadge`, `h2`, three `ContentCard`s, small-print `p` (the only "MCP", not a heading), privacy text link → `legalRoutes.privacy`, account `Button` link → `authRoutes.signIn`
- [ ] Add `{ label: 'AI', href: '#ai' }` to `landingContent.navigation.links` — `constants/public-pages-content.ts`
- [ ] Insert `<AiSection {...landingContent.aiSection} />` between `<LandingHero>` and `<FeatureGrid>` — `app/(public)/landing-page.tsx`; export from `components/landing/index.ts`
- [ ] `tests/component/landing-ai-section.test.tsx`: `id="ai"`; three block titles; Claude Desktop / Claude Code / Cursor present; "MCP" in no heading; privacy href `/privacy`; account href `authRoutes.signIn`; no other hrefs; and in `LandingPage` the section follows the hero and precedes features

## Edge cases

| Case | Behaviour |
|---|---|
| Phone width | nav hides section links (existing `LandingNav`), cards stack, no overflow |
| Nav `AI` link on tablet/desktop | in-page jump to `#ai` (no route change) |

## Definition of Done

- [ ] `tests/component/landing-ai-section.test.tsx` passes; `tests/unit/landing-claims.test.ts` still passes
- [ ] `tsc` + lint clean
