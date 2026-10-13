---
id: T34
title: "Port the PromptInput and Suggestion elements onto Base UI"
layer: "ui"
deps: []
blocks: ["T37", "T39"]
acs: ["AC-18", "AC-31"]
files_hint: ["components/ai-elements/prompt-input.tsx", "components/ai-elements/suggestion.tsx", "tests/component/ai-elements-prompt-input.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T34 — Port the PromptInput and Suggestion elements onto Base UI

Follow-up task of the presentation rewrite (owner decision 2026-10-13, [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)). Behaviour does not change; only presentation does.

## Place in the sequence

- **Blocked by:** — (starts at once; all earlier tasks are done)
- **Blocks:** T37 — Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips, T39 — Build the dashboard AI block prompt box on the PromptInput element
- **Wave:** 1 of the follow-up chain T33–T41 (longest dependency chain inside it).
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** a new Conversation to greet me with the message box in the middle and suggested requests
> **So that** I know what to ask before I type anything
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

It gives the empty state, the docked composer and the dashboard box one prompt card and one chip element.

## Screens

- SCR-02 `default`, `suggestion picked`; SCR-03 `waiting` (submit state); SCR-09 `default` (the elements only).

## Inlined context

> | `prompt-input.tsx` | `PromptInput`, `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSubmit` (status `ready` / `submitted` / `streaming` / `error`) | `InputGroup`, `Textarea`, `Button` | No attachments, screenshots, action menu, model select or `nanoid`. Enter sends and Shift+Enter adds a line, as today. |
> | `suggestion.tsx` | `Suggestions`, `Suggestion` | `Button` (outline, pill) | Wraps onto lines instead of a horizontal `ScrollArea`. |
>
> — `adr/0010, Decision outcome, «What is ported», abridged` · full text: [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)

> **Composer.** `PromptInput` is a card (`rounded-2xl border bg-background shadow-xs`): an auto-growing `PromptInputTextarea` (1–8 rows), then a `PromptInputFooter` with `PromptInputTools` on the left (the `AllowanceNotice` counter, `text-xs text-muted-foreground`) and a round `PromptInputSubmit` (`size-8 rounded-full`, arrow-up icon, `aria-label` "Send") on the right. `status` maps `ready` → arrow, `submitted`/`streaming` → disabled with a `Loader` (the chat sends no stop request; behaviour unchanged), `error` → arrow. The too-long `FieldError` and "{n} / 2,000" sit inside the footer above the tools.
>
> — `screens.md §Source, «Composer», verbatim` · full text: [screens.md](../screens.md)

> `PromptInput` is a `form` with `onSubmit(text)`; `PromptInputSubmit` takes `status: 'ready' | 'submitted' | 'streaming' | 'error'` and `disabled`; no attachments. `Composer` and the dashboard prompt box keep their validation and compose it … `Suggestion` `suggestion: string`, `onClick(suggestion)`, `rounded-full` outline `size="sm"`; `Suggestions` is a wrapping row
>
> — `screens.md §New components, abridged`

> **Hard rule — behaviour does not change.** Behaviour does not change: every state, AC, address, hand-off, allowance notice, breakpoint, the 48 px follow and reduced motion stay exactly as specified in the rows below.
>
> — `screens.md §Source, «Presentation revision», verbatim` · full text: [screens.md](../screens.md)

> **Hard rule — one primitive system, no new dependency.** Chosen: Option 3 [port the needed elements onto Base UI as our own set in `components/ai-elements/`] … It meets the owner's direction and keeps one primitive system and zero new runtime dependencies.
>
> — `adr/0010-…-onto-base-ui.md, Decision outcome, abridged` · full text: [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) · [ADR-0010](../adr/0010-build-the-ai-section-from-own-chat-elements-ported-from-vercel-ai-elements-onto-base-ui.md) · [sad.md](../sad.md) · [spec.md](../spec.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (The chat route, server actions and their copy are unchanged; the UI only re-renders their results.)

## Acceptance criteria

### AC-18 (US-05) — happy path

> **Given** a Freelancer who opens a new Conversation
> **When** the page appears, and then they send the first message
> **Then** they first see a greeting, the message box in the middle and suggested requests; after sending, the message box moves to the bottom with an animation and the reply appears above it. A Freelancer whose device asks for reduced motion sees the move without animation. Pressing a suggested request only fills the message box. A new Conversation left without a message is not saved and never appears in the Conversation list.
>
> — `spec.md §5, AC-18, verbatim` · full text: [spec.md](../spec.md)

### AC-31 (US-10) — error

> **Given** a Freelancer on the dashboard
> **When** they send an empty prompt, or one longer than the chat's message limit
> **Then** nothing is sent and no Conversation is created; the prompt box explains that a message is needed, or how long a message may be
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)


## Checklist

- [ ] Reference upstream `prompt-input.tsx` / `suggestion.tsx` at `6a9d5b1`; drop attachments, referenced sources, action menu, model select, `nanoid`
- [ ] RED: `tests/component/ai-elements-prompt-input.test.tsx` — Enter submits the text, Shift+Enter inserts a newline, IME composition does not submit, submit disabled for `submitted`/`streaming` with a `Loader`, the submit `aria-label` is overridable ("Send to AI" for the dashboard), `Suggestion` calls `onClick(text)` and submits nothing
- [ ] `prompt-input.tsx` on `components/ui/input-group`, `textarea`, `button`; auto-grow 1–8 rows (CSS `field-sizing` or measured; no new package)
- [ ] `suggestion.tsx` on `components/ui/button`
- [ ] Attribution header on both files (LICENSE/NOTICE are T33's)

## Edge cases

| Case | Behaviour |
|---|---|
| Empty or whitespace text on Enter | The element calls `onSubmit` only through the caller's validation; it never blocks the caller's error message (AC-31 stays the caller's) |
| Over 2,000 characters | The element keeps the text; the caller shows the `FieldError` in the footer slot |
| Status `streaming` | Submit disabled with `Loader`; no stop request is sent (behaviour unchanged) |

## Definition of Done

- [ ] components/ai-elements/prompt-input.tsx and suggestion.tsx export the ADR-0010 anatomy on InputGroup, Textarea and Button with the attribution header, PromptInputSubmit reflects ready/submitted/streaming/error, Enter submits and Shift+Enter adds a line, a Suggestion only reports its text, and component tests written first prove each.
- [ ] Every existing test that asserts an AC stays green and is **not weakened**. An assertion that pinned a superseded presentation detail (named in the checklist) is rewritten to the new manifest with an equal-or-stronger assertion, never deleted or skipped; each rewrite is listed in the commit body.
- [ ] `package.json` unchanged; no `@radix-ui` import.
- [ ] Every Hard Rule inlined above still holds.
- [ ] Gate: unit + component + integration (Docker up) + lint + typecheck green; commit with `SDD-Task` and the AC trailers.
