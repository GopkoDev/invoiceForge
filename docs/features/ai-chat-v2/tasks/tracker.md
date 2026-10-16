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
| T75 | [The Conversation list marks and deletes a just-created Conversation correctly, and a saved turn no longer refetches the list (review R20-5, R20-12)](./t75-list-active-row-after-first-send-and-no-per-turn-list-refetch.md) | ui | Dmytro Hopko | M | T66 | done |
| T76 | [Carry askFields on the pinned form-Send path and derive them from the form as composed (cap 6, F1 order) (review R21-1, R21-2)](./t76-ask-fields-on-the-pinned-path-capped-like-the-form.md) | app | Dmytro Hopko | S | T72 | done |
| T77 | [Keep the axe-core lockfile change to axe-core only: restore next's @babel/core 7.29.7 peer resolution (review R21-3)](./t77-keep-the-lockfile-change-to-axe-core-only.md) | infra | Dmytro Hopko | XS | T74 | done |
| T85 | [Refuse the removed dashboard prompt origins on a chat request; keep them readable for history (consistency C5)](./t85-refuse-removed-dashboard-origins.md) | app | Dmytro Hopko | S | — | done |
| T86 | [QuestionForm: drop the unused sending state, restore the input unit suffix, cap the dock lower on a phone, and focus the Message box after × (consistency C10, C11, C15, C17, C18)](./t86-question-form-cleanup-unit-suffix-phone-cap-close-focus.md) | ui | Dmytro Hopko | M | T85 | done |
| T87 | [A failed load of a new form's labels shows an error with Try again instead of an endless skeleton (consistency C16)](./t87-form-labels-load-failure-try-again.md) | ui | Dmytro Hopko | S | T86 | done |
| T88 | [Replies with a form add no empty gap, v1 history renders sanely, and dock tests assert the dock itself (consistency C12, C13, C14)](./t88-no-empty-offer-part-v1-history-dock-test-asserts.md) | ui | Dmytro Hopko | S | T87 | done |
| T89 | [The export schema no longer allows the form question heading the export never writes (consistency C9)](./t89-export-schema-drops-question-heading.md) | tests | Dmytro Hopko | XS | T88 | done |
| T90 | [The privacy and terms pages name Anthropic on paid terms as the model provider (review 2026-10-15 F1-F3)](./t90-privacy-and-terms-name-anthropic.md) | frontend | Dmytro Hopko | XS | T89 | done |
| T91 | [A model call with no reported cost is recorded as unknown (null), never as free (review 2026-10-15 F5)](./t91-unknown-model-cost-is-null.md) | backend | Dmytro Hopko | XS | T89 | done |
| T92 | [Code comments, span fixtures and eval docs match ADR-0014 and ADR-0011 (review 2026-10-15 F8-F10)](./t92-model-comments-fixtures-eval-docs.md) | tests | Dmytro Hopko | XS | T89 | done |
| T93 | [ADR-0014, SAD, spec, architecture map and ship docs are exact about the model switch (review 2026-10-15 F2-F4, F6-F8)](./t93-adr-0014-doc-drift.md) | docs | Dmytro Hopko | XS | T90, T91, T92 | done |
| T94 | [Chat model calls are pinned to Anthropic at the Gateway, so the privacy page's processor list is true (review round 2 N1, N5)](./t94-gateway-only-anthropic.md) | backend | Dmytro Hopko | XS | T93 | done |
| T95 | [A failed turn's unknown router cost is null, and the router verdict always carries its cost (review round 2 N3)](./t95-failed-turn-cost-unknown.md) | backend | Dmytro Hopko | XS | T93 | done |
| T96 | [Docs after round 2: closed risks, terms note, weekly cost check, provider pin and the missing security addendum (review round 2 N2, N4)](./t96-round-2-doc-drift.md) | docs | Dmytro Hopko | XS | T94, T95 | done |
| T97 | [Docs say only another anthropic/* model is a setting change; weekly cost check; terms SCC sentence in the owner approval (review round 3 R3-1..R3-3)](./t97-model-switch-needs-anthropic-docs.md) | docs | Dmytro Hopko | XS | T96 | done |
| T98 | [The Mastra Studio agent is pinned to Anthropic like the app (review round 3 R3-4)](./t98-studio-agent-pinned.md) | backend | Dmytro Hopko | XS | T96 | done |
| T99 | [Every model call stays well below 100k input tokens: output caps, a history size budget, and capped tool answers in the chat (SEC-M-01 a, b)](./t99-bound-model-input-and-output.md) | backend | Dmytro Hopko | S | T98 | done |
| T100 | [The chat refuses more than 10 messages a minute per Freelancer (SEC-M-01 c)](./t100-chat-per-minute-limit.md) | backend | Dmytro Hopko | S | T99 | done |
| T101 | [Gateway requests ask for no prompt training; the app agent carries the pin in its defaults; privacy §5 Vercel row names the AI Gateway (SEC-L-03, SEC-I-04, SEC-I-03)](./t101-no-training-filter-and-agent-default-pin.md) | backend | Dmytro Hopko | S | T100 | done |
| T102 | [ADR-0014, SAD, spec and ship docs say what bounds a turn; weekly check reports null costs; owner checks listed (SEC-M-01 d, e; SEC-I-03; SEC-I-05)](./t102-security-addendum-docs.md) | docs | Dmytro Hopko | S | T101 | done |
| T103 | [One turn's tool answers share a byte budget and a call cap; truncation never splits a character (SEC-M-02, SEC-L-04)](./t103-per-turn-tool-budget.md) | backend | Dmytro Hopko | S | T102 | done |
| T104 | [The per-minute chat limit is atomic in the shared limit store and refusals write no turn rows (SEC-L-05, SEC-I-06 code)](./t104-atomic-chat-rate-limit.md) | migration | Dmytro Hopko | S | T103 | done |
| T105 | [Docs state the real bounds after the re-check (SEC-M-02, SEC-L-05, SEC-I-06 docs)](./t105-re-check-docs.md) | docs | Dmytro Hopko | S | T104 | done |
| T106 | [A card or form is kept only when its answer fits the turn budget; draft answers and links are inside the byte cap (N-1, N-2 code)](./t106-commit-pending-after-charge.md) | backend | Dmytro Hopko | XS | T105 | done |
| T107 | [Docs describe the bounds as they are, with the estimate marked and exclusions named (N-2 docs, N-3, N-4)](./t107-bounds-wording-final.md) | docs | Dmytro Hopko | XS | T106 | done |
| T108 | [The tool-answer cap's last fallback holds with links; docs name the pinned re-call (re-check F-1, F-2)](./t108-cap-fallback-and-pinned-recall-docs.md) | backend | Dmytro Hopko | XS | T107 | done |
| T109 | [Gateway calls require zero data retention; privacy and terms name the EU hosting and the US model transfer (SEC-I-03, owner option A)](./t109-zdr-and-eu-locations.md) | backend | Dmytro Hopko | XS | T108 | done |
| T110 | [ADR-0014, SAD, spec and ship docs record zero data retention and the EU hosting / US model transfer (owner option A)](./t110-zdr-eu-docs.md) | docs | Dmytro Hopko | XS | T109 | done |
| T111 | [Privacy and terms describe where processing happens without overclaiming; Sentry is listed (review Z-1..Z-6)](./t111-privacy-terms-transfer-wording.md) | frontend | Dmytro Hopko | XS | T110 | done |
| T112 | [Privacy and terms tables match §11 for Anthropic and disclose what Sentry receives (review W-1..W-4)](./t112-anthropic-location-and-sentry-disclosure.md) | frontend | Dmytro Hopko | XS | T111 | done |
| T113 | [Drop zero data retention from Gateway calls (Hobby plan) and state Anthropic's 30-day API retention](./t113-drop-zero-data-retention.md) | backend | Dmytro Hopko | XS | T112 | done |
| T114 | [T113 review follow-ups: qualified 30-day cell, ship docs without ZDR, Last updated October 16](./t114-t113-review-follow-ups.md) | frontend | Dmytro Hopko | XS | T113 | done |
| T115 | [propose_draft in the chat tolerates Haiku's Customer and profile arguments](./t115-propose-draft-in-the-chat-tolerates-haiku-s-custom.md) | backend | Dmytro Hopko | XS | T114 | done |
| T116 | [Chat instructions: pass the Customer as written, never move it to the sender profile](./t116-chat-instructions-pass-the-customer-as-written-nev.md) | backend | Dmytro Hopko | XS | T115 | done |
| T117 | [Router: changing an existing draft or invoice is not a drafting intent](./t117-router-changing-an-existing-draft-or-invoice-is-no.md) | backend | Dmytro Hopko | XS | T114 | done |
| T118 | [Eval report prints why each failing row failed](./t118-eval-report-prints-why-each-failing-row-failed.md) | backend | Dmytro Hopko | XS | T114 | done |
| T119 | [Router: only a saved invoice cannot be edited; changing the chat's draft card is drafting](./t119-router-only-a-saved-invoice-cannot-be-edited-chang.md) | backend | Dmytro Hopko | XS | T117 | done |
| T120 | [Chat draft tools: keep line positions, prefer the Freelancer's words, ask for the Customer in code](./t120-chat-draft-tools-keep-line-positions-prefer-the-fr.md) | backend | Dmytro Hopko | XS | T115 | done |
| T121 | [Chat instructions: no values from read tools, ask for the Customer as a question, say the match count](./t121-chat-instructions-no-values-from-read-tools-ask-fo.md) | backend | Dmytro Hopko | XS | T116 | done |
| T122 | [Docs and nits: integration on manual start in the test plans, AC refs, eval JSDoc, stray file](./t122-docs-and-nits-integration-on-manual-start-in-the-t.md) | docs | Dmytro Hopko | XS | T118 | done |
| T123 | [Draft tools: profile follows the Freelancer's words, own-profile notice checked, answered ids tested](./t123-draft-tools-profile-follows-the-freelancer-s-words.md) | backend | Dmytro Hopko | XS | T120 | done |
| T124 | [Chat instructions: the Customer named earlier in the Conversation is carried over; no false 'fills' promise](./t124-chat-instructions-the-customer-named-earlier-in-th.md) | backend | Dmytro Hopko | XS | T121 | done |
| T125 | [No-Customer form also asks the missing line values; own-profile answer carries the exact question](./t125-no-customer-form-also-asks-the-missing-line-values.md) | backend | Dmytro Hopko | XS | T123 | done |
| T126 | [Chat instructions and router: counts in digits, generic-looking names are searched, card edits need a card](./t126-chat-instructions-and-router-counts-in-digits-gene.md) | backend | Dmytro Hopko | XS | T124, T119 | done |
| T127 | [Router sees a code-built marker for a draft card or a draft in progress](./t127-router-sees-a-code-built-marker-for-a-draft-card-o.md) | backend | Dmytro Hopko | XS | T126 | done |
| T128 | [No-Customer branch: keep a partly written profile, resolve the currency like the resolver, log failures, ask every field](./t128-no-customer-branch-keep-a-partly-written-profile-r.md) | backend | Dmytro Hopko | XS | T125 | done |
| T129 | [Router marker wording and stripping; sender-profile match error path tested](./t129-router-marker-wording-and-stripping.md) | backend | Dmytro Hopko | XS | T127, T128 | done |
| T130 | [AC-05b accepts a request to choose; search before linking a named invoice](./t130-own-profile-partial-ac05b-ask-link-search.md) | backend | Dmytro Hopko | XS | T129 | done |
| T131 | [AC-05b scorer accepts only a real request; tests and instruction aligned with the owner decision](./t131-ac05b-scorer-request-only.md) | backend | Dmytro Hopko | XS | T130 | done |
| T132 | [AC-05b scorer: requests in Markdown pass; a stray question does not](./t132-ac05b-scorer-markdown-and-question.md) | backend | Dmytro Hopko | XS | T131 | done |

**Total:** 125 tasks, ~39 person-days (T32 is a review follow-up; T33–T41 are the presentation rewrite of 2026-10-13, ADR-0010; T42–T46, T47–T48 and T49 are its review round 16, 17 and 18 follow-ups; T50–T69 are the owner feedback revision of 2026-10-13, ADR-0011–0013; T70–T75 and T76–T77 are its review round 20 and 21 follow-ups; T78–T84 are the 2026-10-14 fixes, recorded under `_fixes/`; T85–T89 are the follow-ups of the docs/code consistency pass of 2026-10-14; T90–T93, T94–T96 and T97–T98 are the follow-ups of the ADR-0014 review of 2026-10-15, rounds 1–3; T99–T102, T103–T105 and T106–T108 are the follow-ups of its security review addendum, re-check and final review; T109–T112 are the owner's option A for model location and retention; T113 drops zero data retention, 2026-10-16, Hobby plan; T114 is its review follow-up; T115–T118 are the fixes from the first Haiku evaluation, 2026-10-16; T119–T122 are their review and second-evaluation follow-ups; T123–T124 the re-review follow-ups; T125–T126 the third-evaluation fixes; T127–T128 their review follow-ups; T129 the re-review notes; T130 the fourth-evaluation fixes; T131–T132 its review follow-ups).

**Owner gates outside `implement`:** T28 privacy wording review and the spec §8 terms-page question (before `ship`); the real-model evaluation run (T29 rows) and the read/issue load scenarios (pre-release).
