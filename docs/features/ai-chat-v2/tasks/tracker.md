# Tracker — ai-chat-v2

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.
> Estimates: S ≈ 2 h · M ≈ half a day · L ≈ one day (every task ≤ 1 day). Run order: id order, sequential, in place.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Spike and build the run-turn seam that starts a chat turn from a pinned resolution](./t01-spike-pinned-turn-seam.md) | app | Dmytro Hopko | M | — | done |
| T02 | [Promote staged migrations 01–05, apply the Prisma schema edits and extend the test factories](./t02-promote-migrations-and-factories.md) | migration | Dmytro Hopko | M | — | done |
| T03 | [Move foldName into an isomorphic shared helper with one look-alike fixture set](./t03-shared-fold-name.md) | domain | Dmytro Hopko | S | — | done |
| T04 | [Add the offer, origin and start-point types and the CHOICE_UNAVAILABLE and ALREADY_ISSUED error details](./t04-shared-types-and-error-kinds.md) | domain | Dmytro Hopko | S | — | done |
| T05 | [Add the list_sender_profiles read question for the chat and MCP, and fix the stale MCP read-only comment](./t05-sender-profiles-read.md) | app | Dmytro Hopko | M | — | done |
| T06 | [Add the list_products read question with prices per currency and a Customer's Custom prices](./t06-products-read.md) | app | Dmytro Hopko | M | T03, T05 | done |
| T07 | [Make list_customers look-alike aware with a 20-row page, and add the cross-read contract and timing tests](./t07-customers-read-folded-and-read-contracts.md) | app | Dmytro Hopko | M | T03, T06 | done |
| T08 | [Extend the draft resolver: senderProfileId in the request and label fields on the issue candidates](./t08-resolver-request-and-candidate-delta.md) | domain | Dmytro Hopko | M | T03 | done |
| T09 | [Rewrite the chat instructions for the real reads and add the own-sender-profile hint on CUSTOMER_NOT_FOUND (AC-05b)](./t09-chat-instructions-and-own-profile-hint.md) | app | Dmytro Hopko | M | T07, T08 | done |
| T10 | [Build Offered choices from resolver issues and pin a chosen option into a draft request](./t10-offer-builder-and-pin.md) | domain | Dmytro Hopko | M | T04, T08 | done |
| T11 | [Store a turn's offer, message origin and start point in saveTurn, close the open offer, and return offers on reopen](./t11-save-turn-offers-and-reopen.md) | infra | Dmytro Hopko | M | T02, T10 | done |
| T12 | [Check a pressed choice against the stored offer and claim or release it with the allowance slot](./t12-choice-check-claim-release.md) | infra | Dmytro Hopko | M | T10, T11 | done |
| T13 | [Turn propose_draft issues into the reply's offer, apply the turn's pins, and stream the data-offer part](./t13-propose-draft-offers-and-stream-part.md) | app | Dmytro Hopko | M | T01, T10, T11 | done |
| T14 | [Accept choice, origin and startedFrom in the chat request and run the press path in the chat route](./t14-chat-route-press-path.md) | ports | Dmytro Hopko | L | T12, T13 | done |
| T15 | [Prove the press safety properties: injection fixture, uniform refusals, concurrent claims, release on failure, metadata-only spans](./t15-press-safety-suite.md) | tests | Dmytro Hopko | M | T14 | done |
| T16 | [Guard updateInvoiceStatus with an optional expectedVersion and set issuedFromChat on that path](./t16-invoice-status-expected-version.md) | infra | Dmytro Hopko | M | T02, T04 | done |
| T17 | [Add the loadInvoicePreview and issueFromPreview server actions](./t17-preview-and-issue-actions.md) | ports | Dmytro Hopko | M | T16 | done |
| T18 | [List every Conversation summary and the latest three, and add the grouping and title-search helpers](./t18-conversation-summaries-and-grouping.md) | app | Dmytro Hopko | S | T03, T11 | done |
| T19 | [Make the AI section a full-height workspace with a grouped, searchable Conversation list and phone sheets](./t19-full-height-workspace-and-list.md) | ui | Dmytro Hopko | L | T18 | done |
| T20 | [Redesign the empty Conversation start with suggested requests and the composer move, and send the start point](./t20-empty-state-and-start-points.md) | ui | Dmytro Hopko | M | T14, T19 | done |
| T21 | [Follow new text within 48 px with a jump-to-latest control, and pin the word-by-word streaming](./t21-follow-latest-and-streamed-reply.md) | ui | Dmytro Hopko | M | T20 | done |
| T22 | [Render Offered choices under a reply and send a press from the chat island](./t22-offered-choices-ui.md) | ui | Dmytro Hopko | M | T14, T21 | done |
| T23 | [Add the workspace invoice-state store and the Draft card Preview button](./t23-invoice-state-store-and-card-preview.md) | ui | Dmytro Hopko | M | T17, T22 | done |
| T24 | [Build the invoice preview panel and the issue confirmation for desktop and phone](./t24-invoice-preview-panel-and-issue-dialog.md) | ui | Dmytro Hopko | L | T23 | done |
| T25 | [Replace the single AI navigation item with an "AI" group holding AI chat and Connect your AI](./t25-navigation-ai-group.md) | ui | Dmytro Hopko | S | — | done |
| T26 | [Add the dashboard AI block with the prompt box hand-off, the latest Conversations and Create invoice with AI](./t26-dashboard-ai-block-and-handoff.md) | ui | Dmytro Hopko | L | T18, T22 | done |
| T27 | [Cover offers, chosen options, message origins and start points in the data export and account deletion](./t27-export-and-account-deletion.md) | app | Dmytro Hopko | S | T11 | done |
| T28 | [Update the privacy page AI section for what the chat stores and shares, and check the terms page](./t28-privacy-page-ai-section.md) | docs | Dmytro Hopko | S | — | review |
| T29 | [Extend the evaluation harness with explains and press fields, the own-profile-name setup and this feature's fixtures](./t29-eval-harness-extension.md) | tests | Dmytro Hopko | M | T09, T14 | done |
| T30 | [Add e2e-through-UI tests for presses, reopen, full-height layout, empty start, phone sheets and streaming](./t30-e2e-chat-flows.md) | tests | Dmytro Hopko | M | T19, T21, T22 | done |
| T31 | [Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility](./t31-e2e-preview-dashboard-nav-a11y.md) | tests | Dmytro Hopko | L | T07, T24, T25, T26, T28, T30 | done |
| T32 | [Product candidates follow the drafting currency when only the Customer fails (review R14-1)](./t32-drafting-currency-on-customer-not-found.md) | app | Dmytro Hopko | S | T08, T12 | done |
| T33 | [Port the Conversation, Message and Loader elements from Vercel AI Elements onto Base UI, with the licence files](./t33-port-conversation-and-message-elements.md) | ui | Dmytro Hopko | M | — | done |
| T34 | [Port the PromptInput and Suggestion elements onto Base UI](./t34-port-prompt-input-and-suggestion-elements.md) | ui | Dmytro Hopko | M | — | done |
| T35 | [Rebuild the workspace as a bordered container and the Conversation list as plain rows with a row menu for delete](./t35-workspace-container-and-conversation-list.md) | ui | Dmytro Hopko | M | — | done |
| T36 | [Rebuild the message list and chat pane on the elements: centred column, bubbles, avatar, errors as assistant messages with Try again](./t36-message-list-and-chat-pane-on-elements.md) | ui | Dmytro Hopko | L | T33, T35 | done |
| T37 | [Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips](./t37-empty-state-greeting-and-prompt-input-composer.md) | ui | Dmytro Hopko | M | T34, T36 | todo |
| T38 | [Align Offered choices, the Draft card and the preview panel with the message layout](./t38-offered-choices-card-and-preview-visual-alignment.md) | ui | Dmytro Hopko | S | T36 | todo |
| T39 | [Build the dashboard AI block prompt box on the PromptInput element](./t39-dashboard-ai-block-on-prompt-input.md) | ui | Dmytro Hopko | S | T34 | todo |
| T40 | [Register the AI elements and the changed AI components in the design system](./t40-register-ai-elements-in-design-system.md) | docs | Dmytro Hopko | S | T36, T37, T38, T39 | todo |
| T41 | [Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines](./t41-e2e-selectors-and-linux-baselines-retake.md) | tests | Dmytro Hopko | M | T35, T36, T37, T38, T39 | todo |

**Total:** 41 tasks, ~21.5 person-days (T32 is a review follow-up; T33–T41 are the presentation rewrite of 2026-10-13, ADR-0010).

**Owner gates outside `implement`:** T28 privacy wording review and the spec §8 terms-page question (before `ship`); the real-model evaluation run (T29 rows) and the read/issue load scenarios (pre-release).
