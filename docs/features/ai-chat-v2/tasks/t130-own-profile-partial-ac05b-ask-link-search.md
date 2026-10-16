# T130 — Own profile found by part of its name; AC-05b accepts a request to choose; search before linking a named invoice

- **Layer:** backend + eval
- **Deps:** T129
- **AC:** AC-05b, AC-37, AC-48
- **Source:** fourth Haiku evaluation, 2026-10-16; owner decision on the AC-05b / AC-37 conflict

## Definition of done

Fourth Haiku eval (2026-10-16, one run, after T125-T129): Topic PASS; no-guessing 37/40, 0 ungrounded; failing AC-05b-own-profile-uk (explains, then 'Оберіть, будь ласка, клієнта' with no '?'), AC-05b-own-profile-folded (model passed customer 'fop'; the resolver's own-profile check is exact only), link-to-draft (model distrusted its earlier 'I created INV-0042' and did not search). (1) lib/services/assistant-drafts/resolve-parties.ts: the own-sender-profile check for a written Customer that matches no Customer also accepts the partial rule used by matchesOwnSenderProfile (exactly one own profile whose folded name contains the folded written words), so 'fop' with profile 'Consulting FOP' raises the own-profile issue (CUSTOMER_NOT_FOUND with ownSenderProfile, or whatever the existing own-profile issue shape is) naming that profile. Exact match behaviour unchanged; a name that matches a real Customer is never treated as a profile. Integration or unit test following the existing resolve-parties tests. (2) Owner decision 2026-10-16 (AC-05b vs AC-37 conflict: with a form present, a prose question is forbidden): evals/assistant/score.ts ownProfileFailures accepts 'asks for the Customer' as either a '?' with the Customer term, or a request to choose/pick/name/select the Customer (en: /(choose|pick|select|name|tell me)[^.]*customer/i; uk: /(оберіть|виберіть|вкажіть|назвіть)[^.]*(клієнт|замовник)/i). Unit test in tests/unit/evals/. Record the decision in docs/features/ai-chat-v2/test-plan.md where AC-05b's evaluation rule is described (one sentence). (3) lib/ai/instructions/chat.ts: 'When the Freelancer asks for a link to an invoice or draft named or mentioned earlier (for example INV-0042), search for it with search_invoices and link the row's path; do not refuse or doubt it before searching.' Instruction test.

## Revision 2026-10-16

Part (1) dropped: the hint stays exact-only (spec AC-05b, T09). A partial match would call a new Customer named "Consulting" the Freelancer's own profile "Consulting FOP". The eval row `AC-05b-own-profile-folded` (the model shortens the name to "fop") is a known model limitation.
