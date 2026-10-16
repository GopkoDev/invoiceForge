---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-14"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0011 — Ask every open question in one server-checked Question form, answered in one send

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** Dmytro Hopko (owner decision F1–F9 of 2026-10-13 and the question-form feedback of 2026-10-14; mechanism chosen by the spec-revision agent, open to owner veto)
- **Supersedes:** ADR-0002 (offers built only from the first offer-able resolver issue) and ADR-0003 (a press as a single option reference). **Amends:** ADR-0001 (the offer row stays and now holds a form).

## Context

The owner tested the built chat (spec §1 "Owner feedback revision", screenshots 20 and 22). With one button set per reply and options only from the draft resolver, the model fell back to asking four questions in prose whenever the request had no Customer at all: the resolver cannot run without a Customer, so no offer could exist. The owner decided (F1–F9) that the chat asks every open question at once in one form, like Claude's AskUserQuestion: several questions, option buttons that are data-backed (records the model got from reads or the resolver, checked by the server, labelled from the database), a typed "Something else" input, system-computed date options, and one send of all answers that is one counted message. The safety properties of ADR-0001–0003 (no invented option, uniform refusal, no model call for a bad answer, exact pinning) must survive.

## Decision drivers

- Spec §6 "Question form options": 100 % of options are the Freelancer's own checked records, supported currencies or computed dates; 0 options or labels from model text (AC-09, abuse case "Model-chosen options naming foreign records").
- Spec §6 "Refused form answers": forged, outdated or foreign answers refused in the same words, uncounted, with 0 model calls (AC-12b, F7).
- F5: one send of all answers = one message counted once (AC-11); answers pinned into the draft by code (F6, AC-10).
- Owner feedback 2026-10-14 (fix [2026-10-14-question-form-ux](../_fixes/2026-10-14-question-form-ux.md); refs `ref/form-as-built.png`, `ref/form-wanted-claude.png`, `ref/form-wanted-series.png`): a record question must offer the Freelancer's records even when the model named none; one question at a time, docked above the composer, no field headings, no language switching (AC-54–AC-56).
- SAD §2: no new runtime dependency for the AI path; history is loaded server-side; the chat route reads one message per request.
- The pinned-turn seam already spiked in T01 (a prior tool step) and the offer row, claim and release of ADR-0001 exist and are tested.

## Considered options

1. **Extend the offer row into a form (chosen).** `ChoiceOffer` gains `questions` and `answers` (JSONB); questions come from all resolver issues (code) plus an `ask_user` tool whose record ids the server checks and labels; one `form` field on the chat request carries every answer; the existing claim, release, close and partial unique index stay.
2. **A new form table beside `ChoiceOffer`.** Clean naming, but two parallel mechanisms (offers and forms) with two claim paths, two reopen joins and two export shapes for one UI component, and the "one open thing per Conversation" invariant would have to span two tables.
3. **Keep one choice per reply and fix the instructions only.** No schema or contract change, but it cannot ask for a Customer that the resolver never reached, nor for a price or a date, so the prose interrogation of screenshot 22 stays (rejected by the owner, F1).

## Decision outcome

**Chosen:** Option 1. It keeps every proven safety seam of ADR-0001/0003 (owner-scoped row, the one-OPEN partial index, claim with the allowance slot in one transaction, release on failure, uniform `CHOICE_UNAVAILABLE`), and only widens what the row holds. Mechanism:

- **Sources of questions.** (a) `propose_draft` ISSUES → `formFromIssues` builds a question for **every** issue (offer-able ones with options as in the ADR-0002 table; value issues such as `LINE_PRICE_MISSING_IN_CURRENCY` as input-only questions; more than 8 candidates → input-only with `matchCount`; a record issue without candidates is filled by the server as below). (b) The chat-only `ask_user` tool takes `{ draft?, questions[1..6] }`; each question names a closed `field` (`CUSTOMER`, `SENDER_PROFILE`, `BANK_ACCOUNT`, `PRODUCT`, `CURRENCY`, `ISSUE_DATE`, `DUE_DATE`, `QUANTITY`, `PRICE`, `TAX_RATE`, `DISCOUNT`, `PO_NUMBER`, `PAYMENT_TERMS`, `NOTES`, `FREE`), an optional `lineIndex`, a `prompt` (plain text, ≤ 140 characters) and, for record fields, `recordIds` (≤ 8). The server loads every id **owner-scoped and by kind**; any id that fails makes the whole call fail with one uniform tool error (`OPTIONS_UNAVAILABLE`, same words for foreign and unknown) and nothing is stored. Labels are built by the existing label rules from the loaded rows. The model may omit `recordIds`; the server then fills the options (next bullet). Date options are computed by the server (issue date: today, yesterday in the Freelancer time zone; due date: 7 / 14 / 30 days after the issue date).
- **Server-filled record options.** A record question (`CUSTOMER`, `SENDER_PROFILE`, `BANK_ACCOUNT`, `PRODUCT`) that reaches the end of the turn with no options and no `matchCount` is filled by `fillRecordOptions` (`lib/services/assistant-drafts/forms.ts`) from the Freelancer's own records. This covers three sources: `ask_user` without `recordIds`, a resolver issue without candidates, and the fallback form. The fill is owner-scoped, up to 8, most recently updated first; products are active ones in the form's currency when known; bank accounts are those of the request's sender profile and currency when known. Labels come from the same label rules; each option carries a server-written `detail` line (Customer: email, else country; sender profile: country, else email; product: app-formatted price; bank account: "CUR ••last4"). With no records the question stays input-only; a failed fill never fails the turn (the question is stored input-only). The ids the model passes are still loaded owner-scoped by kind with the uniform refusal; the browser sees labels and details only and answers by option id.
- **Prompts, no headings.** Every stored question carries a `prompt`: the model's text, else a default English question written by the server. There is no per-field heading (stored legacy `heading` stays readable as optional). Dates and amounts in labels use the app's existing formatters; the form chrome is English like the rest of the interface.
- **One form per reply.** At the end of the turn the form is the resolver questions of the last `propose_draft` ISSUES followed by the `ask_user` questions whose `field`+`lineIndex` the resolver did not already ask, capped at 6 in the spec §1 F1 order (records, currency, products, dates, quantities and prices, other values, free questions; the rest go to the next form). If the turn ends with `ask_user` refused and no valid form, the system stores a fallback form with the asked fields as questions without model options (record fields filled by the server as below; never prose). Optional fields (tax rate, discount, PO number, payment terms, notes) carry a Skip answer. A card wins: a turn that parks a card stores no form. The form's `request` is the last `propose_draft` request, else the validated partial `draft` of `ask_user`, else none (a free-question form).
- **The browser form.** The form is docked directly above the composer, never inside a message, and shows one question at a time: the `prompt` as header, a pager when there is more than one question, numbered rows with their `detail`, keyboard picks (1–9, arrows, Enter), a "Something else" input and Skip for optional questions. Picking advances; answering the last question sends all answers at once (there is no Send button). While the answers are in flight the dock is hidden; any refused or failed send brings it back with the picks kept and the error shown. Sent, closed and older forms render nothing in the stream; the answer message ("<question> — <answer>", one line per answer) is the history.
- **Submit.** The chat request carries `form: { formId, answers[] }` (each `{ questionId, optionId }` or `{ questionId, text }`) instead of the removed `choice`. Order in the route: body schema → **form check** (owner, OPEN, latest, every `questionId` and `optionId` held, every required question answered, every chosen record re-read and still fitting) → a failed check is the uniform 409, uncounted, no model call → typed-text format errors (amount, calendar day, length) are a 400 per question, uncounted → reserve the slot and claim the row (`OPEN` → `CHOSEN`, `answers` written) in one transaction → compose the message text from the stored labels and typed texts → **pin** every record/date/value answer into a copy of the stored request (record answers by id, "Something else" record answers as names) → if the pinned request passes the draft schema, resolve it in code and hand the result to the turn as the prior `propose_draft` step (T01 seam); otherwise hand the answers to the turn as a prior `ask_user` step (data only) → the turn → `saveTurn` with origin `FORM`.
- **Legacy rows.** Existing single-offer rows are backfilled into the form shape (one question); the `choice` field and `PRESSED` writes end. `PRESSED` stays readable for old messages.

## Consequences

**Positive**
- The prose interrogation disappears for drafts: the model can always ask through a form, even before the resolver can run (no Customer yet).
- AC-09 holds by construction for model-chosen options too: an option is an id the server loaded for this Freelancer, and its label is built from that row.
- One component, one row, one claim path, one export shape for resolver and model questions.
- A record question always offers buttons when the Freelancer has matching records, so the model need not guess which ids to pass.

**Negative**
- The model now chooses *which* records to offer, so a poor choice (the wrong two of four Customers) is possible; server-filled options (when the model passes no ids), "Something else" and the AC-37/AC-46 eval rows are the mitigation, not the schema.
- A whole-call refusal for one bad id costs a model step; the step cap (8) bounds it.
- The question `prompt` is model text shown in the UI; it is plain text and capped, but a stored-text injection can still word a misleading question (it cannot add an option).
- A server-filled list shows at most 8 most recently updated records; an older record is reached through "Something else".
- The chat request contract changes incompatibly (`choice` removed) within the unshipped feature; the T14/T15 tests are rewritten for `form`.

**Neutral**
- "Today" in a form is frozen at the day the form was made (the label shows the date), so a form answered days later uses the shown date, which is exact rather than relative.
- The columns `options`, `kind`'s old values and `chosenOptionId` become legacy; a later contract-phase migration may drop them once no build reads them.

## Links

- Spec: [[../spec.md]] §1 F1–F9, AC-08–AC-14, AC-37–AC-41, AC-54–AC-56, §6 rows "Question form options", "Form answer check", "Refused form answers"
- SAD: [[../sad.md]] §4, §5 "Question form", §6 Critical flow 4, §8
- Fix: [[../_fixes/2026-10-14-question-form-ux]]
- Related ADR: [[0001-store-each-set-of-offered-choices-as-a-server-side-offer-row-tied-to-its-reply]] (amended), [[0002-build-offered-choices-in-code-from-the-draft-resolvers-typed-issues]] and [[0003-send-a-press-as-an-option-reference-and-pin-the-chosen-record-into-the-draft-request-in-code]] (superseded)

## Change history

- 2026-10-14: server-filled record options with `detail`, no headings, one docked question at a time, hidden while sending (fix 2026-10-14-question-form-ux, T78–T84); folded into the decision above.
