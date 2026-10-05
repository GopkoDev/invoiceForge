---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Dmytro Hopko", "Tech Lead"]
updated_at: "2026-10-05"
feature_size: "M"
---

# Test plan — mcp-server

A read-only Assistant connection, authenticated by named, revocable Personal keys, whose every figure matches the dashboard because both use one overdue rule and one Freelancer time zone; plus the "Connect your AI" page, the saved time zone, and keys in the data export and account deletion.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: key format and checksum, key-name validation, the overdue predicate and days-overdue count, period validation, Freelancer-entered-text marking, the proxy exception list, the scan for hand-written overdue checks. | In-memory, no database; a fake clock where "today" matters. |
| Integration | The business layer and the Assistant endpoint against the database they own: key create/list/revoke/authenticate, limits, every tool's rows and totals, dashboard parity, time zone, export, deletion. | A throwaway database container per suite with all migrations applied; never the database from the repo's environment files. |
| Contract | The Assistant connection's boundary: tool listing, every tool's answer envelope (page, cap, totals, time zone), refusals, the "page does not exist" answer, the not-found answer. | Validate real answers against `contracts/openapi.yaml` by operation; no hand-rolled stubs. |
| E2E | The Assistant connection reached over real HTTP through the proxy (session-only and key-less calls). | The running app against a throwaway database; requests sent as an outside caller would. |
| Load | The two numeric latency NFRs for Assistant calls. | The load tool already in your repo, or e.g. k6 or Locust, against a preview deployment with seeded data. |
| Component | Connect your AI (create form, one-time reveal, key lists, revoke confirmation, copy action), the dashboard entry point, the Profile time-zone card, the derived overdue status badge. | Render each component in isolation; assert output and interactions for the states in `screens.md`. |
| Visual-regression | <!-- N/A: the repo has no visual baseline infrastructure; new screens reuse existing components, and their states are covered by component tests --> | — |
| E2E-through-UI | The user flows from `ux-flows.md`: connect an Assistant, manage keys, open an invoice from an Assistant link, one "today" everywhere, overdue without marking by hand. | Drive the real UI in a browser against a throwaway database; one test per flow. |

## AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy path | entry point shown while no key has ever passed a key check | integration | the "has used a key" read is false for a Freelancer with no keys or only never-used keys |
| AC-01 happy path | entry point gone for good once any key was used, even after every key is revoked | integration | the read stays true after the used key is revoked |
| AC-01 happy path | dashboard and settings show the Connect your AI entry point only while unused | component | entry point rendered with a link to the connect page in the unused state; absent in the used state |
| AC-01 happy path | Freelancer reaches Connect your AI from the dashboard and from settings | e2e-through-UI | both entry points open the connect page (spec: `tests/e2e/mcp-key-flows.spec.ts`) |
| AC-02 happy path | generated key carries the recognisable prefix and a valid checksum | unit | prefix present, checksum verifies, a changed character fails the checksum |
| AC-02 happy path | creating a key stores only its digest and last four characters | integration | the stored record holds name, digest, last four and creation date; the full key is not stored anywhere |
| AC-02 happy path | full key is revealed once with a copy action and a not-shown-again warning | component | reveal shows the key, copy action and warning; after leaving, only name, creation date and last four are shown |
| AC-02 happy path | connect page shows setup steps that keep the key in a private setting and three example prompts | component | one setup block per supported assistant, none writes the key into a project file; exactly three example prompts with copy actions |
| AC-02 happy path | Freelancer creates "Laptop assistant" and sees the key exactly once | e2e-through-UI | key visible once; after reload the row shows name, date and last four only (spec: `tests/e2e/mcp-key-flows.spec.ts`) |
| AC-03 error | key name rule: trimmed, 1 to 50 characters | unit | empty, whitespace-only and 51-character names rejected; surrounding spaces removed before the length check |
| AC-03 error | name equal to another active key, ignoring letter case, is refused | integration | no key created; the Freelancer is told the name must be 1–50 characters and different from their other active keys |
| AC-03 error | a revoked key's name can be reused | integration | creation succeeds when the only same-named key is revoked |
| AC-03 error | create form shows the name rule when the name is refused | component | the rule message appears under the name field and no reveal is shown |
| AC-04 domain invariant | 11th active key is refused | integration | no key created; message says at most 10 keys can be active and a revoke makes room |
| AC-04 domain invariant | concurrent creations never exceed 10 active keys | integration | with 9 active keys, two simultaneous creations leave exactly 10 active and one refused |
| AC-05 happy path | key list shows name, creation date, last four and last use or "never used" | integration | three keys listed with correct fields; the unused one reports never used |
| AC-05 happy path | tool listings and limit-refused calls update last use | integration | after a listing call and after a limit-refused call, last use moves to that call's time |
| AC-05 happy path | last use is accurate to within 5 minutes | integration | under a fake clock, last use is never more than 5 minutes behind the latest passing call |
| AC-05 happy path | revoked keys are listed separately with their revocation date | component | active and revoked sections render; only active rows have a revoke action |
| AC-06 happy path | call checked after revocation is refused and returns no data | integration | the first call checked after the revocation commits is refused with no Freelancer data |
| AC-06 happy path | a call whose key check passed before revocation may finish | integration | a call authenticated before the revoke completes its answer normally |
| AC-06 happy path | revoked key cannot be reactivated | integration | no business-layer path clears a revocation; presenting the key stays refused |
| AC-06 happy path | Freelancer revokes a key, confirms, and the key moves to revoked | e2e-through-UI | the row moves to revoked keys with today's date and no reactivate action (spec: `tests/e2e/mcp-key-flows.spec.ts`) |
| AC-06 happy path | a revoke answered not-found keeps keyboard focus on the page | component | the toast shows, the dialog closes and focus moves to the Active keys heading (spec: `tests/component/assistants-keys.test.tsx`) |
| AC-07 authorization | malformed key or bad checksum is refused before any lookup | unit | refused without touching the key store |
| AC-07 authorization | revoked, unknown, malformed and deleted-account keys get one identical refusal | integration | all four refusals are identical, return no Freelancer data and ask for a valid key |
| AC-07 authorization | refusal answer matches the contract and reveals nothing | contract | refusal shape equals the contract's refusal; no hint whether the key existed or whose it was; no sign-in discovery pointer |
| AC-07 authorization | a key-check store failure answers 503, not the key 401, and records no refused check | integration | `503` with the `LimitStoreUnavailable` body and no `Retry-After`; the source's refused-check count is unchanged (spec: `tests/integration/api/mcp-pipeline.test.ts`) |
| AC-07 authorization | GET and DELETE answer 405 with the contract body before any key check | unit | `405`, `Allow: POST`, and the `MethodNotAllowed` JSON-RPC body (spec: `tests/unit/api/mcp-route-transport-errors.test.ts`, `tests/integration/api/mcp-pipeline.test.ts`) |
| AC-07 authorization | Sentry transactions for the Assistant endpoint carry no key, headers or body | unit | the transaction hook drops headers, cookies and body of an `/api/mcp` transaction; the incoming body is ignored on `/api/mcp` only (spec: `tests/unit/config/mcp-sentry-transactions.test.ts`) |
| AC-07 authorization | an SDK failure is reported without echoing its text, and client refusals are not reported | unit | the SDK's catch-all failure reaches Sentry once and the answer is the ServerFailure (HTTP 500, -32603, id null, no `error.data`); a plain client refusal passes through with no report (spec: `tests/unit/api/mcp-route-transport-errors.test.ts`) |
| AC-08 authorization | another Freelancer's invoice by number is answered as not existing | integration | answer identical to a number that does not exist |
| AC-08 authorization | another Freelancer's customer by name is answered as not existing | integration | answer identical to a name that matches no one |
| AC-08 authorization | another Freelancer's record identifier is answered as not existing, in every tool that takes one | integration | answer identical to an unknown identifier for each tool |
| AC-08 authorization | not-found answer is the same shape for foreign and missing records | contract | both answers validate against the same contract response and are equal apart from the reference echoed back |
| AC-09 authorization | the Assistant endpoint is the only bearer-only proxy exception | unit | the proxy exception list holds exactly that one path |
| AC-09 authorization | a valid browser session without a Personal key is refused | integration | the call is refused; no data returned; the session is never read |
| AC-09 authorization | a Visitor, and a signed-in browser, calling the Assistant endpoint without a key are refused | e2e | both refused through the real proxy; no Freelancer data returned (spec: `tests/e2e/mcp-proxy.spec.ts`) |
| AC-10 domain invariant | tool listing offers only read tools | contract | every listed tool matches a contract read operation; none creates, changes, deletes, marks paid or sends |
| AC-10 domain invariant | calling an unknown or write-like tool changes nothing | integration | the call is refused as an unknown tool and the Freelancer's data is unchanged |
| AC-11 domain invariant | 61st call within the most recent 60 seconds is refused with a retry time | integration | the call is refused and says when to try again |
| AC-11 domain invariant | limit-refused calls do not count toward the limit | integration | after refusals, the key is served again exactly when the oldest counted call leaves the window |
| AC-11 domain invariant | the window is the most recent 60 seconds, not a calendar minute | integration | 60 calls straddling a minute boundary still refuse the next call |
| AC-11 domain invariant | tool listings count toward the limit | integration | 60 listings then one tool call: the tool call is refused |
| AC-11 domain invariant | other keys and other Freelancers keep working when one key hits the limit | integration | a second key of the same Freelancer and another Freelancer's key are served normally |
| AC-11 domain invariant | a JSON-RPC batch is refused and still counts | integration | `400` / `-32600` before any tool runs; the call counts toward the key limit (spec: `tests/integration/api/mcp-pipeline.test.ts`) |
| AC-11 domain invariant | a body over the size cap is refused and still counts | integration | `413` / `-32600` before any tool runs; the call counts toward the key limit (spec: `tests/integration/api/mcp-pipeline.test.ts`) |
| AC-11 domain invariant | Accept and Content-Type are checked before the body is read | integration | `415` for a non-JSON type and `406` for a bad Accept, whatever the body holds (spec: `tests/integration/api/mcp-pipeline.test.ts`) |
| AC-11 domain invariant | a client that goes away mid-body gets a client-error refusal | unit | `400` / `-32700` and no Sentry report (spec: `tests/unit/api/mcp-route-transport-errors.test.ts`) |
| AC-12 happy path | overdue rule: issued, unpaid, and marked overdue or due before today | unit | due yesterday unmarked → overdue; marked → overdue; due tomorrow → not overdue; paid, draft, cancelled → never |
| AC-12 happy path | days overdue is whole days from due date to today, never below 0 | unit | due yesterday → 1; marked overdue before its due date → 0 |
| AC-12 happy path | the three forms of the overdue rule agree on one fixture | integration | the database form, the query-builder form and the in-memory form select the same invoices |
| AC-12 happy path | no hand-written overdue status check outside the rule module | unit | the source scan finds no direct overdue-status comparison outside the rule module |
| AC-12 happy path | overdue tool returns due-yesterday and marked invoices, not due-tomorrow, in the Kyiv time zone | integration | two rows with customer, number, sender profile, amount, currency, due date, days overdue |
| AC-12 happy path | overdue totals per currency cover every overdue invoice, not only the page | integration | with more overdue invoices than one page, totals and counts equal the full set |
| AC-12 happy path | an issue or due date is stored as its calendar day at UTC midnight and compared by day | integration | a Kyiv local-midnight due date is stored as that day, is not overdue on it, and `updateInvoice` stores the picked day the same way (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | the server accepts only `yyyy-MM-dd` dates | unit, integration | the server schema accepts `yyyy-MM-dd` and refuses a `Date` for either date; the service refuses a `Date` too (spec: `tests/unit/invoice-calendar-day-server-schema.test.ts`, `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | the calendar-day migration converts only owners with a saved zone | integration | Kyiv and New York owners get the day they saw; an owner with no zone or an unknown zone keeps the original instants (no UTC fallback); UTC-midnight values stay; a second run changes nothing (spec: `tests/integration/invoice-calendar-days-migration.test.ts`) |
| AC-12 happy path | the first zone save converts that Freelancer's legacy dates in the same transaction | integration | NULL to Kyiv turns local-midnight and time-of-day values into the Kyiv day; NULL to America/New_York turns `2026-10-16T02:00Z` into 15 Oct; a later zone change, a lost seed race and another Freelancer's invoices move nothing; two racing seeds normalise once; a failed normalisation rolls the zone back (spec: `tests/integration/services/profile/time-zone.test.ts`) |
| AC-12 happy path | an editor save keeps an unedited legacy date | integration | with no saved zone, a notes-only save keeps `2026-10-14T21:00Z`, and the Kyiv zone saved afterwards still yields 15 Oct (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | a normalisation that runs while an unedited save is in flight is not overwritten | integration | the save re-reads the dates under a row lock and keeps the normalised day, not the stale legacy instant (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | a zone seeded after the editor loaded the legacy dates does not undo the normalisation | integration | the zone is seeded (the `router.refresh()` render) after the editor loaded; a notes-only save keeps the normalised 1 Oct and 15 Oct (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | a stale tab keeps the normalised days | integration | another request saves the zone after this tab loaded; the tab's notes-only save keeps the normalised days, and so does a second save after another tab seeds the zone (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | a second save in the same editor session keeps the normalised dates | integration | the second notes-only save compares against the dates the first save returned, not the first snapshot (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | forged or malformed loaded dates cannot move a stored date | integration | a malformed loaded date is a VALIDATION failure that writes nothing; a forged instant whose day equals the submitted day only keeps the stored value; one whose day differs writes only the submitted day (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | normalisation committed before the save read the row is kept | integration | the save reads the dates after the zone write committed and keeps the normalised day; a barrier on `pg_stat_activity` orders the zone write before the save's read (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-12 happy path | the editor sends the loaded dates, keeps an edit made while a save is in flight, and clears them on reset | component | an update sends the stored instants next to the submitted days; a new invoice sends none; the next save sends the instants the last one returned; a date, invoice number or status changed in flight survives the response and the form stays dirty; reset forgets them (spec: `tests/component/invoice-editor-store-loaded-dates.test.tsx`) |
| AC-12 happy path | a save that resolves after the editor was reset or set up again writes nothing | component | a save in flight, then `reset()` and `initialize({})`, then the response: `invoiceId`, `invoiceNumber` and `loadedDates` stay unset and a late failure shows no field errors (spec: `tests/component/invoice-editor-store-loaded-dates.test.tsx`) |
| AC-12 happy path | the invoice editor seeds the time zone on a first private visit | component | the editor layout mounts the time-zone cookie (spec: `tests/component/invoice-editor-layout-time-zone.test.tsx`) |
| AC-13 happy path | every Debtor is reachable across pages, ranked by overdue total within each currency | integration | 9 Customers in two currencies all returned across pages, each with count and total, correctly ordered |
| AC-13 happy path | Debtors ranking agrees with the dashboard's Debtors | integration | the dashboard's shown entries equal the first entries of the Assistant answer per currency |
| AC-14 happy path | Expected payments for this month hold only not-yet-overdue invoices due this month | integration | past-due and later invoices excluded; grouped by currency, ordered by due date; totals over every match |
| AC-14 happy path | Expected payments answer names the period's first and last day and the time zone | integration | bounds and time zone match the Freelancer's month |
| AC-14 happy path | Expected payments totals equal the dashboard | integration | without a period, totals equal the dashboard's Expected payments; with one, they equal its planned figure for that period |
| AC-15 happy path | summary figures equal the dashboard to the cent for every currency | integration | received, planned, overdue and all-future totals and counts equal the dashboard for each issued-invoice currency, unconverted |
| AC-15 happy path | summary answer has exactly four figures, each stating its date basis | contract | four figures, each a total and count with its counting date; no breakdown or chart data |
| AC-16 error | period rule: named preset, or from–to of at most 5 years with start not after end | unit | unknown preset, a range over 5 years and a reversed range are each rejected |
| AC-16 error | summary and Expected payments tools explain the period rule when refused | integration | each invalid period is refused with the plain-language rule; no figures returned |
| AC-17 happy path | search returns only issued invoices, at most 50 per page, with totals and a more-pages flag | integration | 120 issued invoices: 50 per page, total 120, totals per currency over every match, more pages stated; the 4 drafts absent |
| AC-17 happy path | drafts and cancelled invoices appear only when asked for and are labelled | integration | with drafts or cancelled requested they appear, each row's status in words |
| AC-17 happy path | search narrows by Customer, sender profile, status, issue-date range, due-date range and number fragment | integration | each filter alone and combined returns exactly the matching invoices |
| AC-17 happy path | free text in notes and lines is not searched | integration | a word found only in notes or lines matches nothing |
| AC-18 domain invariant | every list caps at 50 rows, defaults to 20 and says when capped | contract | asking for 1,000 returns 50 rows with the cap stated; no page size returns 20 |
| AC-18 domain invariant | totals and counts cover the full set when the page is capped | integration | overdue, Debtors, Expected payments, customers and search totals equal the full match set |
| AC-18b error | a page past the last one returns no rows, the total and the last page number | integration | page 7 of 3 returns no rows, total and last page 3; never an earlier page |
| AC-18b error | the "page does not exist" answer matches the contract | contract | answer validates against the contract's out-of-range shape for every list tool |
| AC-19 happy path | one invoice is returned as stored, with a link and without bank account numbers | integration | number, sender profile and customer details as copied onto the invoice, lines, totals, currency, status, dates and a link; no account number or international account number |
| AC-19 happy path | draft and cancelled invoices open the same way and are labelled | integration | both returned with their status label |
| AC-19 happy path | invoice link opened without a session leads through sign-in back to the invoice | e2e-through-UI | sign-in page, then the invoice page with its status badge (spec: `tests/e2e/mcp-invoice-link.spec.ts`) |
| AC-19b domain invariant | every Freelancer-entered field is marked as data entered by the Freelancer | unit | notes, line descriptions, product names, customer names and addresses, and payment terms are wrapped in the data marking; "Ignore previous instructions…" stays inside it |
| AC-19b domain invariant | tool descriptions declare marked fields as data, not instructions | contract | every tool whose answer contains marked fields says so in its listed description |
| AC-20 error | an invoice number shared by two sender profiles is not resolved silently | integration | both candidates listed with sender profile, customer and issue date; a question asks which one is meant |
| AC-20 error | naming the sender profile picks the one invoice | integration | INV-0012 with a profile name returns that profile's invoice |
| AC-21 domain invariant | a renamed Customer's invoices under both names are found by the current name | integration | "Acme GmbH" returns invoices issued as "Acme Ltd" and "Acme GmbH" |
| AC-21 domain invariant | Customer names match in part and regardless of letter case, against current and copied names | integration | "Acme Ltd" and "acme" resolve to the same Customer |
| AC-21 domain invariant | several matching Customers are listed as candidates | integration | no Customer picked; candidates listed with a question, as in AC-20 |
| AC-22 happy path | first visit saves the browser's time zone when none is saved | integration | the Kyiv time zone is stored on the account; an already-saved zone is not overwritten |
| AC-22 happy path | a changed time zone is used from the next request by the dashboard and every Assistant answer | integration | the next request after a change uses the new zone on both surfaces |
| AC-22 happy path | without a saved time zone both surfaces use UTC and Assistant answers name UTC | integration | figures computed in UTC; the answer states UTC |
| AC-22 happy path | Profile time-zone card shows the saved zone or "Not set yet" and lets the Freelancer change it | component | both states render; changing submits the new zone |
| AC-22 happy path | Freelancer with a Kyiv browser sees the zone saved in settings and changes it | e2e-through-UI | settings show Kyiv after the first visit; after a change the dashboard reflects it (spec: `tests/e2e/mcp-time-zone.spec.ts`) |
| AC-23 cross-context | at 00:30 on the 1st in Kyiv, dashboard and Assistant both use the new month and count last month's due invoice as overdue | integration | under a fake clock, both surfaces return the same month bounds and the same overdue figure including that invoice |
| AC-23b cross-context | at 21:00 on 14 March in New York, an invoice due 14 March is not overdue on either surface | integration | under a fake clock, neither counts it; at 00:00 on 15 March New York time both count it with 1 day overdue |
| AC-23 cross-context | a named preset is resolved on the server in the account time zone | unit | `?preset=this-month` resolves to the account zone's month and wins over a stale from/to pair (spec: `tests/unit/lib/validations/dashboard-params-preset-t42.test.ts`) |
| AC-23 cross-context | a preset click sends only the preset name, and the applied preset stays pressed after a reload | component | each preset pushes `?preset=<name>` with no from/to; after a load, only the preset matching the applied period is pressed; a custom period presses none (spec: `tests/component/dashboard-presets-t42.test.tsx`) |
| AC-23 cross-context | dashboard chart days are labelled by their calendar day in any browser zone | component | in a Los Angeles browser the tick and tooltip for `2026-10-01` read Oct 1 (spec: `tests/component/dashboard-chart-calendar-days-t42.test.tsx`) |
| AC-23b cross-context | dashboard and Assistant agree on month edges by calendar day for a New York owner | integration | this-month includes the invoice due on the 1st and excludes the 1st of next month; due-date filters agree on the first and last day (spec: `tests/integration/services/invoices/calendar-days.test.ts`) |
| AC-24 cross-context | dashboard counts a past-due unmarked invoice as overdue, lists its Debtor and leaves it out of Expected payments | integration | overdue figures, Debtors and Expected payments reflect the derived rule |
| AC-24 cross-context | invoice list filters by the derived status | integration | the invoice is included under overdue and excluded under pending |
| AC-24 cross-context | stored status is unchanged and marking paid still works | integration | stored status stays pending; mark as paid succeeds and the invoice leaves overdue |
| AC-24 cross-context | the editor gets the stored status plus `derivedOverdue`, and a save never stores the derived overdue | integration | `getInvoiceEditorData` sets `derivedOverdue`; a save of a past-due pending invoice returns `PENDING` with `derivedOverdue: true`; a submitted `OVERDUE` is stored as `PENDING` only for a derived-overdue invoice; a not-yet-due or hand-marked overdue invoice is stored as sent (spec: `tests/integration/services/invoices/derived-status.test.ts`) |
| AC-24 cross-context | status badge shows overdue and hides "Mark as overdue" and "back to pending" | component | a derived-overdue invoice renders the overdue badge without either action |
| AC-24 cross-context | a past-due unmarked invoice shows as overdue on every surface | e2e-through-UI | dashboard recent invoices, invoice list, customer page and invoice page all show overdue (spec: `tests/e2e/mcp-overdue-surfaces.spec.ts`) |
| AC-25 happy path | data export lists each key's name, creation date, last use and revocation date | integration | one active and one revoked key exported with those fields and nothing from which the key could be rebuilt (neither the key nor its digest) |
| AC-26 cross-context | account deletion removes keys and weekly usage in the deletion transaction | integration | deletion succeeds; no key or usage rows remain for the account |
| AC-26 cross-context | a key of a deleted account is refused as in AC-07 | integration | the next call with that key gets the uniform refusal |

## Edge cases / error paths

- No authorization header on an Assistant call → refused like an unknown key, and counted as one refused key check for the source (Flow 5 flag; contract `info.description`).
- Authorization header present together with a valid session cookie → the cookie is ignored; the key alone decides (AC-09).
- A source with 30 refused key checks in the most recent 5 minutes → its next call is refused before any key is checked, even with a valid key; it is served again once the oldest refusal leaves the window (§6 NFR).
- Limit store unavailable → every Assistant call is refused, source limit and key limit alike; no tool runs (§6 fail-closed NFR).
- Page number or page size below 1, or not a whole number → refused as invalid input with the paging rule, not silently corrected (contract paging schema).
- Page size above 50 → capped at 50 and stated, never refused (AC-18).
- An empty result (a Freelancer with no overdue invoices) → no rows, zero totals, a stated time zone, and no "page does not exist" answer for page 1.
- Invalid time zone submitted from settings → refused, the saved zone unchanged (Flow 12, design addition).
- A browser that reports no time zone on first visit → nothing saved; both surfaces keep UTC (SCR-01 default-UTC state).
- Revoke on a key that is already revoked or not the Freelancer's → not-found state on the connect page, no change (SCR-03 revoke-not-found).
- Copying from the connect page when the clipboard is refused → an error toast asking to copy by hand; the value is never logged (SCR-03 `CopyButton`).
- Key and authorization header never appear in logs or error reports → a request with a key that fails mid-tool leaves no key, digest or answer body in the reported error.
- One-time dashboard notice about the new overdue rule → shown once, dismissable, gone after dismissal (spec §8 default; covered by a component test in T22).

## Test data

- Seed strategy: factories under the repo's test support for each `data-model.md` entity — Freelancer (with and without a saved time zone), sender profile, Customer (with a rename history copied onto invoices), invoice in every stored status with lines and due dates relative to a fake "today", Personal key (active, never used, revoked, of a deleted account), weekly usage row, limit event. Two shared fixtures: a multi-currency parity fixture (several Customers, two or more currencies, overdue by mark and by date, pending this month and later, paid within and outside the period) used by every parity test, and a 5,000-invoice fixture for the latency budget. A second Freelancer is seeded in every tenant-isolation test.
- Time: every test that depends on "today" pins a fake clock and a Freelancer time zone; nothing reads the real wall clock.
- Integration dependency: a throwaway database container per suite with every migration applied, not a mocked store; suites skip cleanly when no container runtime is available and never fall back to another database.
- Cleanup boundary: per-test truncation of every table (not a wrapping transaction), because the revocation race, concurrent key creation and deletion tests need committed data visible on separate connections. The 5,000-invoice fixture is seeded once per suite and treated as read-only.
- E2E and e2e-through-UI: a fresh throwaway database per run, seeded through the same factories; each test creates its own Freelancer so tests never share keys or limit windows.

## NFR validation (load)

- NFR: p95 ≤ 1.5 s server-side for summary figures, Debtors and Expected payments at 5,000 invoices → latency budget test at integration level: on the 5,000-invoice fixture, 50 calls of each aggregate tool, assert p95 ≤ 1.5 s.
- NFR: p95 ≤ 800 ms server-side for list and single-record questions (≤ 50 rows), and p95 ≤ 1.5 s for aggregates → pre-release scenario with the load tool already in your repo, or e.g. k6 or Locust, against a preview deployment seeded with the 5,000-invoice fixture: 5 Personal keys at 1 call per second each (each key at its 60-per-minute ceiling), mixed across every tool, for 10 minutes. Assert p95 ≤ 800 ms for list and single-record tools, p95 ≤ 1.5 s for aggregate tools, and no refusals other than the expected limit refusals.
- NFR: dashboard p95 no more than 10 % slower than the 7 days before release → not a load test; measured from dashboard spans in error tracking after release (spec §6 measurement).
- Per-key limit, failed-key attempts per source, limiter failure mode, revocation, last-use accuracy → integration tests in the AC coverage and edge cases above (spec §6 names "integration test" for each); page size → contract test (AC-18).
- Server-side failure rate ≤ 1 % per week → monitored from error tracking weekly with the daily alert (sad.md §7), not a pre-release test.

## CI placement

- On every PR: unit, component and contract (the fast suites), and integration (already a separate job on every PR), including the parity tests, the day-boundary tests and the 1.5 s latency budget test.
- On schedule / pre-release: e2e and e2e-through-UI (not yet wired into CI — run before `ship`), and the load scenario against a preview deployment before `ship`.
