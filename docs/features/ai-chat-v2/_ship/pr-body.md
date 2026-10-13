## Summary

This PR is the second iteration of the in-app AI chat. It removes the friction around the first iteration's rules and keeps every rule: nothing is guessed, a draft exists only after **Create**, the Daily message allowance applies, and the AI never issues.

- **Choices as buttons.** When the draft action has to ask which Customer, bank account, product, sender profile or currency, the reply shows the options as buttons. The buttons are built in code from the draft action's own findings, never from model text. A press is an exact, counted message. A press that cannot be applied is turned down before the model sees it, and it is not counted.
- **New read questions** for the chat and MCP: sender profiles with bank accounts (last four digits only), products with prices and custom prices, and a Customer search that ignores look-alike letters.
- **Preview and issue in the chat.** A created draft opens in the editor's own preview, and **Issue invoice** asks for one confirmation, then issues through the editor's path and invoice-integrity rules. A draft that was saved again after the preview opened is never issued from that view.
- **A full-height AI workspace** with panes that scroll on their own, a grouped and searchable Conversation list, follow-to-latest, a greeting start screen and phone sheets.
- **Findable AI:** an "AI" navigation group, and on the dashboard a prompt box, the 3 latest Conversations and "Create invoice with AI".
- **Data notice:** the export and account deletion cover the new data, and the privacy page's AI section is updated. The wording waits for the owner's approval.

> **Stacked on #10 (`feat/ai-assistant`).** This branch is built on ai-assistant, which is not merged yet. Review and merge #10 first. When #10 is merged and its branch is deleted, GitHub moves this PR's base to `main` by itself; if the branch is kept, change the base by hand.

Spec: [`docs/features/ai-chat-v2/spec.md`](docs/features/ai-chat-v2/spec.md). Changelog: [`_ship/changelog.md`](docs/features/ai-chat-v2/_ship/changelog.md). Feature description: [`_ship/feature.md`](docs/features/ai-chat-v2/_ship/feature.md). Security review: [`_ship/security-review-2026-10-13.md`](docs/features/ai-chat-v2/_ship/security-review-2026-10-13.md).

## Owner decisions before merge

- [ ] **Privacy page AI section (T28, AC-35).** Approve the wording in `app/(public)/privacy/privacy-content.tsx` §11, and set the page's "Last updated" date. It still reads January 23, 2026 (`constants/public-pages-content.ts`). T28 stays in `review` until then.
- [ ] **Terms page (spec §8).** The check found no contradiction with the chat: §1 and §3 already make the Freelancer the issuer who checks all data. One gap was there before this feature: the terms §10 sub-processor table does not list Google Gemini through the Vercel AI Gateway, which the privacy page names. Decide whether to add it, then close the §8 question.
- [ ] **Real-model evaluation.** Run `pnpm eval:assistant` with the gateway key on preview. It was not run here because of the free-tier cost. It includes the new AC-05b, AC-05, AC-14 `many-studios`, AC-24 and pressed-record rows.
- [ ] **Load scenarios.** Run the read/issue load scenarios from the test plan before release: new reads ≤ 800 ms p95 at 20 profiles, 500 products and 2,000 Customers; preview ≤ 1.5 s; issue ≤ 2 s. They were not run here. The integration timing test covers the reads on one machine only.

## Acceptance criteria

- AC-01 — the chat lists sender profiles and their accounts, with the defaults marked and no full account number ✓
- AC-02 — a product's standard prices and a Customer's custom price, exactly as stored ✓
- AC-03 — a Customer saved with a Cyrillic letter and two spaces is found as "oohn doe" ✓
- AC-04 — a draft under another sender profile and its UAH account, both named as taken from the request ✓
- AC-05 — no matching Customer or product: said plainly, with a link to add one ✓
- AC-05b — a sender profile's name is never taken for a Customer; the chat explains the difference and asks ✓
- AC-06 — a read-only Personal key gets the same reads with ids and no full account number ✓
- AC-07 — the reads hold only the Freelancer's own records ✓
- AC-08 — two matching Customers become two buttons; a press continues to a card for the pressed one ✓
- AC-08b — one choice at a time: Customer first, then the USD account, then the card ✓
- AC-09 — buttons only from the draft action's findings, whatever the model writes ✓
- AC-10 — look-alike Customer names show their emails; the pressed one is used exactly ✓
- AC-11 — a press counts; with the allowance used up, a press is refused like a typed message and marks nothing ✓
- AC-12 — older replies' buttons are inactive and show the chosen one ✓
- AC-12b — a forged or outdated press never reaches the model, is not counted, and gets the same words ✓
- AC-13 — a reopened Conversation shows its choices; a press on a deleted account is turned down without counting ✓
- AC-14 — 12 matches: no buttons, the count, and a request for a more exact name ✓
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
- AC-29 — the dashboard prompt opens a new Conversation that is already running, counted once ✓
- AC-30 — the 3 latest Conversations, a link to all, and "Create invoice with AI" ✓
- AC-31 — an empty or too-long dashboard prompt is not sent ✓
- AC-32 — with the allowance used up, the dashboard says so and offers the editor ✓
- AC-33 — replies appear word by word; reopened replies are whole ✓
- AC-34 — the export includes choices, origins and start points; account deletion removes them ✓
- AC-35 — the privacy page's AI section (implemented; wording awaits owner approval — see above)
- AC-36 — a Visitor is sent to sign in; nothing is processed or counted ✓

## Design

- Spec: `docs/features/ai-chat-v2/spec.md` (+ `ux-flows.md`, `screens.md`)
- Architecture: `docs/features/ai-chat-v2/sad.md`
- Decisions: `docs/features/ai-chat-v2/adr/` (ADR-0001 … ADR-0009). The ai-assistant ADRs stay in force.
- Data model + migrations: `docs/features/ai-chat-v2/data-model.md` (`prisma/migrations/20261013100000_create_choice_offer` … `20261013104000_add_invoice_issued_from_chat`)
- API: `docs/features/ai-chat-v2/contracts/openapi.yaml` (`POST /api/chat` with `choice`, `origin` and `startedFrom`; MCP `list_sender_profiles`, `list_products` and `list_customers`) and `contracts/server-actions.md`
- Test plan: `docs/features/ai-chat-v2/test-plan.md`
- Review: `docs/features/ai-chat-v2/_review/review-2026-10-13.md` — **PASS** after 15 rounds; every finding was fixed

## Tasks (SDD-Task trailers)

All 32 tasks in `tasks.json`, T01 – T32, are committed with `SDD-Task` trailers (`git log --grep SDD-Task 9de5d62..HEAD`, 37 commits). T28 waits for the owner's wording approval. They cover:

- the pinned-turn spike and the migrations;
- the shared name fold and the three reads;
- the resolver delta, the offer builder, and the press check, claim and release;
- the chat route's press path and the press safety suite;
- the version-guarded issue, and the preview and issue actions;
- the Conversation summaries and the full-height workspace;
- the start screen, follow-to-latest, Offered choices UI, invoice-state store and preview panel;
- navigation, the dashboard, the export, the privacy page and the evaluation rows;
- two e2e suites and the T32 review fix.

The review fixes of rounds 1–13 are separate commits, listed by round in the review record.

## Verification

All runs below are at 47e6fea (HEAD f1c57ff + one e2e timing fix, see below), on macOS with Docker.

- **Unit:** 2902 passed, 8 failed. The 8 failures are all in `readme-works-as-written` and `required-settings`. They fail because `env.example` is deleted in the local working tree; that deletion is not part of this branch, and the file is present at HEAD.
- **Integration** (testcontainers Postgres, full suite): 151 files, **1472 passed / 60 skipped / 0 failed**.
- **E2E, full suite** (local production build, `CI=1 pnpm test:e2e`): **147 passed / 6 skipped / 0 failed**. The 6 skips are the 5 Linux-only screenshot tests and the opt-in PDF timing run.
- **E2E Linux baselines** (Chromium of `mcr.microsoft.com/playwright:v1.63.0-noble`, `PW_SNAPSHOT_PLATFORM=linux`, `-g baselines`, no update): **5 passed**. These are SCR-01/03, SCR-02/03/04, SCR-06/09 and the two editor layouts.
- **Lint:** 0 errors (the 4 warnings are in files outside this feature). **Typecheck:** clean.
- **E2E fix found by the ship run (47e6fea, test only):** the AC-18 check measured the docked composer during its intended 250 ms move. Under load it failed about 1 run in 5 (623–662 px mid-move, 719 px settled). The test now waits for the move to end; 10/10 repeats pass. Product behaviour is unchanged.
- **Security review** (spec §6.1): no finding at MEDIUM or above. There are two LOW findings and one informational one, all limited to the Freelancer's own data or analytics. See `_ship/security-review-2026-10-13.md`.
- **Ran the feature.** The dev database does not have this feature's five migrations, and it was not migrated. The app ran as a production build on :4311 against a throwaway Postgres (the e2e harness, all 42 migrations applied), with real HTTP and a real Chromium, and with the scripted stub model in place of Gemini. Observed:
  - **AC-08:** "invoice Acme for 20 hours at $50" with Acme Corp and Acme GmbH gave two buttons `['Acme Corp', 'Acme GmbH']`. Pressing "Acme GmbH" gave a Draft card whose Customer id is Acme GmbH's. The pressed message was stored with origin `PRESSED`.
  - **AC-11:** the typed message and the press counted 30 → 28 messages left. Create, Preview and Issue left it at 28 (AC-27).
  - **AC-12b:** a forged press (`choice.offerId` that does not exist) got `409 CHOICE_UNAVAILABLE` with "This option is no longer available. Choose again or type your request."
  - **AC-20:** Preview opened the panel at `/ai/{id}?preview={cardId}` with Issue in 46 ms.
  - **AC-23:** the dialog read "Issue invoice …-0001? Customer Acme GmbH, Total 1,000.00 USD, Once it's issued, its lines and amounts can no longer change." Issuing gave `PENDING`, kept the same invoice number and set `issuedFromChat = true`. The card and the panel showed Pending, and Issue was gone.
  - **AC-26b:** the draft was saved elsewhere (version + 1) after the preview opened, then confirmed. Result: still `DRAFT`, with "This draft was changed after you opened the preview. Check it and issue again." and a reload.
  - **AC-06 / AC-03:** a read-only Personal key over HTTP MCP. `list_sender_profiles`, `list_products` and `list_customers` all returned 200 with ids, and no response contained the seeded full account number. `list_customers` for "АCME" (Cyrillic А) matched both Acme Customers.
  - **AC-28:** the navigation shows "AI chat" and "Connect your AI".
  - **AC-29 / AC-34:** a prompt sent from the dashboard opened `/ai/{id}` with the message already sent. The Conversation is stored with `startedFrom = DASHBOARD_PROMPT` and the message origin `DASHBOARD`.
  - **AC-15:** the AI section has 0 px of page-level overflow at 1440 × 900.
  - **AC-36:** an anonymous `GET /ai` got 307 to `/login?callbackUrl=%2Fai`, and an anonymous `POST /api/chat` got 401.
- **Deferred:** replies from the real model (`pnpm eval:assistant`) and the load scenarios. Both are owner items above.

## Operational notes

- **Migrations:** five additive, idempotent migrations run with `prisma migrate deploy`. `20261013102000_backfill_conversation_message_origin` is a data step that sets `origin = 'TYPED'` on existing Freelancer messages. The down scripts are in `docs/features/ai-chat-v2/migrations/`; run them in reverse order (05 → 01). The dev database does not have them yet.
- **Settings, cron, services:** none new. The ai-assistant settings still apply.
- **Rollback:** redeploy the previous build. The new table and columns can stay. Down 05 drops the "issued from the chat" KPI history, and down 01 drops all stored Offered choices.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
