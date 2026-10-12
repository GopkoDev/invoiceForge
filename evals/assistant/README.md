# Assistant evaluation

`pnpm eval:assistant` measures the chat's topic boundary and its no-guessing guard before a release
and on every change to the Assistant's instructions or model setting (spec §6, QG-3). A failing run
blocks the change. It is not part of `pnpm test` or `pnpm test:unit`.

- `topic-boundary.jsonl`: at least 100 labelled questions (`in_scope`, `mixed`, `off_topic`; English and Ukrainian). The router must refuse at least 95 % of the off-topic ones and at most 5 % of the in-scope and mixed ones.
- `no-guessing.jsonl`: drafting requests (AC-12 to AC-22). Every incomplete or ambiguous one must end in a question, the complete controls must give a card, and no proposal may carry a value from neither the request nor the defaults.

## Running it

It calls the real model, so it needs the AI keys (the same gateway settings as the app, for example
`AI_GATEWAY_API_KEY`, optionally `AI_CHAT_MODEL`) in the environment, and Docker running: the
drafting requests run against a seeded throwaway Postgres started by the test harness. It never
uses the `.env` or `.env.prod` database.

```sh
pnpm eval:assistant
```

The exit code is 0 only when every threshold holds; the report lists the failing questions and ids.
A provider that keeps failing after five retries with backoff fails the run.
