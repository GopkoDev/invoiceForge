## Summary

This PR is the second iteration of the in-app AI chat. It removes the friction around the first iteration's rules and keeps every rule: nothing is guessed, a draft exists only after **Create**, the Daily message allowance applies, and the AI never issues.

- **One Question form per reply.** When the chat needs something, the reply ends with one form of up to 6 questions (records, currency, dates, values, free questions), shown above the composer one question at a time (numbered rows, pager, keyboard), the last answer sending all answers and hiding the form while the reply is written (it returns with the answers on a failed send, fix 2026-10-14). Questions are never asked in prose. A record question the chat asked without records is filled by the server from the Freelancer's own records (fix 2026-10-14). The options are records that the server loaded for this Freelancer, owner-scoped and by kind, whether they come from the draft action or from the chat's new `ask_user` tool. The answers go as one counted message whose text the server builds. The server applies the answers exactly and runs the draft action itself. A form that cannot be applied is turned down before the model, is not counted, and always gets the same words. `form` replaces the earlier `choice` field (ADR-0011).
- **Formatted replies** with `react-markdown`: lists, tables, bold and code. Only links to the app's own pages stay links, and HTML shows as text (ADR-0012).
- **A chat that drafts instead of interrogating:** it knows today and the time zone, searches before it says a record is missing, links invoices, and `search_invoices` filters by the day created.
- **New read questions** for the chat and MCP: sender profiles with bank accounts (last four digits only), products with prices and custom prices, and a Customer search that ignores look-alike letters.
- **Preview and issue in the chat.** A created draft opens in the editor's own preview. **Issue invoice** asks for one confirmation, then issues through the editor's path and invoice-integrity rules. A draft that was saved again after the preview opened is never issued from that view.
- **A full-height AI workspace** built from our own chat elements, ported from Vercel AI Elements onto Base UI (ADR-0010). It has panes that scroll on their own, a grouped and searchable Conversation list that stays mounted when you switch (ADR-0013), follow-to-latest, a greeting start screen (its accent words and message box styled like the Terms page, fix 2026-10-14), placeholders that do not move, and phone sheets.
- **Findable AI:** an "AI" navigation group and "Create invoice with AI" on the dashboard. The dashboard AI block and its prompt handoff were removed by the owner (2026-10-14); a chat request carrying the dashboard prompt origin is now refused (T85), stored rows stay readable.
- **Docs/code consistency pass (2026-10-14):** the feature docs were rewritten in place to the current behaviour (ADR-0009 superseded, ADR-0011 consolidated, AC-54..56 in the test plan), and follow-ups T85–T89 fixed what it found: the unused form sending state removed, the price/discount/rate unit restored, a phone-sized dock cap, focus after ×, an error with Try again when a form cannot load, no empty gap under a reply with a form, and the export schema refusing the dropped question heading. Record: [`_review/consistency-2026-10-14.md`](docs/features/ai-chat-v2/_review/consistency-2026-10-14.md).
- **Data notice:** the export (v2.4) and account deletion cover the forms and answers, and the privacy page's AI section is updated. The wording waits for the owner's approval.

> **Stacked on #10 (`feat/ai-assistant`).** This branch is built on ai-assistant, which is not merged yet. Review and merge #10 first. When #10 is merged and its branch is deleted, GitHub moves this PR's base to `main` by itself; if the branch is kept, change the base by hand.

Spec: [`docs/features/ai-chat-v2/spec.md`](docs/features/ai-chat-v2/spec.md). Changelog: [`_ship/changelog.md`](docs/features/ai-chat-v2/_ship/changelog.md). Feature description: [`_ship/feature.md`](docs/features/ai-chat-v2/_ship/feature.md). Security reviews: [`_ship/security-review-2026-10-14.md`](docs/features/ai-chat-v2/_ship/security-review-2026-10-14.md) (presentation rewrite and owner-feedback revision) and [`_ship/security-review-2026-10-13.md`](docs/features/ai-chat-v2/_ship/security-review-2026-10-13.md) (first build).

## Owner decisions before merge

- [ ] **Privacy page AI section (T28, AC-35).** Approve the wording in `app/(public)/privacy/privacy-content.tsx` §11 (it now names Question forms and their answers), and set the page's "Last updated" date. It still reads January 23, 2026 (`constants/public-pages-content.ts`). T28 stays in `review` until then.
- [ ] **Terms page (spec §8).** The check found no contradiction with the chat: §1 and §3 already make the Freelancer the issuer who checks all data. One gap was there before this feature: the terms §10 sub-processor table does not list Google Gemini through the Vercel AI Gateway, which the privacy page names. Decide whether to add it, then close the §8 question.
- [ ] **Real-model evaluation.** Run `pnpm eval:assistant` with the gateway key on preview. It was not run here because of the free-tier cost. It includes the AC-05b, AC-14 `many-studios` and AC-24 rows and the new form rows `form-not-prose-uk`/`-en`, `single-profile-not-asked`, `yesterday-date`, `search-before-add`, `link-to-draft` and `last-draft-january` (AC-37, AC-45 – AC-49).
- [ ] **Load scenarios.** Run the read/issue load scenarios from the test plan before release: new reads ≤ 800 ms p95 at 20 profiles, 500 products and 2,000 Customers; preview ≤ 1.5 s; issue ≤ 2 s. They were not run here. The integration timing test covers the reads on one machine only.
- [ ] **Whole-workspace hard-load skeleton** (review owner item). The chat-pane skeletons hold AC-51. A placeholder for the whole workspace on a hard load needs a protected-route loading boundary, which is outside this feature.
- [ ] **Optional security follow-ups** (none blocks merge): SEC-I-02 (a free-question form skips the off-topic router), SEC-L-01 (`issueFromPreview` can flag the Freelancer's own non-chat draft as issued from the chat). See the 2026-10-14 security review.

## Acceptance criteria

- AC-01 — the chat lists sender profiles and their accounts, with the defaults marked and no full account number ✓
- AC-02 — a product's standard prices and a Customer's custom price, exactly as stored ✓
- AC-03 — a Customer saved with a Cyrillic letter and two spaces is found as "oohn doe" ✓
- AC-04 — a draft under another sender profile and its UAH account, both named as taken from the request ✓
- AC-05 — no matching Customer or product: said plainly, with a link to add one ✓
- AC-05b — a sender profile's name is never taken for a Customer; the chat explains the difference and asks ✓
- AC-06 — a read-only Personal key gets the same reads with ids and no full account number ✓
- AC-07 — the reads hold only the Freelancer's own records ✓
- AC-08 — two matching Customers become a form question with both and "Other…"; Send posts "Customer: Acme GmbH" and the card is for Acme GmbH ✓
- AC-08b — the Customer and the bank account in one form; Send waits for both; one Send gives the card and counts once ✓
- AC-09 — options only from records the server checked, whatever the model writes or names by id ✓
- AC-10 — look-alike Customer options show their emails; the picked one is used exactly ✓
- AC-11 — one Send counts once; with the allowance used up, a Send is refused like a typed message and marks nothing ✓
- AC-12 — older forms are read-only and show the answers that were sent ✓
- AC-12b — a forged, outdated or foreign form Send never reaches the model, is not counted, and gets the same words ✓
- AC-13 — a reopened Conversation shows its sent form read-only; the latest unsent form turns down a deleted account without counting ✓
- AC-14 — 12 matches: an input-only question with the count and a request for a more exact name ✓
- AC-15 — only the panes scroll; the page never does; the message box stays visible ✓
- AC-16 — follow new text within 48 px; "Jump to latest" after scrolling up ✓
- AC-17 — Today / Yesterday / Previous 7 days / Older, a look-alike-aware search and New chat ✓
- AC-18 — the greeting start, the composer move (none under reduced motion), suggestions only fill, empty Conversations are not saved ✓
- AC-19 — the phone layout: list sheet, full-screen preview sheet ✓
- AC-20 — Preview opens the editor's preview with "Open in editor" and Issue ✓
- AC-21 — a deleted draft's preview says it is no longer available, with no Issue ✓
- AC-22 — another Freelancer's preview is "can't be found" ✓
- AC-23 — issue after one confirmation through the editor's path; the number is kept; card, preview and links show issued ✓
- AC-24 — "issue it" in words still only points to the preview or editor ✓
- AC-25 — an invoice-integrity rule blocks with the editor's message; "Open in editor" ✓
- AC-26 — already issued in another tab: nothing issued again ✓
- AC-26b — changed in another tab: the preview reloads and must be confirmed again ✓
- AC-27 — issuing works with the allowance used up ✓
- AC-28 — the "AI" navigation group with "AI chat" and "Connect your AI" ✓
- AC-29 — removed by the owner 2026-10-14 (dashboard AI block)
- AC-30 — the 3 latest Conversations, a link to all, and "Create invoice with AI" ✓
- AC-31 — removed by the owner 2026-10-14
- AC-32 — removed by the owner 2026-10-14
- AC-54 — record questions are filled from the Freelancer's own records ✓ (fix 2026-10-14)
- AC-55 — one question at a time above the composer ✓ (fix 2026-10-14)
- AC-56 — no field headings, English chrome, app date/amount formats ✓ (fix 2026-10-14)
- AC-33 — replies appear word by word; reopened replies are whole ✓
- AC-34 — the export includes forms with their answers, choices, origins and start points; account deletion removes them ✓
- AC-35 — the privacy page's AI section (implemented; wording awaits owner approval — see above)
- AC-36 — a Visitor is sent to sign in; nothing is processed or counted ✓
- AC-37 — a list of Customers plus one form (Customer, Line 1 · Price), no questions in prose; one Send gives the card ✓ (real-model behaviour: eval rows)
- AC-38 — an "Other…" name is matched as words; "forty" or "-5" is stopped in the form ✓
- AC-39 — "Yesterday · 12 Oct 2026" and "14 days after the issue date" give 12 and 26 October ✓
- AC-40 — a typed message instead of Send closes the form with no answers saved ✓
- AC-41 — a card turn has no form; never two forms in a reply ✓
- AC-42 — lists, tables and bold render, streamed and reopened alike; an invoice link opens the editor ✓
- AC-43 — HTML shows as text; an outside link is plain text ✓
- AC-44 — an unclosed mark streams as typed and becomes bold; never an empty element ✓
- AC-45 — the turn tells the model today, the weekday and the time zone ✓ ("dated yesterday" end to end: eval row)
- AC-46 — a create request with missing values gets a card or a form, never prose ✓ (eval rows)
- AC-47 — the chat searches before it says a record is missing ✓ (eval row)
- AC-48 — search rows carry the in-app path; the chat links a draft ✓ (eval row)
- AC-49 — `search_invoices` filters and sorts by the day created ✓ ("last draft created in January": eval row)
- AC-50 — the list's top row and the chat header end on one line at 768 and 1440 px ✓
- AC-51 — placeholders have the size and place of the content; layout shift ≤ 0.01 ✓
- AC-52 — a switch reads no list, keeps the same list node, its scroll, search and rows ✓
- AC-53 — the avatar is level with the first line, for one-line and five-line replies ✓


## Design

- Spec: `docs/features/ai-chat-v2/spec.md` (+ `ux-flows.md`, `screens.md`), including the owner-feedback revision F1–F13
- Architecture: `docs/features/ai-chat-v2/sad.md`
- Decisions: `docs/features/ai-chat-v2/adr/` (ADR-0001 … ADR-0013). The ai-assistant ADRs stay in force; ADR-0012 supersedes ai-assistant AC-07's plain-text rendering for the in-app chat only.
- Data model + migrations: `docs/features/ai-chat-v2/data-model.md` (`prisma/migrations/20261013100000_create_choice_offer` … `20261013107000_backfill_choice_offer_questions`)
- API: `docs/features/ai-chat-v2/contracts/openapi.yaml` 0.3.0 (`POST /api/chat` with `form`, `origin` and `startedFrom`; the chat-only `ask_user` tool; the `search_invoices` additions; MCP `list_sender_profiles`, `list_products` and `list_customers`) and `contracts/server-actions.md`
- Test plan: `docs/features/ai-chat-v2/test-plan.md`
- Review: `docs/features/ai-chat-v2/_review/review-2026-10-13.md` — **PASS** after 22 rounds (first build 1–15, presentation rewrite 16–19, owner-feedback revision 20–22); every finding was fixed, none deferred

## Tasks (SDD-Task trailers)

The 77 tasks in `tasks.json`, T01 – T77, are committed with `SDD-Task` trailers (`git log --grep SDD-Task 9de5d62..HEAD`, 85 commits). T28 waits for the owner's wording approval. They cover:

- T01 – T32, the first build: the pinned-turn spike and migrations 01–05, the shared name fold and the three reads, the resolver delta and the offer row, the chat route's press path, the version-guarded issue with the preview and issue actions, the Conversation summaries and the full-height workspace, navigation, the dashboard, the export, the privacy page, the evaluation rows and the e2e suites;
- T33 – T49, the presentation rewrite: the ported chat elements (Conversation, Message, PromptInput, Suggestion, Loader) with their Apache-2.0 LICENSE and NOTICE, the restyled workspace, and the review fixes of rounds 16–18;
- T50 – T69, the owner-feedback revision: migrations 06–08, the form schemas, `formFromIssues`/`ask_user`/`composeForm`, `checkForm`/claim/pin and the route's form path, the Question form UI, the Markdown renderer and link allowlist, the date and time-zone note, the `search_invoices` additions, the mounted Conversation list, the aligned header, the skeletons and avatars, the export v2.4, and the e2e and visual updates;
- T70 – T77, the fixes of review rounds 20–21.

The review fixes of rounds 1–13 are separate commits, listed by round in the review record.

## Verification

The gate below ran at 0268b7bf (after the 2026-10-14 consistency pass, T85–T89); the later commits only retake one Linux baseline. All runs are on macOS with Docker.

| Gate | Result |
|---|---|
| Unit (`vitest.config.ts`) | 299 files, **3317 passed**, 0 failed |
| Integration (testcontainers Postgres, full suite) | 156 files, **1617 passed / 61 skipped / 0 failed** |
| Lint | 0 errors (4 warnings, in files outside this feature) |
| Typecheck (`tsc --noEmit`) | clean |
| E2E, full suite (local production build, `CI=1 pnpm test:e2e`, caffeinate) | **159 passed / 7 skipped / 0 failed**. The skips are the Linux-only screenshot tests and the opt-in PDF timing run |
| Linux baselines (Chromium of `mcr.microsoft.com/playwright:v1.63.0-noble`, `PW_SNAPSHOT_PLATFORM=linux`) | the 5 visual specs pass (29 tests); `ai-v2-question-form-sent` retaken on purpose (T88 removed the empty gap under a reply with a form) |

**The feature ran for real.** The e2e suite runs the app as a production build against a throwaway Postgres with all migrations, with real HTTP and a real Chromium, and with the scripted stub model in place of Gemini. The dev database was not touched. The checks of the revision that it observed:
- **AC-08b:** a form held a Customer question and a bank-account question, and Send stayed disabled until both had an answer. One Send gave the card and took exactly one message from the allowance.
- **AC-37 / AC-38:** in one Send, an "Other…" Customer name, a typed price and a Skip counted one message and showed one line per answer, then the card.
- **AC-40:** with two of three questions answered, a typed message was sent instead. The form closed with no answer, and the picks were not saved.
- **AC-13:** a reopened Conversation showed the sent form read-only, with three accounts and the typed price. The latest unsent form turned down an account deleted since, with no count.
- **AC-42 / AC-43:** a saved reply showed its list, bold and table. The in-app link opened the invoice in the editor, and the outside link was inert text.
- **AC-50 – AC-53:**
  - The list's top row and the chat header ended on one line at 768 and 1440 px.
  - With a delayed server, the placeholders matched the content, and the layout shift was 0.01 or less.
  - A switch made 0 list requests and kept the same list node, its scroll and its search.
  - The avatars were level with the first line.
- **AC-20 / AC-23, AC-29, AC-15, AC-18, AC-19, AC-33** stayed green in the same run: preview and issue, the dashboard prompt, the panes, the start screen, the phone sheets and word-by-word replies.
- The manual first-build run at 47e6fea, against the same harness, also observed these: AC-12b's forged id gets the 409; AC-26b's outdated preview is not issued; AC-06/AC-03 MCP reads never return the full account number; AC-36 sends a Visitor to sign in.

**Security review** (spec §6.1, clean context, read only) of the presentation rewrite and the owner-feedback revision: no finding at MEDIUM or above. There is one informational finding (SEC-I-02), and two low findings carry over from the first review (SEC-L-01 unchanged, SEC-L-02 narrower). All of them are limited to the Freelancer's own data or analytics. See `_ship/security-review-2026-10-14.md`.

**Deferred:** replies from the real model (`pnpm eval:assistant`, which also confirms the model-behaviour parts of AC-37 and AC-45 – AC-49) and the load scenarios. Both are owner items above.

## Operational notes

- **Migrations:** eight additive, idempotent migrations run with `prisma migrate deploy`. There are two data steps:
  - `20261013102000_backfill_conversation_message_origin` sets `origin = 'TYPED'` on existing Freelancer messages;
  - `20261013107000_backfill_choice_offer_questions` turns earlier offer rows into one-question forms. Production has no such rows.

  `20261013105000_add_form_enum_values` only adds enum values, in a migration of its own. The down scripts are in `docs/features/ai-chat-v2/migrations/`; run them in reverse order (08 → 01). The dev database does not have the migrations yet.
- **New dependencies:** `react-markdown` 10.1.0 and `remark-gfm` 4.0.1 (runtime, exact pins), and `axe-core` 4.13.0 (dev, exact pin).
- **Settings, cron, services:** none new. The ai-assistant settings still apply.
- **Rollback:** redeploy the previous build. The new table and columns can stay. Down 06 deletes the forms and maps the `FORM` messages back to `TYPED`. Down 05 drops the "issued from the chat" KPI history. Down 01 drops all stored forms and Offered choices.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

