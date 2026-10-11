---
id: T02
title: "Move the seven read-question definitions from lib/mcp/tools into the shared lib/assistant-tools registry, behaviour unchanged"
layer: "ports"
deps: []
blocks: ["T13", "T26"]
acs: ["AC-02"]
files_hint: ["lib/assistant-tools/", "lib/mcp/tools/", "lib/mcp/server.ts", "eslint.config.mjs", "tests/unit/service-layer-boundary.test.ts", "tests/contract/mcp-tools-list.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T02 — Move the seven read-question definitions from lib/mcp/tools into the shared lib/assistant-tools registry, behaviour unchanged

## Place in the sequence

- **Blocked by:** nothing — starts in wave 1 · **Blocks:** T13 — Wrap the shared read questions as chat tools bound to the acting Freelancer and add find_in_app over a fixed app map, T26 — Register create_draft_invoice through registerDraftTool for every key and map its results to the MCP tool answer · **Wave:** 1 — sad §11 asks for this move-only task first, green on the existing MCP tests before anything builds on it.
- **Lane:** shares `lib/mcp/server.ts` with T26; shares `lib/mcp/tools/` with T26; shares `tests/contract/mcp-tools-list.test.ts` with T26 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to ask the chat who owes me, what is coming in, my summary figures, and about my customers and invoices
> **So that** I get answers in plain words that match my dashboard without hunting through screens
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task gives the chat and MCP one set of read-question handlers, so the chat's answers equal the dashboard's by construction; it changes no behaviour.

## Inlined context

> **One read-tool registry for both channels** (ADR-0010). The seven definitions (name, description, zod input/output, handler taking the actor) move to `lib/assistant-tools/`. `lib/mcp/server.ts` registers them with `registerReadOnlyTool` as today, and `lib/ai/tools/` wraps the same handlers as Mastra tools. The chat's dashboard parity is the MCP parity by construction.
>
> — `sad.md §5, building-block decisions, verbatim` · full text: [sad.md](../sad.md)

> **Chosen:** Option 1. (**One registry** — move the seven definitions to `lib/assistant-tools/`; MCP and the chat agent each register them through a thin adapter.)
>
> — `adr/0010 §Decision outcome + Option 1, abridged` · full text: [ADR-0010](../adr/0010-share-one-read-tool-registry-between-mcp-and-the-chat.md)

> **Hard rule:** **Moving `lib/mcp/tools` to `lib/assistant-tools`** breaks imports, the read-only lint rule and the `tools/list` contract test if done alongside feature work (ADR-0010). — A separate move-only first task, green on the existing MCP tests before anything else builds on it.
>
> — `sad.md §11, risk row 9, abridged` · full text: [sad.md](../sad.md)

> `@modelcontextprotocol/sdk` 1.32.0 (pinned); the MCP server registers its tools through `lib/mcp/server.ts`, read-only by construction today (`registerReadOnlyTool`).
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

Current state (code, 2026-10-11): `lib/mcp/tools/` holds `overdue.ts`, `debtors.ts`, `expected-payments.ts`, `summary.ts`, `customers.ts`, `search.ts`, `invoice.ts` and `shared.ts`; `lib/mcp/server.ts` imports each `<name>Tool` + `<name>Handler` pair and calls `registerReadOnlyTool(server, tool, handler)` seven times.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [ADR-0010](../adr/0010-share-one-read-tool-registry-between-mcp-and-the-chat.md) · `docs/features/mcp-server/contracts/openapi.yaml`) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Unchanged: the seven MCP read tools keep their names, descriptions, input/output schemas and answers exactly (`docs/features/mcp-server/contracts/openapi.yaml`). The `tools/list` answer must be byte-identical before and after the move.

— `sad.md §5 + mcp-server contract, abridged` · full text: [sad.md](../sad.md)

## Acceptance criteria

### AC-02 — happy path

> **Given** a Freelancer with overdue invoices in two currencies
> **When** they ask the chat who owes them money
> **Then** the Assistant lists the Debtors and the overdue totals per currency, covering every invoice overdue today in the Freelancer time zone, and every figure equals the dashboard's Debtors
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `git mv` the seven definitions and `shared.ts` to `lib/assistant-tools/` (one file per question, same exports) — `lib/mcp/tools/` → `lib/assistant-tools/`
- [ ] Add `lib/assistant-tools/index.ts` exporting a typed, ordered `READ_QUESTIONS` array of `{ definition, handler }` — `lib/assistant-tools/index.ts`
- [ ] Register from the array in `lib/mcp/server.ts` (same order as today) — `lib/mcp/server.ts`
- [ ] Repoint the read-only / service-layer lint rules and the boundary scan at the new folder — `eslint.config.mjs`, `tests/unit/service-layer-boundary.test.ts`
- [ ] Update imports in tests; do not change assertions — `tests/`
- [ ] Run the existing MCP suites (contract `tools/list`, parity, isolation, aggregate, lookup, pipeline) — all green, unchanged

## Edge cases

| Case | Behaviour |
|---|---|
| A test or lint rule still points at `lib/mcp/tools/<read tool>` | fix the path, never the assertion |
| `tools/list` order or text changes | regression — the move must be byte-identical |
| `lib/assistant-tools` importing from `lib/mcp` | not allowed — the registry is channel-neutral; MCP-only helpers stay in `lib/mcp` |

## Definition of Done

- [ ] The seven definitions live in lib/assistant-tools, lib/mcp/server.ts registers them from there with registerReadOnlyTool, lib/mcp/tools holds no read-tool definition, and the existing MCP contract, parity, isolation and lookup/aggregate tests pass unchanged.
- [ ] no assertion in an existing MCP test was edited
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
