# Security review — ai-chat-v2, presentation rewrite and owner-feedback revision (2026-10-14)

**Scope:** `git diff 14a1866..db5d064`, without `env.example` and `docs/`. This range holds the presentation rewrite (ADR-0010, T33–T49) and the owner-feedback revision (spec §1 F1–F13, AC-37..AC-53, ADR-0011/0012/0013, T50–T77). These came after the first ship review, [security-review-2026-10-13.md](./security-review-2026-10-13.md), which covered `9de5d62..f1c57ff`. The review ran in a clean context and could only read the code. It followed the abuse cases in [spec](../spec.md) §6.1 and covered these new surfaces:
- the `ask_user` tool, the Question form and its Send path (origin `FORM`);
- the refusal of foreign and unknown ids;
- the `react-markdown` renderer and its in-app link allowlist;
- the React-`cache` session read in `lib/helpers/session-read.ts`;
- `ConversationListProvider` and the AI layout;
- export v2.4, migrations 06–08 and the new dependencies.

**Result:** no finding at MEDIUM or above, and nothing that lets one Freelancer reach another Freelancer's data. There is one new informational finding. Of the three earlier findings, one still applies unchanged, one applies in a narrower form, and one has been replaced.

## Findings

| ID | Sev | Finding | Where | Impact | Suggested follow-up |
|---|---|---|---|---|---|
| SEC-I-02 (replaces SEC-I-01) | info | Every sent form skips the off-topic refusal, including a free-question form with no draft request: `(input.pinned \|\| input.priorAnswers) && verdict.topic === 'OFF_TOPIC' ? 'IN_SCOPE'`. Typed answers are the Freelancer's own words, at most 6 of them (NOTES up to 2,000 characters, FREE 500, the others 200 or less). They reach the model in the composed message and as `priorAnswers` data. A Freelancer who coaxes the chat into asking a FREE question can get an answer to an off-topic request. | `lib/ai/run-turn.ts:257`; `app/api/chat/route.ts:203-219` | The Send still takes one allowance slot, so the quota holds. Only the topic policy can be stepped around, and only by the Freelancer on purpose. The answers are labelled as data, not instructions (`priorAskStep`). | Optional: keep the router verdict when the form holds no draft request (`!stored.request`), or skip the router only for picked options. |
| SEC-L-01 (from 2026-10-13, unchanged) | low | `issueFromPreview` does not check that the invoice came from a chat card. A Freelancer who calls the action directly can mark **their own** draft `issuedFromChat = true`. | `lib/actions/assistant-actions.ts` `issueFromPreview` (only type renames in this range) | Only the §7 KPI "drafts issued from the chat" can be skewed. | As before: require a `CREATED` Draft card of the actor that links to the invoice before setting the flag, or count only `assistantOrigin` drafts in the KPI query. |
| SEC-L-02 (from 2026-10-13, narrower) | low | The browser can still claim a dashboard start, but only on a first message and only as the pair `origin: DASHBOARD` with `startedFrom: DASHBOARD_PROMPT`. `requestMessageOriginSchema` is `['TYPED','DASHBOARD']`, so a browser cannot claim `FORM` or `PRESSED`. | `lib/validations/assistant-chat.ts:52,122-129`; `app/api/chat/route.ts:111,123` | Analytics metadata only. | None needed (ADR-0009). |

SEC-I-01 (a pressed turn skipping the router) no longer exists in that form: the press path and the `choice` field are removed, and the skip moved to form Sends (SEC-I-02). Labels still carry only the last four digits of an account (`lib/services/assistant-drafts/forms.ts:464`).

## Checked and sound

- **Route order (ADR-0011).** The Conversation owner check (`route.ts:115-123`) runs first, then `checkForm`, then the allowance. `checkForm` requires the actor, `OPEN` and a matching `conversationId` (`forms.ts:592-596`).
- **Uniform refusal (AC-12b, F7).** All of these return the same `UNAVAILABLE`, which the route sends as one 409 `CHOICE_UNAVAILABLE` body with one sentence (`forms.ts:596-626`, `route.ts:142`):
  - a foreign, unknown or closed form;
  - an option or question that the form does not hold, or a duplicate answer;
  - text on an option-only question;
  - a skipped required question;
  - a record that changed.

  A lost claim gets the identical body (`route.ts:153`). The 400 for a typed-answer format error can only come after the form is proven to be the actor's own, so it tells nothing about other accounts.
- **`ask_user` (AC-09).** A call holds at most 6 questions with at most 8 ids each (`forms.ts:386-409`). The server loads every id by its field's kind, scoped to the owner: Customer, sender profile and product by `userId` (products also `isActive`), and bank accounts through `senderProfile.userId`. Every id must come back. Ids on a typed-value question and duplicate ids are refused. Each failure gives the same `OPTIONS_UNAVAILABLE`, and nothing is stored (`forms.ts:430-480`). The partial draft's ids get the same check, and on Send they are resolved again by the owner-scoped resolver (`route.ts:194`). The model writes only the `prompt` (140 characters or less). Labels come from code.
- **Composed message (F5).** The server builds the message from the stored headings and labels plus the trimmed typed text, and ignores the browser's text (`route.ts:144`, `lib/validations/form-answers.ts:97-119`). The bounds are: form text 8,000 characters, typed answers 2,000 in the schema, then 100/200/500/2,000 per field (`form-answers.ts:24-53`), and one answer per question.
- **Claim and allowance (AC-11).** The slot and the claim are taken in one transaction, and a lost claim rolls the slot back (`allowance.ts:132-141`). The claim is a conditional `updateMany` on `{id, userId, state:'OPEN'}`, so a double Send has exactly one winner (`forms.ts:641-647`). The slot and the claim are released when the resolve fails, when the stream throws, and when the turn is not counted (`route.ts:195-198,234,334`).
- **Plain text where it must be.** The model's question prompts and the labels render as plain text in the form (`components/ai/question-form.tsx:217,249`), and so do the Freelancer's messages (`components/ai/message-list.tsx:46-52`).
- **Markdown (ADR-0012, AC-43).**
  - Raw HTML nodes become text nodes (`components/ai-elements/message.tsx:126-144`). There is no `rehype-raw` and no `dangerouslySetInnerHTML` in the diff.
  - `allowedElements` has no `img` and no `input`, and footnote `section`/`sup` are unwrapped.
  - `urlTransform` and the `a` component both call `isInAppPath`. It is a set of anchored regexes over literal paths plus `[A-Za-z0-9_-]{1,64}` (`lib/ai/in-app-links.ts:4-29`). Thus `javascript:`, `//`, `/\`, `%2f`, `..`, whitespace and control characters, uppercase, `?` and `#` all fail.
  - GFM `www.` autolinks become `http://…` and are refused. Reference-style links go through the same transform, and a refused link renders only its text.
- **`readSession` (`lib/helpers/session-read.ts`).** It uses React `cache`, which is scoped to one request, so no session is shared across requests. Outside a render it does not cache. An error still lands in the catch of `getAuthenticatedUser` and returns UNAUTHORIZED (`auth-helpers.ts:16`).
- **Conversation list (ADR-0013).** `listConversationSummaries` and `listLatestConversations` filter by `userId` (`conversations.ts:74-95`). `ConversationListProvider` is client display state only. Deletes and renames still go through the owner-scoped server actions. `readForms` is owner-scoped, and its view drops refs, sources and the stored request (`forms.ts:109-131`).
- **Export v2.4 (AC-34).** It holds questions, labels, prompts and answers only, with no refs, sources or request (`lib/services/account/account.ts:283-306`). `ChoiceOffer` still cascades from User, Conversation and ConversationMessage.
- **Migrations 06–08.** They are additive and idempotent (`IF NOT EXISTS`, `WHERE "questions" IS NULL`). The enum values are added in a migration of their own.
- **Dependencies.** `react-markdown` 10.1.0, `remark-gfm` 4.0.1 and `axe-core` 4.13.0 (dev) are pinned to exact versions. The lockfile change for axe-core is limited to that package (review R21-3).
- **`search_invoices`.** The new `path` is built by code and limited to `/invoices/{id}/edit`. The created-date filter stays under `senderProfile.userId` (`lib/services/invoices/assistant-search.ts:177`).

## Addendum — consistency pass follow-ups (2026-10-14, `c5e417f7..b5bb1da6`)

Reviewed by `sdd:reviewer` (clean context, read only) with the rest of the consistency pass. One server-side change: **T85** narrows the chat request schema (`lib/validations/assistant-chat.ts`) to `origin: TYPED` and the start points `AI_SECTION`, `INVOICE_LIST`, `DASHBOARD_CREATE`; `app/api/chat/route.ts` sets `userOrigin` to `FORM` or `TYPED` only. This **closes SEC-L-02**: a browser can no longer claim a dashboard start. The schemas are used only by the request parser; stored `DASHBOARD` / `DASHBOARD_PROMPT` rows, the export and the DB enums are unchanged. T86–T88 are browser-only (no new data path); T89 tightens the export contract schema. No new finding.

## Addendum — ADR-0014 model switch (2026-10-15, `3d0a4b77..HEAD`)

Reviewed by `sdd:reviewer` (clean context, read only), as spec §6.1 requires before ship. Scope: the default model `anthropic/claude-haiku-5.5` through the Vercel AI Gateway, the removal of the Google key and `@ai-sdk/google`, the Anthropic pin (`GATEWAY_PROVIDER_OPTIONS`), unknown cost stored as null (T91, T95) and the privacy/terms copy (T90). In-scope single test files: 44/44 pass.

**Checked and sound.** Every model call site is pinned to Anthropic: the router (`lib/ai/router.ts:62-68`), the app agent stream (`lib/ai/run-turn.ts:362`, the only `chatAgent` caller) and the Studio agent (`mastra/index.ts:62-65`, `defaultOptions`, deep-merged by Mastra 1.76 into every call); `@ai-sdk/gateway` 4.0.110 sends `providerOptions` in the request body and declares `only`. The eval harness goes through the same pinned calls. Tool answers only enter the pinned stream; raw tool answers stay on the server. No new place carries message text (tracing exporter and Sentry unchanged; Studio full-text traces stay local; AI-path logs go through `redactError`). The metadata-only span processor is allow-list based, so Anthropic/Gateway provider metadata is dropped by default. Secrets: `AI_GATEWAY_API_KEY` is server-only and never logged; nothing reads `GOOGLE_GENERATIVE_AI_API_KEY`; `env.example` holds placeholders only. A null cost cannot bypass the allowance, which counts slots, not cost. Copy limits the no-training claim to paid API terms. The lockfile change removes `@ai-sdk/google` only.

| ID | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| SEC-M-01 | medium | Spend is not bounded per turn or per Freelancer. The 40-message history cap counts messages, not size; no `maxOutputTokens` is set; `get_invoice` returns unbounded `description`/`notes`/`terms`/`paymentTerms` and line counts (invoice schema has no `.max()`), so one stored invoice can push every later agent step (up to 8) above 100k input tokens at the 5× tier (≈ USD 0.05–0.13 per call vs the USD 0.02 cap). A turn that fails after paid calls is not counted and gives its slot back, and `/api/chat` has no per-minute limit, so deliberate context overflows repeat without spending the allowance. | `lib/ai/run-turn.ts:26,265,362`; `lib/services/conversations/conversations.ts:22,218`; `lib/assistant-tools/invoice.ts:79-87`; `lib/validations/invoice.ts:150,220-226`; `app/api/chat/route.ts:333-334`; ADR-0014 :52; `sad.md:1069` | Bound output tokens and history size; cap tool answer size; bound failed-turn repeats; Gateway spend budget; correct ADR-0014 and sad §11 on what bounds a turn |
| SEC-L-03 | low | The no-training promise is not enforced on the request; the Gateway offers `disallowPromptTraining`. | `lib/ai/gateway-options.ts:3`; `app/(public)/privacy/privacy-content.tsx:517-521` | Add `disallowPromptTraining: true` to the pin and test it; check routing on preview |
| SEC-I-03 | info | Owner checks the code cannot prove: the "USA" location, the SCC claim covering Anthropic as Vercel's sub-processor, provider-side retention, and the Vercel row in privacy §5 not naming the AI Gateway. | `constants/public-pages-content.ts:357-361,377-382,388,804-813`; `privacy-content.tsx:514-545` | Owner check with the open wording approval; optionally name the AI Gateway in the Vercel row |
| SEC-I-04 | info | The app agent is pinned only at its single call site; a future second call would skip the pin. | `lib/ai/agent.ts:33-39`; `lib/ai/run-turn.ts:362` | Also set `defaultOptions.providerOptions` on the app agent and assert it |
| SEC-I-05 | info | The weekly p95 check ignores null costs and may leave out failed turns with paid calls. | `lib/ai/gateway-cost.ts:6-9`; `_ship/feature.md:150` | Report the null-cost share and total spend including failed turns |

**Verdict:** CHANGES REQUESTED. Data flow and secrets are sound. SEC-M-01 must be fixed before ship or accepted in writing by the owner with a Gateway spend budget in place; SEC-L-03 and the SEC-I-03 owner checks before the privacy copy goes live.

**Resolution (2026-10-15).** SEC-M-01 a, b, d: output tokens, history size and tool-answer size are bounded in code (T99, commit `c64cb2f2`); c: the chat refuses more than 10 messages a minute per Freelancer, AC-11 unchanged (T100, `40494fd9`; the refusal is stored as a FAILED turn, which the weekly check separates); d, e: ADR-0014 and sad §11 corrected, and the weekly check reports unknown costs and total spend (T102); the Gateway spend budget is an owner item in `pr-body.md`. SEC-L-03: `disallowPromptTraining: true` on every Gateway call (T101, `79a96aa0`). SEC-I-03: the Vercel row in privacy §5 and terms §10 names the AI Gateway (T101); the location, SCC and retention checks are owner items in `pr-body.md`. SEC-I-04: the app agent carries the pin in `defaultOptions` (T101). SEC-I-05: the weekly check in `_ship/feature.md` reports the null-cost share and spend including FAILED turns (T102).

**Verdict (updated 2026-10-15):** Resolved in code; owner items open (Gateway spend budget, SEC-I-03 checks).

### Re-check after T99–T102 (2026-10-15, `91b8996f..0556e47a`)

Reviewed by `sdd:reviewer` (clean context, read only). SEC-L-03, SEC-I-03 (code part), SEC-I-04 and SEC-I-05 resolved; the anthropic endpoint advertises `has_no_training: true`, so `disallowPromptTraining` does not fail closed. SEC-M-01 (a) resolved: output caps reach every step (Mastra merges `modelSettings` per step), the history budget applies to the model's input, and a new message is bounded by the request schema. Still open:

| ID | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| SEC-M-02 | medium | Caps are per tool answer, never per model call: parallel tool calls in one step (only the 2,000-token output cap limits them) and answers kept for later steps can still put 300k+ tokens in one call; `propose_draft` answers, prior steps and links are not capped; character counts undercount tokens for non-ASCII text; the 20k answer cap has no final check | `lib/ai/tools/read-tools.ts:16,37-41,105`; `lib/ai/run-turn.ts:364`; `lib/ai/limits.ts` | T103 |
| SEC-L-04 | low | String truncation can split a surrogate pair, sending a lone surrogate the provider likely rejects (a cheap repeatable failed turn) | `lib/ai/tools/read-tools.ts:16` | T103 |
| SEC-L-05 | low | The 10/min limit counts finished turns, so parallel requests overrun it (≈ 30 per window, bounded by the allowance); every refusal writes an `AssistantTurn` row kept 400 days | `app/api/chat/route.ts:155-172`; `lib/services/assistant-usage/turns.ts:11-22` | T104 |
| SEC-I-06 | info | `TOO_FAST` missing from `types/result.ts` `ActionErrorCode` and the contract descriptions; no contract assertion or form-path test for it | `contracts/openapi.yaml:312,368`; `types/result.ts:14`; `tests/integration/api/chat-route.test.ts` | T104, T105 |
| — | — | Docs overstate the bounds ("every model call is bounded", "already started", "this limit does stop repeated paid failures") | `spec.md:646,648`; ADR-0014 :52,:59; `_ship/pr-body.md:14` | T105 |

The full gate after T102 also caught a unit red the scoped gate missed: `countRecentTurns` (T100) has no request-free test (`tests/unit/service-layer-inventory.test.ts`); T104 replaces that function.

**Verdict:** CHANGES REQUESTED → T103–T105.

**Resolution (re-check).** SEC-M-02 and SEC-L-04: one per-turn tool budget (60,000 bytes, 12 calls), byte-counted sizes and surrogate-safe cuts (T103). SEC-L-05 and SEC-I-06: the 10/min limit is atomic in the shared limit store, refusals write no turn rows, `TOO_FAST` is in `ActionErrorCode` and the contract test resolves ai-chat-v2's contract (T104), and the docs state the real bounds and the migration to deploy (T105).

### Final review after T103–T105 (2026-10-15, `ffe81498..a0da23a7`)

Reviewed by `sdd:reviewer` (clean context, read only; security and code quality). SEC-M-02, SEC-L-04, SEC-L-05 and SEC-I-06 resolved in code: parallel calls cannot overspend the byte budget (the answer is checked and charged synchronously after the body; the parallel 15-call test admits ≤ 60k bytes), every truncation is surrogate-safe, the per-minute limit counts and records inside one locked transaction and a refusal writes nothing, the migration is additive with a tested down/up. The test-harness changes made in T104 do not weaken any test (the chat-route contract is now the stricter ai-chat-v2 one; the AC-11 mock still rejects the save). `ask_user`'s preprocess swap leaves the model-visible schema unchanged.

| ID | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| N-1 | low | `withToolBudget` runs the tool body before charging: when a `propose_draft` CARD/ISSUES or `ask_user` answer does not fit, the model gets the budget text but `turn.pending` already holds the card/form, `drafted` stays false (add-page links can leak beside a card, R2-B3) and the reply ignores the shown card; `propose_draft` answers have no per-answer cap | `lib/ai/limits.ts:53-58`; `lib/ai/tools/propose-draft.ts:210,218`; `lib/ai/tools/ask-user.ts:32`; `lib/ai/run-turn.ts:402,439,473-474` | T106 |
| N-2 | low | Docs overstate the bounds: links are added after the 20k cap, `propose_draft`/pinned answers are uncapped, pinned/prior steps are charged with a clamp, the worst case omits the user message and model-written inputs, and "below the 100k tier" is an estimate | spec bounds row; ADR-0014 :52; `sad.md` §11; `_ship/changelog.md:80`; `_ship/pr-body.md:14` | T106 (links inside the cap, `propose_draft` cap) + T107 |
| N-3 | low | ADR-0014 :59 still says the limit "does" stop repeated paid failures | ADR-0014 :59 | T107 |
| N-4 | info | Calls with invalid input are rejected by Mastra before `execute` and do not use the 12-call cap | `@mastra/core` tool validation | T107 (say so in the spec row) |

**Verdict:** CHANGES REQUESTED → T106, T107.

**Resolution (final review).** N-1 (a refused answer left its card or form): the tool body returns `{ answer, commit }` and `withToolBudget` commits only after the bytes were charged (T106). N-2: `propose_draft` answers and read-tool links are inside the 20,000-byte cap (T106) and the docs state the bounds with the estimate marked and the exclusions named (T107). N-3: ADR-0014 says the limit slows repeated failures to at most 10 a minute per Freelancer (T107). N-4: the spec row says calls rejected for invalid input do not use the 12-call cap (T107). T106 also fixed a test fixture found by the full integration gate: the look-alike loop in `tests/integration/ai-chat-v2-customers-read.test.ts` reused one turn for more than 12 calls, so each lookup now gets its own turn (assertions unchanged).

### Re-check after T106–T107 (2026-10-15, `5f0a88d5..6ea9438e`)

N-1..N-4 resolved: a refused answer never commits pending state (commit runs once, synchronously after a successful charge); capped CARD/ISSUES answers keep every id (min string cap 31 > cuid length) and the form is built from the uncapped resolver output; the customers-read fixture change keeps its chat-vs-MCP assertions.

| ID | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| F-1 | low | The last fallback of `capToolAnswer` checks `kept` but returns `{ ...kept, links: [] }`, up to 11 bytes over 20,000 | `lib/ai/tools/read-tools.ts:64` | T108 |
| F-2 | low (docs) | A `propose_draft` re-call in a pressed turn returns the pinned value uncut (charged to the turn budget); spec/sad say every `propose_draft` answer is ≤ 20,000 bytes | `lib/ai/tools/propose-draft.ts:198`; spec bounds row; `sad.md` §11 | T108 |

**Verdict:** CHANGES REQUESTED (low) → T108.

**Resolution (re-check after T106–T107):** F-1, F-2 → T108 (the last fallback of `capToolAnswer` now size-checks the exact object it returns, `links: []` included; spec and sad name the pinned `propose_draft` re-call as charged to the turn budget, not cut).

**Final verdict (2026-10-15):** resolved in code (T90–T108); full gate after T107 green (tsc, lint 0 errors, unit 3392/3392, integration 156 files / 1629 tests), T108 scoped gate green. Owner items open before ship: Vercel AI Gateway spend budget/alert, the SEC-I-03 checks (USA location, SCC coverage of Anthropic via Vercel's DPA, provider-side retention), privacy/terms wording and Last-updated date, migration `20261015100000_add_chat_message_limit_scope` on prod before the app deploy, removing `GOOGLE_GENERATIVE_AI_API_KEY` from Vercel, and the real-model evaluation on Claude Haiku 5.5.
