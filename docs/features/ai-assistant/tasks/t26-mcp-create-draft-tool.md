---
id: T26
title: "Register create_draft_invoice through registerDraftTool for every key and map its results to the MCP tool answer"
layer: "ports"
deps: ["T02", "T21"]
blocks: []
acs: ["AC-17", "AC-29"]
files_hint: ["lib/mcp/server.ts", "lib/mcp/tools/create-draft.ts", "tests/contract/mcp-tools-list.test.ts", "tests/integration/api/mcp-create-draft.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T26 — Register create_draft_invoice through registerDraftTool for every key and map its results to the MCP tool answer

## Place in the sequence

- **Blocked by:** T02 — Move the seven read-question definitions from lib/mcp/tools into the shared lib/assistant-tools registry, behaviour unchanged, T21 — Create a Draft invoice for a Personal key: permission, repeat mark, resolver, key slot, invoice and repeat row in one transaction · **Blocks:** nothing — a leaf of the graph · **Wave:** 5 — the MCP adapter over the create service.
- **Lane:** shares `lib/mcp/server.ts` with T02; shares `lib/mcp/tools/` with T02; shares `tests/contract/mcp-tools-list.test.ts` with T02 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to describe an invoice in one sentence, check the proposed draft, and create it with one press
> **So that** I get a ready-to-review Draft invoice without filling the editor by hand
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

> **As an** Assistant
> **I want** to create a Draft invoice for the Freelancer who gave me a key with Draft permission, under the same no-guessing rule as the chat
> **So that** Freelancers who use their own AI client get the same drafting as the chat
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task exposes drafting to external Assistants as one MCP tool that every key can see and only a Draft-permission key can use.

## Inlined context

> **The draft tool is listed to every key and refused without Draft permission** (ADR-0011).
> - `create_draft_invoice` is registered through a new `registerDraftTool`, which sets `readOnlyHint: false` and runs the permission check before anything else.
> - A key without the permission gets the AC-29 refusal. The tool's description says a key with Draft permission is needed.
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. (**List to every key, refuse without permission** — `create_draft_invoice` appears in `tools/list` for all keys with `readOnlyHint: false` and a description naming Draft permission; the handler refuses read-only keys with the AC-29 explanation.)
>
> — `adr/0011 §Decision outcome + Option 1, abridged` · full text: [ADR-0011](../adr/0011-list-the-mcp-draft-tool-to-every-key-and-refuse-it-without-draft-permission.md)

Current code: the `tools/list` handler in `lib/mcp/server.ts` hard-codes `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }` for every tool and appends `DATA_NOT_INSTRUCTIONS` to each description; `CallToolRequestSchema` runs `runTool` then `countCall(context.keyId, outcome)`. Annotations must become per-definition so only the draft tool is `readOnlyHint: false`.

> **Hard rule:** The existing `LimitEvent` per-key MCP call limits still apply to every MCP call.
>
> — `sad.md §8, Limits, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([openapi.yaml](../contracts/openapi.yaml) `x-mcp-tools`, `DraftToolError` · `docs/features/mcp-server/contracts/openapi.yaml` ToolError) and follow it. Do not guess.

## Data delta

No DB changes. (All writes go through T21's `createDraftForKey`.)

## API contract

`tools/list` gains exactly one entry:
- `name: create_draft_invoice`, `title: Create a draft invoice`, description (verbatim from `x-mcp-tools`) + the data-not-instructions suffix; `annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }`; input `CreateDraftInvoiceInput`; output `DraftCreatedAnswer`.

Tool errors (`isError: true`, the mcp-server ToolError shape `{ code, message, fieldErrors?, details? }`); nothing is created in any of them:
- `FORBIDDEN` — "This key can only read. To create drafts, the Freelancer can create a new key with Draft permission on the Connect your AI page." (AC-29)
- `VALIDATION` + `DRAFT_ISSUES` — ambiguous or missing values, named, e.g. "Two Customers match \"Acme\": Acme Corp and Acme GmbH. Ask the Freelancer which one." (AC-31, AC-17 external)
- `RATE_LIMITED` + `DRAFT_LIMIT_REACHED` — "This key has created 50 drafts today, its daily limit. The Freelancer can lift it on the Connect your AI page. Reading still works." (AC-27)
- `CONFLICT` (repeat mark reused with different content) · `NOT_FOUND` (repeat mark's first draft deleted) · `FAILED`.
- VALIDATION / NOT_FOUND / CONFLICT / FORBIDDEN / RATE_LIMITED count as Assistant errors in the weekly usage.

— `contracts/openapi.yaml §x-mcp-tools, §DraftToolError, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-17 — cross-context

> **Given** a Freelancer who has no sender profile, or whose sender profiles have no bank account
> **When** they ask the chat to draft an invoice
> **Then** the chat explains that a sender profile with a bank account is needed before any invoice can be drafted and links to where they set one up; no draft card is shown. When only the default sender profile lacks a bank account and another profile has one, the chat says so, links to adding an account to the default profile, and offers to draft under another profile if the Freelancer names it. It never picks the other profile itself. An external Assistant is refused with the same explanation.
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

### AC-29 — authorization

> **Given** a Personal key without Draft permission
> **When** its Assistant tries to create a draft
> **Then** the attempt is refused with an explanation that the key can only read and that the Freelancer can create a key with Draft permission; nothing is created
>
> — `spec.md §5, AC-29, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Per-definition annotations; `registerDraftTool(server, definition, handler)` with `readOnlyHint: false` — `lib/mcp/server.ts`
- [ ] Tool definition + handler: call `createDraftForKey(actor, context.key, input, now)`, map failures to ToolError with the messages above, success to `structuredContent` — `lib/mcp/tools/create-draft.ts`
- [ ] Pass `canCreateDrafts` and `name` from the key check into the tool context — `lib/mcp/server.ts`
- [ ] Contract test: eight tools; only `create_draft_invoice` has `readOnlyHint: false`; the seven read entries byte-identical to before — `tests/contract/mcp-tools-list.test.ts`
- [ ] Integration test over `/api/mcp`: read-only key → FORBIDDEN; draft key, no sender profile with account → AC-17 explanation; success → `DraftCreatedAnswer` with the editor link — `tests/integration/api/mcp-create-draft.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Read-only key calls the tool | `FORBIDDEN`, nothing read or created (AC-29) |
| Tool input fails the schema | the SDK's invalid-params error, nothing created |
| Per-key call limit (60/min) hit | existing 429 before the tool runs |
| Pre-release key | listed the tool, refused on call |

## Definition of Done

- [ ] The tools/list contract test shows exactly one new tool, create_draft_invoice, with readOnlyHint false and the data-not-instructions suffix for every key, and MCP integration tests show a read-only key gets the FORBIDDEN answer, a Freelancer without a sender profile with a bank account gets the AC-17 explanation, and a success returns DraftCreatedAnswer with the editor link.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
