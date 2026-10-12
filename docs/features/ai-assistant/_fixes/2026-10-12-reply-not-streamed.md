---
slug: ai-assistant
date: 2026-10-12
triage: gap
acs: []
commit: a15c673
recurrence_of: none
---

# Fix: the reply appears all at once instead of being written out

## Symptom

In `next dev`, the Freelancer asked a question. They expected the reply to appear word by word as it was generated (screens.md SCR-02 "streaming": "Text deltas render progressively"). Instead, "Thinking…" stayed for a few seconds and then the whole reply appeared at once. Every reply did this.

## Root cause

Nothing in the app buffers the stream. Each layer was checked:

- `lib/ai/run-turn.ts`: `chunkStream`'s `ReadableStream.start()` enqueues each chunk as it arrives, and a reader gets enqueued chunks before `start()` settles. The `text-delta` case emits each Mastra `fullStream` delta at once.
- `app/api/chat/route.ts`: `for await (const chunk of turnStream) write(chunk)` writes as the turn produces chunks, inside `createUIMessageStream`.
- Next's server: the `compression` middleware is on, but `pipeToNodeResponse` calls `res.flush()` after every chunk.
- The client: `useChat` has no throttle, and the island renders every streamed message (a component test already shows partial text while the stream is open).

A new integration test shows the route sends the first `text-delta` while the model is still holding back the rest of its reply. With the route's loop changed to collect the turn before writing, the same test fails with `Expected: "first words"`, `Received: "still waiting"`. It passes at HEAD.

The cause is the model's timing. The Mastra traces of the owner's dev turns (read-only query of `mastra.mastra_ai_spans`, metadata only) show this pattern. Gemini Flash-Lite (`google/gemini-3.5-flash-lite` through the AI Gateway) spends 2–5 s on the router and one to four tool steps. It then writes the final text in one burst: the `chunk: 'text'` span lasts 166 ms for 51 output tokens and 186 ms for 57 output tokens. So the reply was streamed, but all its words arrived within about 0.2 s, which looks like one jump on screen. The scripted test models also send each step's text as one delta, so no test looked at pacing.

## The fix

`runTurn` writes the model's text out word by word: each model delta is split into words (with their trailing whitespace) and emitted `WORD_DELAY_MS` (20 ms) apart. Text is never held back. The first word of the reply goes out as soon as the model sends it, so the time to the first visible words (spec §6, p95 ≤ 3 s) does not change. A typical 50-token reply (about 35 words) now takes about 0.7 s to write out instead of about 0.2 s. A 150-word reply adds about 3 s, which stays within the 12 s full-reply budget for these turns (2–6 s in the traces). The saved text, the result and every other chunk are unchanged.

## The pinning test

Unit, `tests/unit/lib/ai/run-turn-paced-text.test.ts`, "a reply the model sends in one burst reaches the chat as paced word deltas". Before the fix it failed at line 39 with `AssertionError: expected [ Array(1) ] to deeply equal [ 'Acme ', 'Corp ', 'owes ', …(7) ]`: the whole reply was one delta. It also checks that the deltas are spread over at least `(n − 1) × WORD_DELAY_MS`.

Regression guard, integration, `tests/integration/api/chat-route.test.ts` "the reply streams (fix 2026-10-12, SCR-02 streaming) › sends the first text-delta before the model has finished generating". A scripted model writes its first words, a tool step comes first, and the model then waits on a gate. The route's response body must yield the first `text-delta` before the gate opens. It passes at HEAD and fails if anything between the model and the response buffers the turn.

## Spec patch (proposed, awaiting owner)

No AC says how a reply appears. Spec §6 only measures the first visible words (≤ 3 s p95) and the full reply (≤ 12 s p95). screens.md SCR-02 asks for progressive text, but a provider that writes a reply in 0.2 s meets both NFRs while showing it all at once. This is a gap. The owner could not be asked, so spec.md is **not** changed. Proposed new row for the §6 NFR table, after "Chat, time to the first visible words of a reply, p95":

> | Chat, a reply's text appears progressively, word by word, never as one block once it is complete | written out at no less than 20 ms per word | e2e / component check of the streamed deltas |

## Follow-ups

- `WORD_DELAY_MS` is a UX setting. Tune it, or cap the total pacing per reply, if long answers feel slow.
- The e2e stub model sends its words without delays, so no e2e checks the pacing in a browser. The unit test pins it at the turn level.
