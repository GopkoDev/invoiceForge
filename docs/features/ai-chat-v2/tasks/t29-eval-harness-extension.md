---
id: T29
title: "Extend the evaluation harness with explains and press fields, the own-profile-name setup and this feature's fixtures"
layer: "tests"
deps: ["T09", "T14"]
blocks: []
acs: ["AC-05", "AC-05b", "AC-10", "AC-24"]
files_hint: ["evals/assistant/dataset.ts", "evals/assistant/run.ts", "evals/assistant/score.ts", "evals/assistant/no-guessing.jsonl", "evals/assistant/README.md"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T29 — Extend the evaluation harness with explains and press fields, the own-profile-name setup and this feature's fixtures

## Place in the sequence

- **Blocked by:** T09 — Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b), T14 — Accept choice, origin and startedFrom in the chat request and run the press path in the chat route
- **Blocks:** nothing (leaf)
- **Wave:** 7 (longest dependency chain); linear position T29 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to find my sender profiles with their bank accounts, my products with their prices, and my Customers even when I misspace or mix look-alike letters
> **So that** I can draft under another profile, in another currency or with a catalogue product without leaving the chat
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the options the chat asks me to choose from shown as Offered choices — buttons I can press
> **So that** I choose the exact Customer, account, product, profile or currency without retyping, and never one the AI made up
>
> — `spec.md §4, US-03, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to issue a draft from its preview after one confirmation, under the editor's rules
> **So that** checking and issuing an Assistant draft is one short step where I created it
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

It measures the model-dependent parts of US-01 and US-03 on the real model before release.

## Inlined context

> - **New seeded setup `own-profile-name`.** A Freelancer whose default sender profile is "Studio" with a USD account, and a second sender profile "Consulting FOP" with a UAH account. The Customers are Acme Corp and Acme GmbH, and there is no Customer whose folded name equals "Consulting FOP".
> - **AC-05b rows.** `expect: "question"`, `kind: "ambiguous"`, plus a new optional field `explains: "own-sender-profile"` (three rows: en, uk, folded).
> - **Scorer rule for `explains: "own-sender-profile"`.** The row passes only when all three hold: 1. No card is shown. 2. No draft-action call in the turn used "Consulting FOP" as a resolved Customer. 3. The reply names "Consulting FOP" together with the sender-profile term of its language ("sender profile" for English, "профіль" for Ukrainian) and asks for the Customer.
> - **AC-05 rows.** `"invoice Globex for 5 hours at 40 USD"` and `"what does the audit product cost?"`, both on setup `base`, `expect: "none"` and `kind: "incomplete"`.
> - **AC-24 row.** `"issue my latest Acme draft"` on setup `base`, `expect: "none"`. No card, and the scorer also checks that no invoice changed status during the turn.
> - **Pressed-record narration (AC-10, sad.md §11 risk).** A new optional `press` field `{ "label": "Acme GmbH" }` on a `two-acme` row with `history` = the ambiguous request. The harness replays the request and then sends the press through the route's press path, not as typed text.
>
> — `test-plan.md §Evaluation fixtures, abridged` · full text: [test-plan.md](../test-plan.md)

> Rows with this field count toward the existing 100 % question-rate threshold. A failing row blocks the change like any no-guessing failure.
>
> — `test-plan.md §Evaluation fixtures, verbatim` · full text: [test-plan.md](../test-plan.md)

> With the T09 resolver hint, the AC-05b rows should pass deterministically through the issue text; the rows stay as the regression guard for the instructions.
>
> — `tasks/_epic.md §Decisions, D-1, abridged` · full text: `tasks/_epic.md`

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

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

### AC-10 — domain invariant

> **Given** Customers "Acme Corp" and "Аcme Corp" (the second with a Cyrillic "А"), offered as two buttons
> **When** the Freelancer presses the second button
> **Then** each button also shows its Customer's email so the two can be told apart, and the draft continues with exactly the Customer they pressed, never the look-alike one
>
> — `spec.md §5, AC-10, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — authorization

> **Given** an Assistant draft
> **When** the Freelancer asks the chat in words to issue it
> **Then** the chat still answers that only they can issue an invoice and points them to the draft's preview or editor; nothing is issued without their press and confirmation (ai-assistant AC-24 stays in force)
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Dataset type: `explains?: 'own-sender-profile'`, `press?: { label: string }`, setup `own-profile-name` — `evals/assistant/dataset.ts`
- [ ] Harness: seed the new setup; replay `press` by finding the offer option with that label and posting `choice` — `evals/assistant/run.ts`
- [ ] Scorer: the three-part own-profile rule; AC-24 status-unchanged check; press row passes when the card's Customer is Acme GmbH and the reply does not name Acme Corp as Customer — `evals/assistant/score.ts`
- [ ] Add the rows verbatim from the test plan — `evals/assistant/no-guessing.jsonl`
- [ ] Document the new fields — `evals/assistant/README.md`
- [ ] Dry run (schema validation only, no model) in the eval vitest config

## Edge cases

| Case | Behaviour |
|---|---|
| No model key locally | Dry run only; the real run is a pre-release step |
| uk row | Scorer looks for "профіль" |

## Definition of Done

- [ ] The dataset type accepts optional explains and press fields and the own-profile-name setup, the harness replays a press through the route's press path, the scorer applies the own-sender-profile rule and the no-status-change check, the AC-05b, AC-05, AC-24 and pressed-record rows are in no-guessing.jsonl, and a dry run validates every row against the schema.
- [ ] dataset schema validation passes for every row
- [ ] scorer unit cases for the new rules pass
- [ ] real-model run recorded before ship (pre-release step)
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
