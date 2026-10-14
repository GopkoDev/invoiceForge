---
slug: ai-chat-v2
date: 2026-10-14
kind: consistency-pass
base: c5e417f7
reviewers: [sdd:critic (opus) over spec + sad + ADRs, sdd:reviewer (opus) over ux-flows + screens + spec + contracts vs code and tests]
---

# Consistency pass 2026-10-14 — docs ↔ docs and docs ↔ code

The 2026-10-14 fixes (`_fixes/2026-10-14-*.md`, T78–T84) only appended "Amended / Superseded" notes. This pass compared the docs with each other and with the code at `c5e417f7`, then rewrote the stale passages in place and fixed the code findings as T85–T89. The owner delegated every decision; the rule used was: the owner's fix-record wishes win, otherwise the simpler and safer option.

## Findings and decisions

Classes: DOC-STALE (code right, doc wrong), CODE-BUG (doc right, code wrong), BOTH-DEFENSIBLE (decided below), GAP (a decision recorded only in a fix note).

| # | Finding | Class | Decision | Fixed by |
|---|---|---|---|---|
| C1 | spec F1/F2/F5/F8/F9, Goals, US-03 and the bodies of AC-08b, 10–13, 38–40 still describe the 2026-10-13 form (all questions together, field headings, Send, read-only history forms) | DOC-STALE | rewrite in place to the AC-55/56 model | 099a2be9 |
| C2 | AC-54 says "Other…", AC-55 and the code say "Something else" | DOC-CONFLICT | "Something else" | 099a2be9 |
| C3 | Dashboard AI block and prompt handoff removed (T80) but ADR-0009 Accepted; sad.md, ux-flows US-10, screens SCR-02/SCR-09, server-actions `?handoff`, design-system, test-plan still describe them | DOC-STALE | ADR-0009 Superseded (pointer to the fix record); rewrite or remove the passages | 099a2be9 |
| C4 | Server-filled record options (ADR-0011 amendment) cover the fallback form and resolver issues without candidates; spec F3 still says "inputs only" and AC-54 only names the no-recordIds case | GAP | widen F3 and AC-54 to the ADR's three sources | 099a2be9 |
| C5 | The request schema still accepts `origin: DASHBOARD` / `startedFrom: DASHBOARD_PROMPT`; spec says only "readable for history", openapi says "accepted" | BOTH-DEFENSIBLE | refuse on request (safer, no client writes them); keep DB enums and reads for history | T85 6d724a96 |
| C6 | sad.md §5 Question form, Critical flows 4 and 5, §8 accessibility row lag ADR-0011 as amended (heading, no `detail`, Send, inputs-only fallback) | DOC-STALE | rewrite in place | 099a2be9 |
| C7 | Hide-while-sending (T84) recorded only in AC-55's note; screens "sending" row, design-system QuestionForm/ChatIsland rows stale; AC-55 note omits 429 | DOC-STALE | rewrite the dock states; "any refused or failed send" | 099a2be9 |
| C8 | test-plan has no AC-54/55/56 rows; rows still expect read-only forms and Send disabled; rows point at deleted dashboard tests | DOC-STALE | add rows mapped to the existing tests; retire the removed ones | 099a2be9 |
| C9 | Export: code writes 2.4 without `heading` (never shipped, no bump needed); the export schema still allows `heading` and the fixture sends it; docs and a test header say 2.3 | BOTH-DEFENSIBLE + DOC-STALE | drop `heading` from the schema and fixture; 2.3 → 2.4 in docs | T89 72fbb039 + 099a2be9 |
| C10 | `QuestionForm` `pending` / "Sending…" state unused (chat passes `pending={false}`) | CODE (dead) | remove | T86 c2203527 |
| C11 | The dock's blur effect is redundant (the form renders nothing while in flight) | CODE (redundant) | remove the effect, keep `hidden` | T86 c2203527 |
| C12 | Dock tests `if (q) expect(q).not.toBeVisible()` pass trivially | test weakness | assert unconditionally | T88 b0337448 |
| C13 | screens says legacy offers render via the same component and pressed ones read "answered"; code renders nothing for a history offer and a PRESSED message is a plain bubble; no component test of v1 history | DOC-STALE + test gap | doc the real behaviour; add the test | T88 b0337448 + 099a2be9 |
| C14 | `message-list.tsx` renders an empty `<div>` for every `data-offer` part (extra gap); unused `renderOffer` | CODE-BUG (cosmetic) | render nothing, remove the prop | T88 b0337448 |
| C15 | Unit suffix (currency, "%") removed in T79 though screens and openapi `currency` still describe it | BOTH-DEFENSIBLE | restore the suffix (a bare "40" is ambiguous) | T86 c2203527 |
| C16 | A failed `loadConversationCards` leaves the dock skeleton forever | CODE-BUG | inline error with Try again | T87 6fe94335 |
| C17 | × only hides for the page view and drops focus to `<body>` | BOTH-DEFENSIBLE | focus the Message box after ×; document × as per page view (a reload brings the open form back) | T86 c2203527 + 099a2be9 |
| C18 | An 8-option dock at `max-h-[50dvh]` leaves ~18 px for messages at 360×640 | BOTH-DEFENSIBLE | `max-h-[40dvh]` below `md` | T86 c2203527 |
| C19 | AC-39 and the SCR-04 wireframe use "Yesterday · 12 Oct 2026"; AC-56 moved dates to the app format ("Today · Oct 14, 2026") | DOC-STALE | rewrite | 099a2be9 |
| C20 | screens SCR-03 still talks of `offers`, presses and `{offerId, optionId}` | DOC-STALE | rewrite to forms | 099a2be9 |
| C21 | `_fixes/2026-10-14-question-form-ux.md` names pre-rebase hashes | DOC-STALE | replace with the branch hashes | 099a2be9 |
| C22 | The privacy page still lists "options the chat offered as buttons" and "prompts you send from the dashboard" among stored data | BOTH-DEFENSIBLE | keep: rows of both kinds stay stored for history until their Conversation expires, so the disclosure is still true; the wording is owner-gated (T28) | — |

Focus areas found clean by the reviewer: failed sends (400 / 409 / 429 / network / could-not-complete) bring the dock back with picks kept; reload re-docks an open form; switching Conversations cannot leak a form (per-page `ChatSession`); there is no Stop control; focus after reply or failure lands on the Message box; labels, `role="alert"` and `aria-live` are in place.
