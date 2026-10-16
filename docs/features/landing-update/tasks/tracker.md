# Tracker — landing-update

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | Add the new landing copy and demo sample to landingContent and pin its claims with a truth-guard unit test | domain | Dmytro Hopko | M | — | done |
| T02 | Record the landing page's first-load compressed JavaScript baseline before any landing code changes | tests | Dmytro Hopko | S | — | done |
| T03 | Build DemoDraftCard, the presentational replica of the chat draft proposal card | ui | Dmytro Hopko | S | T01 | done |
| T04 | Build the LandingDemo player: phase state machine, play-once on visibility, Replay, links and text equivalent | ui | Dmytro Hopko | M | T01, T03 | done |
| T05 | Add the demo's CSS-only finished-still fallbacks and the armed/visible reveal timing | ui | Dmytro Hopko | M | T04 | done |
| T06 | Rewrite LandingHero around the one-sentence promise with the demo and drop the stats row | ui | Dmytro Hopko | S | T01, T02, T05 | done |
| T07 | Build AiSection, place it right after the hero and add the #ai navigation link | ui | Dmytro Hopko | S | T01, T02 | todo |
| T08 | Override the landing route's description, openGraph and twitter metadata with the one-sentence promise | wiring | Dmytro Hopko | S | T01 | done |
| T09 | Write the landing e2e spec: first screen, demo timing and fallbacks, no data requests, sign-in links, signed-in redirect | tests | Dmytro Hopko | M | T06, T07, T08 | todo |
| T10 | Add axe, Linux visual references of the finished demo and the 30 KB JS budget check to the landing e2e spec | tests | Dmytro Hopko | S | T02, T09 | todo |
| T11 | Register LandingDemo, DemoDraftCard and AiSection in the design-system component inventory | docs | Dmytro Hopko | S | T03, T05, T07 | todo |

**Total:** 11 tasks, ~5 person-days (S ≈ 0.3 d, M ≈ 0.7 d).
