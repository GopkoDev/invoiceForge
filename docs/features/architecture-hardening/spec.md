---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-09-26"
feature_size: "M"
---

# Spec — architecture-hardening

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (repo-root; no feature-scoped CONTEXT)
> **Reference module / docs / channels used:** `docs/architecture-map.md` (§Conventions, §Constraints, §Review findings F1–F7), `docs/code-review-findings.md` (A1–A10, L1–L10) — plus the interview and CONTEXT.

## 1. Context

Invoice Forge is in production with real Freelancers who create invoices, export them as PDFs and send them to their Customers. A review on 2026-09-26 found 27 open problems. The image-conversion endpoint that fetches a sender profile's logo for PDFs can be called by any Visitor, and it will fetch any address, including the cloud provider's internal metadata service, with no limit on response size. Invoice data can be corrupted in several ways: two invoices in the same sender profile can get the same number, line totals and discounts sent by the browser are stored without checks (so totals can be negative), and a Freelancer who has any invoice cannot delete their account at all. List and dashboard pages crash or return wrong results on malformed links, and when a load fails they show an empty state or a "not found" page. Account and profile actions do not follow the shared guard convention, and the repository config has gaps (F4–F6).

Why now: these are live risks, not hypothetical ones. The unauthenticated server-side fetch is exploitable today, and every day the data bugs stay open adds more invoices whose numbers or totals the Freelancer cannot trust.

Committed approach: the server enforces every rule itself instead of trusting the browser form. When amounts or invoice data the Freelancer entered break a rule, the Freelancer is blocked and told why in plain language, and the entered value is never silently corrected. Values the system derives itself (a line total, a proposed invoice number, filters read from a link) are computed or normalised by the system, and the result is shown. The fix ships in waves ordered by risk: (1) the image-conversion security fix first, as its own release, then (2) invoice data integrity, (3) input and link validation, and (4) the rest. The market supports this direction. Stripe and QuickBooks enforce unique invoice numbers, Invoice Ninja's account deletion is total and irreversible, and Stripe accepts logos only as uploads. Two gaps no competitor covers become our differentiators: a manually typed number that neither collides nor moves the invoice sequence (QuickBooks advances its sequence on manual numbers), and a deletion warning that states how many invoices will be lost and offers export at that moment. The sharpest failure mode the adversarial pass found is this: if the account-deletion fix makes deletes cascade through the schema, deleting a single customer would silently destroy that customer's invoices. The invariant "a customer or sender profile that has invoices can never be deleted on its own" is kept explicitly (AC-22). Success means zero open High/Medium findings, and a Freelancer who can trust every stored number and total.

Assumption: some sender profiles already hold invoices that share a number (L2, L4). Before wave 2 ships, existing duplicates are counted. If the count is zero, uniqueness is enforced for every invoice at once. Otherwise the one-time clean-up question in §8 blocks design, and until it is settled, legacy duplicates are handled by AC-17.

Traceability — finding → user story:

| Findings | US |
|---|---|
| A1, A2, F1, F2 | US-01 |
| L2, L4, L10 (duplicate numbering) | US-02 |
| L3, L5, L8, L10 (custom-price customer, AC-31) | US-03 |
| L7 | US-04 |
| L1, F3, A10 | US-05 |
| A3, A4, A5, L6, L9, A9 | US-06 |
| A6, A7 | US-07 |
| A8 | US-08 |
| F4, F5, F6 | §6 repository-hygiene rows |
| F7 | in scope since 2026-09-27 — test-plan.md, task T00 |

## 2. Goals

- A Visitor can reach no endpoint unless it is deliberately public, and image conversion can never reach internal or private network addresses.
- Every invoice saved from now on has an invoice number that is unique within its sender profile, and totals that equal what the Freelancer saw and are never negative.
- A malformed link or a failed load never crashes a page, and is never shown as empty data or a missing page.
- Account deletion always succeeds, and removes all of the Freelancer's data.

## 3. Non-goals

<!-- Amended 2026-09-27 (plan-tests): the F7 non-goal "ship without tests" was reversed by the owner. Automated tests are in scope — see test-plan.md; the harness is task T00. -->
- **Uploading a logo file instead of a link.** This is the stronger fix for server-side fetching, but it needs file storage and a migration of existing logos, which is beyond size M. Planned as a separate feature.
- **Bulk repair of data that is already corrupted.** Existing bad invoices are corrected when a Freelancer next edits them (AC-17). Whether to also run a one-time clean-up is tracked in §8.
- **Soft delete or a grace period for account deletion.** Deletion is immediate and total by decision; export beforehand is the safety net.
- **Removing a deleted Freelancer's records from error monitoring and logs.** These expire under their normal retention period; account deletion (AC-20) does not reach into external monitoring.
- **Letting the Freelancer enter the actual payment date.** The paid date is the moment the status changed to Paid (AC-18); a manually entered payment date is a new capability, not a fix for L7.

## 4. User stories

<!-- N/A: Visitor has no goals of its own — it is only an adversary or crawler; covered by AC-02, AC-05, AC-23, AC-30 -->

### US-01: Include my logo safely in PDFs
**As a** Freelancer
**I want** my sender profile's logo fetched for my PDFs only from safe, real image links
**So that** my invoices carry my branding and the app can't be abused to reach internal systems

### US-02: Get a unique invoice number
**As a** Freelancer
**I want** every invoice I save to get an invoice number that is unique within its sender profile, whether I keep the proposed number or type my own
**So that** my numbering is continuous and a save never fails over a number I didn't choose

### US-03: Trust invoice amounts
**As a** Freelancer
**I want** the system to recompute and check every amount I save
**So that** the totals on my PDFs and dashboard are always correct and never negative

### US-04: Track when an invoice was paid
**As a** Freelancer
**I want** the paid date to follow the invoice's status
**So that** my payment history and dashboard reflect reality

### US-05: Manage and delete my account safely
**As a** Freelancer
**I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
**So that** I can leave the product cleanly and no one else can touch my account

### US-06: Use any link to my lists and dashboard
**As a** Freelancer
**I want** invoice-list and dashboard links with bad or tampered parameters to open with sensible defaults, and date ranges to include the end date
**So that** a shared or bookmarked link never crashes the page or shows wrong figures

### US-07: See an honest error when data fails to load
**As a** Freelancer
**I want** a clear error with a retry when my data can't be loaded
**So that** I don't mistake a failure for "no data" or "page missing" and create duplicates

### US-08: Keep my private pages out of search engines
**As a** Freelancer
**I want** search engines told not to crawl the private sections of the app
**So that** crawlers don't pull links to my signed-in area into search results

## 5. Acceptance criteria

### AC-01 (US-01) — happy
**Given** a signed-in Freelancer whose sender profile logo is a secure link to an image within the size limit
**When** the Freelancer generates an invoice PDF
**Then** the PDF includes the logo

### AC-02 (US-01) — authorization
**Given** a Visitor with no signed-in session
**When** the Visitor asks the app to fetch an image from any address
**Then** the system refuses without fetching anything, and the refusal reveals nothing about the address

### AC-02b (US-01) — authorization
**Given** a signed-in Freelancer
**When** the Freelancer asks the app to fetch a logo
**Then** the system fetches only the logo link stored on a sender profile the Freelancer owns, accepts no other address, and treats a sender profile that isn't theirs as not found

### AC-03 (US-01) — error
**Given** a signed-in Freelancer whose logo link is not secure, is unreachable, times out, returns something other than an image, exceeds the size limit, leads (directly or after redirects) to an internal or private network address, or whose logo fetch limit per minute is reached
**When** the Freelancer generates an invoice PDF
**Then** the PDF is still produced without the logo, and the Freelancer sees a plain-language warning: a specific reason only for "link is not a secure web address", "file is not an image", "file is larger than the size limit" and "too many requests, try again in a minute"; unreachable, timed-out and internal or private addresses all share one message, "the logo could not be loaded from this link", so the warning never reveals which addresses exist

### AC-04 (US-01) — error
**Given** a Freelancer editing a sender profile
**When** the Freelancer saves a logo link that is not a secure web address
**Then** the system blocks the save and shows, next to the logo field, that the link must be a secure web address

### AC-05 (US-01) — authorization
**Given** a Visitor with no signed-in session
**When** the Visitor calls any app endpoint other than a deliberately public one
**Then** the system denies access by default, including endpoints added in the future: a page request is sent to sign-in, and a data request or action is refused as "not signed in" without returning any data. The deliberately public set is exactly: sign-in and sign-up, the landing page, privacy, terms, the crawling rules and sitemap, social-share preview images, and the app icons and manifest; anything else becomes public only by being added to this list explicitly

### AC-06 (US-02) — happy
**Given** a Freelancer creating an invoice under a sender profile and leaving the invoice number field empty (the editor shows the proposed number only as a hint, "assigned on save")
**When** the Freelancer saves the invoice
**Then** the system assigns the next free number from that profile's invoice sequence at the moment of saving, advances the sequence, and shows the final number. An empty number field is the only signal that a number is system-proposed; any filled-in number is manual, even if it equals the hint

### AC-07 (US-02) — domain invariant
**Given** a Freelancer with two editor tabs open for new invoices under the same sender profile, both showing the same proposed number as a hint and both with the number field left empty
**When** both invoices are saved at about the same time
**Then** both are saved, each with a different invoice number, and neither save fails

### AC-08 (US-02) — domain invariant
**Given** a Freelancer who types an invoice number that is already used in the same sender profile, where two numbers count as the same if they match ignoring letter case and leading or trailing spaces (so "INV-001" and " inv-001 " are the same number)
**When** the Freelancer saves the invoice
**Then** the system blocks the save, says that this invoice number is already used in this sender profile, and leaves the invoice sequence unchanged

### AC-09 (US-02) — domain invariant
**Given** a sender profile whose next proposed number was already taken by a manually typed invoice number
**When** the Freelancer saves a new invoice without touching the number
**Then** the system skips to the first free number, advances the sequence to it, and the Freelancer never sees an "already used" message

### AC-10 (US-02) — happy
**Given** a Freelancer who saves an invoice with a manually typed number (including one equal to the proposed hint) that is not yet used in the sender profile
**When** the invoice is saved
**Then** the invoice keeps that number and the invoice sequence does not move

### AC-11 (US-02) — cross-context
**Given** a Freelancer moving an existing invoice from sender profile A to sender profile B
**When** the Freelancer saves the change
**Then** the invoice number field is cleared and the same rules as for a new invoice in B apply: left empty, the invoice gets a number from B's invoice sequence and B's sequence advances (AC-06, AC-09); filled in, it is a manual number (AC-08, AC-10). A's invoice sequence does not change, and A's old number is not proposed again. The invoice never keeps A's number under B unless the Freelancer types it and it is free in B

### AC-12 (US-02) — happy
**Given** a Freelancer duplicating an existing invoice
**When** the copy is created
**Then** the copy gets a number from its sender profile's invoice sequence, in the same format as a newly created invoice

### AC-13 (US-03) — happy
**Given** a Freelancer saving an invoice with line items
**When** the invoice is saved
**Then** the system stores each line total as quantity × price rounded to 2 decimal places (half rounds up), whatever the browser sent; the subtotal is the sum of the rounded line totals, and the tax amount is rounded once. The editor uses the same rule, so the saved total equals the total the editor showed. If the browser sent different figures, the system's figures are stored and shown after saving, and the save is not blocked

### AC-14 (US-03) — error
**Given** a Freelancer entering a line with a negative price or a quantity of zero or less, or a negative shipping amount, a negative discount, or a tax rate outside 0–100 %
**When** the Freelancer saves the invoice
**Then** the system blocks the save and shows next to the offending field or line that the price, shipping and discount can't be negative, the quantity must be greater than zero, and the tax rate must be between 0 and 100 %

### AC-15 (US-03) — domain invariant
**Given** a Freelancer entering a discount (a fixed amount in the invoice currency) larger than the subtotal plus shipping
**When** the Freelancer saves the invoice
**Then** the system blocks the save and explains that the discount can't exceed the subtotal plus shipping, so an invoice total can never be negative; a discount exactly equal to the subtotal plus shipping is allowed and gives a total of zero

### AC-16 (US-03) — error
**Given** a Freelancer updating a Customer's custom price with a negative amount, a non-number, or a note longer than allowed
**When** the Freelancer saves it
**Then** the system blocks the save with the same field messages it shows when a custom price is created

### AC-17 (US-03) — cross-context
**Given** an invoice saved before this change whose stored total differs from the recomputed total, whose amounts break the rules above, or whose invoice number is also used by another invoice in the same sender profile
**When** the Freelancer edits and saves it in the editor
**Then** the system shows the old and new totals and asks for confirmation before saving; an invoice whose amounts break the rules can't be saved until they are corrected; and an invoice with a shared number can be opened and viewed but can't be saved until its number is changed to a free one. A status change from the invoice list does not touch amounts or number and is never blocked by these checks

### AC-18 (US-04) — happy
**Given** a Freelancer setting an invoice's status to Paid from another status, from the invoice list or by saving it in the editor
**When** the change is saved
**Then** the system records the moment of that change as the paid date; saving an invoice that is already Paid again leaves its paid date unchanged

### AC-19 (US-04) — domain invariant
**Given** a Paid invoice
**When** the Freelancer changes its status to anything other than Paid
**Then** the paid date is cleared, and a status the product doesn't know is rejected with a plain-language message

### AC-20 (US-05) — happy
**Given** a Freelancer who has invoices
**When** the Freelancer chooses to delete their account
**Then** the system warns how many invoices will be permanently lost and offers an export first, and after confirmation removes all of the Freelancer's data in full (either everything is removed or nothing is): the account, its sign-in links, every session on every device, its email history, sender profiles with their bank accounts, Customers, products, custom prices, and invoices with their lines

### AC-21 (US-05) — authorization
**Given** a Freelancer who deleted their account while still signed in on another device
**When** that other device performs any action
**Then** the device is treated as a Visitor: signed out, shown no data, and nothing is created

### AC-22 (US-05) — cross-context
**Given** a Freelancer deleting one Customer or one sender profile that has invoices
**When** the Freelancer confirms the deletion
**Then** the system blocks it, says how many invoices depend on it, and no invoice is removed

### AC-23 (US-05) — authorization
**Given** a Visitor with no signed-in session
**When** the Visitor tries to change account or profile settings
**Then** the system denies it as "not signed in" before looking at any submitted values

### AC-24 (US-05) — happy
**Given** a signed-in Freelancer
**When** the Freelancer exports their data
**Then** they receive one file whose name starts with the product name "Invoice Forge", holding the same categories of data that account deletion removes (AC-20), except sessions

### AC-25 (US-06) — error
**Given** a dashboard link whose date range is malformed, including a range whose start is after its end
**When** the Freelancer opens it
**Then** the dashboard shows the current month in the Freelancer's time zone (the one their browser reports), and the date filter displays the range that was actually applied

### AC-26 (US-06) — error
**Given** an invoice-list link with an out-of-range or malformed page, a page size not offered in the list, or an unknown sort field, sort order, status or tab
**When** the Freelancer opens it
**Then** the list opens with the default for each bad value, and the controls on screen match what is actually shown

### AC-27 (US-06) — happy
**Given** invoices issued at any time on the last day of a filtered date range, where days are counted in the Freelancer's time zone (the one their browser reports)
**When** the Freelancer filters the invoice list by that range
**Then** those invoices are included

### AC-28 (US-07) — error
**Given** a Freelancer opening any page that shows their data (the invoice list, the dashboard, the sender profiles, customers and products pages, any invoice, customer or sender profile detail page, and the invoice editor) while that data can't be loaded
**When** the page renders
**Then** the Freelancer sees an error state with a way to retry, not an empty state and not "page not found", and the failure is reported to error monitoring. "Not found" is shown only for a record that doesn't exist or isn't theirs (AC-29), never for a load failure

### AC-29 (US-07) — authorization
**Given** a Freelancer opening a link to an invoice, customer or sender profile that belongs to another Freelancer
**When** the page loads
**Then** the system shows "not found", exactly as for a record that doesn't exist, so it doesn't reveal that the record exists

### AC-30 (US-08) — happy
**Given** a search engine crawler (a Visitor)
**When** it reads the app's crawling rules
**Then** it is told not to crawl the root or any page of each private section

### AC-31 (US-03) — cross-context
**Given** a Freelancer adding a custom price for a chosen Customer and product, from either the product's page or the customer's page
**When** the Freelancer saves it
**Then** the custom price is linked to exactly that Customer and that product, and if either one isn't the Freelancer's own, the save is blocked as not found

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Logo fetch — size cap | ≤ 512 KB per image; larger is refused | enforced limit + warning count in logs |
| Logo fetch — time cap | ≤ 5 s per fetch, then aborted | enforced timeout + abort count in logs |
| Logo fetch — rate limit | ≤ 30 fetches per minute per Freelancer; only real fetches from the external address count, and reusing a logo already fetched within the same editor or export session does not | enforced limit; refusal count in logs |
| Invoice save latency p95 (incl. number assignment) | TBD — baseline + 20% (see §8) | production performance traces, 7-day window |
| Duplicate-number save failures on untouched numbers | 0 per month | error-monitoring count of "number already used" where the number was system-proposed |
| Unhandled page errors from malformed links | 0 per month | error-monitoring count on list/dashboard pages |
| Data export latency p95 | TBD — ≤ baseline − 30% (see §8) | production performance traces |
| Dashboard date-range change | reloads only date-dependent sections (3 fewer data loads per change) | request count per change in a production trace |
| Repository hygiene — plugin setup | 0 missing-plugin failures on a fresh clone; the plugin installs from shared repo config alone (F4) | fresh-clone check on a second machine |
| Repository hygiene — personal settings | 0 personal settings files tracked in the repo; 0 empty route folders (F5, F6) | ignore-rule check + folder scan in review |
| Availability during rollout | 0 minutes of planned downtime; the schema change is backward-compatible within a wave | deploy log |

## 6.1 Security / privacy

- **Data classification:** confidential. Invoices hold Freelancers' and Customers' names, addresses, tax ids and bank details.
- **Personal data touched:** no new fields. Account deletion now actually removes invoice copies of Customer data, which it silently failed to do before.
- **AuthZ/AuthN impact:** every non-public endpoint requires a signed-in session by default, and new endpoints are private unless deliberately marked public. Account and profile changes check the session first, before any input. Every data read and write stays scoped to the calling Freelancer. A session whose account no longer exists is treated as a Visitor.
- **Abuse cases:**
  - Server-side request forgery through the logo link, including redirects and a second DNS lookup that points at an internal address: the fetch accepts no free-form address, only the logo stored on the caller's own sender profile (AC-02b), and private, loopback and link-local destinations are refused at every hop. The refusal is generic (AC-03 lists the only reasons shown separately) and never echoes upstream status or error text.
  - Resource exhaustion by pointing the logo at a huge file or an endless stream: the size cap, time cap and per-Freelancer rate limit from §6 apply. Open sign-up means anyone can get a session, so the session check alone is not enough.
  - Cross-tenant access to another Freelancer's invoice, customer or profile by guessing ids: the system hides that the record exists (AC-29).
  - A stale session acting after account deletion: treated as a Visitor (AC-21).
  - Error text leaking internals (raw database messages on the error card): error states show plain-language text only, and the details go to error monitoring.
- **Security review:** Required. The feature is size M and changes the authorization boundary of every endpoint.

## 7. Metrics / KPIs

- **Open High/Medium review findings** — baseline: 20 (High: A1, A2, F1, L1, L2, L3; Medium: A3–A7, L4–L8, F2–F5). Target: 0 within 30 days of the first wave's release.
- **Account deletions that fail** — baseline: 100% for Freelancers who have any invoice. Target: 0 failed deletions within 14 days of release.
- **Newly saved invoices with a negative total or a line total ≠ quantity × price** — baseline: to be measured with a one-time count on release day. Target: 0 new ones in the 30 days after the integrity wave ships.
- **"Number already used" failures on system-proposed numbers** — baseline: to be measured from error logs for the 14 days before release. Target: 0 within 14 days of the numbering fix.
- **Unhandled errors on list/dashboard pages caused by link parameters** — baseline: to be counted in error monitoring for the 30 days before release. Target: 0 within 30 days.

## 8. Open questions

- [ ] Should we run a one-time clean-up of invoices that are already corrupted (negative totals, line totals ≠ quantity × price, stale paid dates, invoice sequences behind their highest number, invoice numbers shared within a sender profile)? Default now: no bulk fix; invoices are corrected on their next edit (AC-17). Becomes a blocker for design if the pre-wave-2 count of duplicate numbers is above zero (§1). — owner: Dmytro Hopko, due: before `sdd:design`
- [ ] Invoice prefixes are currently unique across ALL Freelancers, so one Freelancer can learn that another already uses a prefix. Should prefixes be unique only within one Freelancer's account? Default now: out of scope, record as a follow-up. — owner: Dmytro Hopko, due: before `sdd:design`
- [ ] What are the p95 latency targets for saving an invoice (including number assignment) and for the data export? Default now: measure the current p95 from production traces and set the save target to that baseline + 20% (atomic numbering may add a little), and the export target to that baseline − 30% (A10: the export's reads become parallel). — owner: Dmytro Hopko, due: before `sdd:design`
- [ ] Editor tabs opened before a deploy may send data in the old shape after a wave ships. Should the editor detect this and ask the Freelancer to reload, instead of failing the save? Default now: accept the risk and ship waves at low-traffic hours. — owner: Dmytro Hopko, due: before `sdd:tasks`
- [ ] Review 2026-09-27 F-13: the test-plan's e2e, e2e-through-UI and contract rows are not implemented yet (AC-01, AC-02, AC-03, AC-06, AC-20, AC-21 other-device, AC-26, AC-29 e2e/e2e-through-UI; AC-03 and AC-30 contract). The AC-05 route sweep and the AC-21 real session-callback and stale-session tests are not deferred (follow-up T34). Default now: the unit, component and integration rows cover these ACs, and Playwright is not yet wired to a production build. — owner: Dmytro Hopko, due: before each wave's production release (wave 1 for the AC-01–AC-05 rows)
