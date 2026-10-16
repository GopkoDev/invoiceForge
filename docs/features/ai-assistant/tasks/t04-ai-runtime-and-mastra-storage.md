---
id: T04
title: "Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema"
layer: "infra"
deps: []
blocks: ["T11", "T12", "T13", "T14", "T27"]
acs: []
files_hint: ["package.json", "pnpm-lock.yaml", "next.config.ts", "lib/env/required-settings.ts", "lib/ai/model.ts", "lib/ai/mastra.ts", "scripts/mastra-migrate.ts", "tests/support/setup.ts", "tests/unit/lib/env/required-settings-ai.test.ts", "tests/integration/mastra-storage.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T04 — Install the pinned AI SDK, gateway and Mastra packages, add the model settings and the Mastra instance on its own mastra schema

## Place in the sequence

- **Blocked by:** nothing — starts in wave 1 · **Blocks:** T11 — Strip every text-bearing attribute from Mastra spans before export and pin it with a span contract test, T12 — Classify every chat message as in_scope, mixed or off_topic before the agent and end off-topic turns with the fixed refusal, T13 — Wrap the shared read questions as chat tools bound to the acting Freelancer and add find_in_app over a fixed app map, T14 — Add the four independent AI retention steps to the daily purge cron, T27 — Add the propose_draft tool that resolves the Freelancer's own words into a pending Draft card or into questions · **Wave:** 1 — the AI runtime every lib/ai task builds on; independent of the Prisma schema.
- **Lane:** shares `lib/ai/mastra.ts` with T11, T29; shares `lib/ai/model.ts` with T35; shares `package.json` with T32 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** an AI section in the navigation that holds the chat and a link to connecting my own AI client
> **So that** I can use AI on my invoices right after signing in, with nothing to set up
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task installs the runtime that lets the chat work right after sign-in with nothing for the Freelancer to set up: the product's own model key, gateway and agent framework.

## Inlined context

> **New settings in `lib/env/required-settings.ts`.** `AI_GATEWAY_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are required; the build fails without them. `AI_CHAT_MODEL` is optional and defaults to a Gemini Flash-Lite model.
>
> **Mastra.** Its packages are declared server-external in `next.config`. Its storage tables (schema `mastra`) are created by an explicit `pnpm mastra:migrate` step run beside `pnpm prisma migrate deploy`, never lazily on a user request.
>
> — `sad.md §7, Deployment, abridged` · full text: [sad.md](../sad.md)

> **Chosen:** Option 3. The owner prefers zero model spend at launch over the paid-terms options. The model id is the setting `AI_CHAT_MODEL`, defaulting to a Gemini Flash-Lite model (the free-tier class with the highest request limits), fixed after the evaluation run; the key is the Freelancer-independent project key `GOOGLE_GENERATIVE_AI_API_KEY` registered with the Gateway as bring-your-own-key.
>
> — `adr/0003 §Decision outcome, verbatim` · full text: [ADR-0003](../adr/0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key.md)

> **Prisma stays the source of record.** Conversations, Draft cards and counters stay in Prisma tables (ADR-0008, ADR-0009); Mastra Memory is not used. Mastra's storage lives in a separate `mastra` schema of the same database, created and migrated by Mastra, holding traces and evaluation results only.
>
> — `adr/0004 §Decision outcome, guard rail 2, abridged` · full text: [ADR-0004](../adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md)

> **Hard rule:** **No AI runtime is installed.** Every new AI package (SDK, provider, UI hook) is added with an exact version pin, like the other upgrade-sensitive dependencies, and must accept zod 3.25 schemas.
>
> — `sad.md §2, Technical, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** **The `mastra` schema lives outside Prisma.** … `pnpm mastra:migrate` runs beside `prisma migrate deploy` in deploy and in the integration test setup. Prisma never touches the `mastra` schema.
>
> — `sad.md §11, risk row 5, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** **Text leaking into Mastra traces after an upgrade.** … Exact pins for every Mastra package.
>
> — `sad.md §11, risk row 4, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([sad.md](../sad.md) · [ADR-0003](../adr/0003-run-a-gemini-model-through-the-ai-sdk-and-the-vercel-ai-gateway-on-a-free-tier-key.md) · [ADR-0004](../adr/0004-use-mastra-for-the-agent-and-metadata-only-tracing.md)) and follow it. Check the package docs (context7) for the current gateway BYOK and Mastra Postgres storage APIs; do not guess them.

## Data delta

No Prisma changes. Mastra creates its own tables in the separate Postgres schema `mastra` through `pnpm mastra:migrate` (out of Prisma's scope, data-model §Mode).

— `data-model.md §Mode, out of scope, abridged` · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. Exposed module API: `getChatModel()` (`lib/ai/model.ts`) returning the AI SDK language model for `AI_CHAT_MODEL` through the gateway, and `mastra` (`lib/ai/mastra.ts`), the Mastra instance with Postgres storage on schema `mastra` — later tasks register the processor (T11) and the agent (T29) on it.

## Acceptance criteria

No spec §5 AC is satisfied by this task alone; it carries the NFR rows the runtime must make reachable:

> | Model cost per message, p95 | ≤ USD 0.02 | per-message traces (metadata only), weekly |
> | Model provider outage | the chat shows that AI is temporarily unavailable within 10 s; every other part of the app keeps working | fault-injection integration test |
>
> — `spec.md §6, NFR rows "Model cost" and "Model provider outage", verbatim` · full text: [spec.md](../spec.md)

("Every other part of the app keeps working" is why the env check must not make unrelated pages depend on the model at request time — only the build fails on missing keys.)

## Checklist

- [ ] Add exact-version pins: `ai`, `@ai-sdk/gateway`, `@ai-sdk/google`, `@ai-sdk/react`, `@mastra/core`, `@mastra/pg` (and any Mastra observability package the processor needs) — `package.json`, `pnpm-lock.yaml`
- [ ] Required `AI_GATEWAY_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`; optional `AI_CHAT_MODEL` with the Flash-Lite default — `lib/env/required-settings.ts`
- [ ] `getChatModel()` through the gateway (BYOK) — `lib/ai/model.ts` (`server-only`)
- [ ] Mastra instance with Postgres storage on schema `mastra`, no Memory — `lib/ai/mastra.ts`
- [ ] Mastra packages in `serverExternalPackages` — `next.config.ts`
- [ ] `pnpm mastra:migrate` script — `scripts/mastra-migrate.ts`, `package.json`
- [ ] Run `mastra:migrate` after `prisma migrate deploy` in the integration setup — `tests/support/setup.ts`
- [ ] Tests: required-settings unit test for the two keys and the default model; integration test that `mastra:migrate` creates tables only in schema `mastra` and `prisma migrate diff` stays empty — `tests/unit/lib/env/required-settings-ai.test.ts`, `tests/integration/mastra-storage.test.ts`

## Edge cases

| Case | Behaviour |
|---|---|
| `AI_CHAT_MODEL` unset | the Flash-Lite default |
| A required key missing at build | the build fails with the setting named |
| `mastra:migrate` run twice | no error, no change |
| A package needs zod 4 at its API | stop and report — sad §2 requires zod 3.25 schemas to be accepted |
| Mastra tables appear in `public` | defect — storage must be on schema `mastra` |

## Definition of Done

- [ ] The AI SDK, gateway, Google provider and Mastra packages are pinned to exact versions, the build fails without AI_GATEWAY_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY, getChatModel() resolves AI_CHAT_MODEL with a Flash-Lite default, pnpm mastra:migrate creates the mastra schema beside prisma migrate deploy (also in the integration setup), and Prisma never sees the mastra schema.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
