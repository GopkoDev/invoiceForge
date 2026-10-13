---
id: T73
title: "Render Freelancer messages as plain pre-wrapped text, keep single line breaks in replies, trim the Markdown subset to ADR-0012 and fix stale plain-text docs (review R20-2, R20-8, R20-10)"
layer: "ui"
deps: ["T62"]
blocks: []
acs: ["AC-08", "AC-37", "AC-42", "AC-43"]
files_hint: ["components/ai-elements/message.tsx", "components/ai/message-list.tsx", "components/ai-elements/NOTICE", "docs/features/ai-chat-v2/adr/0012-render-replies-as-safe-markdown-with-react-markdown-and-an-in-app-link-allowlist.md", "docs/features/ai-chat-v2/screens.md", "docs/design-system.md", "tests/component/message-response-markdown.test.tsx", "tests/component/ai-conversation-page.test.tsx", "tests/e2e/ai-chat-v2-forms-layout.spec.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T73 — Render Freelancer messages as plain pre-wrapped text, keep single line breaks in replies, trim the Markdown subset to ADR-0012 and fix stale plain-text docs (review R20-2, R20-8, R20-10)

Follow-up task from review 2026-10-13, round 20. Source: [`_review/review-2026-10-13.md`](../_review/review-2026-10-13.md).

## Problem

MessageList renders user parts through the Markdown MessageResponse (message-list.tsx:44-45, message.tsx:257-283) and `whitespace-pre-wrap` was removed, so a sent form's composed lines ("Customer: Acme GmbH\nLine 1 · Price: 40") run together on one line against F5 "one line per answered question"; Shift+Enter breaks are lost; typed "# x" / "1. foo" become a heading or a list. Tests check only textContent (ai-conversation-page.test.tsx:209-212; forms-layout e2e :244-246 matches with \s+). ALLOWED_ELEMENTS (message.tsx:156-172) adds h1–h6 and input outside ADR-0012's subset; ADR-0012 still describes skipHtml/closeUnfinished instead of the implemented HTML-as-text and empty-mark handling. message-list.tsx:27-28 and screens.md:40,:214 still say MessageResponse renders plain text, never Markdown.

## Definition of Done

- Freelancer (user) message parts render as plain text with whitespace-pre-wrap (no Markdown); assistant replies stay Markdown per ADR-0012 and a single newline inside a reply paragraph shows as a line break (whitespace-pre-line on p or equivalent, no new dependency unless needed).
- A component test asserts the visible line structure of a sent form bubble (two composed lines render on two lines: pre-wrap class plus the newline kept in the text node), that typed "# x" in a user bubble renders no heading, and that a reply with a single newline keeps the break; the e2e at ai-chat-v2-forms-layout.spec.ts:244-246 asserts the lines (innerText split on \n), not \s+.
- h1–h6 and input are removed from ALLOWED_ELEMENTS (their text stays via unwrapDisallowed); a test asserts '# Title' and '- [ ] x' in a reply render no heading and no input.
- ADR-0012 text describes HTML-as-text and empty-mark suppression and that user messages stay plain text; message-list.tsx comment, screens.md:40,:214, design-system.md MessageResponse entry and the NOTICE agree.
- RED first. Gate: unit, lint, typecheck; affected e2e (chromium) and the Linux baselines touched by bubbles/replies re-checked.
- Commit with `SDD-Task: T73` and one `SDD-AC` trailer per AC.
