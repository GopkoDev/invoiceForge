---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Dmytro Hopko", "Tech Lead"]
updated_at: "2026-10-01"
feature_size: "M"
---

# Test plan — service-layer

Every business rule and data access moves into a request-free layer that takes the acting Freelancer explicitly and scopes every read and write to them. The web app must behave exactly as before, and every list gains honest search and paging. The existing automated suite is the parity oracle: 0 changed or removed expected values, except the removed list-all-invoices test (spec §6).

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: the list-query rules and page envelope, local-day bounds, the paid-date rule, the acting-Freelancer factory's refusal, wrapper revalidation and report-once behaviour, the boundary and inventory checks. | In-memory, no database. Framework facilities (session, page refresh, error monitoring) are replaced by spies only at the web-wrapper edge, never inside the business layer. |
| Integration | Each business function against a real PostgreSQL: owner scoping, numbering under the row lock, the SQL dashboard aggregates, time-zone resolution against the database's zone list, the all-or-nothing deletion. | One ephemeral PostgreSQL container per suite with the repo's migrations applied. Business functions are called with only a test-built acting Freelancer, with no request, session or cookie (spec §6 request-independence). |
| Contract | The business-layer public API shapes that web wrappers and the future Assistant rely on: `Page<T>`, the result union's failure shape, `details.kind` (contracts/public-api.md §1.2, §1.3). | One table-driven check that calls every list function and every refusal path and validates the real result against a schema written from public-api.md. There are no hand-rolled stubs. |
| E2E | Parity of the web app as the Freelancer and the Visitor see it (US-01, US-08). | The existing end-to-end suites (smoke, route sweep) run unchanged against ephemeral dependencies, plus one new flow for AC-03. |
| Load | Dashboard p95 latency must not regress (spec §6). | The load tool already in your repo, or e.g. k6 or Locust. It runs pre-release, while the old in-memory implementation still exists (before T19). |
| Component / Visual-regression / E2E-through-UI | <!-- N/A: no UI surface — sad.md target_surfaces: [backend-service] --> | — |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy | existing automated suite passes unchanged after each domain moves | integration + unit | the only test diff is the removed list-all-invoices test, and no expected value changes |
| AC-01 happy | existing end-to-end smoke and route sweep pass unchanged | e2e | every page, list, editor and the dashboard render the same records, order and messages |
| AC-02 error | invalid form values are refused with today's field messages | integration | nothing saved, and the same plain-language message sits on the same field (e.g. negative quantity, unknown status) |
| AC-03 happy | wrapper refreshes today's pages only after a successful change | unit | the same set of pages is refreshed as today on success, and nothing is refreshed on any refusal |
| AC-03 happy | new bank account shows on its sender profile without a reload | e2e | the sender profile page lists the new account right after saving |
| AC-04 error | unexpected failure is reported exactly once | unit | the business function reports once, and the web wrapper adds no second report |
| AC-04 error | data store unreachable during a read or a change | integration | the caller gets the plain-language failure with no internal detail, and nothing is stored |
| AC-05 happy | old and new dashboard agree on the parity fixture | integration | every amount equal after rounding to the cent, and every count, group membership and listed invoice identical |
| AC-05 happy | each dashboard query reads no more rows than it displays | integration | rows returned per section ≤ groups or items shown, whatever the invoice history size |
| AC-06 invariant | renamed Customer appears once under the latest overdue invoice's name | integration | one Debtor entry named from the latest issue date, then the latest created |
| AC-06 invariant | Debtors tied at the top-three cut-off are ordered by name | integration | the tie is decided by name, and the sender profiles and accounts come in the fixed order |
| AC-07 happy | request-free caller sees exactly what the page shows | integration | customers, products, custom prices, sender profiles, bank accounts, invoices and dashboard figures equal to what the matching page receives |
| AC-08 authorization | every id-taking function answers another Freelancer's id like a missing one | integration | the same not-found answer as for a never-existing id, and B's row is byte-identical afterwards (one test per function: read, change, delete) |
| AC-08 authorization | list that belongs to another Freelancer's parent is not found | integration | the custom prices of B's customer, B's product and B's sender profile's bank accounts all answer not found, and no records are returned |
| AC-09 authorization | signed-in Freelancer opens or submits B's record id | integration | the same not-found outcome as today, and B's record is neither shown nor changed |
| AC-10 authorization | no session, or a session whose account is gone, never reaches a business function | unit | the caller is refused as not signed in, and no business function is called |
| AC-10 authorization | Visitor reaching any private page or action is sent to sign in | e2e | redirected to sign in, with no private data in the response |
| AC-11 happy | search "ACME", page 1, 2 per page on 23 customers with 5 matches | unit + integration | 2 of the 5 in the usual order, total 5, page 1, 3 pages, more results exist |
| AC-11 happy | every list returns a valid page envelope | contract | every list result matches the shared page shape |
| AC-12 happy | a list asked with no search, page or page size is the full list | unit + integration | the full list in today's order, page 1, total = count, one page (none if empty), no more results |
| AC-12 happy | page given without a page size uses 10 | unit | page size 10 |
| AC-13 error | page or page size 0, −5 or 2.5 is refused | unit + integration | no records, and the caller is told which value is invalid and what is allowed |
| AC-13 error | search text of 101 characters is refused | unit | no records, and the caller is told the 100-character limit |
| AC-13 error | reversed or one-ended invoice date range is refused | integration | no records, and the caller is told the dates must both be given with the start on or before the end |
| AC-13 error | every refusal carries the shared failure shape with the invalid field named | contract | every refusal matches the result union's failure shape, with field errors keyed by the invalid value |
| AC-14 happy | page 99 of a three-page list answers page 1 | unit + integration | page 1 items, and the reported page is 1 |
| AC-14 happy | empty list answers page 1 with no pages | unit | page 1, 0 pages, no items |
| AC-15 happy | invoice created without a number takes the next sequence number | integration | the number equals what the browser flow would assign, and the sequence advances |
| AC-16 invariant | two concurrent saves for one sender profile never share a number | integration | two distinct numbers, and the saves run one after the other |
| AC-16 invariant | typed number already used in the sender profile is blocked | integration | nothing stored, and the message says the number is already used in this sender profile |
| AC-17 invariant | Customer or sender profile with invoices can't be deleted | integration | deletion blocked with the count of dependent invoices |
| AC-17 invariant | invoice saved between the count and the delete | integration | deletion still blocked with the new count, and nothing removed |
| AC-18 invariant | legacy invoice saved without confirming the recalculated total | integration | save blocked, with the old and the new total offered for confirmation |
| AC-18 invariant | totals-changed refusal carries both totals in its details | contract | the failure matches the shape with the totals-changed kind and two exact decimal totals |
| AC-19 cross-context | create or update referring to B's customer, sender profile, bank account or product | integration | blocked as if the record didn't exist, and nothing stored (one test per reference kind) |
| AC-20 cross-context | account deletion that fails partway through | integration | the account, sender profiles, customers, products and invoices all remain, and the Freelancer is told the deletion failed |
| AC-21 cross-context | Kyiv invoice at 00:30 on 1 October falls in October's local bounds | unit | the invoice is outside September's local-day range |
| AC-21 cross-context | September filter and dashboard with Europe/Kyiv exclude that invoice | integration | the invoice list and the dashboard figures agree, the invoice is excluded, and browser and request-free callers get identical results |
| AC-22 happy | missing or unknown zone falls back to UTC | unit + integration | UTC days and months are used, and a zone known to one zone list but not the other also gives UTC |
| AC-23 invariant | paid date follows the status | unit + integration | set when entering paid, kept on paid again, cleared when leaving paid |
| AC-24 happy | duplicated invoice is a new draft with the next number | integration | same lines, customer and sender profile, dated today, due in 30 days, the next system number format, and the original unchanged |
| AC-25 cross-context | editor data proposes the Customer's custom price | integration | editor and request-free caller get identical data, and the product line uses the custom price |
| AC-26 happy | invoice filters and sort match the invoices page | integration | the same invoices in the same order for status, customer, sender profile, date range, drafts or final tab and each sort option |
| AC-26 happy | unknown sort option or status is refused | integration | no records, and the caller is told which value is not allowed |

## Edge cases / error paths

- Foreign filter id on the invoice list (B's customer or sender profile as a filter) → expected: an empty page, the same answer as a never-existing filter id.
- Status change on a missing or foreign invoice → expected: not found, and nothing changed, including the paid date.
- The acting Freelancer's own account deleted mid-call (profile update, account deletion, data export) → expected: the business function answers not found, and the web caller still sees today's outcome (sent to sign in, or the export's failure response).
- Invoice number clash on a system-assigned number (allocator backstop) → expected: nothing stored, and the invoice-number-conflict alert is raised once (spec §6 error reporting).
- Duplicating an invoice whose stored amounts break today's rules → expected: refused with the reasons listed, and nothing created.
- Deleting a non-draft invoice, a product used on invoices, or a bank account with invoices → expected: blocked with today's message, and nothing removed.
- Changing the profile email to one already used by another account → expected: blocked with today's message.
- Bank-account search text that matches only an account number or IBAN → expected: no match, because those fields are never searched.
- A list's total and items read while another change lands → expected: they may differ by one. This is accepted for a read, so the test asserts no repeated or skipped record across pages, not an exact total under concurrency.
- A cast to the acting-Freelancer type outside its factory module, a browser-callable marker in the business layer, or a business-layer import from browser code → expected: the boundary and lint checks fail.
- An exported business function with no request-free test, or an id-taking one with no foreign-record test → expected: the inventory check fails (spec §7 KPIs).

## Test data

- **Seed strategy:** the existing factories for user, sender profile, bank account, customer, product, custom price and invoice (including the legacy-invoice factory), plus `actingFreelancerForTest(userId, timeZone?)` for request-free calls (data-model.md §Test fixtures). Emails use the `@example.test` placeholder domain.
- **Two-Freelancer set:** Freelancers A and B each own one record of every entity. Every foreign-record, owner-scoping and two-Freelancer dashboard test builds on it.
- **Dashboard parity fixture:** the one fixture of AC-05. It has totals that drift in floating point (0.10 + 0.20), several currencies, a Customer renamed between two invoices, Debtors tied at the top-three cut-off, and a Europe/Kyiv Freelancer with a daylight-saving switch inside the range. Before T19 it runs old against new. After T19 the old outputs are recorded values.
- **Integration dependency:** an ephemeral real PostgreSQL (a throwaway container, one per suite, with the repo's migrations applied). The datastore is never mocked, because the owner filters, row locks, restrict violations and `AT TIME ZONE` buckets only exist in the real database.
- **Cleanup boundary:** per test. Tables are truncated between tests, so every test seeds its own A/B set. The container is torn down per suite. The per-process zone-list cache is reset between tests that stub it.

## NFR validation (load)

- **NFR: dashboard load latency p95 ≤ today's baseline (no regression)** → pre-release scenario, run while both implementations exist (after T18, before T19 deletes the old code). One Freelancer holds 10,000 invoices over 3 years in 3 currencies. Call each of the seven dashboard sections at 5 requests/s for 2 minutes, once through the old implementation and once through the new. Assert that the new p95 ≤ the old p95 for every section and that the error rate is 0. Run it with the load tool already in your repo, or e.g. k6 or Locust.
- **NFR: rows returned by each dashboard query ≤ groups or items displayed** → this is not a load test. It is asserted in the AC-05 integration row through the query log.
- The production measurement stays as the spec defines it: 7 days of traces before and after release, per `dashboard.<section>` span. This load scenario is an early warning, not a replacement.

## CI placement

- **On every PR:** unit, contract and integration. Integration already runs on every PR in this repo, and the parity oracle depends on it.
- **On schedule / pre-release:** e2e, and the load scenario once, before the dashboard cutover (T19).

## Task traceability

| Task | Rows it owns |
|---|---|
| T1 | boundary edge case |
| T2 | AC-04 unit |
| T3 | AC-10 unit, AC-21 unit, AC-22 |
| T4 | AC-11–AC-14 unit |
| T6 | AC-02, AC-03 unit, AC-08, AC-09, AC-11 integration, AC-17 |
| T7 | AC-08 |
| T8 | AC-08, including the parent list |
| T9 | AC-08, AC-17 |
| T10 | AC-03 e2e, AC-08, the IBAN search edge |
| T11 | AC-04 integration, AC-20, the tenant-gone edge |
| T12 | AC-07, AC-09, AC-25 |
| T13 | AC-12–AC-14 integration, AC-21 integration, AC-22, AC-26 |
| T14 | AC-15, AC-16, AC-19 |
| T15 | AC-18, AC-19, AC-23, AC-02 |
| T16 | AC-24, AC-08, the duplicate and delete edges |
| T17 | AC-05, AC-07, AC-21, AC-22 (dashboard) |
| T18 | AC-05, AC-06, then the load scenario |
| T19 | AC-01 e2e, the recorded AC-05 values |
| T20 | AC-01, the inventory edge, the contract check, AC-10 e2e |
