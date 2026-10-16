---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-16"
feature_size: "S"
---

# Spec — landing-update

> **Glossary:** [CONTEXT](./CONTEXT.md) (feature-scoped: Landing demo) and the repo-root [CONTEXT](../../../CONTEXT.md) (Visitor, Freelancer, Contributor, Assistant, Assistant draft, Personal key, Draft permission, Conversation, Daily message allowance).
> **Reference module / docs / channels used:** [idea brief](../../idea-brief.md); the current landing page (its sections and texts); [ai-assistant spec](../ai-assistant/spec.md) §1–§3 and [ai-chat-v2 spec](../ai-chat-v2/spec.md) §1–§3 (what the AI really does, so the landing promises nothing more); the privacy page's AI wording; the [changelog](../../changelog.md) "To do" list (which AI tools can connect today).

## 1. Context

Invoice Forge now has an in-app AI chat that answers questions from the Freelancer's own data and turns one sentence into an invoice draft, and an external connection that lets the AI tools a Freelancer already uses read their invoices and, when allowed, create drafts. The public landing page says nothing about either. Its first screen still pitches autofill and templates, so a Visitor — a freelancer or small business that issues invoices and has not signed up yet — never sees the product's strongest difference and gets no reason to create an account because of it. Existing Freelancers and developers looking for connection details are not the audience of this change.

There is no outside deadline. The trigger is that the AI chat (ai-assistant and ai-chat-v2) has just shipped to the main line, and the landing page is now behind the product.

**Committed approach.** Rewrite the landing page's first screen around one promise — "an invoice from one sentence" — and back it with a **Landing demo**: a short scripted animation in which a fixed example sentence turns into a sample draft card, with no model call and no data behind it. Add **one new section** below it that explains, in plain outcome-first words, what the in-app AI does (answers from your own data, prepares drafts you review, never issues or sends) and that the same works from the AI tools the Visitor already uses. Everything else on the landing page stays as it is. This feature is a **temporary bridge**: the separate public-redesign feature will replace the first screen and the demo with an interactive one, so this feature builds the simplest credible version and does not aim for reuse.

Traceability and decisions:

- Easy-depth run: no competitive research, strategic options or failure-mode analysis were dispatched. The approach is the idea brief's §7 recommendation; the brief's risks (a demo that looks fake, "AI" scaring a cautious audience, connection jargon, layout breakage) shape AC-02, AC-05, AC-06, AC-07 and AC-11.
- **Every claim on the landing page must be true today.** What the AI does and does not do is taken from the ai-assistant and ai-chat-v2 specs: it answers only about the Freelancer's own data; a draft exists only after the Freelancer presses Create; it asks instead of guessing; it never issues, sends, edits or deletes an invoice and never creates a Customer; messages count toward a Daily message allowance. The privacy page states that invoices are not used to train AI models. External AI tools connect today through a Personal key (Claude Desktop, Claude Code, Cursor); tools that would connect through the Invoice Forge account (claude.ai, ChatGPT) are still on the "To do" list and must not be named as supported.
- **Relationship to public-redesign** (owner, 2026-10-16): landing-update ships first as a temporary bridge; public-redesign replaces its first screen and demo later.
- Assumptions taken for the owner at easy depth (vetoable before write):
  - The demo plays once when the first screen comes into view, stops on the finished draft card and offers a Replay control; it never loops on its own.
  - The demo's card mirrors the look of the real chat's draft card, carries clearly fictional sample content, and is labelled as an example.
  - Pressing the demo card or any new button leads to the sign-in page, where a first sign-in creates the account.
  - The top navigation gets one new link that jumps to the new AI section.
  - The first screen's three stats ("0% Manual Retyping", "100% Pixel-Perfect", "Live Status Tracking") are removed to make room for the demo.
  - The page's search description and link preview text mention the one-sentence promise.
  - The connection term ("MCP") never appears as a heading; it may appear once in small print for Visitors who look for it.
  - The section links to the privacy page for how AI messages are processed, and does not link to developer documentation.

## 2. Goals

- A Visitor understands from the first screen alone that Invoice Forge turns one sentence into an invoice draft they review, and sees it happen before signing up.
- A Visitor who is cautious about AI near their financial documents finds the limits stated plainly — own data only, drafts only, a human issues every invoice — and a Visitor who already uses an AI tool learns, without jargon, that they can reach their invoices from it.
- More Visitors create an account than before the change, while the landing page promises nothing the product does not do.

## 3. Non-goals

- **A full redesign or repositioning of the public pages.** That is the separate public-redesign feature; doing it here would duplicate work the bridge is meant to avoid.
- **A live or interactive AI on the landing page** (the Visitor typing a sentence or picking prompts). It brings paid anonymous model calls, abuse, rate limits and privacy questions; public-redesign owns the interactive demo.
- **Telling existing Freelancers about the AI inside the app.** A signed-in Freelancer never sees the landing page, and this change targets Visitors.
- **Connection set-up material on the landing page** (steps, configuration snippets, creating a Personal key). That lives on the app's "Connect your AI" page after sign-in; on the landing page it would be noise for the target audience.
- **Changing the privacy, terms or sign-in pages.** The privacy page already describes the AI chat (ai-chat-v2); this feature only links to it.

## 4. User stories

Customer and Assistant have no stories: neither ever reaches the public pages (a Customer never signs in; an Assistant always acts for a known Freelancer).

### US-01: See the one-sentence promise first

**As a** Visitor
**I want** the first screen to tell me in one line that I can get an invoice from one sentence
**So that** I know what makes this product different before I scroll

### US-02: Watch a sentence become a draft

**As a** Visitor
**I want** to see an example sentence turn into an invoice draft without signing up
**So that** I believe the promise instead of taking it on trust

### US-03: Know what the AI will and won't do

**As a** Visitor who is cautious about AI near my financial documents
**I want** to read plainly that the AI only uses my own data, only prepares drafts I review, never issues or sends an invoice, and is not trained on my invoices
**So that** I can trust it enough to try it

### US-04: Learn I can use it from my AI tool

**As a** Visitor who already uses an AI tool
**I want** to read in plain words that I can ask about my invoices and create drafts from the AI tools I already use, and which tools those are
**So that** I know it fits the way I already work

### US-05: Go from the promise to an account

**As a** Visitor
**I want** a clear way from the first screen and from the AI section to create an account
**So that** I can try it on my own invoices right away

### US-06: Use the first screen my way

**As a** Visitor who uses a phone, a keyboard, a screen reader, or a setting that reduces motion
**I want** the promise, the demo and the account button to work for me
**So that** I get the same message as everyone else

### US-07: Keep going straight to my dashboard

**As a** Freelancer
**I want** opening the landing page address while signed in to keep taking me to my dashboard
**So that** the new landing page never gets in my way

### US-08: Keep the new landing page from silently breaking

**As a** Contributor
**I want** the automated checks of the landing page to cover the new first screen and the AI section
**So that** a later change cannot silently remove the promise, the demo or the account button

## 5. Acceptance criteria

The landing page takes no input from the Visitor, so the **error** coverage type covers the demo failing to play.

### AC-01 (US-01) — happy path

**Given** a Visitor who is not signed in
**When** they open the landing page on a desktop or a phone
**Then** the main headline says they can get an invoice from one sentence, the line under it says the AI prepares a draft they review before anything is sent, and an account button is visible without scrolling; the first screen no longer shows the row of three figures it shows today

### AC-02 (US-02) — happy path

**Given** a Visitor whose device does not ask for reduced motion
**When** the first screen comes into view
**Then** the Landing demo plays once: a fixed example sentence appears in a chat box and turns into a draft card showing a Customer, at least one invoice line, the total with its currency and a clear "draft" mark, laid out like the in-app chat's draft card; the demo is labelled as an example, stops on the finished card, and offers a Replay control that plays it again from the start

### AC-03 (US-02) — authorization

**Given** a Visitor who is not signed in
**When** they watch the Landing demo, replay it, or press anything inside it
**Then** the demo shows only its fixed sample content, identical on every play; nothing they do on the landing page reaches the AI chat, creates a Conversation, uses a Daily message allowance or shows any Freelancer's data; and pressing the demo card leads to the sign-in page, not to an invoice

### AC-04 (US-02, US-06) — error

**Given** a Visitor whose device asks for reduced motion, or whose browser cannot play the demo (it fails to load or loads too slowly)
**When** the first screen shows
**Then** the Visitor sees the demo's finished state as a still picture — the example sentence and the finished draft card with the same example label — and the headline and account button work exactly as in AC-01

### AC-05 (US-02, US-03) — domain invariant

**Given** the Landing demo and every text on the landing page
**When** a Visitor reads or watches them
**Then** nothing shows or says that the AI issues, sends or emails an invoice, edits an issued invoice or creates a Customer; the demo ends on a proposed draft that waits for the Freelancer's review, in line with the rule that an Assistant only prepares Draft invoices and a human issues every one

### AC-06 (US-03) — happy path

**Given** a Visitor who scrolls past the first screen
**When** they reach the new AI section
**Then** they read, in plain words: the AI answers questions about their own invoices (for example who owes them money and what is overdue); it prepares an invoice draft from one sentence and asks when a detail is missing instead of guessing; it never issues or sends an invoice; their invoices are not used to train AI models; and a link takes them to the privacy page for how AI messages are processed; the section links to no developer documentation

### AC-07 (US-04) — cross-context

**Given** the AI tools that can connect to a Freelancer's account today through a Personal key
**When** a Visitor reads the part of the AI section about using Invoice Forge from their own AI tool
**Then** it says in plain words that they can ask about their invoices and create drafts from the AI tools they already use; it names only tools that can connect today (Claude Desktop, Claude Code and Cursor) and no tool that cannot yet; it says that creating drafts from such a tool needs a permission the Freelancer chooses when connecting it; and the connection's technical name appears at most once, in small print, never as a heading

### AC-08 (US-05) — happy path

**Given** a Visitor on the first screen or in the new AI section
**When** they press its account button, or the new navigation link and then the button in the section it jumps to
**Then** they reach the sign-in page, where their first sign-in creates their account, exactly as the landing page's existing buttons do

### AC-09 (US-06) — happy path

**Given** a Visitor using only a keyboard, a screen reader, or a phone 360 points wide
**When** they move through the first screen
**Then** the headline is the page's first heading; the demo has a text equivalent (the example sentence and a summary of the resulting draft) that a screen reader reads; the Replay control and the account button can be reached and pressed by keyboard with visible focus; focus is never trapped in the demo; and on the phone the headline, demo and account button fit the screen width without sideways scrolling

### AC-10 (US-07) — cross-context

**Given** a Freelancer who is signed in
**When** they open the landing page address
**Then** they are taken to their dashboard, as today, and never see the new first screen or AI section

### AC-11 (US-08) — happy path

**Given** the new first screen and the new AI section
**When** the landing page's automated checks run
**Then** they fail if the headline, the demo's finished card, the AI section or the account button is missing, or if the landing page shows sideways scrolling on a phone; and the landing page's visual references are refreshed to the new design

### AC-12 (US-01) — happy path

**Given** a search engine result or a link preview of the landing page
**When** a Visitor sees it before visiting
**Then** its description mentions getting an invoice draft from one sentence with AI

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| First screen ready (largest content shown), p75, phones | ≤ 2.5 s | production real-user performance data for the landing page (Core Web Vitals, LCP) |
| Layout shift on the landing page, p75 | ≤ 0.1 | production real-user performance data (Core Web Vitals, CLS) — the demo must not push content around while it loads or plays |
| Code added to the landing page's first load by the demo | ≤ 30 KB compressed | production build output, landing page first-load size before vs after |
| Demo length, start to finished card | ≤ 8 s, plays once, no automatic loop | automated browser check measuring time to the finished card |
| Model calls, or requests that read stored app data, caused by the landing page | 0 (the site-wide page-analytics and performance beacons are excluded) | automated browser check recording the landing page's requests while the demo plays and replays |
| Accessibility violations on the landing page (serious or critical) | 0 | existing automated accessibility check run against the landing page |
| Sideways scrolling at 360 px width | none | automated browser check at phone width |

## 6.1 Security / privacy

- **Data classification:** public — the landing page holds only marketing text and fixed sample content.
- **Personal data touched:** none. The demo's Customer, lines and amounts are fictional sample content, not any Freelancer's data.
- **AuthZ/AuthN impact:** none added. The landing page stays a public page; a signed-in Freelancer keeps being sent to the dashboard (AC-10).
- **Abuse cases:**
  - Anonymous model spend: impossible by construction — the demo calls no model and the landing page accepts no text (AC-03, NFR "Model calls … 0").
  - Data leak through the demo: none — the demo shows fixed sample content only and reads no stored data (AC-03).
  - Misleading claims (trust, consumer-protection risk): every AI claim is checked against the ai-assistant / ai-chat-v2 specs and the privacy page; only AI tools that can connect today are named (AC-05, AC-07).
  - Injection through text fields: not applicable — the landing page has no input.
- **Security review:** N/A — no new access boundary, no personal data, no input, no new request the landing page makes beyond the site-wide analytics and performance beacons every page already sends.

## 7. Metrics / KPIs

- **Visitor-to-account rate** — new accounts created per week ÷ unique Visitors of the landing page that week. Baseline: TBD — measured over the 4 weeks before release from the existing page analytics and the count of accounts created; target: +20% relative to the baseline within 4 weeks after release.
- **Click-through to sign-in** — sign-in page views ÷ landing page views per week. Baseline: TBD — same 4-week window before release from the existing page analytics; target: +15% relative within 4 weeks after release.
- **New accounts that try the AI** — share of accounts created in a week that send at least one AI chat message within 7 days of creation. Baseline: the same share for accounts created in the 4 weeks before release; target: +10 percentage points within 4 weeks after release.

## 8. Open questions

- [ ] Which exact example sentence and draft does the demo show, and must it match what the real chat would produce? Default now: "Invoice Acme for 20 hours of design at $50" → Customer "Acme Corp", one line "Design — 20 h × $50.00", total $1,000.00 USD, marked draft; the card mirrors the real chat's look but is fixed sample content. — owner: Dmytro Hopko, due: before sdd:tasks
- [ ] What is the final headline and supporting line? Default now: "Your next invoice is one sentence away" / "Type what you billed. The AI prepares a draft — you review it before anything is sent." — owner: Dmytro Hopko, due: before sdd:implement
- [ ] Are the KPI targets (+20% / +15% / +10 pp) right once the baseline is known? Default now: keep them and revisit after the 4-week baseline. — owner: Dmytro Hopko, due: before sdd:ship
