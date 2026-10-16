---
status: draft
feature_size: "S"
tool: "code"
updated_at: "2026-10-16"
---

# Screens — landing-update

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code (from `docs/design-system.md` — code-only canon, no Figma/Pencil MCP configured; no degradation)
- **File:** inline wireframes below
- **Inputs:** [ux-flows](./ux-flows.md) SCR inventory · [sad.md](./sad.md) §4–§8 (ADR-0001 card replica, ADR-0002 start frame + CSS fallbacks), §6 Flows 1–6 · [spec](./spec.md) §5 AC-01…AC-12. No `contracts/` — the landing page makes no request, so no contract error states exist.
- **Copy in wireframes** uses the spec §8 defaults (headline, example sentence and draft), still open with the owner; the final words come from `landingContent`, the layout does not depend on them.
- **Reference sizes:** phone 360×640, desktop 1280×800 (spec §1). Light and dark come from the existing tokens; no state differs by theme.

Components named below are the `components/ui/` primitives (Button / `buttonVariants`, Card, Badge, Separator), the existing landing building blocks in `components/landing/` (`LandingNav`, `IconBadge`, `SectionContainer`, `ContentCard`, `NeonBorderWrapper` in `components/ui/`), and the three NEW components in §New components. Nothing is imported from `components/ai/` or `components/ai-elements/` (ADR-0001; `Message` pulls a markdown renderer and `PromptInput` is a live input, neither fits a fixed, input-free demo).

## Screens

### SCR-01 — Landing — first screen

Owner of AC-01…AC-05, AC-08, AC-09, AC-11; the demo states are the `data-phase` values of SAD §4 (`idle → typing → thinking → card → done`, plus `still`).

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Visitor without a session opens `/` (Flow 3); demo in its start frame (`idle`) — the server HTML, before and after hydration until ≥ 50 % of the demo is visible. Headline is the first `h1`; supporting line; account button visible without scrolling at both reference sizes; no row of three figures (AC-01) | `LandingNav` (+ new `#ai` link, tablet/desktop only), `IconBadge` ("Public Beta — Free to Use"), `Button` (account), NEW `LandingDemo` (start frame: empty chat box with "Example" label) | wireframe A (desktop), wireframe B (phone) |
| playing | ≥ 50 % of the demo visible, no reduced motion, player armed (AC-02, Flow 1): the example sentence types into the chat box (`typing`), a short thinking indicator (`thinking`), the proposal card appears (`card`); all inside the fixed demo box | NEW `LandingDemo`, NEW `DemoDraftCard`, `Badge` ("Example") | wireframe C (mid-play) |
| success | Animation reaches `done` within 8 s: finished proposal card with Customer, one line, total + currency, Create shown unpressed, "Example" label; Replay appears below the box; scroll away and back keeps `done` (AC-02, AC-05) | NEW `DemoDraftCard` (`Card`, `Badge`, `Separator`, `buttonVariants` link "Create"), `Button` variant ghost "Replay" | wireframe D |
| replaying | Visitor presses Replay: demo returns to `idle` and plays again from the start with identical content; focus stays on Replay (AC-02, AC-03) | as playing | wireframe C |
| error (still) | Reduced motion asked, scripts off, scripts not run within 3 s of load, or animation not started within 3 s of the demo becoming visible (AC-04, Flow 2, ADR-0002): the finished state shown without animation in the same box — sentence + finished card + "Example" label. Replay shown only when the player is hydrated and reduced motion is not asked (with no scripts or under reduced motion there is nothing to replay) | NEW `LandingDemo` (`still`), NEW `DemoDraftCard` | wireframe D (same layout; Replay conditional) |
| navigate (card / Create) | Visitor presses the demo card or Create at any phase, or the account button (AC-03, AC-08): leaves to SCR-03 sign-in. Card link and Create link are two separate, non-nested links outside the `aria-hidden` animated layer (SAD §8) | `buttonVariants` links to `authRoutes.signIn` | — (navigation, no own layout) |
| keyboard / screen reader | (AC-09, Flow 5) Tab order follows the DOM (owner, 2026-10-16; ux-flows US-06 aligned): nav → account button → demo card → Create → Replay; visible focus on each; focus never trapped. Screen reader: headline is the first heading; the demo reads as one visually hidden text ("Example: 'Invoice Acme for 20 hours of design at $50' becomes a draft for Acme Corp, Design 20 h × $50.00, total $1,000.00 USD"); phase changes are not announced | NEW `LandingDemo` (sr-only text equivalent) | — (behaviour, same layout as default/success) |
| loading | N/A: the page is static server HTML; the pre-hydration moment *is* the default start frame — no spinner or skeleton | — | — |
| empty | N/A: fixed content only; there is no data that could be missing | — | — |
| validation | N/A: the landing page takes no input | — | — |
| signed-in | N/A for this screen: a session on `/` is sent to SCR-05 before the page renders (AC-10, Flow 3) | — | — |

**Wireframe A — SCR-01 default, desktop 1280×800**

```text
+------------------------------------------------------------------------------+
| [Invoice Forge]          Features  Pricing  How It Works  AI   [◐] [Get started] |
+------------------------------------------------------------------------------+
|                                                                              |
|                     ( ✦ Public Beta — Free to Use )                          |
|                                                                              |
|                 Your next invoice is one sentence away          <- h1        |
|     Type what you billed. The AI prepares a draft — you review it            |
|                    before anything is sent.                                  |
|                                                                              |
|                         [ Get started free  → ]                              |
|                                                                              |
|        +----------------------------------------------------- Example -+     |
|        |                                                                |    |
|        |   (fixed-height demo box — start frame: empty chat box)        |    |
|        |                                                                |    |
|        |   +--------------------------------------------------------+   |    |
|        |   | Describe the invoice…                                  |   |    |
|        |   +--------------------------------------------------------+   |    |
|        +----------------------------------------------------------------+    |
|                                                                              |
+------------------------------------------------------------------------------+
  no stats row; the account button sits above the fold; the demo box height
  is fixed per breakpoint and never changes between phases
```

**Wireframe B — SCR-01 default, phone 360×640**

```text
+----------------------------------+
| [Invoice Forge]   [◐] [Get started]|   <- nav: no section links on phone
+----------------------------------+
|  ( ✦ Public Beta — Free to Use ) |
|                                  |
|  Your next invoice is            |
|  one sentence away        <- h1  |
|  Type what you billed. The AI    |
|  prepares a draft — you review   |
|  it before anything is sent.     |
|                                  |
|  [   Get started free  →     ]   |   <- visible without scrolling
|                                  |
|  +------------------- Example -+ |
|  | (demo box, may sit partly   | |   <- plays only once ≥ 50 % visible
|  |  below the fold)            | |
+----------------------------------+
  no sideways scrolling at 360 px
```

**Wireframe C — SCR-01 playing (mid-play, demo box only)**

```text
+------------------------------------------------------ Example -+
|                          +-------------------------------------+ |
|                          | Invoice Acme for 20 hours of design | |  <- user bubble, typed in
|                          | at $50                              | |
|                          +-------------------------------------+ |
|  ✦ …                                                            |  <- thinking (short)
|                                                                  |
|  +------------------------------------------------------------+  |
|  | Describe the invoice…                                      |  |  <- chat box, inert, not focusable
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

**Wireframe D — SCR-01 success / still (demo box only)**

```text
+------------------------------------------------------ Example -+
|                          | Invoice Acme for 20 hours of design | |
|                          | at $50                              | |
|  +------------------------------------------------------------+  |
|  | Draft proposal                                  [Example]  |  |  <- DemoDraftCard (link to sign-in)
|  | Customer      Acme Corp                                    |  |
|  | ---------------------------------------------------------- |  |
|  | Design — 20 h × $50.00                          $1,000.00  |  |
|  | ---------------------------------------------------------- |  |
|  | Total                                       $1,000.00 USD  |  |
|  |                                                 [ Create ] |  |  <- shown, never pressed by the demo
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
                         [ ↻ Replay ]                                  <- success; still: only if player hydrated and no reduced motion
```

### SCR-02 — Landing — AI section

Owner of AC-05…AC-08; `id="ai"`, directly after SCR-01 and before the features section.

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Reached by scrolling at any width or by the nav `AI` link on tablet/desktop (Flow 4). Three blocks: **What it does** — answers about your own invoices, drafts from one sentence you review, asks when something is missing; **What it never does** — never issues, sends, edits or deletes an invoice, never creates a Customer; the chat has a daily message limit; invoices are not used to train AI models; **From your own AI tools** — ask about invoices and create drafts from Claude Desktop, Claude Code and Cursor; drafts need a permission you choose when connecting; small-print line naming the connection (MCP) at most once. Privacy link; own account button. No developer-documentation link, no "Claude" alone, ChatGPT or "any AI tool" (AC-05, AC-06, AC-07) | `SectionContainer`, `IconBadge` (section badge), `ContentCard` ×3, `Button` (account), text link (`buttonVariants` link) to `legalRoutes.privacy`, NEW `AiSection` | wireframe E (desktop), wireframe F (phone) |
| navigate | Privacy link → SCR-04; account button → SCR-03 (AC-06, AC-08) | links | — |
| loading | N/A: static content, no request (AC-03, QG-2) | — | — |
| empty | N/A: fixed content | — | — |
| error | N/A: nothing can fail — no request, no script needed to render | — | — |
| validation | N/A: no input | — | — |

**Wireframe E — SCR-02 default, desktop 1280×800**

```text
+------------------------------------------------------------------------------+
|                          ( ✦ AI that works for you )                         |
|              Ask about your invoices. Get drafts. You stay in charge.   <- h2|
|                                                                              |
|  +----------------------+  +----------------------+  +----------------------+  |
|  | What it does         |  | What it never does   |  | From your own AI     |  |
|  | • answers from your  |  | • never issues or    |  | tools                |  |
|  |   own invoices       |  |   sends an invoice   |  | • Claude Desktop,    |  |
|  | • a draft from one   |  | • never edits or     |  |   Claude Code,       |  |
|  |   sentence — you     |  |   deletes one, never |  |   Cursor             |  |
|  |   review it          |  |   creates a Customer |  | • drafts need a      |  |
|  | • asks instead of    |  | • daily message limit|  |   permission you     |  |
|  |   guessing           |  | • not used to train  |  |   choose when        |  |
|  |                      |  |   AI models          |  |   connecting         |  |
|  +----------------------+  +----------------------+  +----------------------+  |
|            Connects through MCP, an open standard for AI tools.  <- small print, once |
|            How AI messages are processed: Privacy policy →                   |
|                         [ Get started free  → ]                              |
+------------------------------------------------------------------------------+
```

**Wireframe F — SCR-02 default, phone 360×640**

```text
+----------------------------------+
|   ( ✦ AI that works for you )    |
|  Ask about your invoices. Get    |
|  drafts. You stay in charge.     |
|  +----------------------------+  |
|  | What it does               |  |
|  +----------------------------+  |
|  +----------------------------+  |
|  | What it never does         |  |
|  +----------------------------+  |
|  +----------------------------+  |
|  | From your own AI tools     |  |
|  +----------------------------+  |
|  small print (MCP, once)         |
|  Privacy policy →                |
|  [   Get started free  →     ]   |
+----------------------------------+
  cards stack; no sideways scrolling
```

### SCR-03 — Sign-in page (existing)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Reached from any new account button, the demo card or Create (AC-08); a first sign-in creates the account | existing sign-in page, unchanged | — |
| other states | N/A: unchanged existing screen, out of this feature's scope (spec §3) | — | — |

### SCR-04 — Privacy page (existing)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Reached from the AI section's privacy link (AC-06); describes how AI messages are processed | existing privacy page, unchanged | — |
| other states | N/A: unchanged existing screen (spec §3) | — | — |

### SCR-05 — Dashboard (existing)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | A signed-in Freelancer opening `/` is sent here (AC-10) | existing dashboard, unchanged | — |
| other states | N/A: unchanged existing screen | — | — |

### SCR-06 — Search result / link preview (outside the app)

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | A search engine or a shared link shows the landing route's `description`, `openGraph` and `twitter` text, which mention getting an invoice draft from one sentence with AI (AC-12) | page metadata in `app/(public)/page.tsx` — no component | — |
| other states | N/A: rendered by third parties; the app controls only the metadata text | — | — |

## New components

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| `LandingDemo` (`components/landing/landing-demo/landing-demo.tsx`) | A play-once, visibility-started scripted demo with CSS-only fallbacks (ADR-0002) exists nowhere; the chat's `ChatIsland`/`Composer` are live, data-bound and take input | pending |
| `DemoDraftCard` (`components/landing/landing-demo/demo-draft-card.tsx`) | The real `DraftCard` imports server actions and chat contexts and cannot run on a public page; a presentational replica on the same primitives is the decided path (ADR-0001) | pending |
| `AiSection` (`components/landing/ai-section.tsx`) | A new landing section; it composes the existing `SectionContainer`, `IconBadge` and `ContentCard`, but no existing section carries this three-block content with its own account button and privacy link | pending |
