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
| T37 | [Rebuild the empty state with the time-of-day greeting, the PromptInput composer and suggestion chips](./t37-empty-state-greeting-and-prompt-input-composer.md) | ui | Dmytro Hopko | M | T34, T36 | done |
| T38 | [Align Offered choices, the Draft card and the preview panel with the message layout](./t38-offered-choices-card-and-preview-visual-alignment.md) | ui | Dmytro Hopko | S | T36 | done |
| T39 | [Build the dashboard AI block prompt box on the PromptInput element](./t39-dashboard-ai-block-on-prompt-input.md) | ui | Dmytro Hopko | S | T34 | done |
| T40 | [Register the AI elements and the changed AI components in the design system](./t40-register-ai-elements-in-design-system.md) | docs | Dmytro Hopko | S | T36, T37, T38, T39 | done |
| T41 | [Update e2e selectors, add layout checks for the new presentation and retake the Linux visual baselines](./t41-e2e-selectors-and-linux-baselines-retake.md) | tests | Dmytro Hopko | M | T35, T36, T37, T38, T39 | done |
| T42 | [Redraw the Conversation page loading skeleton inside the workspace container (review R16-1)](./t42-conversation-loading-skeleton-container.md) | ui | Dmytro Hopko | S | T35 | done |
| T43 | [Jump to latest shows its label on focus and keeps focus; the follow hook lives with the elements (review R16-2, R16-8)](./t43-jump-to-latest-focus-label-and-hook-layering.md) | ui | Dmytro Hopko | S | T33 | done |
| T44 | [PromptInput on InputGroup, IME-safe Enter in Safari, and a decorative spinner in the submit (review R16-5, R16-6, R16-7)](./t44-prompt-input-input-group-ime-and-submit-spinner.md) | ui | Dmytro Hopko | S | T34 | done |
| T45 | [Start panel: used-up from Create with AI keeps the default heading, chips wrap on phones, greeting slot, one session read (review R16-3, R16-9, R16-10)](./t45-start-panel-used-up-draft-chips-wrap-session-read.md) | ui | Dmytro Hopko | S | T37 | done |
| T46 | [E2E: dark-theme greeting contrast check, phone-width start panel overflow check, data-slot selectors (review R16-4, R16-10, R16-11)](./t46-e2e-dark-contrast-phone-overflow-data-slot-selectors.md) | tests | Dmytro Hopko | S | T43, T45 | done |
| T47 | [The conversation scroll area stays a keyboard stop with a visible focus ring (review R17-1)](./t47-scroll-area-keyboard-stop-and-focus-ring.md) | ui | Dmytro Hopko | S | T43 | done |
| T48 | [One-line suggestion chips keep 32 px; NOTICE records the T44/T45 changes (review R17-2, R17-3)](./t48-chip-height-and-notice.md) | ui | Dmytro Hopko | S | T45 | done |
| T49 | [Record the scroll area's labelled region and Tab stop in screens.md, the NOTICE and the element header (review R18-1)](./t49-record-messages-region.md) | docs | Dmytro Hopko | XS | T47 | done |

| T50 | [Promote staged migrations 06–08, apply the Prisma schema edits for the Question form and extend the factories](./t50-promote-staged-migrations-06-08-apply-the.md) | migration | Dmytro Hopko | M | — | done |
| T51 | [Add the Question form types and zod schemas, swap choice for form in the chat request, and read legacy offers as one-question forms](./t51-add-the-question-form-types-and-zod.md) | domain | Dmytro Hopko | M | T50 | done |
| T52 | [Build the form from resolver issues and compose one form per reply (order, cap 6, dedupe, input-only above 8, date options)](./t52-build-the-form-from-resolver-issues-and.md) | domain | Dmytro Hopko | L | T51 | done |
| T53 | [Check typed answers per kind, pin answers into a stored draft request, and compose the answer message](./t53-check-typed-answers-per-kind-pin-answers.md) | domain | Dmytro Hopko | M | T51 | done |
| T54 | [Add the chat-only ask_user tool that checks every named record owner-scoped and by kind and builds the labels](./t54-add-the-chat-only-ask-user-tool.md) | app | Dmytro Hopko | M | T52 | done |
| T55 | [Compose the turn's one form, stream it, store it in saveTurn and return FormView on reopen](./t55-compose-the-turn-s-one-form-stream.md) | app | Dmytro Hopko | L | T52, T54 | done |
| T56 | [Check a sent form before any count and claim or release it with the allowance slot](./t56-check-a-sent-form-before-any-count.md) | infra | Dmytro Hopko | M | T53, T55 | done |
| T57 | [Run the form path in the chat route: refuse before counting, compose the message, pin and resolve in code, origin FORM](./t57-run-the-form-path-in-the-chat.md) | ports | Dmytro Hopko | L | T56 | done |
| T58 | [Prove the form safety properties: injection and forged-id fixtures, uniform refusals, concurrent sends, release, spans](./t58-prove-the-form-safety-properties-injection-and.md) | tests | Dmytro Hopko | M | T57 | done |
| T59 | [Build the QuestionForm component with every SCR-04 revision state](./t59-build-the-questionform-component-with-every-scr.md) | ui | Dmytro Hopko | L | T51, T53 | done |
| T60 | [Wire QuestionForm into the chat island, send forms, remove OfferedChoices](./t60-wire-questionform-into-the-chat-island-send.md) | ui | Dmytro Hopko | M | T57, T59 | done |
| T61 | [Cover forms, answers and origin FORM in the data export, account deletion and the privacy page](./t61-cover-forms-answers-and-origin-form-in.md) | app | Dmytro Hopko | S | T55 | done |
| T62 | [Render replies as safe Markdown with react-markdown 10.1.0 and remark-gfm 4.0.1 and an in-app link allowlist](./t62-render-replies-as-safe-markdown-with-react.md) | ui | Dmytro Hopko | L | — | done |
| T63 | [Tell the model today and the time zone, and rewrite the chat instructions and router wording for forms, search-first and links](./t63-tell-the-model-today-and-the-time.md) | app | Dmytro Hopko | M | T54, T64 | done |
| T64 | [Add created-date filters, a created-date sort and in-app paths to search_invoices on both channels](./t64-add-created-date-filters-a-created-date.md) | app | Dmytro Hopko | M | — | done |
| T65 | [Extend the evaluation harness with form, card-or-form, link and date checks and the owner-feedback rows](./t65-extend-the-evaluation-harness-with-form-card.md) | tests | Dmytro Hopko | M | T60, T63, T64 | done |
| T66 | [Keep the Conversation list mounted in the AI layout and update it from chat events](./t66-keep-the-conversation-list-mounted-in-the.md) | ui | Dmytro Hopko | L | — | done |
| T67 | [Align the list top row with the chat header, size every skeleton to its content, and level the avatar with the first line](./t67-align-the-list-top-row-with-the.md) | ui | Dmytro Hopko | M | T66 | done |
| T68 | [Add e2e-through-UI tests for forms, Markdown, aligned layout, stable skeletons and list-keeping switches, and retake Linux baselines](./t68-add-e2e-through-ui-tests-for-forms.md) | tests | Dmytro Hopko | L | T60, T62, T67 | done |
| T69 | [Register QuestionForm, ConversationListProvider and the Markdown MessageResponse in the design system and update ux-flows for the form](./t69-register-questionform-conversationlistprovider-and-the-markdown-messageresponse.md) | docs | Dmytro Hopko | S | T60, T62, T66 | done |

| T70 | [A sent form checks a picked record only for still existing, being the actor's and unchanged, not for fitting the stored request (review R20-1)](./t70-form-answers-fit-check-by-record-not-stored-request.md) | domain | Dmytro Hopko | M | T56 | done |
| T71 | [Carry each picked record's id and the pinned partial request into the prior ask_user step so no picked record is matched again by name (review R20-3)](./t71-carry-picked-record-ids-into-the-prior-ask-step.md) | app | Dmytro Hopko | M | T57 | done |
| T72 | [Give resolver-raised questions chat-written question text and fix the instructions' tool sentence (review R20-11, R20-9)](./t72-question-text-for-resolver-questions-and-instructions-wording.md) | app | Dmytro Hopko | S | T63 | done |
| T73 | [Render Freelancer messages as plain pre-wrapped text, keep single line breaks in replies, trim the Markdown subset to ADR-0012 and fix stale plain-text docs (review R20-2, R20-8, R20-10)](./t73-user-bubbles-plain-text-and-markdown-subset-per-adr-0012.md) | ui | Dmytro Hopko | M | T62 | done |
| T74 | [QuestionForm: show the sending state, name every input, show the currency unit, and never drop a form 400 silently (review R20-4, R20-6, R20-7, R20-13)](./t74-question-form-sending-state-labels-unit-and-validation-fallback.md) | ui | Dmytro Hopko | M | T60 | done |
| T75 | [The Conversation list marks and deletes a just-created Conversation correctly, and a saved turn no longer refetches the list (review R20-5, R20-12)](./t75-list-active-row-after-first-send-and-no-per-turn-list-refetch.md) | ui | Dmytro Hopko | M | T66 | todo |

**Total:** 75 tasks, ~36 person-days (T32 is a review follow-up; T33–T41 are the presentation rewrite of 2026-10-13, ADR-0010; T42–T46, T47–T48 and T49 are its review round 16, 17 and 18 follow-ups; T50–T69 are the owner feedback revision of 2026-10-13, ADR-0011–0013; T70–T75 are its review round 20 follow-ups).

**Owner gates outside `implement`:** T28 privacy wording review and the spec §8 terms-page question (before `ship`); the real-model evaluation run (T29 rows) and the read/issue load scenarios (pre-release).
