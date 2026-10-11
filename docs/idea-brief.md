---
status: Draft
owner: "Dmytro Hopko"
updated_at: "2026-10-11"
depth: "medium"
---

# Idea brief — ai-assistant

## 1. Raw idea

> це маю бути аі чат на сайті. в нав барі додається новий розділ аі і він містить чат і перехід на налаштування мсп. цей аі чат має також має мати як і мсп читання і також новиу функцію створення пдф чернетки із інвойсом. це відразу і додається до мсп функціоналу. для чату ми будемо використовувати хук useChat від ai sdk, провайдер моделей від версель, mstra для роботи відладки і статистики.
>
> ще це має на оркестраторі працювати якмусь який буде відхиляти запити не по темі і обирати вірний тул. уточнює дані яких не вистачає

## 2. Problem

The only AI entry point today is the MCP server, which requires the user to own and configure an external AI client. Users without one get no AI access to their invoices at all. Nobody can turn a one-sentence request ("invoice Acme for 20 hours at $50") into a ready-to-review invoice. Today every invoice is built by hand in the editor.

## 3. Users

- **Primary: freelancers and small-business owners without an AI client**, who will never set up an MCP connection. For them the in-app chat is the only way in, so it must work right after login with zero setup.
- **Secondary: existing MCP users.** They get the new draft-creation action in their own client and keep the AI section as the place to manage their MCP connection.

## 4. Why now

No external trigger was named in the interview. The idea extends the MCP server, which shipped recently: the read capabilities already exist, and the chat reuses them for a wider audience.

## 5. Out of scope

- **AI issuing or sending invoices.** The AI only creates Drafts; a human always reviews and issues them, so every existing invoice-integrity rule stays in force.
- **A standalone PDF that bypasses the system.** The PDF is always a rendering of a real Draft invoice, never an off-the-books file.
- **Off-topic conversation.** Anything outside invoiceFlow's own data and actions is politely refused in one sentence, including general invoicing, tax and legal advice.
- **Bring-your-own API key.** It contradicts the primary audience: people without an AI client rarely have a key.
- **Silent write access for existing MCP connections.** Write is opt-in, and existing connections stay read-only.

## 6. Risks

- **Weakest spot: the one-sentence promise vs. "never invent data".** The core value assumes the sentence holds everything needed. In practice the client is often ambiguous or missing, and the rate or currency is unstated. Every one of those cases turns into a follow-up question, so the "one sentence" flow may in reality take three or four turns. If it regularly does, the headline value erodes.
- **Cost is paid by the product, not the user.** Unlike MCP, every chat token is ours. This assumes a per-user daily limit is enough to cap spend. That fails if tool-call loops or long conversations burn the budget per message faster than the limit counts.
- **Write access through external clients.** The draft action is the first MCP write, and there is no orchestrator on that path to ask follow-ups. The action itself must reject incomplete or ambiguous input. If that guard lives only in the chat orchestrator, MCP clients will create drafts from guessed data.
- **Topic boundary drift.** The orchestrator assumes a crisp line ("only invoiceFlow data and actions"). Borderline asks such as "how should I word a reminder?" will test that line constantly. A fuzzy refusal annoys users, and a lax one costs money.
- **Persistent chat history holds financial data.** Saved conversations become a new store of client names and amounts. That brings retention, deletion and privacy obligations the product does not carry today.
- **Discoverability.** The primary audience is AI-inexperienced and may never open a separate "AI" nav section. An entry point is needed where invoices are created.

## 7. Recommendation

Build a new **AI section** in the nav containing a **chat** and a link to **MCP settings**. Add a **"Create with AI"** entry next to "New invoice", which opens the same chat. An **orchestrator** sits in front of the chat. It refuses anything outside invoiceFlow's data and actions, picks the right tool, and asks for missing or ambiguous data instead of inventing it. The headline action creates a **real Draft invoice with its PDF** that a human reviews and issues. The same action ships to MCP at once, behind a **separate opt-in write permission**, and the no-guessing rule is enforced **inside the action itself** so both channels share it. Spend is capped with a **per-user daily limit**; the chat states the limit honestly and points to MCP once it is exhausted. Conversations are **saved as a list** the user can return to. The stack choices named in §1 are carried to `design` as the owner's preference.

## 8. Open questions

- What is the per-user daily limit (messages or tokens), and what does a user see when they hit it? — owner
- How long are saved conversations retained, and can users delete them (one or all)? — owner
- Does the draft action match an existing client only, or may it offer to create a new client in the same flow? — owner
- Which tools does the orchestrator expose on day one: the full MCP read set, or a curated subset? — owner
- How is success measured: share of drafts issued without edits, turns per draft, or something else? — owner
