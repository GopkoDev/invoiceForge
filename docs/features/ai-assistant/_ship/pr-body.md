## Summary

This PR adds an **AI chat inside Invoice Forge** for Freelancers who have no AI client of their own. It works right after sign-in, with nothing to set up. The chat:

- answers questions about the Freelancer's own data through the seven read questions MCP already has, so every figure equals the dashboard;
- turns one sentence ("invoice Acme for 20 hours of consulting at $50") into a **draft card**. Every value comes from the request or the editor's defaults, and every default is named. Anything ambiguous or missing is asked, never guessed. The Draft invoice exists only after the Freelancer presses **Create**;
- gives short "where is this in the app" help, and refuses everything else in one sentence.

Spend is bounded by an honest **Daily message allowance** (30 a day). Conversations are saved, can be deleted, and are deleted automatically 90 days after their last message. The same draft action ships to **MCP** as `create_draft_invoice`, behind a **Draft permission** that only a new Personal key can carry, with 50 drafts per key per day and safe repeats.

Spec: [`docs/features/ai-assistant/spec.md`](docs/features/ai-assistant/spec.md). Changelog: [`_ship/changelog.md`](docs/features/ai-assistant/_ship/changelog.md). Security review: [`_ship/security-review-2026-10-12.md`](docs/features/ai-assistant/_ship/security-review-2026-10-12.md).

## Acceptance criteria

- AC-01 — the AI section opens ready to use, with examples, messages left and a link to connect your own AI client ✓
- AC-02 — Debtors and overdue totals per currency equal the dashboard ✓
- AC-03 — one invoice by number, with a link that opens it ✓
- AC-04 — a partial list is called partial, with the total count; no total from a partial list ✓
- AC-05 — the same overdue rule and the same "today" as the dashboard (Kyiv) ✓
- AC-06 — an off-topic question gets a one-sentence refusal and counts ✓
- AC-06b — a mixed message gets the draft card plus a one-sentence refusal, counted once, not as off-topic ✓
- AC-07 — "where do I change the logo" links to the sender profiles; only real pages are linked ✓
- AC-08 — "how much did Acme pay this year" is answered from a read question, never added up by the model ✓
- AC-09 — 18 used + 1 → 11 left ✓
- AC-10 — a used-up allowance refuses the message and names the renewal time in the Freelancer's zone ✓
- AC-10b — two tabs sending the last message at once: exactly one is processed ✓
- AC-11 — a system-side failure says so, invites a retry, and does not count ✓
- AC-11b — a question past the 8-step cap gets a partial answer, says so, and counts ✓
- AC-11c — Create works with no messages left ✓
- AC-12 — the draft card: Customer, 20 × 50.00 USD, named defaults, today + 30 days, no tax/discount/shipping, number on creation ✓
- AC-13 — Create makes exactly the card's Draft invoice and links to it; nothing is issued or sent ✓
- AC-14 — a second Create, or a reconnect repeat, creates nothing and links to the first draft ✓
- AC-14b — a replaced card cannot create and points to the newer card ✓
- AC-15 — text stored in the Freelancer's data never produces a card ✓
- AC-16 — no price named → the Customer's custom price, named as the source ✓
- AC-16b — a named price wins (catalogue price shown beside it); a different currency gives a free-text line and a question ✓
- AC-17 — no sender profile or bank account → explained with a link, no card; MCP is refused the same way ✓
- AC-18 — an outdated card is rebuilt and must be confirmed again ✓
- AC-19 — "600 EUR" uses the EUR bank account and names quantity 1 and unit "item" as defaults ✓
- AC-19b — a named bank account in another currency is never used; the chat says why and links to adding an account (added by fix 2026-10-12) ✓
- AC-20 — two matching Customers → the chat asks which, naming both ✓
- AC-21 — no matching Customer → a link to add one; no Customer is created ✓
- AC-22 — a line without an amount → the chat asks for quantity and price ✓
- AC-23 — Assistant drafts are marked (chat or key name at creation); the mark goes away on issue ✓
- AC-24 — "send it" / "issue it" → only the Freelancer can, with a link; the draft stays a draft ✓
- AC-25 — a new key can be created with Draft permission and is listed as able to create drafts ✓
- AC-26 — an existing key can never gain Draft permission; the page explains how to get one ✓
- AC-27 — the 51st draft of the day is refused with how to lift the limit; reading keeps working ✓
- AC-28 — the Freelancer can lift a reached limit by 50 for today, repeatedly ✓
- AC-29 — a read-only key is refused and nothing is created ✓
- AC-30 — a Draft-permission key creates the draft with the editor's defaults, listing each one ✓
- AC-31 — ambiguous or missing values are refused, naming what to ask; nothing is created ✓
- AC-32 — a repeat within 24 h returns the first draft; the same mark with other content is refused ✓
- AC-33 — "Create with AI" on the invoice list opens a Conversation ready to draft ✓
- AC-34 — with no messages left, "Create with AI" says so up front and links to the editor ✓
- AC-35 — Conversations are listed newest first, reopen in full and can be continued ✓
- AC-36 — a reopened Conversation shows the draft's current state (issued or gone) ✓
- AC-37 — deleting one or all Conversations leaves every draft as it was ✓
- AC-38 — Conversations are deleted 90 days after their last message, and the list says so ✓
- AC-39 — the export includes Conversations; account deletion removes them ✓
- AC-40 — another Freelancer's Customer is answered as if it did not exist ✓
- AC-41 — another Freelancer's Conversation link is "can't be found", like a missing one ✓
- AC-42 — a Visitor is sent to sign in; nothing is processed or counted ✓

## Design

- Spec: `docs/features/ai-assistant/spec.md` (+ `ux-flows.md`, `screens.md`)
- Architecture: `docs/features/ai-assistant/sad.md`
- Decisions: `docs/features/ai-assistant/adr/` (ADR-0001 … ADR-0013)
- Data model + migrations: `docs/features/ai-assistant/data-model.md` (`prisma/migrations/20261010100000_create_conversation` … `20261010101000_add_mcp_draft_repeat_proposal`)
- API: `docs/features/ai-assistant/contracts/openapi.yaml` (`POST /api/chat`, MCP `create_draft_invoice`) and `contracts/server-actions.md`
- Test plan: `docs/features/ai-assistant/test-plan.md`
- Review: `docs/features/ai-assistant/_review/review-2026-10-12.md` — **PASS** after five rounds

## Tasks (SDD-Task trailers)

All 46 tasks in `tasks.json`, T01 – T46, are committed with `SDD-Task` trailers in 52 commits (`git log --grep SDD-Task cfa67f0..HEAD`). They cover the data layer and migrations, the shared read-tool registry, the draft resolver, the allowance, Draft permission and the per-key cap, the chat agent, router and route, the UI, the evaluation sets, the e2e flows, and the fault, injection and isolation tests. Review fixes carry `SDD-Review` trailers (R-01 … R5-2), and the security fixes carry `SDD-Review: SEC-M-01` / `SEC-L-01`.

## Verification

- Unit: **2480 passed** (at the final commit, after the security and bank-account fixes).
- Integration (Docker-backed Postgres): **1250 passed / 51 skipped**, full suite at the final commit.
- E2E (local production build, `CI=1 pnpm test:e2e`): **122 passed / 4 skipped / 0 failed** at the final commit, including the AI section, draft → Create → mark → issue, Create with AI, used-up notice, Draft-permission key, Conversation reopen, and the SCR-01/SCR-03 baselines.
- Lint: 0 errors (4 warnings that were already there). Typecheck: clean.
- Ran the feature (production build on :4311, real Postgres, real HTTP):
  - **AC-29**: a read-only key calling `create_draft_invoice` → `FORBIDDEN`, "This key can only read…", and 0 invoices.
  - **AC-30**: a Draft-permission key, "Acme", 20 × 50 → `SHP-2026-0001`, `DRAFT`, `defaultsUsed: [senderProfile, bankAccount, issueDate, dueDate]`. Stored total 1000 USD, `assistantOrigin: PERSONAL_KEY`, and the key name recorded.
  - **AC-32**: the same `repeatKey` → `repeated: true` with the same invoice. The same key with quantity 21 → `CONFLICT`. Still 1 invoice.
  - **AC-31**: with "Acme GmbH" added → `CUSTOMER_AMBIGUOUS` listing both. A line "website" without an amount → `LINE_AMOUNT_MISSING`. Still 1 invoice.
  - **AC-42**: anonymous `POST /api/chat` → 401. Anonymous `GET /ai` → 307 to `/login?callbackUrl=%2Fai`.
- **Deferred:** replies from the real model. There is no `AI_GATEWAY_API_KEY` in local `.env`, so the chat ran on the scripted e2e model and `pnpm eval:assistant` (topic-boundary and no-guessing sets) was not re-run here. Run both on preview with the gateway key before promoting.
- Bank-account fix (owner testing with the real model, 2026-10-12): a missing or mismatched bank account is now explained in words, never a link alone. AC-19 is patched and AC-19b added; see `_fixes/2026-10-12-bank-account-currency.md`. Re-review round 6 findings fixed with RED → GREEN tests.
- Security review (spec §6.1): one MEDIUM and one LOW finding, both fixed in b0b88fd with RED → GREEN tests. Everything else checked was sound.

## Operational notes

- **Settings:** set `AI_GATEWAY_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` (required, or the build fails). `AI_CHAT_MODEL` is optional (default `google/gemini-2.5-flash-lite`). Never set `E2E` or `AI_CHAT_MODEL=stub:e2e`.
- **Migrations:** eleven additive migrations run with `prisma migrate deploy`. The down scripts are in `docs/features/ai-assistant/migrations/`; run them in reverse order. Also run `pnpm mastra:migrate` (it creates the `mastra` schema and is idempotent) against the same database.
- **Cron:** the existing daily `/api/cron/purge-limits` now also purges Conversations (90 days), repeat marks (24 h), traces (30 days) and turn and counter rows (400 days).
- **Rollback:** redeploy the previous build. The new tables and columns can stay. Removing the origin columns (down 08) drops the KPI history.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
