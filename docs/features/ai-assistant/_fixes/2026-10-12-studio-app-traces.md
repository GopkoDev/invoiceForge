---
slug: ai-assistant
date: 2026-10-12
triage: no-spec
acs: []
commit: d496c54
recurrence_of: none
---

# Fix: Mastra Studio shows none of the app's chats

## Symptom

The owner chatted in the app (localhost:3000), opened Mastra Studio (`pnpm studio`, localhost:4111, commit 9a68dff), and expected the traces of those chats. Studio's Traces page showed only the one trace of a run made in Studio itself.

## Root cause

The app's tracing works. Studio was looking at a different store.

- **The app writes its traces.** A read-only check of the .env DB (Neon dev, `ep-billowing-resonance-…`) shows the following:
  - The `mastra` schema exists with all Mastra tables. `pnpm mastra:migrate` has been run, and `disableInit: true` in `lib/ai/mastra.ts` is satisfied.
  - `mastra.mastra_ai_spans` holds 417 spans in 26 traces from 2026-10-12. The root spans are `agent run: 'chat-agent'`, and the child spans are model steps and tool calls (`propose_draft`, `list_customers`, `find_in_app`, …).
  - Every span has `input` and `output` NULL. This is the metadata-only processor working as ADR-0004 requires.
  - `tests/unit/lib/ai/observability-registration.test.ts` agrees: the processor and the storage exporter are registered.
- **Studio reads only its own file.** `mastra/index.ts` gave Studio a `LibSQLStore` at `.mastra/studio.db` with its own `MastraStorageExporter`. This is deliberate: Studio's traces keep full text, so they must not reach Neon. As a side effect, Studio's Traces page could only ever list Studio's own runs. Nothing wired it to the app's traces, and nothing documented that it would not show them.

## The pinning test

Unit, `tests/unit/mastra/studio-traces.test.ts`. It uses placeholder DB URLs and a temporary `.mastra` directory, and touches no database.

- "STUDIO_TRACES=app: the traces Studio lists are the app's, in the `mastra` schema of the .env database". Before the fix it failed with `AssertionError: expected 'ObservabilityLibSQL' to be 'ObservabilityPG'`.
- "STUDIO_TRACES=app: Studio starts without creating or altering the app's tables, and writes no spans there". Before the fix it failed with `AssertionError: expected [ MastraStorageExporter{ …(3) } ] to deeply equal []`.
- "by default Studio keeps its own full-text traces in the local file" is a control and passed before and after.

The fix is opt-in. Start Studio with `STUDIO_TRACES=app pnpm studio`. Studio's storage then becomes a composite:

- Everything stays in `.mastra/studio.db`, except the **observability** domain.
- The observability domain is a `PostgresStore` on the `.env` `DATABASE_URL`, schema `mastra`.
- That connection carries `options=-c default_transaction_read_only=on`, so the session cannot write. This was checked on the Neon pooler: `SHOW default_transaction_read_only` returns `on`.
- The domain's `init` is a no-op, so start-up never creates or alters the app's tables.
- Studio registers no observability of its own in this mode, so no full-text spans of Studio runs can reach the shared DB.

A read-only check against the dev DB, with the same store setup, listed the app's 26 traces newest first, `input: null` (no text, by design).

The default (`pnpm studio` without the setting) is unchanged. The header of `mastra/index.ts` documents both modes.

## Spec patch

None. This is debugging tooling, so no AC owns it. Spec §1 "Debugging traces hold metadata only" and ADR-0004 still hold. The app's traces stay metadata-only. In `STUDIO_TRACES=app` mode Studio only reads them. In its default mode, Studio keeps full text in a local, gitignored file.

## Follow-ups

- In app-traces mode, Studio shows the structure of a turn (agent run, steps, tool names, timings, token usage) but no prompts, tool arguments or answers. ADR-0004 intends this. To see the text of a turn, open its Conversation (the only copy of the content), or replay the message in Studio's default mode with the model. Replaying costs model quota.
- The app's spans carry `serviceName` NULL even though `lib/ai/mastra.ts` sets `serviceName: 'ai-assistant'`. This is harmless for listing. Check it if traces are ever filtered by service.
- Each mode needs a Studio restart. The owner's running Studio was not touched.
