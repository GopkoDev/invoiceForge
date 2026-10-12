---
slug: ai-assistant
date: 2026-10-12
triage: regression
acs: [AC-19, AC-12]
commit: pending
recurrence_of: none
---

# Fix: a currency inside a line rejects the whole draft request

## Symptom

In Conversation `g48a9w6ciaj169394idmmfab` (position 1), the Freelancer wrote "створи інвойс для Оohn Doe із послугами прогамування на суму 1660 доларів". They expected a card, or the issues that block one. The chat replied "Помилка: ключ 'currency' не розпізнано в рядку 0", followed by a made-up command syntax (`/invoice from "John Doe" for … with amount "1660" and currency "USD"`). The model had put `currency` inside the line. Mastra's input validation refused the whole `propose_draft` call with `lines.0: Unrecognized key(s) in object: 'currency'`. The model did not retry with the currency on the request. It passed the error on to the Freelancer and made up a syntax.

## Root cause

`draftRequestLineSchema` (`lib/services/assistant-drafts/schema.ts`) is `.strict()`, as the contract requires (openapi `DraftRequestLine`, `additionalProperties: false`). The model put a valid value, the request currency, in the wrong place. The tool rejected the input before `execute`, and the only words the model got were zod's generic "Unrecognized key(s)". Nothing told it where currency belongs. The tests sent only well-formed inputs.

## The pinning test

Unit, `tests/unit/lib/ai/propose-draft-line-currency.test.ts`. It uses `runTurn` with a scripted model and a stubbed resolver that records the request.

- "a line currency with none on the request is lifted to the request and the card is prepared". Before the fix it failed with `AssertionError: expected [] to deeply equal [ { customer: 'Acme', …(2) } ]` (the resolver was never reached).
- "a line currency that repeats the request currency is dropped". Before the fix it failed the same way.
- "a line currency that disagrees is refused with words saying currency goes on the request". Before the fix it failed with `expected '[{"role":"tool","content":[{"type":"t…' to match /currency once for the whole request/`.
- "the tool the model is offered still describes the request fields" is a control. It checks that the JSON schema the model sees is unchanged.

The fix has two parts:
- **Lift.** The chat tool `propose_draft` (`lib/ai/tools/propose-draft.ts`) now runs its input through `liftLineCurrency` before validation. When every line currency agrees with the others and with the request's own currency (ignoring case), it is moved to the request. The resolver and the stored card request only ever see the contract's shape.
- **Clearer refusal.** A line currency that disagrees is left in place, and the strict line schema refuses it. It now says: "A line takes only description, productId, quantity, unit and price. Pass currency once for the whole request, never in a line." This applies to MCP `create_draft_invoice` as well, because the two share the line schema.

The contract is unchanged. openapi `DraftRequest` and `CreateDraftInvoiceInput` still have strict lines with no `currency`, and MCP does not lift. An external Assistant reads the schema and gets the clearer message. The contract tests (`tests/contract/mcp-tools-list.test.ts`) pass unchanged.

## Spec patch

None. Spec §1 "What a request may set" already lets the Freelancer's words set the currency. A currency written into a line by the model is still the Freelancer's currency. AC-12 and AC-19 are re-verified: the request reaches the resolver with the currency on the request.

## Follow-ups

- The chat instructions could tell the model never to show the Freelancer a raw tool error or invent command syntax. That is model behaviour and not pinned here. Consider it with the eval suite (`pnpm eval:assistant`) once a model run is allowed.
