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
