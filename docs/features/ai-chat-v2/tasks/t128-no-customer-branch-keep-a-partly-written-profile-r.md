# T128 — No-Customer branch: keep a partly written profile, resolve the currency like the resolver, log failures, ask every field

- **Layer:** backend
- **Deps:** T125
- **AC:** AC-46, AC-37, AC-09
- **Source:** [review T125–T126](../_review/review-2026-10-16-t125-t126.md)

## Definition of done

Review _review/review-2026-10-16-t125-t126.md. Findings 2-6, lib/ai/tools/propose-draft.ts. (2) Drop senderProfile from the stored request only when it matches none of the Freelancer's profiles by the resolver's rule (exact folded match, or exactly one profile whose name contains the written words; owner-scoped) - reuse the resolver's matching helper from lib/services/assistant-drafts/resolve-parties.ts if exported, else export it; keep the exact-only isOwnSenderProfileName check for the own-profile directive. (3) Currency for the line resolution: read it with the same interpretation as the resolver (interpretCurrency / writtenCurrency; '$' -> USD) and when none is written, omit PRODUCT questions from this branch (keep PRICE/QUANTITY/AMOUNT questions) so the post-Customer resolution asks products in the invoice currency. (4) catch logs console.error(`no_customer_lines_failed error=${String(redactError(error))}`) like other call sites. (5) NO_CUSTOMER_SAY: 'No Customer was given. Call ask_user once with a one-line prompt for each askFields field (for CUSTOMER omit recordIds; the app offers the Freelancer's Customers). Do not guess one.' and OWN_PROFILE_SAY likewise refers to each askFields field. (6) Tests: resolveLines called with an owner-only ctx ({ userId } and no customerId); '$' gives USD; no currency -> PRODUCT issues filtered out; a rejecting resolveLines -> CUSTOMER-only form and a logged line; a partly written profile ('Consulting' with profile 'Consulting FOP') stays in turn.pending.resolver.request; NO_CUSTOMER_SAY mentions each askFields field.
