# T113 — Drop zero data retention from Gateway calls (Hobby plan) and state Anthropic's 30-day API retention on privacy and terms

- **Layer:** backend + frontend copy
- **Deps:** T112
- **AC:** AC-35

## Definition of done

Owner decision 2026-10-16: the Vercel team is on Hobby and the Gateway refuses zeroDataRetention ('Zero Data Retention (ZDR) is only available for Pro and Enterprise plans. Current plan: hobby.', verified by a direct Gateway call), so every turn ended AI_UNAVAILABLE. Remove ZDR, keep the rest. lib/ai/gateway-options.ts: GATEWAY_PROVIDER_OPTIONS = { gateway: { only: ['anthropic'], disallowPromptTraining: true } } (no zeroDataRetention; comment updated). Privacy §11 (app/(public)/privacy/privacy-content.tsx): replace the 'does not store your message text after answering (zero data retention ...)' sentence with: Anthropic deletes the text it receives through the API within 30 days, unless it is flagged for a Usage Policy violation (then kept up to 2 years) or the law requires longer; Vercel AI Gateway does not keep the message text after the request. Keep 'does not use the content you send to train its models', 'outside the EU, mainly in the USA'. constants/public-pages-content.ts privacy §5 and terms §10 Anthropic rows: data 'Chat message text and the data it reads to answer (deleted within 30 days)'. Nothing on any public page may say 'zero data retention'. Tests: tests/unit/lib/ai/gateway-only-anthropic.test.ts and agent-gateway-defaults.test.ts expect the options without zeroDataRetention (and assert zeroDataRetention is absent); tests/component/public-pages-ai-subprocessor.test.ts, privacy-ai-section.test.tsx, privacy-page-ai-section.test.tsx: assert /30 days/ and not /zero data retention/i for Anthropic (keep the USA / outside-EU / no-absolute-claim assertions). Docs: ADR-0014 revision 2026-10-16 (ZDR dropped: Hobby plan; Anthropic 30-day API retention, 2 years if flagged; Gateway keeps no content); sad.md §2 line 60 and the §11 ZDR risk row; spec.md §6.1 line 659 revision note. Scoped gate: the five tests + vitest related on changed files, tsc, eslint on changed files.

## Sources

- Vercel AI Gateway error on a direct call with `zeroDataRetention: true` (2026-10-16): ZDR only on Pro and Enterprise.
- Anthropic privacy center, "How long do you store my organization's data": API inputs and outputs deleted within 30 days; up to 2 years if flagged by trust and safety; longer where the law requires.
- Vercel docs, AI Gateway security and compliance: the Gateway does not retain prompts or outputs after the request.
