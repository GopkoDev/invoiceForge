---
id: T09
title: "Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b)"
layer: "app"
deps: ["T07", "T08"]
blocks: ["T29"]
acs: ["AC-05", "AC-05b", "AC-24"]
files_hint: ["lib/ai/instructions/chat.ts", "lib/services/assistant-drafts/schema.ts", "lib/services/assistant-drafts/resolve-parties.ts", "lib/ai/issue-text.ts", "lib/ai/tools/propose-draft.ts", "docs/features/ai-chat-v2/contracts/openapi.yaml", "docs/features/ai-chat-v2/contracts/api-sync-report.md", "tests/unit/chat-instructions.test.ts", "tests/unit/own-profile-hint.test.ts", "tests/integration/ai-chat-v2-own-profile.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T09 — Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b)

## Place in the sequence

- **Blocked by:** T07 — Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests, T08 — Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates
- **Blocks:** T29 — Extend the evaluation harness with explains and press fields, the own-profile-name setup and this feature's fixtures
- **Wave:** 4 (longest dependency chain); linear position T09 of T31 for the sequential in-place run.
- **Lane:** shares `lib/services/assistant-drafts/resolve-parties.ts` with T03; `lib/services/assistant-drafts/resolve-parties.ts` with T08; `lib/ai/tools/propose-draft.ts` with T13 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to find my sender profiles with their bank accounts, my products with their prices, and my Customers even when I misspace or mix look-alike letters
> **So that** I can draft under another profile, in another currency or with a catalogue product without leaving the chat
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to issue a draft from its preview after one confirmation, under the editor's rules
> **So that** checking and issuing an Assistant draft is one short step where I created it
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

It makes the chat say plainly that a sender profile is the Freelancer's own business, deterministically from the resolver rather than only from the model's reading of the instructions.

## Inlined context

> **AC-05b depends on the model** following the chat instructions and the sender-profile read (Flow 6). There is no resolver rule for "this Customer name is your own sender profile". Candidate for §11 with an eval fixture in `plan-tests`. Alternative for `tasks`: a resolver hint on `CUSTOMER_NOT_FOUND` when the folded name equals a sender profile.
>
> — `sad.md §6, Flags for design and data-model, verbatim` · full text: [sad.md](../sad.md)

> **Decision (tasks stage):** take the resolver hint **and** keep the eval fixture. `CUSTOMER_NOT_FOUND` gains an optional `ownSenderProfile: { senderProfileId, name }` set only when `foldName(written)` equals `foldName` of one of the acting Freelancer's sender profile names. `issuesText` then explains the difference and asks which Customer; `propose_draft` adds no "Add a Customer" link for it (screens.md SCR-03 "answered — own profile named": text only). It is additive in `DraftIssueDelta`, so the openapi delta and the sync report are updated in this task.
>
> — `tasks/_epic.md §Decisions, D-1, abridged` · full text: `tasks/_epic.md`

> The chat instructions list what the chat can read (no more promise of a product read that does not exist) and explain sender profile versus Customer (AC-05b). Inline: wording only.
>
> — `sad.md §5, building-block decisions, verbatim` · full text: [sad.md](../sad.md)

> Write safety | The model still has no create or issue tool. Issuing exists only as the Freelancer's server action behind a confirmation dialog, with the expected version (ADR-0007). A request in words to issue gets the AC-24 answer with a preview link.
>
> — `sad.md §8, Write safety row, verbatim` · full text: [sad.md](../sad.md)

> AC-05b error | a draft naming the Freelancer's own sender profile as the Customer gets no card | integration | scripted model calls the draft action with Customer "Consulting FOP": the resolver reports the Customer as not found, no card, no Offered choice is stored
>
> — `test-plan.md §AC coverage, AC-05b integration row, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `DraftIssueDelta` (additive, this task): `CUSTOMER_NOT_FOUND` + optional `ownSenderProfile: { senderProfileId: RecordId, name: FreelancerText }`. Same for chat, Create press and MCP `DRAFT_ISSUES`. Record it in `api-sync-report.md` as a tasks-stage additive change.

— `contracts/openapi.yaml, DraftIssueDelta, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-05 — error

> **Given** a Freelancer with no Customer matching "Globex" and no catalogue product matching "audit"
> **When** they ask the chat to find the Customer "Globex" or the product "audit"
> **Then** the chat says plainly that nothing matches and links to the page where they can add one; it never names a record that does not exist
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-05b — error

> **Given** a Freelancer whose sender profile is named "Consulting FOP" and who has no Customer of that name
> **When** they write "invoice Consulting FOP for 10 hours at 40 USD"
> **Then** the chat explains that "Consulting FOP" is their own sender profile — the business they invoice from — while a Customer is the party who pays, and asks which Customer to invoice; it never treats the sender profile as the Customer and shows no draft card
>
> — `spec.md §5, AC-05b, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — authorization

> **Given** an Assistant draft
> **When** the Freelancer asks the chat in words to issue it
> **Then** the chat still answers that only they can issue an invoice and points them to the draft's preview or editor; nothing is issued without their press and confirmation (ai-assistant AC-24 stays in force)
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Instructions: list exactly the reads in `READ_QUESTIONS` (incl. sender profiles, products, Customers), drop the non-existent product-read promise, add the sender-profile vs Customer rule and the AC-24 "only you can issue, use the preview or editor" answer — `lib/ai/instructions/chat.ts`
- [ ] Schema + resolver: optional `ownSenderProfile` on `CUSTOMER_NOT_FOUND`, set by folded equality with an owned profile name — `schema.ts`, `resolve-parties.ts`
- [ ] Issue text (en + uk): "{name} is your own sender profile — the business you invoice from. A Customer is the one who pays. Which Customer should this invoice go to?" — `lib/ai/issue-text.ts`
- [ ] No `new-customer` page link when the hint is set — `lib/ai/tools/propose-draft.ts`
- [ ] Patch `DraftIssueDelta` and add a line to the sync report — `contracts/openapi.yaml`, `contracts/api-sync-report.md`
- [ ] Unit: instructions name exactly the registry's reads and hold the rule; the chat agent's tools include no status change or issue action — `tests/unit/chat-instructions.test.ts`; hint unit — `tests/unit/own-profile-hint.test.ts`
- [ ] Integration: scripted `propose_draft` with Customer "Consulting FOP" → not found with hint, no card, no offer row — `tests/integration/ai-chat-v2-own-profile.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| "consulting  fop" (case/spaces) | Hint still set (folded equality) |
| A Customer is also called "Consulting FOP" | Resolved as that Customer; no hint (the hint is only on not found) |
| Partial match of a profile name ("Consulting") | No hint; plain not found or the usual near-miss |
| Asked in words to issue a draft (AC-24) | Instruction answer: only the Freelancer issues, link to preview/editor; no tool exists |

## Definition of Done

- [ ] The chat instructions name exactly the read questions in READ_QUESTIONS and state the sender-profile versus Customer rule, CUSTOMER_NOT_FOUND carries an ownSenderProfile hint when the folded written name equals one of the Freelancer's sender profile names, the issue text explains it in en and uk, no card, offer or add-Customer link follows, and the agent's tool set holds no issuing tool.
- [ ] unit + integration tests green
- [ ] openapi delta and sync report updated
- [ ] existing no-guessing unit tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
