---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-30"
feature_size: "M"
---

# Spec — service-layer

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (repo-root; no feature-scoped CONTEXT). Terms added for this feature: Assistant, Debtor, Expected payment.
> **Reference module / docs / channels used:** `docs/architecture-map.md` (§Conventions, §Module inventory), `docs/code-review-findings.md`, `docs/features/architecture-hardening/{spec.md, contracts/server-actions.md}` (the result contract, error codes and hard rules this feature preserves), `lib/actions/**` and `types/actions.ts` (the current behaviour) — plus the interview and CONTEXT.

## 1. Context

Every piece of data a Freelancer sees or changes in Invoice Forge goes through about fifty server-side functions. Each of them does four jobs at once: it works out who the caller is from the browser session, reads the Freelancer's time zone from the browser, runs the business rules and data queries, and tells the web app which pages to refresh. Because identity and time zone come only from the browser, none of these functions can be used by anything that is not a browser page. The next planned features are an in-app AI chat and an MCP server, which let an Assistant read and change data on behalf of one Freelancer. An Assistant has no browser session, so today it could only reuse the business rules by faking a session or by copying the queries. A copy would miss the rules the architecture-hardening work just made reliable, such as invoice numbering, amount checks, ownership and safe deletion. The dashboard has a second, related problem: it loads every matching invoice into memory and adds them up there, so it gets slower as a Freelancer's history grows, and an Assistant asking the same questions would do the same.

Why now: the AI chat and MCP features are next on the roadmap, and each would otherwise build its own data access. The web app's rules were hardened on 2026-09-26–30, and the test suite now covers them, so the logic can be moved with a safety net. If we wait, the Assistant features will copy that logic, and we will have to keep two copies in sync.

Committed approach: one set of business functions takes the acting Freelancer (and, where dates matter, their time zone) as an explicit input. Each function limits every read and every write to that Freelancer's records itself; no caller is trusted to have filtered first. The web app's server-side functions become thin wrappers: they identify the Freelancer from the session, call the business function, and refresh the same pages as today. Reads and all changes move, including invoice numbering, the totals-changed check and account deletion; only the sign-in flow stays where it is. Every record list (invoices, customers, products, custom prices, sender profiles, bank accounts) can optionally be searched and paged. Search is a case-insensitive text match on the fields a person sees as the record's name: invoices by invoice number, customer name and sender name (as today); customers by name, company and email; products by name; custom prices by product name and customer name; sender profiles by name and legal name; bank accounts by bank name and account holder (not by account number or IBAN). Each list and it always reports the total and whether more results exist, so it never truncates results silently. Dashboard figures are computed by the database instead of in memory, and they match today's figures to the cent. Nothing changes for the Freelancer. Outside research supports this direction. Public guides for AI tools (Vercel's AI SDK tool context, articles on MCP authentication) cover passing the acting user's identity into a tool, but not the layer between the tool and the data. That missing layer is this feature. Stripe's MCP server is a counter-example: it caps list results at 100 and gives no way to fetch the next page, which we avoid by always returning the total and whether more exist. The sharpest failure mode found is this: many changes today first check that a record belongs to the Freelancer and then write to it by its id alone. If those two steps drift apart in the new layer, an Assistant could change another Freelancer's data. So every change is itself limited to the acting Freelancer's records (AC-08). Success means the web app behaves exactly as before and every existing check still passes with its expected values unchanged. Every business function can also be called in a test with only the acting Freelancer and a time zone, with no browser request.

Deliberate behaviour changes (the only ones):
1. The dashboard takes a Debtor's name, a sender profile's name and a bank account's bank and holder names from the most recent invoice in the group. "Most recent" means the latest issue date, and on the same issue date the invoice created last. The choice is made among the invoices the section counts (selected currency and period). Debtors tied on their exact overdue total are ordered by name, and that also decides which of them make the top three. Today all of these are arbitrary.
2. Dashboard amounts are exact sums of the stored two-decimal invoice totals. Today they carry floating-point noise, so the old figure rounded to the cent must equal the new one.
3. The sender-accounts section lists sender profiles by name, and each profile's accounts by bank name and then holder name. Today the order is arbitrary.
4. Every list ends its sort order with the record identifier, so records with equal sort values keep a fixed order and paging never repeats or skips a record. Today their relative order is arbitrary.
5. At release, the old in-memory dashboard code, the unused list-all-invoices function (with its test) and every other function the move leaves unused are deleted.

Web pages keep correcting a malformed link to the documented defaults before they call a business function, as they do today (architecture-hardening AC-25/26). A business function itself refuses invalid input (AC-13, AC-26). The invoices page always passes its own page size, so its first page still shows 10 invoices.

## 2. Goals

- The web app keeps working exactly as it does today: same pages, data, messages and refreshes, while all business rules live in one place that does not depend on a browser session.
- An Assistant (in a later feature) can read and change a Freelancer's data through the same rules as the web app, and it can never see or touch another Freelancer's data.
- Every list can be searched and paged the same way, and it always tells the caller how much data exists, so later features never get silently truncated lists.
- Dashboard figures stay correct to the cent, and loading them no longer means reading every matching invoice into memory.

## 3. Non-goals

- Building the AI chat, the MCP server or any Assistant tool. This feature only prepares the functions they will call, so their permission model and sign-in design stay with those features.
- Limiting how many results a caller may request. Upper limits on page size belong to the future Assistant tool layer, because the web app's pickers need full lists today.
- Adding paging or server-side search to the customers, products and custom-prices pages or pickers. That UI change is a separate follow-up feature. Here the lists only gain the ability to page and search.
- Changing the stored data model or running a data migration. The feature must ship without downtime and be easy to roll back.
- Changing the sign-in flow. Signing in is inherently tied to the browser, and no Assistant signs in by itself.

## 4. User stories

### US-01: Keep using the app unchanged
**As a** Freelancer
**I want** every page, form, picker and the dashboard to behave exactly as before
**So that** the internal change costs me nothing and I don't have to relearn anything

### US-02: Trust dashboard figures
**As a** Freelancer
**I want** my dashboard figures (revenue, the chart, sender accounts, Debtors and Expected payments) to match today's to the cent and to appear in a stable order
**So that** I can rely on them as my invoice history grows

### US-03: Read a Freelancer's data without a browser
**As an** Assistant acting for a Freelancer
**I want** to read that Freelancer's invoices, customers, products, custom prices, sender profiles, bank accounts and dashboard figures by naming the Freelancer and, where dates matter, their time zone
**So that** I can answer the Freelancer's questions without a browser session

### US-04: Search and page through any list
**As an** Assistant acting for a Freelancer
**I want** every list to accept an optional search text, page and page size and to tell me the total and whether more results exist
**So that** I never mistake a partial list for the whole one

### US-05: Change data under the same rules
**As an** Assistant acting for a Freelancer
**I want** creating, changing and deleting records to follow exactly the rules the web app follows (invoice numbering, amount checks, deletion guards)
**So that** data changed through me is as trustworthy as data changed in the browser

### US-06: Only my data, whoever asks
**As a** Freelancer
**I want** every read and change made on my behalf, from a page or an Assistant, limited to my own records
**So that** nobody else's data mixes into mine and nobody can reach mine

### US-07: Dates in my time zone
**As a** Freelancer
**I want** date-based figures and filters to use my time zone, whether I ask in the browser or an Assistant asks for me
**So that** "this month" and "today" mean my month and my day

### US-08: Stay locked out without a session
**As a** Visitor
**I want** to be sent to sign in whenever I reach a private page or action
**So that** I know how to get access, and no private data is shown to me

## 5. Acceptance criteria

### AC-01 (US-01) — happy
**Given** a signed-in Freelancer with existing sender profiles, customers, products, custom prices, bank accounts and invoices
**When** the Freelancer opens any list, detail page, the invoice editor, a picker or the dashboard, or saves any form
**Then** they see the same records, values, order, messages and confirmations as before the change (except the deliberate dashboard naming and tie order in AC-06), and every existing automated check passes with its expected values unchanged (the only removed check is the one for the unused list-all-invoices function)

### AC-02 (US-01) — error
**Given** a signed-in Freelancer fills in a form with invalid values, for example a negative quantity or an unknown invoice status
**When** they save it
**Then** the system blocks the save and shows the same plain-language messages next to the same fields as before the change

### AC-03 (US-01) — happy
**Given** a signed-in Freelancer creates, changes or deletes a record, for example a bank account on one of their sender profiles
**When** the change succeeds
**Then** every page that showed that record before the change is refreshed as it is today (lists, detail pages, the sender profile and the dashboard), so the Freelancer sees the change without reloading

### AC-04 (US-01) — error
**Given** a signed-in Freelancer's request fails for an unexpected reason (for example the data store is unreachable)
**When** the page or form reports the failure
**Then** the Freelancer sees the same plain-language error and retry option as before, without internal details, and the failure is reported to error monitoring exactly once

### AC-05 (US-02) — happy
**Given** one fixed set of invoices whose totals add up with floating-point drift (for example 0.10 + 0.20), several currencies, a Customer renamed between two invoices, Debtors tied at the top-three cut-off and a Freelancer in a time zone that switches to or from daylight saving time within the selected range
**When** the dashboard figures are produced by the old and by the new implementation
**Then** every amount is equal after rounding to the cent, and every count, the membership of every group and every listed invoice is identical; the names shown, the order among tied entries, which tied Debtor makes the top three, and the sender-accounts order are not compared here, because they change on purpose (§1 deliberate changes 1 and 3) and are checked by AC-06

### AC-06 (US-02) — domain invariant
**Given** a Customer renamed between two of their overdue invoices, and two Debtors who owe the same overdue total at the top-three cut-off
**When** the Freelancer opens the Debtors section
**Then** each Customer appears at most once, under the name on their most recent overdue invoice (latest issue date, then latest created). Debtors tied on their exact overdue total are ordered by name, which also decides who makes the top three. Sender profiles and their accounts appear in the fixed order of §1 deliberate change 3, so the same data always gives the same dashboard

### AC-07 (US-03) — happy
**Given** an Assistant acting for Freelancer A, with no browser session
**When** it asks for A's customers, products, custom prices, sender profiles, bank accounts, invoices or dashboard figures
**Then** it receives exactly the records and figures A sees on the matching page

### AC-08 (US-06) — authorization
**Given** an Assistant acting for Freelancer A, and a record (invoice, customer, product, custom price, sender profile or bank account) that belongs to Freelancer B
**When** it asks to read, change or delete that record by its identifier, or asks for a list that belongs to it (for example the custom prices of B's customer)
**Then** the system answers exactly as it does for an identifier that never existed, and B's record stays unchanged, so A's side cannot even learn that the record exists

### AC-09 (US-06) — authorization
**Given** a signed-in Freelancer A who opens or submits a link or form carrying the identifier of Freelancer B's record
**When** the page loads or the form is saved
**Then** A gets the same "not found" outcome as today and B's record is neither shown nor changed

### AC-10 (US-08) — authorization
**Given** a Visitor with no session, or with a session whose account no longer exists
**When** they reach any private page or trigger any private action
**Then** they are sent to sign in as today, and no private data is read or changed

### AC-11 (US-04) — happy
**Given** Freelancer A has 23 customers, of which 5 have "acme" in their name or email in any letter case
**When** an Assistant acting for A asks for customers matching "ACME", page 1, 2 per page
**Then** it receives 2 of those 5 customers in the usual order, together with total 5, page 1, 3 pages in all and "more results exist"

### AC-12 (US-04) — happy
**Given** Freelancer A has records in a list
**When** a picker or an Assistant asks for that list, including the invoices list, without a search text, page or page size
**Then** it receives the full list in the same order as today, reported as page 1 with the total equal to the number of records, one page in all (none for an empty list) and "no more results". A page given without a page size uses a page size of 10

### AC-13 (US-04) — error
**Given** an Assistant acting for Freelancer A
**When** it asks for a list with a page or page size that is not a whole number of at least 1 (for example 0, −5 or 2.5), with a search text longer than 100 characters, or with a date range that is reversed or has only one end
**Then** the system returns no records and tells it which value is invalid and what is allowed

### AC-14 (US-04) — happy
**Given** Freelancer A's list has 3 pages at the requested page size
**When** an Assistant or A's page asks for page 99
**Then** it receives page 1, as the invoices list does today, and the page number in the response is 1. An empty list likewise answers with page 1 and no pages

### AC-15 (US-05) — happy
**Given** an Assistant acting for Freelancer A, and A's sender profile whose invoice sequence proposes the next number
**When** it creates an invoice with no invoice number
**Then** the invoice gets the next number from that sender profile's invoice sequence, exactly as when A saves in the browser

### AC-16 (US-05) — domain invariant
**Given** A's page and an Assistant acting for A save new invoices for the same sender profile at the same moment, or the Assistant types a number already used in that sender profile
**When** both saves finish
**Then** no two invoices in that sender profile share an invoice number, and a typed duplicate is blocked with the message that the number is already used in this sender profile

### AC-17 (US-05) — domain invariant
**Given** one of A's customers or sender profiles has invoices
**When** an Assistant acting for A, or A in the browser, tries to delete it on its own
**Then** the system blocks the deletion and says how many invoices depend on it, as it does today

### AC-18 (US-05) — domain invariant
**Given** an invoice saved before the amount rules existed, whose stored total differs from the total the system recalculates
**When** an Assistant or A saves a change to it without confirming the new total
**Then** the system blocks the save and shows the old and the new total for confirmation, as it does today

### AC-19 (US-05) — cross-context
**Given** an Assistant acting for Freelancer A creates or changes an invoice that refers to a customer, sender profile, bank account or product belonging to Freelancer B
**When** the save runs
**Then** the save is blocked as if that customer, sender profile, bank account or product did not exist, and nothing is stored

### AC-20 (US-05) — cross-context
**Given** Freelancer A asks to delete their account, and the deletion fails partway through
**When** the failure happens
**Then** nothing is removed: A's account, sender profiles, customers, products and invoices all stay as they were, and A is told the deletion failed

### AC-21 (US-07) — cross-context
**Given** Freelancer A works in Europe/Kyiv and has an invoice issued at 00:30 local time on 1 October, which is still 30 September in UTC
**When** A filters invoices or views the dashboard for September in the browser, or an Assistant asks the same while passing Europe/Kyiv
**Then** the invoice does not count in September in either case (it belongs to A's October), and both return identical figures

### AC-22 (US-07) — happy
**Given** an Assistant acting for Freelancer A passes no time zone or an unknown one
**When** it asks for date-based figures or a date filter
**Then** the system uses UTC days and months, exactly as the browser does today when it reports no valid time zone

### AC-23 (US-05) — domain invariant
**Given** one of Freelancer A's invoices
**When** an Assistant acting for A, or A in the browser, marks it as paid, or later moves it out of paid to any other status
**Then** marking it paid records the payment date, saving an invoice that is already paid as paid again leaves its payment date unchanged, and moving it out of paid clears that date, so a paid date exists only while the invoice is paid

### AC-24 (US-05) — happy
**Given** one of Freelancer A's invoices
**When** an Assistant acting for A, or A in the browser, duplicates it
**Then** a new draft is created with the same lines, customer and sender profile, dated today and due in 30 days. It gets the next number from that sender profile's invoice sequence, in the same format as any system-assigned number, and the original invoice is unchanged

### AC-25 (US-03) — cross-context
**Given** Freelancer A has agreed a custom price with one Customer for one product
**When** an Assistant acting for A, or A in the invoice editor, loads the data for a new invoice for that Customer
**Then** both receive the same customers, products and custom prices, and that product's line is proposed at the custom price rather than the product's standard price

### AC-26 (US-04) — happy
**Given** Freelancer A's invoices span several statuses, customers, sender profiles and dates
**When** an Assistant acting for A asks for invoices filtered by status, customer, sender profile and a date range and limited to drafts or to final invoices as the page's tabs allow, sorted by one of the sort options the invoices page offers
**Then** it receives exactly the invoices, in the same order, that A sees on the invoices page with the same filters. A sort option or status the page does not offer is refused, and the system says which value is not allowed

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Behaviour parity — existing checks | 0 changed or removed expected values in existing automated tests (sole exception: the test of the removed list-all-invoices function) | test diff reviewed in `review`; full suite green in CI |
| Dashboard parity | 0 differences above 0.01 per amount; 0 differences in counts, group membership or listed invoices (Debtor / sender-account names and tie order excluded; checked by AC-06) | old-vs-new comparison on the AC-05 fixture during development; before release the old output is recorded as fixed expected values in that test and the old code is deleted (§1 change 5) |
| Request-independence of business functions | 100% of business functions callable with only the acting Freelancer (+ time zone) and no browser request; 0 uses of session, cookie, header or page-refresh facilities inside the business layer | an integration test per function + an automated import check in CI |
| Tenant isolation | 100% of business functions that take a record identifier have a foreign-record test (read, change, delete) proving AC-08 | test inventory checked in `review` |
| Dashboard load latency p95 | ≤ today's baseline (no regression); target reduction TBD (see §8) | production performance traces, 7-day window before vs after |
| Data read per dashboard load | independent of the number of invoices: rows returned by each dashboard query ≤ the number of groups or items displayed | query log in the dashboard parity test |
| Error reporting | each unexpected failure reported exactly once; the invoice-number-conflict alert still fires on a system-proposed number clash | existing failure-reporting tests, unchanged |
| Business layer not reachable from the browser | 0 business-layer functions marked as browser-callable; 0 imports of the business layer from browser-side code | automated check in CI |
| Availability during rollout | 0 minutes of planned downtime; no stored-data change | deploy log |

## 6.1 Security / privacy

- **Data classification:** confidential. The functions read and change Freelancers' and Customers' names, addresses, tax ids and bank details.
- **Personal data touched:** no new fields. Assistants will later read the same personal data the Freelancer already sees.
- **AuthZ/AuthN impact:** identity moves from "read inside every function" to "passed in by the caller". Each business function limits every read and every write to the acting Freelancer's records itself, including the final write, not only a check before it. Business functions do not verify identity. Only trusted server-side callers may call them: today the web wrappers, which identify the Freelancer from the session first; later the Assistant layer, which must authenticate the Freelancer before calling. Business functions are never reachable directly from the browser (checked in CI, §6).
- **Abuse cases:**
  - Cross-tenant read or change by guessing identifiers, from a page or an Assistant: the system hides that the record exists and changes nothing (AC-08, AC-09).
  - Check-then-write drift, where ownership is checked in one step and the write runs on the bare identifier in another: every write is itself limited to the acting Freelancer's records, and it is covered by a foreign-record test (§6 Tenant isolation).
  - A forged acting identity: business functions trust the caller, so none is exposed to the browser or to an Assistant without an authenticating layer in front. The Assistant features must specify that layer (§3).
  - Huge result sets or search texts from a non-browser caller: search text is limited to 100 characters (AC-13), and page-size caps belong to the Assistant tool layer (§3, §8).
  - Account deletion called with the wrong identity: only a wrapper that verified the session may call it, and it stays all-or-nothing (AC-20).
- **Security review:** Required. The authorization boundary moves from each function's own session check to an explicit acting-Freelancer input, for every data function in the app.

## 7. Metrics / KPIs

- **Direct data-store calls inside web server-side functions** — baseline: 114 (counted 2026-09-30 in `lib/actions`). Target: 0 within the feature's release; all of them live in the business layer.
- **Business functions with a request-free integration test** — baseline: 0. Target: 100% at release.
- **Business functions with a foreign-record test** — baseline: foreign-record tests exist for a subset of actions only (`tests/integration/actions/foreign-record-not-found-parity.test.ts`). Target: 100% of functions that take a record identifier, at release.
- **Regressions reported after release that trace back to this change** — baseline: 0 (new change). Target: 0 within 30 days of release.
- **Dashboard load latency p95** — baseline: TBD, measured from 7 days of production traces before release (§8). Target: ≤ baseline at release; the reduction target is set in §8.

## 8. Open questions

- [ ] What is the dashboard latency target? Default now: measure the current p95 of each dashboard section from 7 days of production traces and require no regression; set a reduction target once the baseline is known. — owner: Dmytro Hopko, due: before `sdd:design`
- [ ] The browser validates time-zone names with one zone database, and the data store computes date buckets with another. What happens with a zone name that one knows and the other doesn't? Default now: the time zone is accepted only if both know it; otherwise UTC is used, as for an unknown zone (AC-22). — owner: Dmytro Hopko, due: before `sdd:design`
- [ ] What page-size and full-list limits should the Assistant tool layer enforce, given that business functions return full lists when no page is requested? Default now: no limit in the business layer; the Assistant feature spec sets its caps. — owner: Dmytro Hopko, due: before `sdd:specify` of the AI-chat / MCP feature
