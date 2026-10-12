# Tracker — ai-chat-v2

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Estimates: S ≈ 2 h · M ≈ half a day · L ≈ one day (every task ≤ 1 day). Run order: id order, sequential, in place.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Spike and build the run-turn seam that starts a chat turn from a pinned resolution](./t01-spike-pinned-turn-seam.md) | app | Dmytro Hopko | M | — | done |
| T02 | [Promote staged migrations 01–05, apply the Prisma schema edits and extend the test factories](./t02-promote-migrations-and-factories.md) | migration | Dmytro Hopko | M | — | done |
| T03 | [Move foldName into an isomorphic shared helper with one look-alike fixture set](./t03-shared-fold-name.md) | domain | Dmytro Hopko | S | — | todo |
| T04 | [Add the offer, origin and start-point types and the CHOICE_UNAVAILABLE and ALREADY_ISSUED error details](./t04-shared-types-and-error-kinds.md) | domain | Dmytro Hopko | S | — | todo |
| T05 | [Add the list_sender_profiles read question for the chat and MCP, and fix the stale MCP read-only comment](./t05-sender-profiles-read.md) | app | Dmytro Hopko | M | — | todo |
| T06 | [Add the list_products read question with prices per currency and a Customer's Custom prices](./t06-products-read.md) | app | Dmytro Hopko | M | T03, T05 | todo |
| T07 | [Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests](./t07-customers-read-folded-and-read-contracts.md) | app | Dmytro Hopko | M | T03, T06 | todo |
| T08 | [Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates](./t08-resolver-request-and-candidate-delta.md) | domain | Dmytro Hopko | M | T03 | todo |
| T09 | [Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b)](./t09-chat-instructions-and-own-profile-hint.md) | app | Dmytro Hopko | M | T07, T08 | todo |
| T10 | [Build Offered choices from resolver issues and pin a chosen option into a draft request](./t10-offer-builder-and-pin.md) | domain | Dmytro Hopko | M | T04, T08 | todo |
| T11 | [Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen](./t11-save-turn-offers-and-reopen.md) | infra | Dmytro Hopko | M | T02, T10 | todo |
| T12 | [Check a pressed choice against the stored offer and claim or release it with the allowance slot](./t12-choice-check-claim-release.md) | infra | Dmytro Hopko | M | T10, T11 | todo |
| T13 | [Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part](./t13-propose-draft-offers-and-stream-part.md) | app | Dmytro Hopko | M | T01, T10, T11 | todo |
| T14 | [Accept choice, origin and startedFrom in the chat request and run the press path in the chat route](./t14-chat-route-press-path.md) | ports | Dmytro Hopko | L | T12, T13 | todo |
| T15 | [Prove the press safety properties: injection fixture, uniform refusals, concurrent claims, release on failure, metadata-only spans](./t15-press-safety-suite.md) | tests | Dmytro Hopko | M | T14 | todo |
| T16 | [Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path](./t16-invoice-status-expected-version.md) | infra | Dmytro Hopko | M | T02, T04 | todo |
| T17 | [Add the loadInvoicePreview and issueFromPreview server actions](./t17-preview-and-issue-actions.md) | ports | Dmytro Hopko | M | T16 | todo |
| T18 | [List every Conversation summary and the latest three, and add the grouping and title-search helpers](./t18-conversation-summaries-and-grouping.md) | app | Dmytro Hopko | S | T03, T11 | todo |
| T19 | [Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets](./t19-full-height-workspace-and-list.md) | ui | Dmytro Hopko | L | T18 | todo |
| T20 | [Redesign the empty Conversation start with suggested requests and the composer move, and send the start point](./t20-empty-state-and-start-points.md) | ui | Dmytro Hopko | M | T14, T19 | todo |
| T21 | [Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming](./t21-follow-latest-and-streamed-reply.md) | ui | Dmytro Hopko | M | T20 | todo |
| T22 | [Render Offered choices under a reply and send a press from the chat island](./t22-offered-choices-ui.md) | ui | Dmytro Hopko | M | T14, T21 | todo |
| T23 | [Add the workspace invoice-state store and the Draft card Preview button](./t23-invoice-state-store-and-card-preview.md) | ui | Dmytro Hopko | M | T17, T22 | todo |
| T24 | [Build the invoice preview panel and the issue confirmation for desktop and phone](./t24-invoice-preview-panel-and-issue-dialog.md) | ui | Dmytro Hopko | L | T23 | todo |
| T25 | [Replace the single AI navigation item with an "AI" group holding AI chat and Connect your AI](./t25-navigation-ai-group.md) | ui | Dmytro Hopko | S | — | todo |
| T26 | [Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI](./t26-dashboard-ai-block-and-handoff.md) | ui | Dmytro Hopko | L | T18, T22 | todo |
| T27 | [Cover offers, chosen options, message origins and start points in the data export and account deletion](./t27-export-and-account-deletion.md) | app | Dmytro Hopko | S | T11 | todo |
| T28 | [Update the privacy page AI section for what the chat stores and shares, and check the terms page](./t28-privacy-page-ai-section.md) | docs | Dmytro Hopko | S | — | todo |
| T29 | [Extend the evaluation harness with explains and press fields, the own-profile-name setup and this feature's fixtures](./t29-eval-harness-extension.md) | tests | Dmytro Hopko | M | T09, T14 | todo |
| T30 | [Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming](./t30-e2e-chat-flows.md) | tests | Dmytro Hopko | M | T19, T21, T22 | todo |
| T31 | [Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility](./t31-e2e-preview-dashboard-nav-a11y.md) | tests | Dmytro Hopko | L | T07, T24, T25, T26, T28, T30 | todo |

**Total:** 31 tasks, ~16.5 person-days.

**Owner gates outside `implement`:** T28 privacy wording review and the spec §8 terms-page question (before `ship`); the real-model evaluation run (T29 rows) and the read/issue load scenarios (pre-release).
