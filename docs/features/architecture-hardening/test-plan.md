---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["implementing engineer", "Tech Lead", "Security Lead"]
updated_at: "2026-09-27"
feature_size: "M"
---

# Test plan — architecture-hardening

The server enforces every rule itself. A Visitor reaches only deliberately public endpoints, the logo fetch never reaches a private address, every saved invoice has a number unique within its sender profile and totals that are recomputed and never negative, malformed links and load failures never crash a page or pose as "empty" or "not found", and account deletion always succeeds and removes everything.

> **Scope change (2026-09-27).** The owner reversed spec §3 non-goal F7 while planning tests: this feature now ships **with** automated tests, and `/sdd:implement` runs with TDD on. Task T00 sets up the harness and blocks every other task. The upstream artifacts (spec §3, sad §2/§10/§11, `tasks/_epic.md`, data-model "Test fixtures") are amended to match. The sad §10 manual probe sets stay as the pre-wave smoke check on the preview deployment, on top of these tests.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: IP-range classification, the public allowlist matcher, refusal-code → warning mapping, invoice-number normalization, exact-decimal rounding, the invoice / custom-price / sender-profile schemas, `applyStatusChange`, link-parameter parsers, day bounds in a time zone, the robots rules. | In-memory, no I/O. An injected clock where time matters. |
| Integration | Server actions, route handlers, the safe fetcher, the rate limiter, the number allocator, the deletion transaction and page loaders, against the real dependencies they own. | A throwaway Postgres container per suite with the repo migrations **plus** staged migrations 01–06 applied. A throwaway local HTTP image host inside the test process. An injectable DNS resolver to simulate rebinding. Never the `.env` database. |
| Contract | `/api/convert-image`, `/api/user/export` and `/robots.txt` against `contracts/openapi.yaml`. The `ActionResult` codes and `details` shapes against `contracts/server-actions.md`. | Validate the real response against the agreed document. No hand-written stubs of the response. |
| E2E | Request-boundary flows through the real app entry point (the proxy included): the no-cookie route sweep, stale sessions, foreign ids. | A production build of the app against the throwaway database, driven over HTTP with seeded session cookies. |
| Load | The only load-testable numeric NFR: the logo rate limit. | The load tool already in your repo, or e.g. k6 or Locust. |
| Component | The UI states that screens.md adds: editor number hint and field errors, SCR-04 warning, SCR-05 logo error, SCR-06 applied range, SCR-08, SCR-14 blocked block, SCR-15, SCR-17. | Render in a component harness with props / mocked action results. Assert text and behaviour, with no full app boot. |
| Visual-regression | <!-- N/A: owner decision 2026-09-27 — no new components; the component tests assert each new state's content. --> | — |
| E2E-through-UI | The critical user-story flows driven through the rendered UI: PDF with logo / warning, create invoice, delete account, malformed list link. | The flow scripts come from `ux-flows.md` and run against the production build and throwaway database, signed in as a seeded Freelancer. |

## AC coverage

Every §5 acceptance criterion maps to at least one row. The Level column is the owner-confirmed choice (2026-09-27), and `implement` writes each test at that level without re-deciding it. "Flow" refers to sad §6, and "SCR-NN" to screens.md.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 | logo from an owned profile's secure image link is returned for the PDF | integration | The route returns the image as embeddable data. One real fetch is counted. |
| AC-01 | generated PDF includes the sender profile logo | e2e-through-UI | SCR-04 shows the logo and no warning. |
| AC-02 | visitor asking for any image is refused before any fetch | integration | The request is refused as not signed in, the local image host receives zero requests, and the response names no address. |
| AC-02 | image conversion without a session is refused through the real entry point | e2e | Same refusal via the proxy. The body echoes no part of the requested address. |
| AC-02b | only the logo stored on the caller's own sender profile is fetched | integration | A free-form address parameter is ignored or rejected. Only the stored link is requested from the host. |
| AC-02b | another Freelancer's sender profile is treated as not found | integration | The response is identical to the one for a non-existent profile id. Nothing is fetched and nothing is counted. |
| AC-02b | convert-image request and response match the contract | contract | Request parameters and every response variant validate against `openapi.yaml` `convertLogoImage`. |
| AC-03 | private, loopback, link-local and metadata addresses are classified unsafe | unit | Unsafe: `169.254.169.254`, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `0.0.0.0`, `::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped IPv6 of any of these. A public address is safe. |
| AC-03 | non-https logo link is refused before any lookup | unit | Refusal reason: not a secure web address. |
| AC-03 | each refusal reason maps to its plain-language warning | unit | Not secure, not an image, too large and rate limited each get their own message. Unreachable, timeout and private address all map to "the logo could not be loaded from this link". |
| AC-03 | redirect to a private address is refused at the hop | integration | Host → redirect to `10.0.0.1`: refused with the generic reason. No connection is made to the private address. |
| AC-03 | DNS answer that changes to a private address between lookup and connect is refused | integration | The injected resolver returns a public address and then a private one. The connection uses the validated pinned address or is refused, and never reaches the private one. |
| AC-03 | response over the size cap is aborted | integration | A 5 MB body (and a body that lies in its declared length) is aborted at 512 KB, with the "larger than the size limit" reason. |
| AC-03 | slow response is aborted at the time cap | integration | A slow-drip host is aborted after 5 s total, with the generic reason. |
| AC-03 | non-image response is refused | integration | An HTML body is refused with the "file is not an image" reason. |
| AC-03 | more than three redirect hops are refused | integration | The 4th hop is refused with the generic reason. |
| AC-03 | 31st real fetch within a minute is refused | integration | 30 succeed and the 31st gets the "too many requests" reason. The sliding window carries across a minute boundary (injected clock). |
| AC-03 | refusal responses match the contract and carry no upstream text | contract | Every refusal validates against `openapi.yaml`. No upstream status or error text appears in the body. |
| AC-03 | PDF is produced without the logo plus the warning | component | The SCR-04 warning shows the exact message for each reason. The PDF still renders. |
| AC-03 | logo already fetched in this editor or export session is reused | component | A second PDF in the same session makes no new logo request, so it doesn't count toward the limit. |
| AC-03 | PDF without the logo and with the generic warning for an unreachable link | e2e-through-UI | SCR-04 renders the PDF without the logo and shows the generic warning. |
| AC-04 | sender profile schema rejects a non-https logo link | unit | `http:`, `ftp:`, `javascript:` and a relative path are rejected with "must be a secure web address". An empty value is allowed. |
| AC-04 | saving a sender profile with an insecure logo link is blocked | integration | `VALIDATION` with the field error on the logo field. Nothing is saved. |
| AC-04 | logo field shows the secure-address error | component | The SCR-05 message renders next to the logo field. |
| AC-05 | public allowlist matcher allows exactly the public set | unit | Sign-in, sign-up, landing, privacy, terms, robots, sitemap, share images, icons and manifest are allowed. Every other path, including an unseen `/api/new-thing` and a page path, is denied. |
| AC-05 | every non-public built route denies a request without a cookie | e2e | A sweep over every route in the built route manifest: pages redirect to sign-in, and data routes and actions are refused as not signed in with no data. Only allowlisted paths return content. |
| AC-06 | empty number field means system-assigned and a filled one means manual | unit | An empty or whitespace-only value is system, and any other value (including one equal to the hint) is manual. |
| AC-06 | saving with an empty number assigns the next number and advances the sequence | integration | The invoice gets the profile's next formatted number, `invoiceCounter` goes up by 1, and the response carries the final number. |
| AC-06 | creating an invoice shows the "assigned on save" hint and then the final number | e2e-through-UI | The editor shows the hint in an empty field, and after saving it shows the assigned number. |
| AC-07 | two concurrent saves with empty numbers both succeed with different numbers | integration | Two saves under one profile on two separate connections, repeated 20 times: 40 of 40 succeed, all numbers are distinct, and the counter advances by 40. |
| AC-08 | numbers equal ignoring case and surrounding spaces normalize to one key | unit | `"INV-001"`, `" inv-001 "` and `"Inv-001\t"` share one key. Internal spaces are kept. |
| AC-08 | normalization in code matches the migration backfill | integration | For a sample set (tab, CR, mixed case), the code's key equals the key migration 03 wrote. |
| AC-08 | manual number already used in the profile is blocked | integration | `CONFLICT` "already used in this sender profile". Nothing is saved and the counter is unchanged. The same number in a different profile is allowed. |
| AC-08 | editor shows the already-used message on the number field | component | The message renders next to the number field. |
| AC-09 | proposed number already taken manually is skipped | integration | With next = 5 and 5 and 6 taken manually, a save with an empty number gets 7. The counter ends at 7 and no "already used" is returned. |
| AC-10 | free manual number is kept and the sequence does not move | integration | The invoice stores the typed number, even when it equals the hint, and `invoiceCounter` is unchanged. |
| AC-11 | moving an invoice to another profile with an empty number uses the new profile's sequence | integration | The invoice gets B's next number, B's counter advances, A's counter is unchanged, and A's old number is not proposed again in A. |
| AC-11 | moving with a typed number follows the manual rules in the new profile | integration | Free in B: kept and B's counter doesn't move. Taken in B: blocked as already used. |
| AC-11 | changing the sender profile in the editor clears the number field | component | The field is empty and B's hint is shown. |
| AC-12 | duplicate gets a number from its profile's sequence | integration | The copy's number has the new-invoice format and the counter advances. The source invoice is unchanged. |
| AC-13 | line total is quantity × price rounded half up to 2 places | unit | `0.005 → 0.01`, `1.005 → 1.01` (exact decimal, no float drift), `2.675 → 2.68`. The subtotal is the sum of the rounded lines and tax is rounded once. |
| AC-13 | editor and server compute identical totals | unit | The shared module gives the same result on the editor and server paths for a table of cases. |
| AC-13 | browser-sent totals are replaced by recomputed ones without blocking | integration | A save with tampered line totals, subtotal and total succeeds. The stored figures are the recomputed ones and are returned in the response. |
| AC-14 | invoice schema enforces amount bounds | unit | Rejected: price −0.01, qty 0, qty −1, shipping −0.01, discount −0.01, tax −0.01 and 100.01. Accepted: price 0, tax 0, tax 100. |
| AC-14 | save with an out-of-bounds amount is blocked with field errors | integration | `VALIDATION` with a per-field or per-line path. Nothing is saved. |
| AC-14 | editor shows each bound message next to the offending field or line | component | Each message renders at its field or line. |
| AC-15 | discount above subtotal plus shipping is rejected and equal is allowed | unit | Above: rejected with "can't exceed subtotal plus shipping". Equal: accepted with total 0.00. |
| AC-16 | custom-price schema is shared by create and update | unit | Negative, non-number and too-long note are rejected with the same messages on both paths. |
| AC-16 | updating a custom price with invalid values is blocked | integration | `VALIDATION` with the same field messages as create. The stored price is unchanged. |
| AC-17 | legacy invoice with a different stored total asks for confirmation | integration | A first save returns `CONFLICT` `TOTALS_CHANGED` with the old and new totals, and nothing is saved. A resubmit with matching `confirmedTotals` saves. Stale `confirmedTotals` asks again. |
| AC-17 | legacy invoice whose amounts break the rules can't be saved until corrected | integration | `VALIDATION`, even when confirmed. It saves after the fix. |
| AC-17 | legacy invoice with a shared number can be viewed but not saved until renumbered | integration | Loading works and is flagged as shared. Saving with the shared number is blocked, and saving with a free number succeeds and writes the key. |
| AC-17 | status change from the list skips legacy checks | integration | The list status change on a legacy invoice with a shared number and a changed total succeeds. Amounts and number are untouched. |
| AC-17 | legacy confirmation shows the old and new totals | component | SCR-15 shows both figures. Confirm resubmits and cancel keeps the editor. |
| AC-18 | entering Paid sets the paid date and re-saving Paid keeps it | unit | `applyStatusChange`: non-Paid → Paid sets now (injected clock), and Paid → Paid keeps the original. |
| AC-18 | paid date is recorded from both the list and the editor | integration | Both paths store `paidAt` equal to the change moment. An editor re-save of a Paid invoice leaves it unchanged. |
| AC-19 | leaving Paid clears the paid date and an unknown status is rejected | unit | Paid → Draft/Sent/Overdue: `paidAt` becomes null. Status `"FOO"` is rejected with a plain-language message. |
| AC-20 | deletion summary counts the invoices that will be lost | integration | The count equals the invoices across all of the Freelancer's sender profiles. Other Freelancers' invoices are excluded. |
| AC-20 | account deletion removes every data category | integration | After deletion, zero rows remain for the account in: user, sign-in accounts, sessions, email history, sender profiles, bank accounts, Customers, products, custom prices, invoices, invoice lines, logo fetch windows, and the sign-in links for the account's email (T17 deletes them, per `tasks/_epic.md`). A second Freelancer's data is untouched. |
| AC-20 | account deletion is all-or-nothing | integration | A failure injected after the invoices are deleted rolls back: every row is still present and the action returns `FAILED`. |
| AC-20 | deleting an account warns, offers export, then lands on sign-in | e2e-through-UI | SCR-08 shows "N invoices will be permanently lost" and the export offer. Confirming lands on SCR-01. |
| AC-21 | session whose account no longer exists is treated as a Visitor | integration | The guard returns not signed in. A create action with that session creates nothing. |
| AC-21 | another device's session after deletion is signed out | e2e | Session B's page request goes to sign-in, its data requests are refused, and its create action leaves no row. |
| AC-22 | deleting a Customer or sender profile with invoices is blocked with the count | integration | `CONFLICT` "N invoices depend on it", for both entity types. No invoice or record is removed. |
| AC-22 | invoice added between the count and the delete still blocks the deletion | integration | The database restrict violation maps to the same "N invoices depend on it" refusal, not `FAILED`. |
| AC-22 | delete-record dialog shows the blocked block | component | SCR-14 shows the count and hides the confirm button. |
| AC-23 | settings actions without a session are refused before input is read | integration | For `updateProfile` and each account and profile action: an invalid payload with no session returns not signed in, not `VALIDATION`, and nothing changes. |
| AC-24 | export holds the deletion categories except sessions, under the product name | integration | The file name starts with "Invoice Forge". It holds every AC-20 category except sessions, and nothing from another Freelancer. |
| AC-24 | export response matches the contract | contract | Headers and body validate against `openapi.yaml` `exportUserData`. |
| AC-25 | malformed or inverted dashboard range falls back to the current month in the Freelancer's time zone | unit | `from=abc`, `to=xyz`, a missing end, and start after end all give the current month in the given time zone. An invalid time zone falls back to UTC. |
| AC-25 | date filter shows the range actually applied | component | The SCR-06 filter displays the parsed (fallback) range, not the raw link values. |
| AC-26 | each bad list parameter falls back to its default | unit | `page=-1`, `page=2.5`, `page=abc`, a page beyond the last, a `pageSize` not offered, `sortBy=items`, an unknown order, `status=FOO` and an unknown tab each give their default. Valid values pass through. |
| AC-26 | list opened from a tampered link shows controls matching the list | e2e-through-UI | SCR-02 renders with no error, and the pagination, sort, status and tab controls show the defaults that were applied. |
| AC-27 | day bounds are local and the end day is inclusive | unit | For zones east and west of UTC and a DST-change day, the range covers local 00:00 on the start day up to (but not including) local 00:00 after the end day. |
| AC-27 | invoice issued late on the last day is included | integration | Invoices at local 23:59:59.999 and 00:00 on the last day are returned, and one at 00:00 the next day is not. |
| AC-28 | a failed data load routes to the error state and is reported | integration | For each loader of the nine AC-28 pages, a data failure returns `FAILED` (not `NOT_FOUND` or empty), the page routes to the error boundary, and one report goes to error monitoring. |
| AC-28 | load-error state offers a retry and shows no internals | component | SCR-17 shows plain text and a retry that re-requests. No raw database message appears. |
| AC-29 | a foreign record is indistinguishable from a missing one | integration | For an invoice, a customer and a sender profile, another Freelancer's id and a random id give identical `NOT_FOUND` results. |
| AC-29 | opening a foreign record's link shows not found | e2e | The rendered SCR-16 is identical for the foreign id and the non-existent id. |
| AC-30 | crawling rules disallow the root and every page of each private section | unit | Each private section has a disallow rule for its root and its sub-pages. Public pages are not disallowed. |
| AC-30 | robots response matches the contract | contract | `/robots.txt` validates against `openapi.yaml` `getRobots`. |
| AC-31 | custom price links exactly the chosen owned Customer and product | integration | Created from the product page and from the customer page, it stores exactly the chosen ids. |
| AC-31 | custom price for a Customer or product that isn't the caller's is blocked as not found | integration | `NOT_FOUND` for a foreign Customer and for a foreign product. Nothing is saved. |

## Edge cases / error paths

Every error and authorization AC already has its own dedicated row above. These boundary and failure cases come from the spec, the SAD and the data model, and are written as their own tests:

- Logo link given as a decimal or octal IP (`https://2130706433/`) → expected: classified by its resolved address and refused as private.
- Redirect from https to http → expected: refused as not a secure web address at that hop.
- Image host closes the connection mid-body → expected: generic "could not be loaded" warning, PDF still produced.
- Sender profile with no logo set → expected: PDF without a logo and **no** warning. No fetch is made and nothing is counted.
- Rate-limit counter write fails (database unavailable) → expected: fail closed. No outbound fetch, the generic warning, and the PDF is still produced.
- Two concurrent requests at the 30th slot → expected: exactly one succeeds. The counter never goes past the limit through a lost update.
- Allocator encounters a unique violation anyway (a manual number inserted concurrently) → expected: retried or surfaced as a save with a new number, never "already used" for a system-proposed number.
- Moving an invoice to profile B and back to A with the number field empty → expected: a fresh number from A's sequence, not A's old number.
- Resubmit with `confirmedTotals` after another tab changed the invoice → expected: asked to confirm again with the current figures.
- Account deletion while an export is in flight → expected: the deletion either completes fully or not at all. The export returns data or not signed in, never a partial file for a deleted account.
- `tz` cookie missing, malformed or naming an unknown zone → expected: UTC is used with no error.
- Dashboard range change → expected: only the date-dependent sections reload (3 fewer data loads per change). This is asserted as a request count in the component test for SCR-06.
- Invoice, customer or sender profile id that is malformed (not an id shape) → expected: not found, never an error state.
- Migration pairs 01–06 → expected: each up applies on a copy of the repo schema, each down reverts it, and a second up/down cycle is clean (integration, T01/T07/T30).
- Wave 4 pre-flight with a remaining NULL key → expected: the check reports it, and the contract-step migration is not promoted (integration on a seeded legacy row).

## Test data

- **Seed strategy:** factories that follow `data-model.md` entity shapes: Freelancer (user + a session token usable as a cookie), SenderProfile (with BankAccount, a settable `invoiceCounter`, and a **per-factory unique `invoicePrefix`**, since prefixes are globally unique), Customer, Product, CustomPrice, Invoice with items, a **legacy invoice** builder (NULL `invoiceNumberKey`, a stored total ≠ recomputed, optional shared number), and LogoFetchWindow rows. Every authorization suite seeds **two** Freelancers so that "someone else's record" is real data. Fixture emails use `@example.test`.
- **Image host fixtures:** a small valid image, a 5 MB image, a body that declares a false length, an HTML page, a slow-drip endpoint, redirect chains (to a private address, https → http, 4 hops), and a connection dropped mid-body. They're served by a throwaway local HTTP host started per suite. Rebinding uses an injected resolver.
- **Integration dependency:** a throwaway Postgres container spun up per suite, with the repo migrations and staged migrations 01–06 applied. **Never** the database in `.env`: it holds the owner's real accounts. No mocked datastore. The AC-07 and AC-22 race tests need real parallel connections, so an in-process single-connection database is not enough.
- **Time:** an injected clock for the rate-limit window and `paidAt`. Time-zone cases pass the zone explicitly.
- **Cleanup boundary:** per-test truncation of every table the feature touches (not a wrapping transaction: the concurrency and deletion tests need committed data on separate connections), and a new container per suite. E2E and e2e-through-UI runs use a fresh database per run, and each test seeds its own Freelancer so tests don't share state.

## NFR validation (load)

- **NFR: logo fetch rate limit ≤ 30 real fetches per minute per Freelancer** → scenario: one seeded Freelancer fires 60 concurrent logo requests within 10 s against the production build (throwaway database, local image host). Assert exactly 30 outbound fetches reach the image host, 30 responses carry the "too many requests" refusal, the stored window count equals 30 (no lost or double updates), and a second Freelancer's concurrent requests are unaffected.
- **NFR: logo size cap ≤ 512 KB and time cap ≤ 5 s** → per-request limits, covered by the AC-03 integration rows, not by load.
- **NFR: invoice save p95 and data export p95** → pending: both targets are TBD until the spec §8 baseline is measured. No load scenario is written until a number exists.
- **NFR: 0 duplicate-number failures on untouched numbers and 0 unhandled page errors from malformed links per month** → production metrics. Their pre-release proxies are the AC-07 race test and the AC-25/AC-26 parser tests.

## CI placement

- **On every PR:** unit, component, contract and integration. Integration needs the throwaway container, and the suite should stay in minutes. The AC-07 race runs 20 iterations here.
- **Before each wave ships (and nightly):** e2e, e2e-through-UI and the rate-limit load scenario, against a production build. Wave 1 does not ship until every AC-01–AC-05 row is green.
- **Manual, before each wave:** the sad §10 probe sets on the preview deployment (route sweep, SSRF probe list, malformed-link checklist, database-unreachable walk) remain the smoke check on real infrastructure.
