---
id: T21
title: "Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction"
layer: "app"
deps: ["T06", "T16", "T17"]
blocks: ["T26"]
acs: ["AC-27", "AC-30", "AC-31", "AC-32"]
files_hint: ["lib/services/assistant-drafts/create-for-key.ts", "lib/services/assistant-drafts/repeat-marks.ts", "tests/integration/services/assistant-drafts/create-for-key.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T21 — Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction

## Place in the sequence

- **Blocked by:** T06 — Write the Assistant origin once at creation, set issuedAt when an invoice first leaves DRAFT, and expose assistantMark on invoice reads, T16 — Resolve draft lines against the catalogue and custom prices, apply the quantity and unit defaults and finish resolveDraftRequest, T17 — Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached · **Blocks:** T26 — Register create_draft_invoice through registerDraftTool for every key and map its results to the MCP tool answer · **Wave:** 4 — the MCP write path (critical flow 3); the tool adapter waits on it.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to create a new Personal key with Draft permission, keep my existing keys read-only, and control how many drafts a key may create per day
> **So that** my own AI client can draft invoices without a leaked key ever flooding my account
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant
> **I want** to create a Draft invoice for the Freelancer who gave me a key with Draft permission, under the same no-guessing rule as the chat
> **So that** Freelancers who use their own AI client get the same drafting as the chat
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task lets an external Assistant with a Draft-permission key create a Draft invoice under the same no-guessing rule as the chat, within the key's daily limit and safely retryable.

## Inlined context

> Critical flow 3: create_draft_invoice with request and optional repeat key → authenticate the Personal key, acting Freelancer → key has no Draft permission → refused, key can only read; permission present → check the repeat key → repeat within 24 hours → same content returns the first draft, different content is refused; new request → resolveDraftRequest → ambiguous or missing values → refused, names what is ambiguous or missing; complete → in one transaction take one of today's key drafts, create the Draft invoice with origin key name, write the repeat row → key daily limit reached → no draft slot left, nothing created → refused, lift the limit on the keys page; created → draft link and every default used.
>
> — `sad.md §6, critical flow 3, abridged` · full text: [sad.md](../sad.md)

> **MCP repeat marks live in their own table** (ADR-0012). The tool takes an optional `repeatKey`.
> - `McpDraftRepeat` (key id + repeat key unique, request fingerprint, invoice id, created at) is written in the same transaction as the invoice.
> - A repeat within 24 h returns the first draft, and the same key with different content is refused.
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

> **Flow 3 and AC-17:** the MCP "ambiguous or missing values" refusal must include the no-sender-profile and no-bank-account cases with the same explanation as the chat.
>
> — `sad.md §6, flags for design and data-model, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** No Assistant can issue, send, edit or delete an invoice.
>
> — `sad.md §8, Write safety, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([server-actions.md](../contracts/server-actions.md) §MCP adapter · [data-model.md](../data-model.md) §McpDraftRepeat · [ADR-0012](../adr/0012-keep-mcp-repeat-keys-in-their-own-table-purged-after-24-hours.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `McpDraftRepeat.personalKeyId` | TEXT | PK (1), FK CASCADE | written with the invoice |
| `McpDraftRepeat.repeatKey` | TEXT | PK (2), ≤ 200 (zod) | |
| `McpDraftRepeat.fingerprint` | TEXT | NOT NULL | SHA-256 hex of the canonical request |
| `McpDraftRepeat.invoiceId` | TEXT | NULL, FK SET NULL | the first draft; NULL = no longer available |
| `McpDraftRepeat.createdAt` | TIMESTAMP(3) | NOT NULL DEFAULT now | starts the 24 h window |
| `Invoice.assistantOrigin/KeyName/KeyId` | — | — | `PERSONAL_KEY`, the key name, the key id |
| `PersonalKeyDraftDay.created` | INTEGER | — | +1 via `takeKeyDraftSlot` (T17) |

Repeat check: read by `(personalKeyId, repeatKey)` → found, < 24 h, same fingerprint → return the first draft; found, < 24 h, different fingerprint → refuse; found but older than 24 h and not yet purged → delete it in the same transaction and treat the request as new. A racing repeat fails on the PK; the service then re-reads the winner's row and returns its draft.

— `data-model.md §McpDraftRepeat, abridged` · full text: [data-model.md](../data-model.md)

## API contract

```ts
createDraftForKey(actor: ActingFreelancer, key: { id: string; name: string; canCreateDrafts: boolean },
  input: CreateDraftInvoiceInput, now: Date): Promise<ActionResult<DraftCreatedAnswer>>;
```
- Checks Draft permission first (`FORBIDDEN`), then the repeat mark, then resolves. In one transaction it then takes a key draft slot, creates the invoice with `assistantOrigin = PERSONAL_KEY`, `assistantKeyName` and `assistantKeyId`, and writes the repeat row.
- `DraftCreatedAnswer { invoiceId, invoiceNumber, status: DRAFT, link: /invoices/{id}/edit (absolute), draft: DraftProposal (with invoiceNumber), repeated: boolean }`.
- Failures: `FORBIDDEN` (no permission) · `VALIDATION` + `{ kind: DRAFT_ISSUES, issues }` · `RATE_LIMITED` + `{ kind: DRAFT_LIMIT_REACHED, created, allowance, renewsAt }` · `CONFLICT` (repeat mark reused with different content) · `NOT_FOUND` (the repeat mark's first draft was deleted since) · `FAILED`.

— `contracts/server-actions.md §MCP adapter; openapi.yaml DraftCreatedAnswer, DraftToolError, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-27 — domain invariant

> **Given** a Personal key with Draft permission that has created 50 Assistant drafts today in the Freelancer time zone
> **When** its Assistant tries to create another draft
> **Then** the attempt is refused with an explanation that the key's daily draft limit is reached and that the Freelancer can lift it on the page where keys are managed; reading through the key keeps working
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

### AC-30 — happy path

> **Given** a Personal key with Draft permission, and a Freelancer with a Customer Acme Corp and a default sender profile with a default bank account in USD
> **When** the Assistant asks to create a draft for Acme Corp with 20 hours at 50 USD
> **Then** a Draft invoice is created with those lines and the editor's defaults for everything else, and the answer lists every default used and gives a link to open the draft
>
> — `spec.md §5, AC-30, verbatim` · full text: [spec.md](../spec.md)

### AC-31 — error

> **Given** a Personal key with Draft permission
> **When** the Assistant asks to create a draft for "Acme" while two Customers match, or with a line that has no quantity or price and matches no catalogue product
> **Then** the attempt is refused and the answer names what is ambiguous or missing (the matching Customers, or the line without an amount); nothing is created — the same rule the chat follows
>
> — `spec.md §5, AC-31, verbatim` · full text: [spec.md](../spec.md)

### AC-32 — domain invariant

> **Given** an Assistant that created a draft but lost the answer to a network failure
> **When** it repeats the same creation request, marked as a repeat of the first
> **Then** no second draft is created and the answer points to the draft created the first time. A repeat mark is honoured for 24 hours. The same mark sent with different content is refused, and nothing is created. An identical request without a repeat mark creates a new draft, because two identical invoices can be intended.
>
> — `spec.md §5, AC-32, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Repeat-mark read / stale delete / write / race re-read — `lib/services/assistant-drafts/repeat-marks.ts`
- [ ] `createDraftForKey`: permission → repeat → `resolveDraftRequest` → transaction (`takeKeyDraftSlot`, `createInvoice(…, { origin: 'PERSONAL_KEY', keyId, keyName }, tx)`, repeat row) → answer with `defaultsUsed` — `lib/services/assistant-drafts/create-for-key.ts`
- [ ] Integration tests: AC-29 FORBIDDEN with no reads; AC-30 created with defaults listed; AC-31 two Acmes / a line without amount; AC-17 no profile with account → DRAFT_ISSUES; AC-27 51st rolls back; AC-32 repeat same → `repeated: true`, different → CONFLICT, no mark + identical → second draft, parallel repeats → one invoice; first draft deleted → NOT_FOUND — `tests/integration/services/assistant-drafts/create-for-key.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Identical request without `repeatKey` | a new draft (two identical invoices can be intended) |
| Repeat mark older than 24 h, not yet purged | deleted in the transaction; request treated as new |
| Limit reached and repeat of an earlier success | returns the first draft (repeat check is before the slot) |
| Key revoked between auth and create | the pipeline's key check already refused it (mcp-server) |
| Resolver issues | nothing created, no slot taken, no repeat row |

## Definition of Done

- [ ] Integration tests show a key without Draft permission gets FORBIDDEN before anything is read, a complete request creates a draft with origin PERSONAL_KEY and the key name, an ambiguous or incomplete one returns DRAFT_ISSUES naming the problem, the 51st draft rolls back with DRAFT_LIMIT_REACHED, and a repeat mark within 24 h returns the first draft (same content) or CONFLICT (different content) while two racing repeats create one invoice.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
