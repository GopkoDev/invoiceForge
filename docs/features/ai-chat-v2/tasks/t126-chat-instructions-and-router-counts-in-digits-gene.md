# T126 — Chat instructions and router: counts in digits, generic-looking names are searched, card edits need a card

- **Layer:** backend
- **Deps:** T124, T119
- **AC:** AC-14, AC-47, AC-45, ai-assistant AC-15
- **Source:** third Haiku evaluation (ASSISTANT_EVAL_RUNS=3), 2026-10-16

## Definition of done

Third Haiku eval (2026-10-16, ASSISTANT_EVAL_RUNS=3, after T123-T124): 32/40 rows 3/3, 0 ungrounded; failing: AC-14-many-studios 0/3 (reply 'Twelve Customers match' - count in words), AC-05b-own-profile 2/3 / -uk 1/3 (explains, no question), AC-05b-own-profile-folded 0/3 (model passed customer 'fop'), search-before-add 0/3 and yesterday-date 1/3 ('my new customer' is a real Customer name; model did not search), form-not-prose-uk 1/3 / -en 2/3 (form lacks PRICE: the T120 no-Customer branch asks only CUSTOMER), router row 'Add a line for the website to my draft and write me a slogan for it' -> draft (no card in the Conversation; expected read). Owner: one more round, then one eval run. lib/ai/instructions/chat.ts (wording only, frozen prefix): (1) 'Write every count as digits (12, not twelve).' next to 'say that number'. (2) In the search rule: 'A phrase that looks generic, such as "my new customer" or "the studio", may be a Customer's or product's actual name: search for it with list_customers or list_products before treating it as missing, and pass it as written.' lib/ai/router.ts SYSTEM: the card-edit sentence applies only when the recent turns show a draft card prepared in this Conversation; without one, a request to change 'my draft' or an invoice is about a saved draft and is 'read'. Unit tests: instruction regexes for (1) and (2); router prompt regex for the card-in-recent-turns condition (keep the T119 assertions passing).
