# Assistant evaluation

`pnpm eval:assistant` measures the chat's topic boundary and its no-guessing guard before a release
and on every change to the Assistant's instructions or model setting (spec §6, QG-3). A failing run
blocks the change. It is not part of `pnpm test` or `pnpm test:unit`.

- `topic-boundary.jsonl`: at least 100 labelled questions (`in_scope`, `mixed`, `off_topic`; English and Ukrainian). The router must refuse at least 95 % of the off-topic ones and at most 5 % of the in-scope and mixed ones.
- `no-guessing.jsonl`: drafting requests (AC-12 to AC-22). Every incomplete or ambiguous one must end in a question, the complete controls must give a card, and no proposal may carry a value from neither the request nor the defaults.
  Each row is checked against `noGuessingItemSchema` (`dataset.ts`) before any model call. Optional fields (ai-chat-v2):
  - `explains: "own-sender-profile"` (AC-05b, setup `own-profile-name`: default profile "Studio" with a USD account, a second profile "Consulting FOP" with a UAH account, Customers Acme Corp and Acme GmbH). The row passes only when no card is shown, no draft action resolved "Consulting FOP" as the Customer, and the reply names "Consulting FOP" with the sender-profile term of its language ("sender profile" / "профіль") and asks for the Customer. It counts toward the 100 % question rate.
  - `explains: "match-count"` (AC-14, setup `many-studios`: twelve Customers "Studio A" to "Studio L"). The row passes only when no card is shown, the reply says that 12 match, and it names none of them. It counts toward the 100 % question rate.
  - `press: { "label": "Acme GmbH" }` (AC-10): the harness replays the row's `history` through the chat route, then answers the offered form question whose option has that label, as a one-answer form Send through the route (never typed text; the server sets the origin). The row passes when the card is for the pressed Customer and the reply does not name the look-alike.
  - `kind: "issue"` (AC-24): asks the chat to issue an invoice in words. No card, and no invoice of the Freelancer may change status during the turn (checked on every row).

## Running it

It calls the real model, so it needs the AI keys (the same gateway settings as the app, for example
`AI_GATEWAY_API_KEY`, optionally `AI_CHAT_MODEL`) in the environment, and Docker running: the
drafting requests run against a seeded throwaway Postgres started by the test harness. It never
uses the `.env` or `.env.prod` database.

```sh
pnpm eval:assistant
ASSISTANT_EVAL_RUNS=5 pnpm eval:assistant
```

`ASSISTANT_EVAL_RUNS` (default 1) runs the drafting-behaviour set that many times; each row must then
pass in at least ceil(0.8 * runs) of them (4 of 5), and the per-row pass counts are printed.

`pnpm eval:assistant:dry` validates both datasets against their schema and sizes without the model or a database.

The exit code is 0 only when every threshold holds; the report lists the failing questions and ids.
A provider that keeps failing after five retries with backoff fails the run.
