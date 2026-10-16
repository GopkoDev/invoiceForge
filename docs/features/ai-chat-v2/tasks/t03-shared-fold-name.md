---
id: T03
title: "Move foldName into an isomorphic shared helper with one look-alike fixture set"
layer: "domain"
deps: []
blocks: ["T06", "T07", "T08", "T18"]
acs: ["AC-03", "AC-17"]
files_hint: ["lib/helpers/fold-name.ts", "lib/services/assistant-drafts/match-name.ts", "lib/services/assistant-drafts/resolve-parties.ts", "tests/support/fixtures/look-alike-names.ts", "tests/unit/fold-name.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T03 — Move foldName into an isomorphic shared helper with one look-alike fixture set

## Place in the sequence

- **Blocked by:** nothing (can start first)
- **Blocks:** T06 — Add the list_products read question with prices per currency and a Customer's Custom prices, T07 — Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests, T08 — Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates, T18 — List every Conversation summary and the latest three, and add the grouping and title-search helpers
- **Wave:** 1 (longest dependency chain); linear position T03 of T31 for the sequential in-place run.
- **Lane:** shares `lib/services/assistant-drafts/resolve-parties.ts` with T08; `lib/services/assistant-drafts/resolve-parties.ts` with T09 — serialized in id order.

## Why (user story)

> **As a** Freelancer
> **I want** the chat to find my sender profiles with their bank accounts, my products with their prices, and my Customers even when I misspace or mix look-alike letters
> **So that** I can draft under another profile, in another currency or with a catalogue product without leaving the chat
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the AI section to fill my screen, with a Conversation list and messages that scroll separately and the message box always at the bottom
> **So that** I never scroll the page to find where to type or which Conversation I am in
>
> — `spec.md §4, US-04, verbatim` · full text: [spec.md](../spec.md)

It gives the resolver, the three reads and the Conversation title search one fold rule, so look-alike names match the same way everywhere.

## Inlined context

> **Chosen:** Option 1. One function, one fixture set, one place to change. At the spec's sizing, loading 2,000 short name rows is far within 800 ms.
>
> — `adr/0004 §Decision outcome, abridged` · full text: [adr/0004](../adr/0004-match-look-alike-names-in-the-app-with-one-shared-fold-without-a-stored-search-key.md)

> Name matching | One `foldName` (NFKC, lower case, look-alike Cyrillic as Latin, spaces collapsed) for the resolver, the three reads and the title search. Stored names are always shown as stored.
>
> — `sad.md §8, Name matching row, verbatim` · full text: [sad.md](../sad.md)

> lib/helpers/fold-name.ts                     MOVED    foldName from assistant-drafts/match-name.ts, isomorphic (ADR-0004)
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

> Look-alike name search | 100 % of the look-alike fixture set (Latin/Cyrillic pairs, extra spaces, case) matches in the chat, MCP and the Conversation search | unit + contract tests
>
> — `spec.md §6, NFR row «Look-alike name search», verbatim` · full text: [spec.md](../spec.md)

> Shared look-alike fixture set: one list of Latin/Cyrillic pairs, extra spaces and case variants. The fold unit test, the three-channel contract test and the title-search unit test all read it, so the "100 % of the fixture set" NFR is measured once against one source.
>
> — `test-plan.md §Test data, verbatim` · full text: [test-plan.md](../test-plan.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-03 — happy path

> **Given** a Customer saved as "Оohn  Doe" with a Cyrillic "О" and two spaces
> **When** the Freelancer asks the chat about "oohn doe"
> **Then** the chat finds that Customer and answers about it, showing its name exactly as saved
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-17 — happy path

> **Given** a Freelancer with Conversations whose last messages were today, yesterday, 7 days ago and 8 days ago
> **When** they open the AI section, and then type "inv" into the Conversation search
> **Then** the list is grouped under Today, Yesterday, Previous 7 days (the one from 7 days ago) and Older (the one from 8 days ago), with a New chat button at its bottom; the search shows only the Conversations whose titles contain "inv", ignoring case, extra spaces and look-alike letters, and says so when none match
>
> — `spec.md §5, AC-17, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Move `foldName` (and only it) into `lib/helpers/fold-name.ts` with no `server-only` import; keep `match-name.ts` for the server-only matching helpers and import the fold from the helper — `lib/helpers/fold-name.ts`, `lib/services/assistant-drafts/match-name.ts`
- [ ] Update every caller (`resolve-parties.ts` and any other `foldName` import) — `lib/services/assistant-drafts/`
- [ ] Create the shared fixture list (pairs such as "Acme Corp"/"Аcme Corp", "Оohn  Doe"/"oohn doe", case and extra-space variants, plus a few distinct names) — `tests/support/fixtures/look-alike-names.ts`
- [ ] Unit test over the fixture set — `tests/unit/fold-name.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| Leading, trailing and repeated inner spaces | Collapsed; "Оohn  Doe" folds equal to "oohn doe" |
| Mixed Latin/Cyrillic look-alikes | Cyrillic look-alikes map to Latin before comparison |
| Distinct names that only share a prefix | Stay distinct ("Acme Corp" ≠ "Acme GmbH") |
| Imported from a client component | Works: no `server-only`, no Node-only API |

## Definition of Done

- [ ] foldName lives in lib/helpers/fold-name.ts with no server-only import, every caller imports it from there, and a unit test over the shared look-alike fixture set shows every Latin/Cyrillic, extra-space and case variant folds equal while distinct names stay distinct.
- [ ] fold unit test passes over the whole shared fixture set
- [ ] existing resolver tests stay green after the move
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
