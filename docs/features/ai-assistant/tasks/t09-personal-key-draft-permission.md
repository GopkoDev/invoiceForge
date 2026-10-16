---
id: T09
title: "Set Draft permission only when a Personal key is created and return it from the key list and the key check"
layer: "app"
deps: ["T01"]
blocks: ["T17"]
acs: ["AC-25", "AC-26"]
files_hint: ["lib/services/personal-keys/personal-keys.ts", "lib/services/personal-keys/authenticate.ts", "lib/actions/personal-key-actions.ts", "lib/validations/personal-key.ts", "types/personal-key/types.ts", "tests/integration/services/personal-keys/draft-permission.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T09 — Set Draft permission only when a Personal key is created and return it from the key list and the key check

## Place in the sequence

- **Blocked by:** T01 — Promote the ten staged migrations, add the Prisma models and extend the test factories for the AI tables · **Blocks:** T17 — Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached · **Wave:** 2 — the write-capability gate (ADR-0011) that the key limit, the MCP tool and the keys page read.
- **Lane:** shares `lib/actions/personal-key-actions.ts` with T17; shares `lib/services/personal-keys/personal-keys.ts` with T17; shares `types/personal-key/types.ts` with T17 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to create a new Personal key with Draft permission, keep my existing keys read-only, and control how many drafts a key may create per day
> **So that** my own AI client can draft invoices without a leaked key ever flooding my account
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task makes Draft permission a property a key is born with: chosen only when the key is created, shown in the key list, returned by the key check, and impossible to add later.

## Inlined context

> **The draft tool is listed to every key and refused without Draft permission** (ADR-0011).
> - `PersonalKey.canCreateDrafts` is set only by the create-key service and has no update path.
>
> — `sad.md §5, building-block decisions, abridged` · full text: [sad.md](../sad.md)

> - **Turning on Draft permission for an existing Personal key.** A key that may already have leaked must never gain write access silently; a new key is the only way.
>
> — `spec.md §3, Non-goals, verbatim` · full text: [spec.md](../spec.md)

> **Leaked key with Draft permission.** Draft permission is never added to an existing key, so keys that leaked before this release stay read-only.
>
> — `spec.md §6.1, Abuse cases, abridged` · full text: [spec.md](../spec.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([server-actions.md](../contracts/server-actions.md) §Personal keys · [ADR-0011](../adr/0011-list-the-mcp-draft-tool-to-every-key-and-refuse-it-without-draft-permission.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `PersonalKey.canCreateDrafts` | BOOLEAN | NOT NULL DEFAULT false | written only by `createPersonalKey`; read by list and authenticate |

Access: the draft tool reads `canCreateDrafts` from the authenticate row that already reads the key by `digest` → `PersonalKey_digest_key`. No new query.

— `data-model.md §PersonalKey (one new column), abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `createPersonalKey(input: { name: string; canCreateDrafts: boolean })` ✎ (AC-25) — the input gains `canCreateDrafts`, default `false` when absent; result unchanged (`{ key, fullKey }`); this is the **only** writer of `PersonalKey.canCreateDrafts`. No update action exists (AC-26). Existing outcomes unchanged.
- `PersonalKeySummary` ✎ gains `canCreateDrafts: boolean` (the list mark). (`draftsToday` is added by T17.)
- `authenticatePersonalKey` ✎ also returns `canCreateDrafts` and `name` from the same row.

— `contracts/server-actions.md §Personal keys + §MCP adapter, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-25 — happy path

> **Given** a Freelancer on the page where they connect their own AI client
> **When** they create a new Personal key and choose to give it Draft permission
> **Then** the key is created and shown once as before, and the key list marks it as able to create drafts
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — domain invariant

> **Given** a Personal key created without Draft permission, including every key that existed before this release
> **When** the Freelancer looks for a way to give it Draft permission
> **Then** there is none; the page explains that drafting needs a new key with Draft permission, which they can create and then revoke the old key
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `canCreateDrafts` in the create schema (default false) — `lib/validations/personal-key.ts`
- [ ] Store it in `createPersonalKey`; no other `update` path writes it — `lib/services/personal-keys/personal-keys.ts`
- [ ] Return it in `listPersonalKeys` and the summary type — `lib/services/personal-keys/personal-keys.ts`, `types/personal-key/types.ts`
- [ ] Return `canCreateDrafts` and `name` from `authenticatePersonalKey` (same select) — `lib/services/personal-keys/authenticate.ts`
- [ ] Action passes the field through — `lib/actions/personal-key-actions.ts`
- [ ] Integration tests, incl. a scan asserting no `personalKey.update*` call sets `canCreateDrafts` — `tests/integration/services/personal-keys/draft-permission.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Create input without `canCreateDrafts` | `false` |
| Revoke a draft key | unchanged revoke path; permission irrelevant after revocation |
| Any code path updating `canCreateDrafts` | must not exist (scan test) |
| Pre-release key | `false` (migration default) |

## Definition of Done

- [ ] Integration tests show createPersonalKey stores canCreateDrafts (default false), no service or action can change it afterwards, listPersonalKeys returns canCreateDrafts, and authenticatePersonalKey returns canCreateDrafts and name from the same row with no extra query.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
