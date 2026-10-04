---
status: Draft
owner: "Dmytro Hopko"
updated_at: "2026-10-04"
depth: "medium"
---

# Idea brief — mcp-server

## 1. Raw idea

> хочу додати можливість користувачу могти створити чернетку інвойсу, отримати дані про його інвоси і статистику чи тих хто не сплатив вчасно чи зрозуміти мацбктні платежі за допомогою його аі агента. чи автоматизувати свої процеси за допомогою цього мсп і з своїх внструментів.

(EN: let the user create a draft invoice, get data about their invoices and statistics — who hasn't paid on time, what payments are coming — through their own AI agent, or automate their processes with this MCP from their own tools.)

## 2. Problem

A freelancer who already lives in an AI assistant has to leave it and open the invoceFlow UI to draft an invoice or check who owes them money. Their invoicing data is invisible to the agent they use for everything else, so questions like "who is overdue?" or "what will come in this month?" can't be answered where they are asked.

## 3. Users

- **Primary (v1): solo freelancer / small agency owner whose AI assistant can connect to a remote MCP server with a personal key** — Claude Desktop, Claude Code, Cursor and similar clients that accept an `Authorization` header. Asks conversational questions ("who owes me?", "what comes in this month?"), several times a week.
- **Primary (v2): the same freelancer in a hosted chat assistant** (claude.ai, ChatGPT) — these connect remote MCP servers only through OAuth, which arrives in v2 (see §5, §7).
- **Secondary: technical self-automator** — wires invoceFlow into their own scripts and agent chains with the same personal key. Served by the same tools, not designed for first.

## 4. Why now

No external trigger was named (no incident, contract or deadline). The motivation is product direction and portfolio value: make invoceFlow usable from the user's AI agent. Success is measured by **regular use** — a share of active users connect it and use it weekly within 2–3 months of launch.

## 5. Out of scope

- **Sending invoices / reminders to clients** — the agent never reaches a client; a hallucinated amount must not leave the account.
- **Marking invoices paid, deleting, or editing non-draft invoices** — irreversible or financially meaningful; stays a human action in the UI.
- **Agent-side arithmetic over raw lists** — statistics are computed by invoceFlow so numbers always match the dashboard.
- **Currency conversion** — summaries are reported per currency, exactly as the dashboard does; converting would need an exchange-rate source and would make the numbers disagree with the dashboard.
- **OAuth / "sign in with your invoceFlow account" in v1** — next-auth cannot act as an OAuth authorization server, so this needs an external provider or a dedicated authorization server. It is the largest and riskiest piece, so it ships as v2 once the tools have proven useful with personal keys.
- **Fine-grained per-resource permissions** — two access levels are enough for a freelancer; more checkboxes cost support.
- **Optimising for the automation audience first** — personal keys exist, but tool design targets the conversational user.

## 6. Risks

- **Nobody knows it exists (weakest spot, from the premortem).** Assumes users will discover a connector buried in settings; false if there is no visible "Connect your AI" entry point with copy-paste setup commands and prompts. Onboarding is part of the feature, not an add-on.
- **Answers are wrong because invoice rules are not enforced yet (depends on `invoice-integrity`).**
  - *Overdue (D3):* `OVERDUE` is only ever set by hand today, so "who is overdue?" would return only invoices the user flagged. v1 must derive overdue at read time (`PENDING` and due date before today in the Freelancer's time zone), or D3 ships first.
  - *Drafts (D4, D6, D11):* the server accepts any status transition, checks invoice vs bank-account currency only in the browser, and a new draft consumes a number from the sequence. Draft tools are safe only after "agents may change DRAFT only" and the server-side currency check exist; deleted agent drafts would leave numbering gaps.
- **Retries create duplicates.** MCP clients and models retry calls; without an idempotency key a retried "create draft" produces two drafts.
- **Wrong time zone.** An MCP client sends no `tz` cookie, so everything falls back to UTC and "this month" / "overdue today" shift for a Kyiv user after 21:00. A time zone must be stored on the user profile or the connection.
- **The proxy blocks the endpoint.** Since `security-patch` the proxy refuses anonymous non-GET requests, and an MCP call is a POST with a bearer key and no session cookie. `/api/mcp` needs an explicit, reviewed exemption with its own key check.
- **Oversized or over-sensitive answers.** Business functions return full lists when no page is requested. Tools must enforce a maximum page size and omit IBANs and account numbers unless the tool exists to return them.
- **Leaked personal key exposes financial data.** Mitigated by the read-only level, hashed keys, last-used tracking, revocation and a per-key rate limit (reuse the `security-patch` limiter) — but read access alone still reveals clients and amounts.
- **Prompt injection through the user's own agent.** The agent sees invoceFlow data and also has the user's other tools (mail, web). Free-text fields (notes, product names) can carry instructions. Limiting writes to drafts keeps the damage small; the risk is named, not eliminated.
- **Agent creates wrong drafts → trust erodes.** Drafts only target existing clients and bank accounts, derive currency from the bank account on the server, and return a link back to the UI for review.
- **Value may be thin for low-volume users.** A freelancer with five invoices a month may find the dashboard faster; usage depends on scenarios the UI doesn't cover well (drafting from conversation context in the same chat).

## 7. Recommendation

Ship in two steps, both as a hosted MCP endpoint (`/api/mcp`, stateless Streamable HTTP, a new server instance per request, `@modelcontextprotocol/sdk` ≥ 1.26).

- **v1 — personal key, read-only.**
  - Tools (~6): list clients, search invoices, overdue invoices (derived at read time), expected incoming payments for a period, summary statistics per currency computed by invoceFlow, get one invoice.
  - A "Connect your AI" settings page: create a personal key (shown once, stored hashed), name it, see last use, revoke it; copy-paste setup for Claude Desktop, Claude Code and Cursor; example prompts.
  - Keys are deleted with the account and listed in the data export.
  - A shared tool layer (`lib/tools/*`: input schema, page-size cap, output trimming, call into `lib/services`) so a future in-app AI chat reuses the same tools.
- **v1.1 — drafts, after `invoice-integrity` D4 and D6.** "Create draft" and "update draft" behind the "read + drafts" key level, with an idempotency key, server-derived currency, DRAFT-only edits and an audit record of what each key changed.
- **v2 — OAuth** so hosted chat assistants (claude.ai, ChatGPT) can connect with the user's invoceFlow account.

Prerequisites: `security-patch` merged (proxy rules, limiter), a stored time zone for the user or the key, and at least `invoice-integrity` D3 or the read-time overdue rule.

## 8. Open questions

- How is "regular use" measured exactly — which event counts as weekly active, and what share is the target? — owner: Dmytro Hopko
- Is MCP access available on all plans or a paid-plan feature? — owner: Dmytro Hopko
- Where is the time zone stored — on the user profile (shared with the future chat) or per key? Proposed: user profile. — owner: Dmytro Hopko
- Overdue: derive at read time inside this feature, or ship `invoice-integrity` D3 first? Proposed: read-time rule in the shared business layer, reused by the dashboard. — owner: Dmytro Hopko
- Audit trail scope: writes only (drafts created / changed per key) or reads too? Proposed: writes in v1.1, plus last-used time per key in v1. — owner: Dmytro Hopko
- Which OAuth approach for v2 — an external identity provider or a self-hosted authorization server? — owner: Dmytro Hopko
- Which clients are tested and documented at launch? Proposed for v1: Claude Desktop, Claude Code, Cursor. — owner: Dmytro Hopko
