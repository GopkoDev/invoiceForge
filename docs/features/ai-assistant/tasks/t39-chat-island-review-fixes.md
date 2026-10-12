---
id: T39
title: "Fix the chat island: real 429 body, late data-conversation, one announcement per reply, scroll to newest"
layer: "ui"
deps: ["T33"]
blocks: []
acs: ["AC-10", "AC-10b", "AC-11", "AC-35"]
files_hint: ["components/ai/chat-island.tsx", "components/ai/message-list.tsx", "tests/component/ai-chat-island.test.tsx", "tests/component/ai-conversation-page.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
origin: "review-2026-10-12"
---

# T39 — Fix the chat island: real 429 body, late data-conversation, one announcement per reply, scroll to newest

Follow-up task from the independent review ([../_review/review-2026-10-12.md](../_review/review-2026-10-12.md)). Findings: R-01, R-02, R-22, R-23 — read each finding's row there (file:line, problem, suggested fix) and the cited artifacts; the source artifact always wins over this summary.

## Acceptance

Covers AC-10, AC-10b, AC-11, AC-35 — verbatim text in [spec.md §5](../spec.md); screen states in [screens.md](../screens.md); contracts in [contracts/](../contracts/).

## Definition of Done

On a contract 429 the island shows used-up and disables the composer; a failed first message shows the could-not-complete/ai-unavailable alert, keeps /ai and retries with no conversationId; the id is adopted only from the late data-conversation; the finished reply is announced once via a separate live region; the list scrolls to the newest message on load and while streaming.

Each finding pinned by a test that was red before the fix. Gate: unit + integration + lint + typecheck clean. Commit trailers `SDD-Task: T39`, one `SDD-AC` per AC, one `SDD-Review: R-xx` per finding. Append the resolution line per finding to the review record's Resolution log.
