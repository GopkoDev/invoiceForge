---
slug: ai-assistant
date: 2026-10-12
triage: regression
acs: [AC-20, AC-21, AC-16]
commit: ff78924, eed7410
recurrence_of: none
---

# Fix: the owner's Customer "Оohn Doe " is never found by name

## Symptom

The Freelancer wrote "створи інвойс для Оohn Doe …". They expected the card for their Customer. The chat said there is no such Customer (`CUSTOMER_NOT_FOUND`). In Conversation `g48a9w6ciaj169394idmmfab`, the fallback words even read "У вас немає клієнта Oohn Doe".

In the dev DB, the Customer is stored as `"Оohn Doe "` (hex `d09e 6f686e 20 446f65 20`): a Cyrillic capital "О" (U+041E) and a trailing space. The model passes the name as "Oohn Doe" in Latin letters, or as "John Doe". Only the owner's data showed this. Any name typed with a mixed keyboard layout hits it.

## Root cause

The draft resolver compared names with `name.toLowerCase().includes(written.trim().toLowerCase())`:

- `resolveCustomer` and the near-miss check in `lib/services/assistant-drafts/resolve-parties.ts`.
- The sender profile and bank-account matching in the same file.
- `productsNamed` and `pickProduct` in `resolve-lines.ts`.

A Cyrillic "о" is a different code point from the Latin "o", so "Oohn Doe" is not contained in "оohn doe ". The near-miss check also compared the untrimmed stored name, so "John Doe" was two edits away (the first letter plus the trailing space) and not offered as a question either. The tests used ASCII names only.

## The pinning test

- Integration, `tests/integration/services/assistant-drafts/resolve-parties.test.ts`, "fix 2026-10-12: names match across look-alike letters and stray spaces":
  - "the Latin "Oohn Doe" finds the Customer stored as "Оohn Doe ", showing the stored name". Before the fix it failed with `AssertionError: expected false to be true` (the result was not ok).
  - ""John Doe" is a near miss of "Оohn Doe ": offered as a question, never filled in". Before the fix it failed with `expected { kind: 'CUSTOMER_NOT_FOUND', …(1) } to match object { kind: 'CUSTOMER_NEAR_MISS', …(1) }`.
  - "a sender profile and a bank account written with look-alike letters are found". Before the fix it failed with `expected false to be true`.
- Integration, `tests/integration/services/assistant-drafts/resolve-draft-request.test.ts`, "fix 2026-10-12: "web dev" finds the product stored as "WЕB DEV " (Cyrillic "Е", trailing space)". Before the fix it failed with `Error: [{"kind":"LINE_AMOUNT_MISSING","lineIndex":0,"description":" web  dev"}]`.
- Unit, `tests/unit/services/assistant-drafts/match-name.test.ts`, covers the folding itself. It shows that Cyrillic names still match each other and that different names stay different.

The fix adds `foldName` (`lib/services/assistant-drafts/match-name.ts`). It applies NFKC, lower case, the Cyrillic letters that look like Latin ones mapped to Latin, and whitespace collapsed and trimmed. It is applied to both sides of every comparison in the Customer, near-miss, sender profile, bank account and product matching. Stored data is never changed, and the card shows the name as stored. MCP shares the resolver, so `create_draft_invoice` matches the same way.

## Spec patch

None needed. Spec §1 "Matching names" says a name matches "when its name contains the word the Freelancer used, ignoring case". The tests above re-verify AC-20 and AC-21 with the stored name. Folding invisible differences is how this code implements "ignoring case": a Freelancer cannot see a Cyrillic "О" or a trailing space, so they cannot be expected to type them. Folding only widens matches between letters that look identical. "Several matches → asked" and "near miss → asked, never filled in" still apply.

Clarification confirmed by the owner and applied to spec.md §1 on 2026-10-12:

- Before: "A Customer or catalogue product matches when its name contains the word the Freelancer used, ignoring case."
- After: "A Customer or catalogue product matches when its name contains the word the Freelancer used, ignoring case, extra spaces and letters that look the same in Latin and Cyrillic (a Customer saved as "Оohn Doe" with a Cyrillic "О" matches "Oohn Doe")."

## Follow-ups

- The read tools' Customer search (`nameMatchWhere` in `lib/services/customers/customers.ts`, used by `list_customers` and `search_invoices` by Customer name) is a SQL `ILIKE`. It still misses "Оohn Doe " for "Oohn Doe". Its rule belongs to the service-layer and mcp-server specs ("a case-insensitive text match"), not to ai-assistant §1. This fix leaves it unchanged. Folding in SQL needs a `translate()`-based raw query or a stored folded column. Decide that in the service-layer feature.
- Consider offering the stored name's trailing-space cleanup in the Customer editor. This is a data-quality improvement and out of scope here.
