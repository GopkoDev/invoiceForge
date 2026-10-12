---
slug: ai-assistant
date: 2026-10-12
triage: gap
acs: [AC-19, AC-11]
commit: 541c065
recurrence_of: _fixes/2026-10-12-bank-account-currency.md
---

# Fix: a reply with no words is saved and counted

## Symptom

In Conversation `g48a9w6ciaj169394idmmfab`, the Freelancer answered the bank-account question with "Privat". They expected an answer. The chat showed an empty reply. In the dev DB, `ConversationMessage` position 5 is an ASSISTANT message with `parts: []`. Its `AssistantTurn` is IN_SCOPE, ANSWERED, counted, with 1 step, no tools and 0 output tokens. The model (Gemini Flash-Lite) ended the turn without calling a tool or writing text.

## Root cause

`runTurn` (`lib/ai/run-turn.ts`) streams only what the model writes. Its one fallback, added by fix `2026-10-12-bank-account-currency`, fires only after a `propose_draft` ISSUES answer. A turn with no tool call, or one with only a read tool and then silence, saved `text: ''`. `assistantPartsOf` (`lib/ai/stream.ts`) then stored no text part. That earlier record listed this as a follow-up ("A turn where the model calls a read tool and then writes nothing still shows an empty reply"). The scripted test models always wrote text.

## The pinning test

Unit, `tests/unit/lib/ai/run-turn-empty-reply.test.ts`:

- "English: no tool and no text still gets a sentence asking to rephrase, streamed and ANSWERED". Before the fix it failed with `AssertionError: expected '' to match /rephrase/i`.
- "Ukrainian: the sentence follows the language of the message". Before the fix it failed with `AssertionError: expected '' to match /[а-яіїєґ]/i`.
- "a read tool followed by no text gets the same sentence". Before the fix it failed with `AssertionError: expected '' to match /rephrase/i`.
- "a reply the model did write is left as it is" is a control and passed before and after.

The fix adds one step, after the ISSUES fallback. When the turn still has no text, no card and is not capped, `runTurn` streams a short sentence of its own, in English or Ukrainian per the router's `language`. The sentence says it could not answer and asks the Freelancer to rephrase or add the missing detail. A turn with a card and no text still gets no words (review R6-2). A capped turn gets the existing too-broad sentence instead.

**Counting.** The turn stays ANSWERED and counted. Spec §1 D2 counts "every message the chat accepts" and exempts "only messages whose reply failed on the system's side". AC-11 makes the same exemption. The model ending its turn is not a system-side fault: the provider answered without error. The system now produces a reply that tells the Freelancer what to do next. This is the same reasoning as the ISSUES fallback, which is also counted.

## Spec patch (proposed, awaiting owner)

No AC covers a reply with no words outside the bank-account case of AC-19 ("A reply is never a link alone"). This is a gap. The owner was not available to confirm, so spec.md is **not** changed. Proposed new AC for §5:

> ### AC-11d (US-04) — error
>
> <!-- added-by-fix: 2026-10-12 -->
>
> **Given** a Freelancer with messages left today
> **When** they send a message and the Assistant's reply would hold no words and no draft card
> **Then** the chat says in one sentence, in the Freelancer's language, that it could not answer and asks them to rephrase or add the missing detail. A reply is never empty. The message counts toward the allowance, because the reply did not fail on the system's side.

## Follow-ups

- The router judged "Privat" in this Conversation as IN_SCOPE with draft intent, but the model had no earlier request to resend. Consider telling the chat instructions to resend the earlier `propose_draft` request plus the answer when the Freelancer answers an ISSUES question. The tool description already says this. This is model behaviour and is not pinned here.
- Watch `AssistantTurn` rows with `outputTokens = 0` and an ANSWERED outcome. They now carry the fallback sentence; a rising share means the model or the prompt needs attention.
