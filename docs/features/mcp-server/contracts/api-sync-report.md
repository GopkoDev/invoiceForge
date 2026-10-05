---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
---

# API sync report — mcp-server

**Inputs:**
- `data-model.md` ✓ (schema change: `PersonalKey`, `PersonalKeyUsageWeek`, `User.timeZone`, `User.overdueNoticeDismissedAt`, `LimitScope` + 2 values)
- `sad.md` §5, §6 (critical flows 1–2, flows 3–15), §7, §8, §11 ✓
- `spec.md` §4 US-01..US-10 / §5 AC-01..AC-26 ✓
- ADR-0001…0008 ✓
- the existing schema `prisma/schema/invoice.prisma`, plus `types/result.ts`, `lib/services/_shared/list-query.ts`, `lib/validations/dashboard-period.ts`, `components/dashboard/header/dashboard-filters.tsx` (presets) and `types/dashboard/types.ts` for unchanged entities

**Interface kind:** `target_surfaces: [backend-service, web-frontend]`, read from sad.md. The backend exposes:
- the MCP endpoint `/api/mcp` (JSON-RPC over Streamable HTTP, stateless) and its seven read-only tools → [`openapi.yaml`](./openapi.yaml). The tool input and output schemas are in `components.schemas`, indexed by `x-mcp-tools`;
- server actions and business functions → [`server-actions.md`](./server-actions.md).

`web-frontend` consumes `server-actions.md`.

**No `events.md`.** No §6 flow has a message bus or an async consumer. The weekly usage upsert and the limit events are synchronous writes in the request.

**Size / route:** M / standard (from `.size` / `.route`).

**Decisions taken at `api` (2026-10-04, with the owner):**
- **D-1.** A key refusal is `401` + `WWW-Authenticate: Bearer realm="invoiceflow", error="invalid_token"`, with no `resource_metadata` and a JSON-RPC error body. If a launch client misbehaves at `ship`, the fallback is `403` (OQ-A2).
- **D-2.** A request with no key, including one with a session cookie only, counts as a refused key check for the source limit (closes the sad.md §6 flag "Missing key counts as a refused key check").
- **D-3.** Freelancer-entered text is the wrapper object `{ "freelancerText": "…" }` (closes the sad.md §8 "Untrusted text — exact shape at `api`").
- **D-4.** A source block is `429` + `Retry-After`, worded differently from the key refusal (drift B4-1, accepted).
- **D-5.** An unavailable limit store is `503` with no `Retry-After`, for both limits (drift B4-2, accepted).
- **D-6.** `updateInvoiceStatus` refuses `OVERDUE`/`PENDING` on a date-overdue invoice on the server too (contract addition, accepted).
- **D-7.** The invoice link opens the existing editor `/invoices/{id}/edit` (OQ-A1, resolved in `screens.md`, 2026-10-04).

## A. Field origins

### `/api/mcp` transport and request pipeline

| schema_path | origin | confidence |
|---|---|---|
| postMcpMessage (POST only, JSON responses, no session id, GET/DELETE 405) | ADR-0002 (stateless Streamable HTTP) | high |
| PersonalKey bearer scheme; no cookie read | ADR-0003, AC-09 | high |
| PersonalKeyValue `^ifk_[0-9A-Za-z]{49}$` (43 secret + 6 checksum) | ADR-0004 (`ifk_` + 32 random bytes base62 + checksum suffix); the lengths are the contract's proposal, since ADR-0004 does not fix them | medium |
| 401 KeyRefused (uniform body and header) | AC-07, AC-09, AC-26; sad.md critical flows 1–2, flows 5, 15; D-1 | high |
| 401 → records `LimitEvent` `MCP_SOURCE`/`REFUSED` | data-model `LimitEvent` table; D-2 | high |
| 429 Limited — key limit, `retryAt` = oldest counted call + 60 s | data-model `MCP_KEY` rule; AC-11 | high |
| 429 Limited — source limit, `retryAt` = oldest refusal + 5 min | data-model `MCP_SOURCE` rule; spec §6 NFR; D-4 | high |
| 503 LimitStoreUnavailable | ADR-0007 fail closed; spec §6 limiter NFR; D-5 | high |
| RetryAtDetails | existing `ActionErrorDetails` `RETRY_AT` (types/result.ts) | high |
| RequestRefusal JSON-RPC codes `-32001` / `-32029` / `-32003` | contract proposal (implementation-defined server error range) | medium |
| counted calls = every message past the key check | AC-11, AC-05; data-model `MCP_KEY` "tool listings included" | high |
| substantive = `tools/call` only; success / Assistant error / server failure | data-model `PersonalKeyUsageWeek` (`attempts`, `successes`, `assistantErrors`) | high |
| InitializeResponse.capabilities (tools only, `listChanged: false`) | ADR-0002 (no notifications) | high |
| InitializeResponse.instructions | AC-19b, AC-18, AC-15, AC-22; D-3 | high |
| ToolDefinition.annotations `readOnlyHint: true` … | AC-10; sad.md flow 5 | high |
| ToolDefinition.description data-not-instructions suffix | AC-19b; sad.md flow 5 | high |
| unknown tool → `-32602` | AC-10; sad.md flow 5 | high |
| CallToolResult (structuredContent + one text block) | MCP 2025-06-18 tool result; sad.md §8 error handling | high |

### Shared value types

| schema_path | origin | confidence |
|---|---|---|
| RecordId | existing schema `cuid()` ids; sad.md §8 ID strategy | high |
| Currency enum | existing `Currency` (invoice.prisma) | high |
| DecimalString `^-?\d+\.\d{2}$` | existing `DecimalString` (types/result.ts, architecture-hardening ADR-0006); Invoice amounts `Decimal(10,2)` | high |
| LocalDate | existing `LocalDate` (dashboard/period.ts); `Invoice.issueDate`/`dueDate` read as calendar days (ADR-0005) | high |
| TimeZoneName / `timeZone` | data-model → `User.timeZone` (NULL = `UTC`); AC-22 | high |
| `today` | derived — today in `timeZone` (ADR-0005, ADR-0006) | high |
| FreelancerText | AC-19b; D-3 | high |
| InvoiceDisplayStatus | existing `InvoiceStatus`, mapped through the shared rule (ADR-0005); AC-17 "status in words" | high |
| PageInput (default 20, cap 50, capped not refused) | spec §6 page size; AC-18; service-layer ADR-0005 page numbers | high |
| PageInfo | existing `Page<T>` (list-query.ts) + `pageSizeCapped` (AC-18) | high |
| PageOutOfRangeDetails `{total, lastPage}` | AC-18b; sad.md flows 6, 7, 9, 11 | high |
| AmbiguousReferenceDetails | AC-20, AC-21; sad.md flows 9, 10 | high |
| PeriodInput presets `this-month…all-time` | existing `dashboard-filters.tsx` presets + `dashboardParamsSchema`; security-patch ADR-0004 (5 years) | high |
| PeriodInput error message | AC-16 wording | high |
| AppliedPeriod | AC-14 "states the period's first and last day" | high |
| CurrencyTotal | AC-12, AC-14, AC-17, AC-18 (totals over every match) | high |
| ToolError `{code, message, fieldErrors?, details?}` | existing `ActionFailure` (types/result.ts) minus `success`; sad.md §8 | high |

### Tools

| schema_path | origin | confidence |
|---|---|---|
| list_overdue_invoices.rows.* (invoiceNumber, senderProfile, customer, amount, currency, dueDate) | existing `Invoice.invoiceNumber`, `senderProfileId` + `SenderProfile.name`, `customerId` + `Invoice.customerName`, `Invoice.total`, `currency`, `dueDate`; AC-12 | high |
| list_overdue_invoices.rows.daysOverdue | AC-12 (whole days, never below 0) | high |
| list_overdue_invoices.currency (filter) | existing `Currency`; US-03 "amounts per currency" | medium |
| list_overdue_invoices ordering (due date ascending) | contract proposal; no AC fixes it | medium |
| list_debtors.rows (customer, currency, overdueTotal, overdueCount) | existing `DebtorInfo` (`customerId`, `customerName`, `total`, `count`); AC-13 | high |
| list_debtors.rows.rank (ties by name, then id) | AC-13 "ranked by total overdue amount within each currency"; the tie rule is the contract's proposal | medium |
| list_debtors.totals.debtorCount | sad.md flow 6 "Debtor count per currency" | high |
| list_expected_payments.period / rows / totals | existing `ExpectedPaymentItem`; AC-14 | high |
| get_summary_figures.currencies.* (received, planned, overdue, allFuturePayments) | existing `DashboardSummaryStats` (`totalReceived`/`receivedCount` …); AC-15 | high |
| get_summary_figures.*.countedBy | AC-15 "each states which date it is counted by" | high |
| get_summary_figures.period default `this-month` | existing `dashboardParamsSchema` current-month fallback | high |
| get_summary_figures.currencies set (issued-invoice currencies) | AC-15; ADR-0008 | high |
| list_customers.name (≤ 100) | existing `listQuerySchema.search` max 100; AC-21 | high |
| list_customers.rows.* | existing `Customer` columns (name, companyName, email, phone, taxId, address, city, country, postalCode, defaultCurrency) | high |
| search_invoices filters (customer/customerId, senderProfile/senderProfileId, status, issue/due ranges, invoiceNumber) | AC-17 filter list; existing `Invoice` columns; `invoiceNumberKey` (normalizeInvoiceNumber) | high |
| search_invoices.status default issued | AC-17; CONTEXT "Issued invoice" | high |
| search_invoices.senderProfile name → AMBIGUOUS_REFERENCE | contract addition; no §6 branch (see B-back-feed) | medium |
| get_invoice.invoiceId / invoiceNumber / senderProfile | AC-08, AC-20; sad.md flow 10 | high |
| get_invoice.sender.* | existing `Invoice.sender*` snapshot columns (no logo) | high |
| get_invoice.customer.* | existing `Invoice.customer*` snapshot columns; AC-19 | high |
| get_invoice.lines.* | existing `InvoiceItem` (name, description, unit, quantity, rate, amount) | high |
| get_invoice.amounts.* | existing `Invoice` subtotal, taxRate, taxAmount, discount, shipping, total, amountPaid | high |
| get_invoice.paymentTerms / terms / notes / poNumber | existing `Invoice` columns; AC-19b | high |
| get_invoice — no bank fields at all | AC-19 (stricter: the whole bank snapshot is omitted, sad.md §8 data minimisation) | high |
| get_invoice.link | AC-19; path `/invoices/{id}/edit` (existing editor route), OQ-A1 resolved in screens.md | high |

### Server actions (server-actions.md)

| schema_path | origin | confidence |
|---|---|---|
| createPersonalKey.name (trim, 1–50, case-insensitive unique among active) | data-model `PersonalKey.name` / `activeNameKey`; AC-03 | high |
| createPersonalKey → CONFLICT at 10 active | data-model create step 2; AC-04 | high |
| createPersonalKey.fullKey (once) | ADR-0004; AC-02 | high |
| PersonalKeySummary (id, name, createdAt, lastFour, lastUsedAt) / revokedAt | data-model `PersonalKey` columns; AC-02, AC-05 | high |
| revokePersonalKey → NOT_FOUND on 0 rows | data-model "Revoke"; AC-06 | high |
| hasUsedAnyPersonalKey | data-model "Entry point"; AC-01 | high |
| authenticatePersonalKey / recordPersonalKeyUsage | data-model "Authenticate", "Record last use", "Count a call" | high |
| updateTimeZone + TIME_ZONE_MESSAGE | data-model `User.timeZone` ("unknown zone is refused"); sad.md flow 12 | high |
| session factory seed (conditional write) | data-model first-visit seed; AC-22 | high |
| getDashboardNoticeState / dismissOverdueRuleNotice | data-model `User.overdueNoticeDismissedAt` | high |
| updateInvoiceStatus refusal on date-overdue | AC-24; D-6 | medium |
| export `personalKeys`, `usageWeeks`, `user.timeZone`, `user.overdueNoticeDismissedAt` | data-model §Export; AC-25 | high |
| exportVersion `2.1` | existing `exportVersion: '2.0'`; additive change, so a minor bump | medium |
| ActionErrorDetails `PAGE_OUT_OF_RANGE`, `AMBIGUOUS_REFERENCE` | AC-18b, AC-20, AC-21 (proposed addition to types/result.ts) | high |

There are no `low` rows: every field traces to a column, an ADR or an AC.

## B. Drift checklist

1. **Endpoint ↔ data-model** *(core)* — ✓.
   - `postMcpMessage` reads `PersonalKey` (digest lookup) and `User.timeZone`. It writes `PersonalKey.lastUsedAt` / `firstSuccessAt`, `LimitEvent` (`MCP_KEY`, `MCP_SOURCE`) and `PersonalKeyUsageWeek`.
   - The seven tools read `Invoice`, `InvoiceItem`, `Customer` and `SenderProfile` (existing schema), all scoped by the acting Freelancer.
   - `createPersonalKey`, `revokePersonalKey`, `listPersonalKeys` and `hasUsedAnyPersonalKey` use `PersonalKey`. `updateTimeZone` uses `User.timeZone`, `dismissOverdueRuleNotice` uses `User.overdueNoticeDismissedAt`, and the export reads both new tables.
   - No data-model field is unused: `firstSuccessAt` and `PersonalKeyUsageWeek` back the §7 KPIs, which have no endpoint by design (ad-hoc reporting, data-model §KPIs).
2. **Error code ↔ repo error definition** *(core)* — ✓ with one proposal.
   - Registry: `ActionErrorCode` in `types/result.ts`. Every `code` the contract uses exists there: `UNAUTHORIZED`, `RATE_LIMITED`, `FAILED`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`.
   - `RETRY_AT` exists. **`PAGE_OUT_OF_RANGE` and `AMBIGUOUS_REFERENCE` are proposed `ActionErrorDetails` kinds** (marked ★ in server-actions.md). `implement` adds them to `types/result.ts`, just as security-patch added `RETRY_AT`.
3. **Validation ↔ constraint** *(core)* — ✓.
   - Key name 1–50 after trimming, unique among active keys ignoring case = data-model `name` + `activeNameKey`.
   - `lastFour` and the 53-character key are consistent: the last four characters of the key.
   - `Currency` / `InvoiceStatus` enums match the existing schema.
   - Amounts are `Decimal(10,2)` → `DecimalString`. `taxRate` `Decimal(5,2)` → `DecimalString`.
   - Name searches ≤ 100 = existing `listQuerySchema`.
   - Periods = `isWithinMaxCustomPeriod` (5 years).
   - Conflict, resolved by taking the stricter rule: the existing `paginate` caps nothing and falls back to page 1 past the end. That contradicts AC-18 and AC-18b, so the Assistant reads use new page functions (server-actions.md §Shared overdue rule). The web list keeps `paginate`.
4. **OpenAPI ↔ sequence** *(supporting)* — 2 findings, both accepted.
   - **B4-1** (D-4): critical flow 1 draws a source block as "uniform refusal". The contract answers `429` + `Retry-After`. AC-07's uniformity concerns keys, and a source block reveals nothing about any key. *Accepted.* `sequences` may reword the flow 1 note on its next pass.
   - **B4-2** (D-5): critical flow 1 groups "limit store unavailable" with the source block and with the key-limit "when to retry" reply. The contract uses `503` with no retry time, because the length of the outage is unknown. *Accepted.*
   - Every other `alt` branch has a response: flow 1 (source / key / limit / answer), flow 2 (revoked → 401), flow 5 (no key → 401, limit → 429, unknown tool → -32602), flows 6–11 (page out of range, invalid period, no match, several matches, answer), flow 15 (deleted account → 401).

### Back-feed (coverage cross-check)

- **Every §5 AC → ≥ 1 operation or response.** ✓
  - AC-01 to AC-06 → server-actions.md (personal keys).
  - AC-07, AC-09, AC-26 → 401. AC-08 → `NOT_FOUND` on search_invoices and get_invoice. AC-10 → annotations and -32602. AC-11 → 429.
  - AC-12 → list_overdue_invoices. AC-13 → list_debtors. AC-14 → list_expected_payments. AC-15 and AC-16 → get_summary_figures and PeriodInput.
  - AC-17 and AC-21 → search_invoices. AC-18 → PageInput/PageInfo. AC-18b → `PAGE_OUT_OF_RANGE`.
  - AC-19 and AC-20 → get_invoice. AC-19b → FreelancerText + instructions.
  - AC-22 to AC-24 → server-actions.md (time zone, shared rule) + `timeZone`/`today` in every answer. AC-25 → export. AC-26 → 401 + cascade.
- **Every operation → a §4 story + ≥ 1 AC.** ✓ See `x-mcp-tools` (stories, acs) and the server-actions.md headings. The transport-only responses (400 / 406 / 413 / 415 / 405) belong to US-09 and carry no Freelancer data.
- **Sequence gaps (resolved as Save-as-OQ with an upstream owner):**
  - **OQ-S1** — search_invoices accepts a sender-profile *name*, which can match several profiles. Flow 9 draws the ambiguity branch for Customer names only. The contract applies the same `AMBIGUOUS_REFERENCE` rule. Owner: `sequences`, due before the contract is finalized (before `tasks`).
  - **OQ-S2** — flow 15 still says "delete weekly usage, Personal keys, then the rest" and draws a rollback branch. data-model verified that the existing `prisma.user.delete` cascades instead (data-model §Account deletion, audit flag). The contract follows data-model. Owner: `sequences` (reword the flow 15 note) together with the sad.md §11 risk row. Due before `tasks`.
- **Orphan sequences:** none. Flows 3, 4, 12, 13, 14 and 15 map to server actions. Flow 13 maps to the derived-status and filter rules.

**Self-check result:** core 3/3 ✓, supporting 1 ✓ with 2 accepted findings, 2 sequence-gap OQs, 0 `low` origins.

## C. Deviations from the api-skill defaults

| Default | Here | Why |
|---|---|---|
| `/api/v1/...` URL versioning | one fixed path `/api/mcp` | ADR-0003 (one exact proxy exception); MCP clients are configured with the URL; protocol versions are negotiated by MCP itself (`MCP-Protocol-Version`) |
| REST resources | one JSON-RPC endpoint + seven tool schemas | `backend-service` sub-kind MCP (ADR-0002) |
| Cursor pagination | page numbers (`page`, `pageSize`, `totalPages`, `hasMore`) | service-layer ADR-0005; AC-18b speaks of page numbers ("page 7", "the last page number") |
| `{code, message, details?}` with `module.error_name` codes | request level: JSON-RPC `error` with `data.code`. Tool level: `ToolError {code, message, fieldErrors?, details?}` with UPPER_SNAKE `ActionErrorCode` | architecture-hardening ADR-0009 (the repo's single error registry); MCP's tool-error model (`isError`) |
| `BearerAuth` with `bearerFormat: JWT` | `PersonalKey` bearer, `ifk_` opaque key | ADR-0004 |
| snake_case JSON | camelCase fields; snake_case tool names | camelCase matches the repo's DTOs and the export; snake_case tool names follow MCP convention |

## D. Open questions raised here

| ID | Question | Default now | Owner | Due |
|---|---|---|---|---|
| ~~OQ-A1~~ | Which page does the get_invoice `link` open? Today the only per-invoice page is the editor `/invoices/{id}/edit`. Does a cancelled or paid invoice open read-only there? | **Resolved in `screens.md` (2026-10-04):** `link` = `<origin>/invoices/{id}/edit`, the existing editor. Its status badge labels draft and cancelled invoices, and no read-only mode is added | `screens` (Dmytro Hopko) | before `sdd:tasks` |
| OQ-A2 | Do Claude Desktop (via `mcp-remote`), Claude Code and Cursor show the 401 message plainly, or start an OAuth sign-in? | 401 per D-1; switch to 403 if a launch client starts OAuth discovery | `ship` (Dmytro Hopko) | at `sdd:ship` |
| OQ-S1 | Add the sender-profile-name ambiguity branch to flow 9 | contract already answers `AMBIGUOUS_REFERENCE` | `sequences` (Dmytro Hopko) | before `sdd:tasks` |
| OQ-S2 | Reword flow 15 and the §11 deletion risk to the verified cascade | contract follows data-model | `sequences` (Dmytro Hopko) | before `sdd:tasks` |

## E. Lint

`spectral lint` with `spectral:oas` (run from a scratch install; the repo has no spectral target yet): **0 errors, 3 warnings, all expected**:
- `operation-success-response` on `GET` and `DELETE` — they only ever answer `405` (ADR-0002);
- `oas3-unused-component` `PersonalKeyValue` — referenced from server-actions.md (`createPersonalKey.fullKey`) and the security scheme text.

All 205 `$ref`s resolve. Suggested: add `spectral lint docs/features/*/contracts/openapi.yaml` to the check target (follow-up, not done here).
