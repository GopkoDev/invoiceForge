# Security review — ai-chat-v2 (2026-10-13)

**Scope:** `git diff 9de5d62..f1c57ff` (feat/ai-assistant → feat/ai-chat-v2). The review ran on a clean context and could only read the code. It followed the abuse cases in [spec](../spec.md) §6.1, plus owner scoping on the new server actions and reads, the dashboard hand-off (ADR-0009), the export and account deletion, and the new migrations.

**Result:** no finding at MEDIUM or above. There are three LOW or informational findings. None of them lets one Freelancer reach another Freelancer's data. They are recorded here as possible follow-ups and were not fixed before ship.

## Findings

| ID | Sev | Finding | Where | Impact | Suggested follow-up |
|---|---|---|---|---|---|
| SEC-L-01 | low | `issueFromPreview` does not check that the invoice came from a chat card. A Freelancer who calls the server action directly can issue any of **their own** drafts through it, and that invoice then gets `issuedFromChat = true`. The owner check holds (`lockInvoiceRow` is scoped to the user), and the editor's rules and version guard still apply. This matches the contract in [server-actions.md](../contracts/server-actions.md) as written. | `lib/actions/assistant-actions.ts` `issueFromPreview` | Only the §7 KPI "drafts issued from the chat" can be skewed, and only by the Freelancer's own deliberate call. No KPI query exists in code yet. When one is written, it should count only chat-created drafts (`assistantOrigin`). | Optionally require a `CREATED` Draft card of the actor that links to the invoice before setting the flag. |
| SEC-L-02 | low | The browser sets `origin: DASHBOARD` and `startedFrom` on a new Conversation's first message, so a crafted request can claim a start point it did not use. `PRESSED` is set only by the server. | `app/api/chat/route.ts` | Only analytics metadata (§7 "Conversations started from the dashboard") can be skewed. | None needed. The start point comes from the address by design (ADR-0009, contract). |
| SEC-I-01 | info | A pressed turn gives the model the full resolved proposal, where a normal card answer gives a summary. Pressed turns skip the off-topic router. The stored label (the Freelancer's own record name) becomes the message text. | `lib/ai/run-turn.ts` | No account number is included: the bank account label is the bank name and the last four digits. The labels are the Freelancer's own records, so the injection risk is low. | None. |

## Checked and sound

- **AC-09, buttons only from code.** `offerFromIssues` builds the options from the resolver's typed issues only. `saveTurn` re-checks them against a strict schema. Model text never becomes a label or a ref.
- **AC-12b and AC-13, forged presses.** The request carries only `{ offerId, optionId }`.
  - `checkChoice` requires the acting Freelancer, `OPEN`, and the Conversation the route owner-checked. It also checks that the ref fits the offer kind and that the record is still the Freelancer's and still fits.
  - Every refusal is the same `409 CHOICE_UNAVAILABLE`, before the allowance, the claim or the model.
  - A partial unique index keeps at most one open offer per Conversation, and the server's stored label replaces the browser's text.
- **AC-11, allowance.** The allowance slot and the offer claim are taken in one transaction. With no slot left, nothing is claimed. A release undoes both.
- **AC-06, account numbers.** The `list_sender_profiles` output has only the bank name, the last four digits, the currency and the default mark. The resolver's issues and the offer labels carry the last four digits only.
- **AC-07 and AC-22, owner scoping.** Every new read filters on the acting Freelancer. A foreign `customerId` in `list_products` answers NOT_FOUND. `loadInvoicePreview` checks the card owner, the `CREATED` state and the Conversation, then reads the invoice owner-scoped.
- **AC-24, AC-26 and AC-26b, issuing.** No model or MCP tool reaches `issueFromPreview` or `updateInvoiceStatus`. The version guard runs on the locked row (`ALREADY_ISSUED`, `CHANGED_ELSEWHERE`).
- **ADR-0009 dashboard hand-off.** The address carries only a random id. The text stays in same-origin session storage, is taken once, and is rendered as React text. The diff adds no `dangerouslySetInnerHTML`.
- **AC-34, export and deletion.** The export (v2.3) adds the origins, start points, labels and chosen options, without refs or the stored request. `ChoiceOffer` cascades from User, Conversation and ConversationMessage.
- **Migrations.** All five are additive and idempotent. The only data step is a bounded backfill of `origin = 'TYPED'`.
- **E2E stub model.** It is used only when both `E2E=1` and `AI_CHAT_MODEL=stub:e2e` are set (`lib/ai/model.ts`).
