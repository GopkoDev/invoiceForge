---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
---

# Spec — mcp-server

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (project-wide; this feature adds *Personal key*, *Overdue invoice*, *Freelancer time zone* and *Issued invoice*)
> **Reference module / docs / channels used:** [`docs/idea-brief.md`](../../idea-brief.md) (the idea baseline and the interview), [`docs/architecture-map.md`](../../architecture-map.md), [`invoice-integrity/brief.md`](../invoice-integrity/brief.md) (finding D3), [`security-patch/spec.md`](../security-patch/spec.md) with its ADR-0003 (refusing anonymous requests that are not plain reads), architecture-hardening ADR-0010 (the browser time zone carried in a cookie), and service-layer ADR-0001 (the acting Freelancer) and ADR-0005 (the shared page envelope).

## 1. Context

A Freelancer who already works in an AI assistant has to leave it and open invoiceFlow to answer simple money questions: who owes them, what comes in this month, how the quarter looks. Their invoicing data is invisible to the assistant they use for everything else. The first users of this feature are solo freelancers and small agency owners whose desktop or IDE assistant can connect to a remote tool server with a personal key. They ask these questions several times a week. A secondary group is technical Freelancers who wire invoiceFlow into their own scripts with the same key. The feature serves them with the same tools but is not designed for them first.

There is no external trigger: no incident, contract or deadline. The motivation is product direction and portfolio value. Making invoiceFlow usable from the Freelancer's own assistant is the next roadmap step after the business layer (`service-layer`) was made callable without a browser and the public surface was hardened (`security-patch`). Success means regular use: a meaningful share of active Freelancers connect an Assistant and use it every week within three months of launch.

**Committed approach.** v1 is read-only. It offers a curated set of Freelancer questions through the Model Context Protocol, the standard way AI assistants connect to outside tools:
- who is overdue,
- what is expected in a period,
- summary figures per currency,
- the customer list,
- invoice search,
- one invoice.

These sit behind a "Connect your AI" page where the Freelancer creates named Personal keys, sees when each was last used, and revokes them. The central promise is that **an Assistant's numbers always match the dashboard**. Three things make that hold:
- Every surface uses one overdue rule and one Freelancer time zone, and both ship in the same release as the tools.
- Every answer that does not contain everything says so plainly.
- Every "how much" or "how many" question has a total computed by invoiceFlow, so the assistant never has to add numbers up itself.

Outside research supports this direction. Invoicing products that ship an assistant connector expose either generic access to everything, write-first tools that can send invoices, or developer-grade key setup. None found offers dashboard-matching overdue, expected-payment and per-currency answers behind a simple connect page with named keys and example prompts. That gap is what v1 fills. The sharpest failure mode found is a split definition of "overdue". The dashboard counts only invoices marked overdue by hand, while an assistant would count every past-due one. The two would disagree from the first day, so the shared rule is part of this feature, not a follow-up.

Decisions taken during the interview, recorded for traceability:

- **Scope is v1 read-only only.** Creating and editing drafts through an Assistant becomes a separate feature after `invoice-integrity` enforces status transitions (D4) and currency rules (D6) on the server. Delegated sign-in for hosted chat assistants is a later step after that.
- **The overdue rule is computed when data is read and shared with the dashboard.** An issued, unpaid invoice is overdue when it was marked overdue or its due date is before today in the Freelancer time zone. Stored statuses do not change. This closes `invoice-integrity` finding D3, which is removed from that feature's scope.
- **The time zone is saved on the Freelancer's account and decides "today" for every surface.** The browser value only fills it the first time. This replaces architecture-hardening ADR-0010's browser-cookie rule for the dashboard; `design` records the superseding decision.
- **Payment-behaviour history is out of v1.** An invoice's payment date is the moment the Freelancer clicked "Paid", not when the money arrived, so "who usually pays late" would look authoritative and be wrong.
- **Leaked-key mitigation in v1:** keys have a recognisable format so secret scanners can spot them, setup instructions keep the key out of files that get committed, last use is shown, and keys are revocable. A per-key call limit protects shared capacity but does not limit how much data a leaked key can read. Key expiry, first-use emails and automatic revocation of unused keys were considered and left out for v1.
- **The Assistant connection is one added, reviewed exception to the app's refusal of anonymous requests that are not plain reads** (security-patch ADR-0003). It carries no browser session and checks its own Personal key on every call.

## 2. Goals

- A Freelancer can connect their own AI assistant to invoiceFlow in a few minutes, from a visible entry point, without help.
- The answers an Assistant gets about overdue invoices, Debtors, expected payments and summary figures are the same numbers the dashboard shows, for the same period, in the same time zone, every time.
- The Freelancer stays in control of every Assistant connection. They can see it, revoke it at once, and trust that it only reads and only ever sees their own data.
- Connected Freelancers keep using it: asking an Assistant becomes a weekly habit, not a one-time experiment. This is tracked by the §7 weekly-active KPI and supported by US-01's example prompts and the dashboard entry point (AC-01, AC-02).

## 3. Non-goals

- **Creating or editing drafts through an Assistant.** It needs server-side status-transition and currency rules (`invoice-integrity` D4, D6) first, and becomes its own feature.
- **Delegated sign-in for hosted chat assistants.** Assistants that connect only through an account sign-in flow need a dedicated authorization service. That is the largest and riskiest piece, and it follows once personal keys have shown the tools are useful.
- **Any action that leaves the account or changes money state.** This covers sending invoices or reminders, marking paid, deleting and editing issued invoices. A wrong amount from a model must never reach a Customer.
- **Payment-behaviour history** ("who usually pays late, by how much"). The stored payment date is the click time, not the real payment date.
- **Currency conversion.** Figures are reported per currency exactly as the dashboard reports them; converting needs a rate source and would make the numbers disagree with the dashboard.
- **Several access levels or per-resource permissions.** v1 has one level, read-only. A "read and drafts" level arrives with the drafts feature.
- **Key expiry, first-use emails and automatic revocation of unused keys.** Each adds friction to weekly use or new personal data. The v1 mitigations are the recognisable key format, revocation and last-used display; the per-key call limit protects shared capacity, not the amount of data a key can read.
- **Plan-based access.** invoiceFlow has no plans today, so every Freelancer can connect an Assistant.

## 4. User stories

### US-01: Connect an Assistant

**As a** Freelancer
**I want** to create a named Personal key from a visible "Connect your AI" entry point and get ready-to-paste setup and example prompts for my assistant
**So that** my assistant can answer questions about my invoices without me opening the app

### US-02: Manage my Personal keys

**As a** Freelancer
**I want** to see each Personal key with its name and last use, and revoke any of them
**So that** I stay in control of which Assistants can read my data

### US-03: Ask who owes me

**As an** Assistant acting for a Freelancer
**I want** the Freelancer's overdue invoices and Debtors, with amounts per currency and days overdue
**So that** the Freelancer gets a correct "who owes me" answer in the conversation

### US-04: Ask what is coming in

**As an** Assistant acting for a Freelancer
**I want** the Expected payments for a period, grouped by currency and ordered by due date
**So that** the Freelancer can plan cash flow from the conversation

### US-05: Ask for summary figures

**As an** Assistant acting for a Freelancer
**I want** per-currency summary figures for a Dashboard period, computed by invoiceFlow
**So that** the numbers I quote match the Freelancer's dashboard exactly

### US-06: Look up customers and invoices

**As an** Assistant acting for a Freelancer
**I want** to list customers, search issued invoices and open one invoice, always knowing whether an answer is complete
**So that** I can answer specific questions without guessing or adding up partial lists

### US-07: One "today" everywhere

**As a** Freelancer
**I want** my time zone saved on my account and used by the dashboard and by every Assistant
**So that** "overdue", "today" and "this month" mean the same thing wherever I ask

### US-08: Overdue without marking by hand

**As a** Freelancer
**I want** the dashboard and invoice list to treat a past-due unpaid invoice as overdue without my marking it
**So that** my dashboard and my Assistant agree on who owes me

### US-09: Only my data, only with a valid key

**As a** Freelancer
**I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
**So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data

### US-10: Keys follow my account

**As a** Freelancer
**I want** my Personal keys listed in my data export and removed when I delete my account
**So that** nothing keeps access to my data after I leave

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** a signed-in Freelancer with no Personal keys
**When** they open the dashboard or the settings
**Then** they see a "Connect your AI" entry point that leads to the connect page. On the dashboard it stays visible until their first key has been used at least once

### AC-02 (US-01) — happy path

**Given** a Freelancer on the connect page
**When** they create a Personal key named "Laptop assistant"
**Then** the full key is shown exactly once, with a copy action and a warning that it will not be shown again. The page also shows setup steps for each supported assistant, which keep the key in a private setting rather than in a project file, and three example prompts. After leaving the page, the key is shown only by its name, creation date and last four characters

### AC-03 (US-01) — error

**Given** a Freelancer creating a Personal key
**When** the name is empty, longer than 50 characters, or the same as one of their other active keys
**Then** the system does not create the key and tells them the name must be 1 to 50 characters and different from their other active keys

### AC-04 (US-01) — domain invariant

**Given** a Freelancer who already has 10 active Personal keys
**When** they try to create another
**Then** the system refuses and tells them that at most 10 keys can be active at once and that they can revoke one to make room

### AC-05 (US-02) — happy path

**Given** a Freelancer with three Personal keys, one of which has never been used
**When** they open the connect page
**Then** each active key shows its name, creation date, last four characters and last use, accurate to within 5 minutes, or "never used". Each has a revoke action. Revoked keys are listed separately with their revocation date

### AC-06 (US-02) — happy path

**Given** a Freelancer revokes a Personal key and confirms
**When** an Assistant next calls with that key, even a call that was already queued
**Then** the call is refused and returns no data, and the key moves to the revoked list. A revoked key can never be reactivated

### AC-07 (US-09) — authorization

**Given** an Assistant presenting a key that is revoked, unknown, malformed, or belongs to a deleted account
**When** it asks for anything
**Then** the system refuses without returning any Freelancer data and without revealing whether the key ever existed or whose it was. The refusal tells the Assistant to ask the Freelancer for a valid key

### AC-08 (US-09) — authorization

**Given** an Assistant acting with Freelancer A's key, and an invoice or customer that belongs to Freelancer B
**When** it asks for that record by its reference
**Then** the system answers exactly as it would for a reference that does not exist, so B's record is never revealed, not even its existence

### AC-09 (US-09) — authorization

**Given** a Visitor, or a browser with a signed-in Freelancer's session but no Personal key
**When** it calls the Assistant connection
**Then** the system refuses. A browser session is never accepted in place of a Personal key, so a web page cannot make a signed-in Freelancer's browser read their data through it

### AC-10 (US-09) — domain invariant

**Given** an Assistant with a valid Personal key
**When** it tries to create, change, delete, mark paid or send anything
**Then** no such capability is offered, and the Freelancer's data stays unchanged. Personal keys are read-only

### AC-11 (US-09) — domain invariant

**Given** a Personal key that has made 60 calls in the past minute
**When** it makes another call
**Then** the system refuses that call and tells the Assistant when it can try again. The Freelancer's other keys and every other Freelancer keep working normally

### AC-12 (US-03) — happy path

**Given** a Freelancer in the Kyiv time zone with three issued, unpaid invoices: one due yesterday and never marked overdue, one marked overdue by hand, and one due tomorrow
**When** an Assistant asks for their overdue invoices
**Then** it receives the first two and not the third. Each row has the customer, invoice number, sender profile, amount, currency, due date and days overdue, together with the total overdue amount and count per currency, computed by invoiceFlow

### AC-13 (US-03) — happy path

**Given** a Freelancer with overdue invoices from 9 Customers in two currencies
**When** an Assistant asks who owes them money
**Then** it receives every Debtor, not only the top three, ranked by total overdue amount within each currency, each with the overdue count and total. The ranking agrees with the dashboard's Debtors for the entries the dashboard shows

### AC-14 (US-04) — happy path

**Given** a Freelancer with pending invoices in two currencies, some due this month, some later, and one already past due
**When** an Assistant asks for the Expected payments for this month
**Then** it receives only the not-yet-overdue invoices due this month in the Freelancer time zone. They are grouped by currency and ordered by due date, with a total per currency. The answer states the period's first and last day and the time zone used

### AC-15 (US-05) — happy path

**Given** a Freelancer and any Dashboard period
**When** an Assistant asks for the summary figures for that period
**Then** every figure equals, to the cent, what the dashboard shows for the same period and time zone. The figures are revenue, overdue total and count, expected total and count, and invoice counts. They are reported per currency and never converted, and each figure states which date it is counted by. Revenue, for example, is counted by issue date, as on the dashboard

### AC-16 (US-05) — error

**Given** an Assistant asking for summary figures
**When** the period is an unknown preset, a custom range longer than 5 years, or a range whose start is after its end
**Then** the system refuses and explains that the period must be a named preset or a from–to range of at most 5 years whose start is not after its end

### AC-17 (US-06) — happy path

**Given** a Freelancer with 120 issued invoices and 4 drafts for one Customer
**When** an Assistant searches that Customer's invoices without asking for drafts
**Then** it receives only issued invoices, at most 50 per page. The answer gives the total number of matches and says plainly whether more pages exist. Every row states its status in words. Drafts and cancelled invoices appear only when the Assistant asks for them, and are then labelled as such

### AC-18 (US-06) — domain invariant

**Given** an Assistant asking for 1,000 invoices or customers in one page
**When** the answer is returned
**Then** it contains at most 50 rows and states that the page size was capped at 50. No answer exceeds the cap, and no partial answer is presented as complete

### AC-19 (US-06) — happy path

**Given** an issued invoice of the Freelancer
**When** an Assistant asks for it
**Then** it receives the invoice as it was issued: number, sender profile and customer details as recorded on the invoice, lines, totals, currency, status, issue and due dates. It also gets a link that opens the invoice in invoiceFlow. Bank account numbers and international bank account numbers are not included

### AC-20 (US-06) — error

**Given** a Freelancer whose two sender profiles each have an invoice numbered INV-0012
**When** an Assistant asks for INV-0012 without naming a sender profile
**Then** the system does not pick one. It lists both candidates with their sender profile, customer and issue date and asks which one is meant

### AC-21 (US-06) — domain invariant

**Given** a Customer renamed from "Acme Ltd" to "Acme GmbH", with invoices issued under both names
**When** an Assistant asks for the invoices of the Customer "Acme GmbH"
**Then** it receives the invoices issued under both names, because a Customer's invoices belong to the Customer, not to the name copied onto each invoice

### AC-22 (US-07) — happy path

**Given** a Freelancer with no saved time zone whose browser reports the Kyiv time zone
**When** they next open the app
**Then** the Kyiv time zone is saved as their Freelancer time zone and shown in settings, where they can change it. After a change, the dashboard and every Assistant answer use the new time zone from the next request

### AC-23 (US-07) — cross-context

**Given** a Freelancer in the Kyiv time zone, at 00:30 on the first day of a month in Kyiv while it is still the previous day in UTC, and a pending invoice due on the last day of the previous month
**When** the Freelancer opens the dashboard and an Assistant asks about "this month" and overdue invoices
**Then** both use the new month, and both count that invoice as overdue

### AC-24 (US-08) — cross-context

**Given** a pending invoice whose due date has passed and that the Freelancer never marked overdue
**When** they open the dashboard and the invoice list
**Then** the dashboard counts it in the overdue figures, lists its Customer as a Debtor and leaves it out of Expected payments. The invoice list shows it as overdue and includes it when filtered by overdue, matching what an Assistant reports. Its stored status is unchanged, and marking it paid works as before

### AC-25 (US-10) — happy path

**Given** a Freelancer with one active and one revoked Personal key
**When** they download their data export
**Then** the export lists each key's name, creation date, last use and revocation date, but never the key itself or anything from which it could be rebuilt

### AC-26 (US-10) — cross-context

**Given** a Freelancer with active Personal keys
**When** they delete their account
**Then** every key stops working from that moment, and an Assistant using one is refused as in AC-07

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95, list and single-record questions (≤ 50 rows) | ≤ 800 ms server-side | request spans in error tracking, 7-day window after release |
| Latency p95, summary figures, Debtors and Expected payments, for a Freelancer with 5,000 invoices | ≤ 1.5 s server-side | integration test on a seeded fixture + spans in error tracking |
| Dashboard figures parity | 100 % of figures equal the dashboard to the cent | automated parity test over a seeded multi-currency fixture, run in CI; spot check in the ship stage |
| Dashboard load after the overdue rule change, p95 | no more than 10 % slower than the 7 days before release | dashboard spans in error tracking |
| Page size | default 20, maximum 50 rows per answer | contract test |
| Per-key call limit | 60 calls per minute per Personal key; no daily cap | integration test |
| Failed-key attempts per source | at most 30 refused key checks per 5 minutes per network source; beyond that the source is refused before any key is checked | integration test |
| Limiter failure mode | fail-closed: 100 % of Assistant calls are refused while the limit store is unavailable | integration test with the limit store unavailable |
| Revocation takes effect | the first call after revocation is refused (0 s grace) | integration test |
| Last-use accuracy | within 5 minutes of the real last call | integration test |
| Server-side failure rate | ≤ 1 % of Assistant calls per week fail on the system's side | error tracking, weekly |

## 6.1 Security / privacy

- **Data classification:** Confidential. Assistants read Customers' names, contact details and invoice amounts, and a Personal key is a credential to that data.
- **Personal data touched:**
  - New per-key records: name, a one-way digest of the key, its last four characters, creation date, last use and revocation date. All are tied to the account, listed in the data export and removed with the account.
  - The Freelancer time zone on the account (low sensitivity).
  - Weekly usage counts per key for the KPIs. These hold aggregates only, never request content.
  - Short-lived failed-attempt records per network source, kept at most 24 hours as in `security-patch`.
- **AuthZ/AuthN impact:**
  - A new credential type, the Personal key. Every call resolves the key to exactly one Freelancer, and that Freelancer becomes the acting Freelancer for the business layer, which limits every read to their records (service-layer ADR-0001).
  - A browser session is never accepted on the Assistant connection, and a Personal key never grants a browser session.
  - The app's refusal of anonymous requests that are not plain reads gets one added, reviewed exception for the Assistant connection, which performs its own key check on every call.
  - Personal keys are read-only.
  - The full key is shown once and never stored in readable form.
- **Abuse cases:**
  - **Leaked key** (sharpest; keys pasted into assistant configs end up in committed files, screen-shares and support tickets): the recognisable key format lets secret scanners flag it, setup keeps it out of project files, revocation is immediate, and last use is visible. The per-key limit caps the call rate and protects shared capacity; it does not bound how much a key can read. The residual risk is accepted: a leaked key reads everything until revoked.
  - **Cross-tenant guessing:** a reference to another Freelancer's record is answered exactly like a non-existent one (AC-08).
  - **Key guessing and invalid-key floods:** refusals are uniform and reveal nothing (AC-07); a source that fails 30 key checks in 5 minutes is refused before any key is checked.
  - **Prompt injection through the Freelancer's own data:** notes, product names and other free text can carry instructions the assistant may follow with its other tools. Read-only keys keep the damage inside invoiceFlow at zero. Answers mark free text as data the Freelancer entered. The residual risk outside invoiceFlow is named, not eliminated.
  - **Oversized or over-sensitive answers:** every answer is capped at 50 rows (AC-18), and bank account numbers are never returned (AC-19).
- **Security review:** Required. This adds a new authentication boundary and a new credential type, plus an exception to the anonymous-request refusal. Run `/security-review` before ship.

## 7. Metrics / KPIs

- **Weekly active Assistant users.** A Freelancer counts when at least one of their keys made one successful call to a substantive tool in a calendar week. Listing the available tools and other housekeeping calls do not count. Baseline: 0. Target: at least 10 % of Freelancers who used the web app in the past 30 days, within 90 days of launch.
- **Key activation rate:** share of created Personal keys that make at least one successful substantive call within 7 days of creation. Baseline: 0. Target: at least 60 % within 60 days of launch.
- **Successful call share:** share of substantive calls that succeed, excluding refusals for invalid keys and limits. Baseline: 0 (new). Target: at least 97 % within 30 days of launch.
- **"Assistant disagrees with dashboard" reports:** support reports or bug tickets where an Assistant's figure differs from the dashboard. Baseline: 0 (new). Target: 0 within 90 days of launch.

## 8. Open questions

- [ ] Which assistants get setup steps and are tested at launch? Default now: Claude Desktop, Claude Code and Cursor. — owner: Dmytro Hopko, due: before `sdd:design` completes
- [ ] `invoice-integrity` D3 is absorbed here. Its brief must drop D3 and depend on this feature's overdue rule. Default now: edit the brief when `invoice-integrity` is specified. — owner: Dmytro Hopko, due: before `sdd:specify invoice-integrity`
- [ ] How are Freelancers told about the new overdue rule, given that their dashboard figures change on release day? Default now: a one-time dashboard notice explaining that past-due invoices now count as overdue automatically. — owner: Dmytro Hopko, due: before `sdd:tasks`
