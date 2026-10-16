---
slug: ai-assistant
date: 2026-10-12
triage: regression (AC-19) + gap (AC-19b)
acs: [AC-19, AC-19b]
commit: 16e5c92
recurrence_of: none
---

# Fix: naming a bank account in the chat does nothing, and the replies are a link alone

## Symptom

In the chat, the Freelancer wrote "create an invoice for Oohn Doe for programming services, 1660 dollars". They expected a card, or a clear explanation of why there was none. The chat asked "What is the bank account for this invoice?" and showed a link. Every follow-up ("use Privat", "yes", an IBAN) got only the link "Sender profile bank accounts →", with no words. The owner hit this on 2026-10-12 while testing PR #10 with the real Gemini model.

## Root cause

There were three faults on one path.

1. `NO_ACCOUNT_IN_CURRENCY` (`lib/services/assistant-drafts/resolve-parties.ts`) carried only the currency and the profile id. The model could not see which accounts did exist, so it asked "which bank account?" instead of explaining that there is none in USD.
2. The resolver matched a named `bankAccount` only among the accounts in the asked currency. "Privat" is a UAH account, so it was never considered, and every turn ended in the same `NO_ACCOUNT_IN_CURRENCY`. No AC covered an account named in another currency.
3. After a `propose_draft` ISSUES result, Gemini Flash-Lite sometimes ends the turn with no text. `runTurn` (`lib/ai/run-turn.ts`) streamed only what the model wrote, so the reply was the tool's link alone.

The tests ran on scripted models that always write text, and they checked the issue kind, not whether the reply explains it.

## The pinning test

- Integration, `tests/integration/lib/ai/run-turn.test.ts`, "fix 2026-10-12: an ISSUES answer the model leaves without words still says what is missing (AC-19)". Before the fix it failed with `AssertionError: expected '' to contain 'EUR'` (English) and `expected '' to match /[а-яіїєґ]/i` (Ukrainian).
- Integration, `tests/integration/services/assistant-drafts/resolve-parties.test.ts`:
  - "a named account in another currency when the profile has none in the asked one is still a mismatch" (the Privat/UAH case) failed with `expected [ { …(3) } ] to deeply equal [ { …(4) } ]`. Before the fix it returned `NO_ACCOUNT_IN_CURRENCY`.
  - The two `NO_ACCOUNT_IN_CURRENCY` cases now also expect the profile's accounts with their currencies.
  - The existing "an account in another currency than the one named is not used" now expects `BANK_ACCOUNT_CURRENCY_MISMATCH` instead of `BANK_ACCOUNT_NOT_FOUND`. The account is still never used; the answer now says why.

The fix:
- `NO_ACCOUNT_IN_CURRENCY` gains `accounts: [{ bankAccountId, label, currency }]`.
- A new issue, `BANK_ACCOUNT_CURRENCY_MISMATCH { written, currency, account }`, is raised when the named account exists in another currency.
- `runTurn` writes a sentence of its own, built from the issues (`lib/ai/issue-text.ts`, English and Ukrainian), when the model leaves an ISSUES turn without text.
- The MCP tool shares the resolver, so it refuses the same way.
- The contract (`openapi.yaml` DraftIssue, plus the new `BankAccountInCurrency` schema) and the Draft card copy are updated.

## Spec patch

The owner confirmed the patch on 2026-10-12.

- **AC-19** (patched): "the chat says so" now reads "the chat says so in words, names the accounts the profile does have with their currencies, and links to adding one … A reply is never a link alone."
- **AC-19b** (added, `added-by-fix: 2026-10-12`): when the named account "Privat" is in UAH and the invoice is in USD, no card is shown. The chat explains the currency mismatch and offers two options: draft in UAH, or add a USD account. It never uses Privat and never picks another account. MCP refuses the same way.

## Review round 6 (same day)

An independent re-review of `1339607..HEAD` requested changes. All of them except R6-5 (an accepted residual, see Follow-ups) are fixed in a follow-up commit, which carries the `SDD-Review: R6-n` trailers:

- **R6-1:** `BANK_ACCOUNT_CURRENCY_MISMATCH` now carries `senderProfileId`, and the chat adds the link to add a bank account.
- **R6-2:** a later CARD in the same turn clears earlier issues, and no fallback words are written next to a card.
- **R6-3:** the named account is matched inside the asked currency first. A same-named account in another currency no longer hides an in-currency one.
- **R6-4:** currency words ("dollars", "доларів", "euro", "євро", "гривень", "pounds", "złoty") read like their symbol. Spec §1 "Currency symbols" is patched to match.
- **R6-6:** the tests now cover the mismatch fallback sentence, the MCP refusal, and every issue kind in `issue-text.ts`.
- **R6-7…R6-9:** the ship docs and the traceability rows (test plan, sad Flow 6, ux-flows) are updated.

## Follow-ups

- Accepted residual (review R6-5): in a MIXED draft turn, the model may write only the one-sentence refusal and leave the draft issue unexplained. The fallback fires only when the model wrote no text at all. Watch for this in real conversations before adding a heuristic.

- Add a no-guessing eval case for an account named in another currency ("invoice Acme 1660 dollars, use Privat" with only a UAH Privat). Run it with `pnpm eval:assistant` once a model key is available.
- The fallback covers only ISSUES turns. A turn where the model calls a read tool and then writes nothing still shows an empty reply. Watch `AssistantTurn` for this and decide whether a general fallback is needed.
- Consider whether the chat instructions should tell the model to always write a sentence after a tool result. The server-side fallback already guarantees the words for ISSUES.
