---
id: T13
title: "Wrap the shared read questions as chat tools bound to the acting Freelancer and add find_in_app over a fixed app map"
layer: "app"
deps: ["T02", "T04"]
blocks: ["T29"]
acs: ["AC-02", "AC-03", "AC-04", "AC-05", "AC-07", "AC-08", "AC-40"]
files_hint: ["lib/ai/turn-context.ts", "lib/ai/tools/read-tools.ts", "lib/ai/tools/find-in-app.ts", "lib/ai/app-map.ts", "tests/integration/api/chat-read-tools-parity.test.ts", "tests/unit/lib/ai/app-map.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T13 — Wrap the shared read questions as chat tools bound to the acting Freelancer and add find_in_app over a fixed app map

## Place in the sequence

- **Blocked by:** T02 — Move the seven read-question definitions from lib/mcp/tools into the shared lib/assistant-tools registry, behaviour unchanged, T04 — Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema · **Blocks:** T29 — Define the chat agent: instructions, tool set, 8-step cap, 40-message history and the turn runner the route calls · **Wave:** 2 — the chat's read path; dashboard parity holds by construction once it reuses the registry.
- **Lane:** shares `lib/ai/turn-context.ts` with T27 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to ask the chat who owes me, what is coming in, my summary figures, and about my customers and invoices
> **So that** I get answers in plain words that match my dashboard without hunting through screens
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the chat to help with my own data, my drafts and finding things in the app, and to tell me briefly when something is outside that
> **So that** I know what it is for and never mistake it for tax or legal advice
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the chat to see only my own data and only while I am signed in
> **So that** no one else's data reaches me and no one reaches mine through it
>
> — `spec.md §4, US-13, verbatim` · full text: [spec.md](../spec.md)

This task gives the chat the same seven read questions MCP has, bound to the signed-in Freelancer, plus a fixed map of the app's real pages for "where is this" help.

## Inlined context

> `lib/mcp/server.ts` registers them with `registerReadOnlyTool` as today, and `lib/ai/tools/` wraps the same handlers as Mastra tools. The chat's dashboard parity is the MCP parity by construction.
>
> **"Where is this in the app" comes from a fixed map.** `find_in_app` answers from a static list of the app's real pages (route, title, what is set there) built from `config/routes.config.ts`, so the Assistant only ever links to pages that exist (AC-07).
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

> | Authorization and tenancy | … The agent's tools receive the actor bound by the route, never an id from the model. Another Freelancer's Customer, invoice or Conversation answers exactly as one that does not exist (AC-40, AC-41). |
> | Untrusted text (prompt injection) | Tool answers are data, never instructions. Every tool description carries the existing data-not-instructions suffix … |
> | Links | The chat renders links only from structured data parts: an invoice id, a Customer form, or a page key from the `find_in_app` map. URLs written by the model are shown as plain text … |
> | Money and figures | Amounts are exact decimal strings from the read questions and the resolver, never converted between currencies. The model never adds numbers up: a total exists only when a read question returns it and it covers every match (AC-04, AC-08). |
>
> — `sad.md §8, crosscutting rows, abridged` · full text: [sad.md](../sad.md)

> | Dashboard parity of chat answers | 100 % of figures equal the dashboard to the cent | the existing parity test, run through the chat's read path |
>
> — `spec.md §6, NFR row, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** Its tools are adapters too: they call services with the actor bound to the request and never touch Prisma.
>
> — `sad.md §5, lib/ai/, abridged` · full text: [sad.md](../sad.md)

Sad §6 flow 5 answer shapes this task's tool outputs must make possible: rows returned marked partial with the total match count (and a total amount only if it covers every match); "cannot answer this one" when no read question returns the asked total; not-found answers for records outside this Freelancer; a short answer with a page link for "where is it"; invoice links by id.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [ADR-0010](../adr/0010-share-one-read-tool-registry-between-mcp-and-the-chat.md) · `docs/features/mcp-server/contracts/openapi.yaml` for the seven tools' outputs) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — chat tools only (never exposed over HTTP):
- Seven read tools from `READ_QUESTIONS` (T02), same names, input and output schemas as MCP, description + the `DATA_NOT_INSTRUCTIONS` suffix; the handler gets the `ActingFreelancer` from the turn context, never from tool arguments.
- Each answer that names invoices also yields `AppLink { kind: 'invoice', invoiceId, label }` entries the route turns into `data-link` parts.
- `find_in_app({ topic })` → `{ pages: Array<{ page: AppPageKey; title; whatIsSetThere }> }`; `AppPageKey` = `dashboard, invoices, new-invoice, customers, new-customer, products, sender-profiles, new-sender-profile, sender-profile-bank-accounts, settings-profile, settings-privacy, settings-assistants, ai`; each key resolves to a real route in `config/routes.config.ts`.

— `contracts/openapi.yaml §AppLink, AppPageKey, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-02 — happy path

> **Given** a Freelancer with overdue invoices in two currencies
> **When** they ask the chat who owes them money
> **Then** the Assistant lists the Debtors and the overdue totals per currency, covering every invoice overdue today in the Freelancer time zone, and every figure equals the dashboard's Debtors
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — happy path

> **Given** a Freelancer with an invoice numbered INV-042
> **When** they ask the chat to show that invoice
> **Then** the Assistant answers with its Customer, amounts, status and due date, and a link that opens it
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** a Freelancer with more invoices matching a question than fit in one answer
> **When** they ask for them
> **Then** the Assistant shows as many as the read question returns, says plainly that the list is partial, says how many match in total, and offers to narrow the question. It gives a total amount only when that total covers every match. It never presents a partial list, or a total computed from one, as complete.
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — cross-context

> **Given** a Freelancer whose saved time zone is Kyiv and an issued, unpaid invoice due yesterday in Kyiv that was never marked overdue
> **When** they ask the chat what is overdue
> **Then** that invoice is included, under the same overdue rule and the same "today" the dashboard uses
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — happy path

> **Given** a signed-in Freelancer
> **When** they ask the chat where to change the logo on their invoices
> **Then** the Assistant answers briefly that it is set on the sender profile and gives a link to their sender profiles; it only ever links to pages that exist in the app
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

### AC-08 — happy path

> **Given** a Freelancer with paid invoices to Acme Corp this year
> **When** they ask the chat how much Acme Corp paid them this year
> **Then** the Assistant answers from their own data and does not treat it as an Off-topic request, even though the question mentions money. "This year" is the calendar year in the Freelancer time zone, and "paid" follows the dashboard's revenue rule. The total comes from a read question and covers every match. When no read question gives that total, the Assistant says it cannot answer this one, and it never adds numbers up itself.
>
> — `spec.md §5, AC-08, verbatim` · full text: [spec.md](../spec.md)

### AC-40 — authorization

> **Given** two Freelancers, where only the other one has a Customer named Globex
> **When** the first Freelancer asks the chat about Globex
> **Then** the Assistant answers exactly as it would for a Customer that does not exist, with no hint that it exists for anyone else
>
> — `spec.md §5, AC-40, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Turn context carrying the bound actor, today in the Freelancer time zone and the turn's pending-card slot (T27 fills the slot) — `lib/ai/turn-context.ts`
- [ ] Mastra tool adapters over `READ_QUESTIONS`, emitting invoice `AppLink`s from answers — `lib/ai/tools/read-tools.ts`
- [ ] App map (page key → route from `protectedRoutes`, title, what is set there; e.g. logo → `sender-profiles`) and the `find_in_app` tool — `lib/ai/app-map.ts`, `lib/ai/tools/find-in-app.ts`
- [ ] Parity: run the existing dashboard-parity fixtures through the chat adapters — `tests/integration/api/chat-read-tools-parity.test.ts`
- [ ] Unit test: every `AppPageKey` maps to an existing route; `sender-profile-bank-accounts` needs `senderProfileId` — `tests/unit/lib/ai/app-map.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Model passes an `actorId` / `userId` argument | schema rejects it; the actor comes only from the turn context |
| Customer of another Freelancer (Globex) | same answer as a Customer that does not exist (AC-40) |
| More matches than one answer holds | the registry's partial fields (`total`, `hasMore`) passed through untouched (AC-04) |
| A total no read question returns | the tool answer has no total — never computed in the adapter (AC-08) |
| "Where do I change the logo?" | `find_in_app` → `sender-profiles` (AC-07) |
| A page key with no route | impossible — unit test fails |

## Definition of Done

- [ ] The existing dashboard-parity test passes through the chat tool adapters, tool answers carry invoice links as AppLink ids and the registry's partial-list fields untouched, an id from another Freelancer answers exactly as an unknown one, and a unit test asserts every AppPageKey of find_in_app resolves to a route in config/routes.config.ts.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
