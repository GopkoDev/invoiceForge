---
id: T03
title: "Build DemoDraftCard, the presentational replica of the chat draft proposal card"
layer: "ui"
deps: ["T01"]
blocks: ["T04", "T11"]
acs: ["AC-02", "AC-03", "AC-05"]
files_hint: ["components/landing/landing-demo/demo-draft-card.tsx", "tests/component/landing-demo-draft-card.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T03 — Build DemoDraftCard, the presentational replica of the chat draft proposal card

## Place in the sequence

- **Blocked by:** T01 — landing content (`LandingDemoSample` type) · **Blocks:** T04 — demo player, T11 — design-system registration · **Wave:** 2 (parallel with T07, T08).
- **Lane:** own lane.

## Why (user story)

> **As a** Visitor
> **I want** to see an example sentence turn into an invoice draft without signing up
> **So that** I believe the promise instead of taking it on trust
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task builds the card the demo ends on.

## Inlined context

> **Chosen:** Option 1, standalone replica. It keeps the public page structurally unable to import the chat's server action and contexts, keeps the demo's bundle cost to one small component, and does not refactor a chat that has just shipped for a page that will be replaced
>
> — `adr/0001, Decision outcome, verbatim` · full text: [ADR-0001](../adr/0001-render-the-landing-demo-card-as-a-standalone-replica-of-the-chat-draft-card.md)

> **Standalone replica** — a new presentational `DemoDraftCard` in `components/landing/landing-demo/`, built from the same `components/ui/` primitives (Card, Badge, Button, Separator) and tokens as the chat card, with fixed sample props; the chat is untouched.
>
> — `adr/0001, Considered options 1, verbatim`

> | success | … finished proposal card with Customer, one line, total + currency, Create shown unpressed, "Example" label … | NEW `DemoDraftCard` (`Card`, `Badge`, `Separator`, `buttonVariants` link "Create") |
>
> — `screens.md SCR-01, state success, abridged` · wireframe D in [screens.md](../screens.md)

```text
| Draft proposal                                  [Example]  |
| Customer      Acme Corp                                    |
| Design — 20 h × $50.00                          $1,000.00  |
| Total                                       $1,000.00 USD  |
|                                                 [ Create ] |
```
— `screens.md wireframe D, abridged`

> the card link and the Create link are two separate, non-nested links placed outside the `aria-hidden` layer (overlaid on the card), so they stay reachable at every phase
>
> — `sad.md §8, Accessibility, abridged` — **this task renders the visual card only** (it is placed inside the `aria-hidden` layer by T04); the two real links are T04's overlay. Export the card's visual and keep it free of focusable elements.

> **Hard rule:** The public landing page imports nothing from `components/ai/`
>
> — `adr/0001, Consequences Positive, verbatim`. Match the look of `components/ai/draft-card.tsx` (read it, `dt`/`dd` rows, `CARD_FRAME`) — never import it.

**Fallback:** read [ADR-0001](../adr/0001-render-the-landing-demo-card-as-a-standalone-replica-of-the-chat-draft-card.md), [screens.md](../screens.md) SCR-01. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-02 — happy path

> **Given** a Visitor whose device does not ask for reduced motion
> **When** at least half of the demo becomes visible on screen
> **Then** the Landing demo plays once per page view: a fixed example sentence appears in a chat box and turns into a draft proposal card showing a Customer, at least one invoice line, the total with its currency and a Create button that the demo does not press, laid out like the in-app chat's draft proposal card; the demo is labelled as an example, stops on that card, and offers a Replay control that plays it again from the start; scrolling away and back does not restart it
>
> — `spec.md §5, AC-02, verbatim` (this task: the card's content and layout)

### AC-03 — authorization

> **Given** a Visitor who is not signed in
> **When** they watch the Landing demo, replay it, or press anything inside it
> **Then** the demo shows only its fixed sample content, identical on every play; nothing they do on the landing page reaches the AI chat, creates a Conversation, uses a Daily message allowance or shows any Freelancer's data; and pressing the demo card or its Create button leads to the sign-in page, not to an invoice, at any moment of the demo; pressing Replay only replays the demo
>
> — `spec.md §5, AC-03, verbatim` (this task: fixed props only, no data import)

### AC-05 — domain invariant

> **Given** the Landing demo and every text on the landing page
> **When** a Visitor reads or watches them
> **Then** nothing shows or says that the AI issues, sends or emails an invoice, edits an issued invoice or creates a Customer, and no text promises unlimited use of the AI; the demo ends on a draft proposal whose Create button is not pressed, in line with the rule that an Assistant only prepares Draft invoices and a human issues every one
>
> — `spec.md §5, AC-05, verbatim`

## Checklist

- [ ] `components/landing/landing-demo/demo-draft-card.tsx`: props `LandingDemoSample`; renders title, Example `Badge`, Customer row, each line, `Separator`, total with currency, a Create **visual** styled by `buttonVariants` (a `span`, not a button/link — no pressed/loading state)
- [ ] No `'use client'` needed; no import from `components/ai/`, `sonner`, `next/navigation`, server actions
- [ ] `tests/component/landing-demo-draft-card.test.tsx`: renders sample from `landingContent.demo`; asserts Customer, line, total + currency, "Example", Create visible; card contains no focusable element; Create has no pressed/disabled/"created" state

## Edge cases

| Case | Behaviour |
|---|---|
| Long Customer or line description at 360 px | wraps (`break-words`), never widens the box |
| Dark theme | tokens only, no hard-coded colours |

## Definition of Done

- [ ] `tests/component/landing-demo-draft-card.test.tsx` passes
- [ ] grep: the file imports nothing from `components/ai/` or `app/**/actions`
- [ ] `tsc` + lint clean
