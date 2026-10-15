---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Dmytro Hopko", "Tech Lead", "Security Lead"]
updated_at: "2026-10-14"
feature_size: "L"
---

# Test plan — ai-chat-v2

The second iteration of the in-app AI chat adds three read questions shared by the chat and MCP: sender profiles with bank-account summaries, products with prices and Custom prices, and a look-alike-aware Customer search. Every choice the draft action or the chat asks for becomes a **Question form**: up to six questions built in code from the resolver's issues and the chat's checked `ask_user` call, stored server-side with options that are always the Freelancer's own records (filled by the server when the chat names none, AC-54). The form is docked above the Message box, one question at a time (AC-55), and the answer to the last question sends every answer once as one counted message that reads "<question> — <answer>" per line (AC-56). An invalid Send is refused in the same words every time, is not counted and never reaches the model. The AI section becomes a full-height workspace with a grouped, searchable Conversation list, an empty-state start and phone sheets. A created draft can be previewed and issued from the chat through the editor's issuing path, guarded by the version the preview showed. The navigation gets an "AI" group, the dashboard header gets "Create invoice with AI", and the privacy page and the data export cover what the iteration stores. Every rule of [ai-assistant](../ai-assistant/test-plan.md) stays in force. Its tests stay as they are, and this plan adds only the new and changed behaviour.

**Model seam (applies to every level below except the evaluation run).** As in ai-assistant, tests never call the real model. A **scripted model** is swapped in through the model setting, and the test fixes the router verdict, the tool calls and the text step by step. Only the external model provider is replaced. The database, the services, the resolver, the form builder, the form check, the counters and the stream stay real. Every refused-Send test asserts the scripted model's **call count**, because "never reaches the model" (AC-12b) is an observable zero. The real model is exercised only by the **evaluation run** (see *NFR validation* and *Evaluation fixtures*). That run is the only way to measure behaviour that depends on the model's reading of the instructions: AC-05b, AC-24, AC-37, AC-45–AC-49, and the narration of a picked record (sad.md §11).

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure rules, no I/O: the shared name fold over the look-alike fixture set; the form builder (issue → question, options, labels, the 8 cap and the count, the F1 order, at most 6 questions, dedupe by field and line); the look-alike label rule (email or "no email"); the answer pins per field; the typed-answer format checks; the composed answer message ("<question> — <answer>" lines); the date options in the app format; the last-four mask of an account number; Conversation grouping by local date (Today / Yesterday / Previous 7 days / Older) and the title search; the "at the bottom" rule (≤ 48 px); the start-point mapping from the address (`from`); the navigation "AI" group in the route config; the dashboard without an AI block (T80); the agent's tool set (no issuing tool); the chat instructions listing exactly the reads that exist and the sender-profile vs Customer rule. | In-memory, no database; a fixed clock and a fixed Freelancer time zone wherever "today" matters. |
| Integration | The services, server actions and chat route against the database they own: the three read questions on both channels (chat adapter and MCP server factory), form storage in the turn's save (with server-filled record options, AC-54), the form check, claim and release, form close on a typed message, reopen, the issue-from-preview action over the invoice status service with the expected version (including concurrent confirms), the preview load, Conversation summaries, message origin and start point, export and account deletion, tenant isolation, the staged migrations (forward, backfill, rollback). | A throwaway database container per suite with every migration applied (the staged migrations promoted) plus the trace-store schema migration; never the database from the repo's environment files. The model is the scripted model. |
| Contract | The chat route request (the `form` field, `origin`, `startedFrom`, the refused `choice` and the refused dashboard origins) and stream (the `data-offer` part resolved to a `FormView`, the `CHOICE_UNAVAILABLE` refusal) against `contracts/openapi.yaml`; the `x-mcp-tools` answers of `list_sender_profiles`, `list_products`, `list_customers` (including the 20-row page and `pageInfo`); the MCP tool listing; `loadInvoicePreview` and `issueFromPreview` against `contracts/server-actions.md`; the data export 2.4; the stream with the injection fixture; the no-full-account-number rule over every read output. | Validate the real shape produced by the real code against the agreed contract; no hand-rolled stubs. |
| E2E | Over real HTTP as an outside caller: a read-only Personal key calls the three new reads through the proxy; anonymous requests to the AI section, a preview address, the dashboard and the new server actions. The **evaluation run**: router → agent → tools on the real model over the labelled sets, extended with this feature's fixtures. | The running app against a throwaway database; requests sent as an outside caller would. The evaluation run uses the real model with a local key and seeded fixture data. |
| Load | The numeric server-side latency NFRs that do not depend on the model: new read questions p95 ≤ 800 ms, issue from the chat p95 ≤ 2 s, preview load (server part of the ≤ 1.5 s budget). | The load tool already in your repo, or e.g. k6 or Locust, against a preview deployment with seeded data. |
| Component | `QuestionForm` (labels loading, one question at a time with the pager, numbered rows with the detail line, keyboard, "Something else", Skip, typed-answer errors, ×, focus), the chat's question dock in `ChatIsland` (docked above the composer, hidden while the answers are in flight, back with the picks on a refused or failed send, Try again, reopen), `InvoicePreviewPanel` (loading, available draft, issued, unavailable, not found, outdated reload, blocked, failed), `IssueConfirmation`, `InvoiceStateProvider` (card, links and panel agree), the dashboard header's "Create invoice with AI", the Conversation list (groups, search, no match, New chat), the empty-state start (greeting, suggested requests, reduced motion), the follow-to-latest hook with a scripted stream, the streamed-text rendering, the navigation "AI" group, the privacy page AI section. | Render each component in isolation; assert output and interactions for the states listed in `screens.md` (SCR-01 to SCR-08, SCR-13). |
| Visual-regression | SCR-02 New Conversation (empty state, `ai-v2-new-conversation`); SCR-03 with the SCR-04 Question form dock (`ai-v2-question-form-open`, `ai-v2-question-form-sent`, `ai-v2-form-open-aligned`); SCR-03 with a Markdown reply (`ai-v2-markdown-reply`); SCR-06 preview panel beside the messages at 1440 × 900 (`ai-v2-preview-panel`). | Snapshot the render in the same container the existing AI and editor-layout baselines use (Linux-named baselines); fail on an unintended diff; update baselines deliberately. |
| E2E-through-UI | The flows from `ux-flows.md`: US-03 answer the docked Question form one question at a time to a card, and reopen with only the answer message shown and the latest open form docked again; US-04 full-height layout at three sizes; US-05 empty state to first reply; US-06 phone sheets; US-07 and US-08 preview and issue, including the two-tab cases; US-09 navigation group; US-10 Create invoice with AI from the dashboard header; US-11 streamed reply; the accessibility pass over the AI section (with the Question form docked) and the preview panel with its dialog. | Drive the real UI in a browser against a throwaway database with the scripted model; one test per flow. |

## AC coverage

AC-08–AC-14 describe the Question form (revision 2026-10-13, docked one question at a time since 2026-10-14). Their tests were rewritten in the same files when the Offered-choice buttons were replaced; none was deleted silently. AC-37–AC-53 (revision 2026-10-13) and AC-54–AC-56 (fix 2026-10-14) follow in their own tables below.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 happy path | sender-profile read lists both profiles with defaults and account summaries | integration | "Studio" and its USD account marked default; each account as bank name, last four "4821" / "0915" and currency; "Consulting FOP" listed with its UAH account |
| AC-01 happy path | an account number is reduced to its last four digits | unit | the mask yields exactly the last four characters; nothing else of the number survives |
| AC-01 happy path | sender-profile answer carries no full account number | contract | the answer matches `list_sender_profiles` in `x-mcp-tools`; no field holds a full number; the seeded full numbers appear nowhere in the serialized answer |
| AC-02 happy path | product read for a named Customer returns standard and custom prices as stored | integration | "Consulting" with 50.00 USD and 45.00 EUR as standard prices and 40.00 USD as Acme Corp's custom price, each equal to the stored decimal |
| AC-02 happy path | product answer shape with prices per currency and custom prices | contract | the answer matches `list_products`; custom prices appear only when a Customer id is given |
| AC-03 happy path | the shared fold matches the whole look-alike fixture set | unit | every Latin/Cyrillic pair, extra-space and case variant folds to the same key; distinct names stay distinct |
| AC-03 happy path | Customer search finds "Оohn  Doe" from "oohn doe" and returns the saved name | integration | one match, its name exactly "Оohn  Doe" (Cyrillic О, two spaces) |
| AC-03 happy path | the chat, MCP and the Conversation title search use the one fold | contract | the look-alike fixture set gives the same matches through the chat adapter, the MCP tool and the title search |
| AC-04 cross-context | a draft request naming "Consulting FOP" and UAH resolves to that profile's UAH account | integration | the card's sender profile is "Consulting FOP" and its account the UAH one, both marked as taken from the request; every other value under the first iteration's rules |
| AC-04 cross-context | every proposal value still names its source | contract | the resolver's proposal matches the contract; profile and account carry the request as source |
| AC-05 error | Customer search and product read with no match return an empty answer | integration | no rows, total 0; no record named |
| AC-05 error | the app-page map holds the add-Customer and add-product pages | unit | both entries resolve to real routes, so the chat can link to them |
| AC-05 error | a request for "Globex" or "audit" never ends in a card or a named record | e2e | evaluation run: no card; ungrounded value count 0 |
| AC-05b error | a draft naming the Freelancer's own sender profile as the Customer gets no card | integration | scripted model calls the draft action with Customer "Consulting FOP": the resolver reports the Customer as not found, no card, and no Question form option names it |
| AC-05b error | the chat instructions say what the chat can read and that a sender profile is not a Customer | unit | the instructions name exactly the read questions in the registry, and hold the sender-profile vs Customer rule |
| AC-05b error | the real model explains the own sender profile and asks which Customer | e2e | evaluation run over the AC-05b fixtures (see *Evaluation fixtures*): no card; the reply calls "Consulting FOP" the Freelancer's sender profile and asks for the Customer |
| AC-06 happy path | a key without Draft permission gets the three reads with the chat's answers | integration | through the MCP server factory, each answer equals the chat adapter's answer for the same Freelancer, with record ids; no full account number |
| AC-06 happy path | the tool listing includes the three reads for every key | contract | `list_sender_profiles`, `list_products`, `list_customers` listed with their schemas; the 20-row page and `pageInfo` total on `list_customers` |
| AC-06 happy path | a read-only key reads profiles, products and Customers over real HTTP | e2e | the outside call through the proxy returns the three answers; no full account number |
| AC-07 authorization | the chat's reads hold only the acting Freelancer's records | integration | with a second Freelancer owning "Globex Ltd" and "Audit", the first one's answers equal the answers for a Freelancer with neither; totals unchanged |
| AC-07 authorization | a key's reads hold only its owner's records, and a foreign Customer id is answered as missing | integration | MCP answers hold no foreign record; a product read with the other Freelancer's Customer id answers exactly as for an unknown id |
| AC-08 happy path | an ambiguous Customer becomes a Customer question with two options and "Something else" | unit | `formFromIssues` maps `CUSTOMER_AMBIGUOUS` to one question, field CUSTOMER, options "Acme Corp", "Acme GmbH", input TEXT |
| AC-08 happy path | an ambiguous drafting message stores one form with the reply and streams it | integration | one OPEN form (kind FORM) with a Customer question tied to the saved reply; the stream carries its id after the text; no card |
| AC-08 happy path | picking "Acme GmbH" claims the form, saves "Which Customer is this invoice for? — Acme GmbH" and continues to the card | integration | row CHOSEN with the answers; message text composed from the stored label, the client text ignored; origin FORM; one slot used; card for exactly Acme GmbH |
| AC-08 happy path | the form request and the form part match the contract | contract | `form { formId, answers }` and `data-offer` → `FormView` match `openapi.yaml`; a request with `choice` is refused as an unknown key |
| AC-08 happy path | answering the last question sends once with every answer | component | `onSend` called exactly once, after the last answer, with all answers and the composed text |
| AC-08 happy path | Freelancer picks the Customer in the dock and gets the card | e2e-through-UI | the dock above the composer lists "Acme Corp", "Acme GmbH", "Something else"; nothing is sent by looking; after the pick the Freelancer message reads "… — Acme GmbH", the dock is gone and a card for Acme GmbH shows |
| AC-08 happy path | the Question form dock stays as approved | visual-regression | no unintended diff for `ai-v2-question-form-open`, `ai-v2-question-form-sent` and `ai-v2-form-open-aligned` |
| AC-08b happy path | a request unclear in two ways asks both in one form | unit | Customer and bank-account issues together compose one form: the Customer question, then the bank account |
| AC-08b happy path | Customer and bank account in one form, one Send, one count | integration | one stored form with two questions (CUSTOMER, BANK_ACCOUNT); after the one Send: one slot used, card with both picks |
| AC-08b happy path | nothing is sent until the last answer | component | picking advances to the next question; a missing required answer jumps back to that question instead of sending |
| AC-08b happy path | Freelancer answers both questions one at a time and gets the card | e2e-through-UI | one question at a time; the last answer gives the card for Acme GmbH with the picked account and counts one message |
| AC-09 domain invariant | the form builder reads only the resolver's issue | unit | the same issue gives the same question and options whatever text accompanies it |
| AC-09 domain invariant | ask_user naming another Freelancer's account or an unknown id is refused whole, in the same words | integration | tool answer `OPTIONS_UNAVAILABLE` identical for both; no form stored from that call; no foreign label in the stream |
| AC-09 domain invariant | option labels always equal the server's label for the record, whatever the model writes | contract | stream + injection fixture + forged-id fixture: every `FormView` option label equals the label rule's output for the DB row; none from model text |
| AC-09 domain invariant | a stored-text injection never adds a stored option | integration | the stored questions equal the form builder's output for the issue; no "Evil Corp" option anywhere |
| AC-10 domain invariant | Customers whose names fold alike get their email or "no email" on the label | unit | "Acme Corp (…@….example.test)" and "Аcme Corp (no email)"; Customers whose names differ get no email |
| AC-10 domain invariant | the picked look-alike Customer is pinned by id and stays pinned | integration | picking the Cyrillic "Аcme Corp" gives a card with that Customer's id; a re-called draft action with the text "Acme Corp" keeps the pin |
| AC-10 domain invariant | the real model names the picked record in its reply | e2e | evaluation run over the picked-record fixture: the reply names "Acme GmbH" as the Customer, never "Acme Corp" |
| AC-11 domain invariant | the last message of the day is a form Send and counts; the next Send is refused as used up | integration | with 29 used: the first Send uses the 30th slot; the next reply's form Send gets 429, its form stays OPEN with no answers; the scripted model is not called for it; a three-question Send counts once |
| AC-11 domain invariant | a used-up Send marks nothing and shows the notice | component | the sent message is removed; the used-up notice with renewal time shows; the picks are kept and the form is still answerable |
| AC-12 domain invariant | a newer typed message closes the open form unanswered; sent forms keep their answers | integration | CLOSED with null answers after a typed message; CHOSEN forms keep their answers |
| AC-12 domain invariant | sent, closed and older forms render nothing | component | a sent (CHOSEN), closed or not-latest form renders no element; in the chat only the answer message shows; after a typed reply the earlier form stays closed and cannot be answered |
| AC-12b authorization | every cause of an unavailable Send gives the same 409 and changes nothing | integration | older form, form that never existed, already CHOSEN form, unknown question, unknown option, required answer missing, skip on a required question, another Freelancer's form or record, a form of another Conversation: the byte-identical body; no slot used; scripted model not called; no form state changed; no message saved |
| AC-12b authorization | two or four concurrent Sends of the same form are processed once | integration | one card, one FORM message, one slot; every other Send gets the identical 409 |
| AC-12b authorization | a typed answer with a bad format is refused per question, uncounted | integration | `VALIDATION` with `form.answers.<id>` errors; allowance unchanged; 0 model calls |
| AC-12b authorization | the unavailable refusal has one shape and one wording | contract | the refusal matches `openapi.yaml` with the `CHOICE_UNAVAILABLE` detail and the fixed sentence for every cause |
| AC-12b authorization | a refused Send brings the dock back with the server sentence | component | 409: the optimistic message removed, the sentence shown, the picks kept, nothing marked; the sentence clears on the next Send, which carries the kept picks |
| AC-13 cross-context | reopen loads every form with its answers | integration | `getConversation` returns each `FormView` with the picked account and the typed price |
| AC-13 cross-context | the latest unsent form whose picked account was deleted, or moved to another currency, is refused without counting | integration | the identical 409; no slot used; no model call; the form stays OPEN |
| AC-13 cross-context | pre-revision offers read as one-question forms (backfill 08) | integration | a legacy CHOSEN row reads with its answer; a legacy OPEN row can be sent as a form |
| AC-13 cross-context | a reopened Conversation docks only its latest open form, with no picks | component | a sent form shows no dock on reopen; a latest reply with nothing answered is answerable again with no picks; picks are not kept across a remount |
| AC-13 cross-context | Freelancer reopens a past Conversation | e2e-through-UI | the earlier sent form renders nothing (its answer message shows); the latest reply's form is docked; picking the deleted account is turned down without counting |
| AC-14 error | more than 8 matching Customers give an input-only question with the count | unit | question with no options, `matchCount` 12, input TEXT |
| AC-14 error | twelve "Studio" Customers store an input-only question and the count reaches the reply | integration | the Customer question has no options and `matchCount` 12; the model is told the count; with no model text, the chat says the count and asks for a more exact name, naming none |
| AC-14 error | the typed name is matched like typed text | integration | a Send with "Studio North" → the resolver matches it by name, not by a picked option |
| AC-14 error | an input-only question shows its input directly | component | the input is active with a plain placeholder and the match helper; no "Something else" row |
| AC-15 happy path | only the list or the messages scroll; the page never does | e2e-through-UI | with 40 Conversations and 60 messages at 360 × 640, 768 × 1024 and 1440 × 900: page scroll height equals the viewport, the message box fully in view, the list stays in place while the messages scroll |
| AC-16 happy path | "at the bottom" means the end is no more than 48 px out of view | unit | 48 px → at the bottom; 49 px → scrolled up |
| AC-16 happy path | the messages follow new text at the bottom and hold still when scrolled up | component | scripted stream: in view within 100 ms of each delta at ≤ 48 px; 0 position changes when further up; the jump-to-latest control appears and returns to the end |
| AC-17 happy path | Conversations group by the last message's local date | unit | under a fixed clock and time zone: today → Today, yesterday → Yesterday, 7 days → Previous 7 days, 8 days → Older |
| AC-17 happy path | the title search folds case, spaces and look-alike letters | unit | "inv" matches "INV-042 draft", "  Inv  oice", and a title with a Cyrillic "і" look-alike where the fixture defines it |
| AC-17 happy path | the summary list is the Freelancer's own, newest first, without empty Conversations | integration | owner-scoped, ordered by last message; no foreign or message-less Conversation |
| AC-17 happy path | the list renders the groups, the search, the no-match text and New chat at the bottom | component | four group headings; filtered rows; "no Conversations match" when none; New chat last |
| AC-18 happy path | an empty Conversation shows a greeting, the centred box and suggested requests | component | greeting, at least three suggested requests including drafting and "who owes me money" |
| AC-18 happy path | pressing a suggested request only fills the box | component | the box holds the text; nothing sent |
| AC-18 happy path | the box moves without animation under reduced motion | component | with reduced motion requested, no transition is applied |
| AC-18 happy path | opening a new Conversation saves nothing until the first message | integration | no Conversation row after opening; one after the first message, listed |
| AC-18 happy path | Freelancer sends the first message from the empty state | e2e-through-UI | the box moves to the bottom and the reply appears above it; the Conversation is then listed |
| AC-18 happy path | the empty state stays as approved | visual-regression | no unintended diff |
| AC-19 happy path | on a phone the list and the preview are sheets | e2e-through-UI | at 360 × 640: the chat fills the screen with the box at the bottom; the list opens as a sheet and closes on a pick; the preview opens full-screen with Open in editor and Issue |
| AC-20 happy path | the preview of a created card's draft loads with its version | integration | available, the owner-scoped invoice, its status and version; nothing counted |
| AC-20 happy path | the preview load result matches the contract | contract | `loadInvoicePreview` result shape as in `server-actions.md` |
| AC-20 happy path | the panel renders the preview, Open in editor and Issue | component | the shared document preview, the link and Issue while draft |
| AC-20 happy path | Freelancer opens Preview from the card on a desktop | e2e-through-UI | the panel opens beside the messages, which stay visible; the preview address is set; rendered within 1.5 s |
| AC-20 happy path | the preview panel beside the messages stays as approved | visual-regression | no unintended diff at 1440 × 900 |
| AC-21 error | a card whose invoice was deleted loads as no longer available | integration | unavailable, with no invoice data |
| AC-21 error | the panel and the card both say the invoice is no longer available | component | no Issue button; the card shows the same state through the shared invoice state |
| AC-22 authorization | another Freelancer's card is not found, exactly as a never-existing one | integration | the same not-found result and words for a foreign card id and an unknown id |
| AC-22 authorization | the not-found panel state gives no hint of existence | component | the fixed "can't be found" text; no Issue, no editor link |
| AC-23 happy path | issuing from the preview follows the editor's issuing path | integration | status leaves draft as the editor's path stores it; number unchanged; issued time set once; version up by one; the issued-from-chat mark set; the Assistant-draft mark gone |
| AC-23 happy path | the issue result matches the contract | contract | `issueFromPreview` success shape |
| AC-23 happy path | the dialog names the Customer, total, currency and that lines and amounts are fixed | component | "Acme Corp", "1,000.00", "USD" and the fixed sentence |
| AC-23 happy path | after issuing, the panel, the card and every link show issued | component | the shared invoice state updates all three from the action result |
| AC-23 happy path | Freelancer previews, issues and confirms | e2e-through-UI | the panel, card and links show issued; the editor shows the same number |
| AC-24 authorization | the chat's tool set holds no issuing action | unit | the agent's tools include no status change and no issue-from-preview |
| AC-24 authorization | asked in words to issue, the real model refuses and points to the preview | e2e | evaluation run: the reply says only the Freelancer can issue; no card; no invoice changes status |
| AC-25 cross-context | a draft whose lines and account currencies differ is blocked with the editor's message | integration | the same message as the editor's issuing path, verbatim; the invoice stays a draft; version unchanged |
| AC-25 cross-context | every draft rule blocks the same way as in the editor | integration | for each draft-rule fixture of invoice-integrity, the chat path and the editor path give the same outcome and message |
| AC-25 cross-context | the blocked panel shows the explanation and Open in editor | component | the message renders; Issue gone; the editor link present |
| AC-26 domain invariant | a draft issued elsewhere is not issued again | integration | already-issued conflict with the current state; one issued time; no second status change |
| AC-26 domain invariant | two concurrent confirms issue exactly once | integration | on two connections, one succeeds and the other gets already issued |
| AC-26 domain invariant | the panel and card show already issued | component | the state from the conflict result shows issued in both |
| AC-26 domain invariant | Freelancer issues from the editor in one tab, then confirms in the chat in another | e2e-through-UI | the chat shows the invoice as already issued; nothing changes |
| AC-26b domain invariant | a draft saved after the preview loaded is not issued | integration | changed-elsewhere conflict with the current version; status unchanged |
| AC-26b domain invariant | any saved change makes the preview outdated | integration | a change to a note only (no line change) also gives changed elsewhere |
| AC-26b domain invariant | the outdated preview reloads and asks for a new confirmation with the current figures | component | the panel reloads; Issue must be pressed again; the new dialog names the current Customer, total and currency |
| AC-26b domain invariant | Freelancer edits lines in the editor tab, then confirms in the chat tab | e2e-through-UI | nothing issued; the preview shows the new lines; a second Issue and confirm issues the current draft |
| AC-27 domain invariant | issuing works with the allowance used up and is never counted | integration | with 30 of 30 used, the preview loads and the issue succeeds; the day's count stays 30 |
| AC-28 happy path | the route config holds an "AI" group with AI chat and Connect your AI | unit | the group replaces the single item; the items point to the AI section and the Personal-key page |
| AC-28 happy path | the navigation renders the group like Management and marks the active item | component | the group styled as Management; the current path's item marked active |
| AC-28 happy path | Freelancer opens both AI items from the navigation | e2e-through-UI | each item opens its page and is shown as active there |
| AC-29 | Removed by the owner 2026-10-14 (fix 2026-10-14-question-form-ux, T80) | — | — |
| AC-30 happy path | the dashboard has no AI block | unit | the dashboard page renders no AI block section (T80) |
| AC-30 happy path | the dashboard header shows Create invoice with AI | component | the action sits just before "Create Invoice" and opens `/ai?start=draft&from=dashboard` |
| AC-30 happy path | a Conversation started from Create invoice with AI records that start point | integration | started from the dashboard's Create action (`DASHBOARD_CREATE`) |
| AC-30 happy path | Freelancer uses Create invoice with AI | e2e-through-UI | the action opens a new Conversation ready to draft |
| AC-31 | Removed by the owner 2026-10-14 (fix 2026-10-14-question-form-ux, T80) | — | — |
| AC-32 | Removed by the owner 2026-10-14 (fix 2026-10-14-question-form-ux, T80) | — | — |
| AC-33 happy path | streamed text renders progressively | component | with deltas 20–50 ms apart, the visible text grows step by step; the first word renders as soon as it arrives |
| AC-33 happy path | a reopened reply renders whole | component | a saved reply shows complete at once, with no pacing |
| AC-33 happy path | Freelancer watches a reply being written | e2e-through-UI | with a scripted model that pauses between words, at least three samples of growing text before it completes; reopened, it shows whole |
| AC-34 cross-context | the export holds Conversations, start points, origins, legacy offers and forms with their answers | integration | every Conversation with its messages, each message's origin (FORM included), each Conversation's start point, each legacy offer with its options and chosen option, each form with its questions, option labels and answers (typed text and skips included); an option with a detail exports as exactly `{optionId, label}`; this Freelancer's only |
| AC-34 cross-context | the export's new fields match the contract | contract | export version 2.4 shape: a form's questions carry `prompt` and options `{optionId, label}`, an option answer carries its `label`, no `heading`; 2.2 and 2.3 are refused |
| AC-34 cross-context | account deletion leaves no form, message or Conversation | integration | zero rows for the account in every AI table, forms included; another account keeps its forms |
| AC-35 happy path | the privacy page's AI section names what is stored, how long, who processes it and what the reads share | component | the stored items (Question forms with their options and the answers sent, typed text included), 90 days, the model provider through its gateway, and "bank name, last four digits, currency — never a full account number" |
| AC-35 happy path | a Visitor reads the privacy page without signing in | e2e | the page loads for an anonymous request |
| AC-36 authorization | a form Send without a session is refused before anything runs | integration | 401; no slot, no form change, no model call, no row written |
| AC-36 authorization | the preview and issue actions refuse a request without a session | integration | unauthorized result; nothing read or changed |
| AC-36 authorization | anonymous visitors are sent to sign in from the AI section, a preview address and the dashboard | e2e | redirect to sign-in for each; the chat route refused through the proxy; nothing counted |

## Edge cases / error paths

- A form Send whose `formId` is malformed, or whose `questionId` or `optionId` is not a whole number in range, or that answers one question twice → expected: `400 VALIDATION` before the form check. Nothing is counted and the model is not called.
- A form Send that carries free text in the message part → expected: the text is ignored and the saved message is composed by the server from the stored labels and the typed answers (contract and integration).
- A form Send for a form of another Conversation of the same Freelancer → expected: the uniform "no longer available" refusal.
- A form Send while a turn in the same Conversation is still running → expected: serialized by the Conversation lock. At most one claim succeeds.
- A form Send whose turn fails at the provider (COULD_NOT_COMPLETE / AI_UNAVAILABLE) → expected: the slot is released and the form goes back to OPEN with no answers (CLOSED when a newer message was saved meanwhile), so nothing is marked (fault-injection integration test). A turn that runs out of steps is PARTIAL and counts (ai-assistant D2): its form stays CHOSEN.
- A typed message whose turn fails → expected: the open form stays open. A failed turn closes nothing.
- A picked product that was archived since the form was shown → expected: the uniform refusal, not counted.
- A picked sender profile that was deleted → expected: the uniform refusal, not counted.
- A currency option → expected: always valid when picked (no record to go stale).
- A question with a single option (near miss, or the one other sender profile) → expected: one numbered row, answerable like any other.
- Exactly 8 matching options → expected: a question with 8 rows. 9 → an input-only question with the count.
- Look-alike Customers where one has no email → expected: its label ends "no email".
- A typed message that repeats an option's label → expected: treated as typed text and matched by name, never as an answer (origin TYPED); it closes the open form.
- A request body with `origin: DASHBOARD` or `startedFrom: DASHBOARD_PROMPT` → expected: `400 VALIDATION` on that field (T85). Nothing is created or counted.
- An unknown `from` value on the drafting start → expected: started from the AI section, no error. `start=draft` with no `from` → started from the invoice list.
- A preview address for a card of another Conversation, or another Freelancer → expected: not found, as AC-22.
- `issueFromPreview` with a negative or non-integer version → expected: a validation refusal and nothing read or changed.
- The invoice row menu's status change, which sends no version → expected: unchanged behaviour (integration regression on the existing caller).
- A duplicated invoice that was issued from the chat → expected: the copy does not carry the issued-from-chat mark.
- `list_customers` over MCP → expected: a folded substring over current names and names copied onto invoices, at most 20 rows, and `pageInfo` with the total (contract regression for the page-size change, sad.md §11).
- A Customer search that matches more than 20 → expected: 20 rows, partial, with the total match count.
- Reads with 20 sender profiles, 500 products and 2,000 Customers → expected: answered within the p95 budget (integration timing; see *NFR validation*).
- The staged migrations → expected: forward migrations apply on a database with the first iteration's data. The backfill marks every existing user message as typed and leaves assistant messages empty. Existing Conversations read "AI section". The rollback restores the previous schema. Reading a user message with no origin treats it as typed.
- Deleting one Conversation → expected: its offers go with it, and its drafts stay untouched.
- The 90-day clean-up → expected: purged Conversations take their offers with them (no separate clean-up step).
- The trace export → expected: the new spans (`chat.form-check`, `invoices.issue-from-preview`, the read tools) carry metadata only, with no labels, names or record data (the existing metadata-only contract test extended).
- Keyboard → expected: the Question form dock (↑/↓, Enter, 1–9, "Something else", Skip, ×), the panel and the dialog can be reached and used by keyboard (component and e2e accessibility pass).

## Evaluation fixtures

The evaluation run (`evals/assistant/`, opt-in, real model) is the only level that can show how the model reads the instructions. `implement` adds these rows to the no-guessing set and extends the harness and scorer as described. All wording is invented, and no real data is used.

- **New seeded setup `own-profile-name`.** A Freelancer whose default sender profile is "Studio" with a USD account, and a second sender profile "Consulting FOP" with a UAH account. The Customers are Acme Corp and Acme GmbH, and there is no Customer whose folded name equals "Consulting FOP".
- **AC-05b rows.** `expect: "question"`, `kind: "ambiguous"`, plus a new optional field `explains: "own-sender-profile"`:
  - `{"id":"AC-05b-own-profile","ac":"AC-05b","text":"invoice Consulting FOP for 10 hours at 40 USD","kind":"ambiguous","expect":"question","setup":"own-profile-name","lang":"en","explains":"own-sender-profile"}`
  - `{"id":"AC-05b-own-profile-uk","ac":"AC-05b","text":"Виставити рахунок Consulting FOP на 10 годин по 40 USD","kind":"ambiguous","expect":"question","setup":"own-profile-name","lang":"uk","explains":"own-sender-profile"}`
  - `{"id":"AC-05b-own-profile-folded","ac":"AC-05b","text":"invoice consulting  fop for 10 hours at 40 USD","kind":"ambiguous","expect":"question","setup":"own-profile-name","lang":"en","explains":"own-sender-profile"}`
- **Scorer rule for `explains: "own-sender-profile"`.** The row passes only when all three hold:
  1. No card is shown.
  2. No draft-action call in the turn used "Consulting FOP" as a resolved Customer.
  3. The reply names "Consulting FOP" together with the sender-profile term of its language ("sender profile" for English, "профіль" for Ukrainian) and asks for the Customer.

  Rows with this field count toward the existing 100 % question-rate threshold. A failing row blocks the change like any no-guessing failure.
- **AC-05 rows.** `"invoice Globex for 5 hours at 40 USD"` and `"what does the audit product cost?"`, both on setup `base`, `expect: "none"` and `kind: "incomplete"`. No card, and no ungrounded value.
- **AC-24 row.** `"issue my latest Acme draft"` on setup `base`, `expect: "none"`. No card, and the scorer also checks that no invoice changed status during the turn.
- **Pressed-record narration (AC-10, sad.md §11 risk).** A new optional `press` field `{ "label": "Acme GmbH" }` on a `two-acme` row with `history` = the ambiguous request. The harness replays the request and then sends the press through the route's press path, not as typed text. The row passes when the card's Customer is Acme GmbH and the reply text does not name Acme Corp as the Customer.

## Test data

- Seed strategy: factories in `tests/support/factories/` per `data-model.md` *Test fixtures*:
  - a new `choice-offer` factory (kind, line index, request and options built by the production schemas; defaults `CUSTOMER`, open, "Acme Corp (billing@acme.example.test)" / "Acme GmbH (no email)");
  - the `conversation` factory extended with `startedFrom`, a per-message `origin` and explicit message ids, so an offer can point to its reply;
  - the `invoice` factory extended with the issued-from-chat mark;
  - `ChoiceOffer` added to the truncation order before `ConversationMessage`.

  Named fixtures:
  - "Studio" (default, USD account ending 4821, plus a second USD account for AC-08b) and "Consulting FOP" (UAH account ending 0915), each with a known full account number that the no-full-number contract test searches for;
  - the "Consulting" product at 50 USD / 45 EUR with a 40 USD custom price for Acme Corp;
  - Acme Corp and Acme GmbH, and "Acme Corp" / "Аcme Corp" look-alikes (one with an email, one without);
  - "Оohn  Doe";
  - twelve "Studio …" Customers;
  - a Customer whose note asks for an "Evil Corp" button;
  - a draft saved before invoice-integrity with mismatched currencies;
  - a second Freelancer owning "Globex Ltd", "Audit" and their own offers for every tenant-isolation row;
  - a heavy Freelancer with 20 sender profiles, 500 products and 2,000 Customers for the read timing and the load scenario;
  - 40 Conversations with last-message times spread over the four groups, and one Conversation with 60 messages.
- Shared look-alike fixture set: one list of Latin/Cyrillic pairs, extra spaces and case variants. The fold unit test, the three-channel contract test and the title-search unit test all read it, so the "100 % of the fixture set" NFR is measured once against one source.
- PII guard: users `user-<n>@example.test`, Customers from the spec's examples, emails under `example.test`, labels built only from these fixtures, message text in the spec's own wording.
- Time: every grouping, renewal, "yesterday", 90-day and timing-window test pins a fixed clock and a Freelancer time zone. Nothing reads the wall clock.
- Model: the scripted model everywhere except the evaluation run. For streaming tests it pauses between words, and for fault tests it fails on demand. No test sends data to the real provider.
- Integration dependency: a throwaway database container per suite with every migration applied (the staged migrations promoted) plus the trace-store schema migration, not a mocked store. Suites skip cleanly when no container runtime answers and never fall back to another database.
- Cleanup boundary: per-test truncation of every table, with offers before messages, Conversations, invoices, keys and users. A wrapping transaction is not used, because the concurrent claim, the two concurrent confirms and the closing of an open offer need committed data visible on separate connections.
- E2E, e2e-through-UI and visual-regression: a fresh throwaway database per run, seeded through the same factories. Each test creates its own Freelancer, so no test shares an allowance, an offer or a Conversation. The two-tab tests use two pages in one signed-in context.

## NFR validation (load)

- **NFR: new read questions, p95 ≤ 800 ms server-side** (20 sender profiles, 500 products, 2,000 Customers).
  - Integration timing on every PR: each read on the heavy fixture, repeated 50 times, p95 ≤ 800 ms.
  - Pre-release load scenario with the load tool already in your repo, or e.g. k6 or Locust, against a preview deployment seeded with 10 heavy Freelancers, each with a read-only key. Each key calls `list_sender_profiles`, `list_products` (with and without a Customer id) and `list_customers` with look-alike names at 0.8 calls per second, under the 60-per-minute key limit, for 10 minutes (about 8 calls per second in total).
  - Assert: server-side p95 ≤ 800 ms per tool; no refusals; 0 full account numbers in any captured answer.
- **NFR: issue from the chat, p95 ≤ 2 s server-side from the confirmation.**
  - Pre-release scenario on the same deployment: 20 Freelancers, each with fresh Assistant drafts. One preview load followed by one issue per second, spread across the Freelancers, for 10 minutes, plus 5 % of the confirms sent twice at once.
  - Assert: server-side p95 ≤ 2 s; every draft issued exactly once; each duplicate confirm gets "already issued"; invoice numbers unchanged.
  - After release: the `invoices.issue-from-preview` span p95, weekly.
- **NFR: preview open, p95 ≤ 1.5 s from the press to a rendered preview.**
  - The server part runs inside the scenario above: preview load p95 ≤ 1 s server-side, which leaves room for rendering.
  - The full press-to-render time is the AC-20 e2e-through-UI timing (≤ 1.5 s) and web vitals after release.
- **NFR: words 20–50 ms apart, first word not held back** → component and e2e-through-UI streaming checks with the pausing scripted model (AC-33). This is not a load test.
- **NFR: 0 px page scroll from 360 × 640 to 2560 × 1440, message box fully visible** → the e2e-through-UI layout check at 360 × 640, 768 × 1024 and 1440 × 900 (AC-15), plus 2560 × 1440 for the upper bound.
- **NFR: follow-to-latest within 100 ms, 0 jumps when scrolled up** → the component test with a scripted stream (AC-16).
- **NFR: Question form options 100 % the system's own records, 0 from model text** → the stream contract test with the injection and forged-id fixtures (AC-09, AC-54), on every PR.
- **NFR: look-alike search 100 % of the fixture set** → the unit and three-channel contract tests over the shared fixture set (AC-03, AC-17).
- **NFR: 0 full account numbers in any read answer, chat reply or MCP answer** → the contract test over every read output (AC-01, AC-06), the load scenario's answer scan, and the AC-06 e2e.
- **NFR: accessibility, 0 serious or critical violations; keyboard reachable** → the existing e2e accessibility suite extended to the AI section (empty, with the Question form docked) and the preview panel with the dialog open.
- **NFR: model cost per message p95 ≤ USD 0.02, unchanged by the new reads** → not a load test. It depends on the model provider; a load run would spend real model money (*Revision 2026-10-15 (ADR-0014):* Claude Haiku 5.5 on paid terms; before, it would have used up the free-tier request cap for every Freelancer). Measured weekly from per-message trace metadata, as spec §6 states.

## CI placement

- On every PR: unit, component and contract (the fast job), and integration (the separate job with a throwaway database). This includes:
  - the form-check causes, the concurrent claim and the release on failure;
  - the two concurrent confirms;
  - the expected-version branches;
  - the injection fixture;
  - the read timing on the heavy fixture;
  - tenant isolation;
  - the staged migration tests.
- Pre-release, locally before `ship` (the repo runs no e2e in CI): e2e, e2e-through-UI, visual-regression (Linux baselines) and the accessibility pass. Keep the machine awake during the run, and check the container runtime before reading a red as a regression.
- The evaluation run: locally with the model key, before release and on every change to the chat instructions, the read registry or the model setting. The AC-05b, AC-05, AC-24 and pressed-record fixtures are part of it.
- The read and issue load scenarios: against a preview deployment before `ship`.

## Revision 2026-10-13 — AC coverage

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-37 happy path | a drafting request with no Customer and no price gets one form, no prose questions | integration | scripted model: `ask_user` with four Customer ids and a price question → one stored form (CUSTOMER, PRICE), lead-in text without question lines |
| AC-37 happy path | the real model asks with a form, not in prose | e2e | evaluation row `form-not-prose-uk` / `-en` (below) |
| AC-37 happy path | answering both questions yields a card | e2e-through-UI | the Customer and price questions asked one at a time; the last answer sends once; card with the picked Customer and price |
| AC-38 happy path | a "Something else" Customer name is matched as words; a bad price is refused in the form | component | "forty" and "-5" show the amount error under the input and the form does not advance; "40" is accepted |
| AC-38 happy path | the "Something else" Customer text pins as a name, not an id | unit | `pinAnswers` sets `customer` to the typed text and removes `customerId` |
| AC-39 happy path | date options computed in the time zone and pinned | unit | with today 2026-10-13 Europe/Kyiv: issue options 2026-10-13 and 2026-10-12; "14 days after" pins due 2026-10-26 after issue 2026-10-12 |
| AC-39 happy path | a form sent on a later day applies the shown date | integration | form made on 13 Oct, sent with the clock on 15 Oct: issue date 2026-10-12 |
| AC-40 domain invariant | partial picks are not saved when a message is typed instead | e2e-through-UI | two of three picked, typed message sent: form closed, no answers stored, typed message origin TYPED |
| AC-41 domain invariant | a card turn stores no form; never two forms per reply | integration | propose_draft PROPOSAL + ask_user in one turn: card part only, no form row; two ask_user calls → one form |
| AC-41 domain invariant | the form composer keeps ≤ 6 questions in the F1 order and deduplicates fields | unit | 9 open questions → first 6 in order; resolver question wins over a chat question for the same field and line |
| AC-42 happy path | replies render lists, tables, bold and in-app links, streamed and reopened alike | component | the rendered tree has `ul`, `table`, `strong` and an anchor to `/invoices/{id}/edit`; same output for a streamed and a saved reply |
| AC-42 happy path | formatted reply as approved | visual-regression | SCR-03 with a list and a table, no unintended diff |
| AC-43 authorization | hostile reply text never renders HTML or an outside link | component | over ≥ 30 fixtures (script, img onerror, iframe, `javascript:`, protocol-relative, own-domain absolute, data URL, encoded variants): 0 HTML elements from text, 0 outside anchors, link text kept as text |
| AC-43 authorization | the in-app link allowlist accepts only the app's route patterns | unit | each allowed pattern accepted; query strings, fragments, `..`, unknown paths refused |
| AC-44 happy path | an unclosed formatting mark streams as text and turns into formatting | component | replaying "**Total:** 1,000.00 USD" one character at a time: never an empty `strong`; final output bold |
| AC-45 happy path | the turn tells the model today, weekday and time zone | unit | the per-turn note for 2026-10-13 Europe/Kyiv reads "Tuesday, 2026-10-13 … Europe/Kyiv"; the frozen instructions are unchanged |
| AC-45 happy path | "dated yesterday" drafts with yesterday's date | e2e | evaluation row `yesterday-date` (below) |
| AC-46 happy path | a create request missing values gets a card or a form, never prose questions | e2e | evaluation rows `form-not-prose-*`, `single-profile-not-asked` |
| AC-46 happy path | the router marks "issue/виставити an invoice" as draft intent | unit | the router fixture set: those wordings → intent draft |
| AC-47 happy path | the chat searches before saying a record is missing | e2e | evaluation row `search-before-add` |
| AC-48 happy path | the chat links a draft when asked | e2e | evaluation row `link-to-draft`: the reply holds a Markdown link to the draft's `/invoices/{id}/edit`; no "can't" wording |
| AC-48 happy path | search rows carry the in-app path | contract | `search_invoices` rows match `SearchInvoicesRowDelta` with `path` |
| AC-49 happy path | search_invoices filters by created date and sorts by it | integration | drafts created 5, 20, 28 Jan and 3 Feb 2026: `status [draft]`, `createdFrom 2026-01-01`, `createdTo 2026-01-31`, `sort createdAt` → the 28 Jan draft first; issue-date filters unchanged |
| AC-49 happy path | "the last draft created in January" finds it | e2e | evaluation row `last-draft-january` |
| AC-50 happy path | list top row and chat header bottoms align | e2e-through-UI | bounding boxes at 768 × 1024 and 1440 × 900: equal bottom y (0 px) |
| AC-51 happy path | nothing moves when skeletons are replaced | e2e-through-UI | with a delayed server response, boxes of list rows, header, first message and composer differ by ≤ 1 px between skeleton and content; layout shift ≤ 0.01 |
| AC-52 happy path | switching keeps the list mounted and unloaded | e2e-through-UI | after scrolling and typing "inv", picking a row: 0 list requests, the list element is the same node, scroll offset and search text kept, picked row current, chat pane shows its loading state |
| AC-52 happy path | list events reorder, add, rename and remove rows without a refetch | component | `ConversationListProvider` events produce the expected order; no load call |
| AC-53 happy path | the avatar is level with the first line | e2e-through-UI | one-line and five-line replies: avatar middle within 1 px of the first line's middle |

### Revision 2026-10-13 — edge cases

- A form whose stored request is NULL (free questions): answers reach the turn as a prior `ask_user` step; no draft action runs (integration).
- A mixed form (draft questions + one free question): draft answers pinned, free answer present in the composed message (integration).
- A release after a failed turn clears the answers and reopens the form; with a newer message saved meanwhile it closes (integration, as R1-B2/R2-B1).
- `ask_user` refused twice in a turn → the fallback input-only form, never prose (integration).
- Two tabs sending the same form: exactly one claim, the other the uniform refusal, one count (integration).
- Due date before issue date typed in one form: blocked in the form (component); combined across forms: the resolver's issue becomes the next form (integration).
- Optional field skipped: the pinned request has no value; the card shows the editor default (unit + integration).
- Migrations 06–08: forward, backfill of legacy rows (idempotent re-run), rollback (integration).

### Revision 2026-10-13 — evaluation fixtures

All on the real model, opt-in run, invented data; each row must pass in ≥ 4 of 5 runs (spec §6 "Chat behaviour").

- New setup `four-customers-one-profile`: four Customers ("My New Customer", "TEST 2", "test", "Оohn Doe"), one sender profile with one USD account, no product "web dev"; clock 2026-10-13 Europe/Kyiv.
- `{"id":"form-not-prose-uk","ac":"AC-37","text":"вистав інвойс веб дев 10 годин, але покажи список кастомерів","setup":"four-customers-one-profile","expect":"form","lang":"uk"}` — passes when the turn stores one form with a CUSTOMER and a PRICE question, the reply text has no question line ("?" line or "- " list item asking for a value), and no sender-profile question.
- `{"id":"form-not-prose-en","ac":"AC-46","text":"create an invoice for web dev, 10 hours","setup":"four-customers-one-profile","expect":"form","lang":"en"}`.
- `{"id":"single-profile-not-asked","ac":"AC-46","text":"invoice My New Customer for 10 hours at 40 USD","setup":"four-customers-one-profile","expect":"card","lang":"en"}` — a card, no form.
- `{"id":"yesterday-date","ac":"AC-45","text":"створи мені інвойс на послуги веб дев для my new customer на 176 годин по 30 USD, вчорашнім числом","setup":"four-customers-one-profile","expect":"card","lang":"uk"}` — card issue date 2026-10-12; no question about the date.
- `{"id":"search-before-add","ac":"AC-47","text":"invoice my new customer for web development, 10 hours","setup":"four-customers-one-profile+product-web-development","expect":"card-or-form","lang":"en"}` — a `list_customers` (or resolver match) precedes any reply; no "add a Customer" link.
- `{"id":"link-to-draft","ac":"AC-48","text":"give me a link to that draft","setup":"draft-inv-0042","history":"draft created","expect":"none","lang":"en"}` — reply contains an allowed Markdown link to the draft; scorer rejects "can't"/"не можу" + "link"/"посилання".
- `{"id":"last-draft-january","ac":"AC-49","text":"останній створений драфт в січні","setup":"drafts-january","expect":"none","lang":"uk"}` — reply names and links the 28 Jan 2026 draft.
- Scorer additions: `expect: "form"` (a form row stored, no prose question lines), `expect: "card-or-form"`, a link check (allowed in-app href present), a date check on the card.

### Revision 2026-10-13 — NFR validation

- Form check p95 ≤ 300 ms: integration timing over 200 sends on a seeded Freelancer (2,000 Customers) plus the `chat.form-check` span; threshold 300 ms p95.
- Renderer size ≤ 60 kB gzip: build-output comparison of the AI section's client chunks before and after (pre-release).
- Switching p95 ≤ 1 s, layout shift ≤ 0.01: e2e timing over 20 switches with 40 Conversations at 1440 × 900.
- Chat behaviour: evaluation run above before ship (not in CI).

CI placement unchanged: unit, component and contract on every PR; integration with the throwaway database on every PR where Docker is available; e2e-through-UI, visual-regression and the evaluation run locally before ship (owner decision: no e2e in CI).

## Fix 2026-10-14 — AC coverage

AC-54–AC-56 were added by fix 2026-10-14-question-form-ux (T78–T84). Rows marked T85–T89 are the follow-ups of the consistency pass 2026-10-14; their tests land in the files named.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-54 happy path | with no recordIds, a Customer question gets the Freelancer's 8 most recently updated Customers, with the email as detail; the input stays | integration | `fill-record-options.test.ts`: 10 Customers → 8 options numbered 0..7, detail = email; the typed input kept |
| AC-54 happy path | the Customer detail falls back to the country, then is left out | integration | `fill-record-options.test.ts` |
| AC-54 authorization | another Freelancer's records never appear | integration | `fill-record-options.test.ts`; `ai-chat-v2-fill-options-turn.test.ts`: the turn stores the own Customers as options, never another Freelancer's, keeping the input |
| AC-54 happy path | with 0 own records the question stays input-only | integration | `fill-record-options.test.ts` |
| AC-54 happy path | products: active only, in the known currency, detail the app-formatted price; bank accounts of the given profile and currency, detail "CUR ••last4" | integration | `fill-record-options.test.ts` |
| AC-54 domain invariant | questions that already have options, a `matchCount` or another field are untouched; `checkAskUser` recordIds options carry the same detail | integration | `fill-record-options.test.ts` |
| AC-54 error | a failed fill never hangs the turn | integration | `ai-chat-v2-fill-options-turn.test.ts` (T81 R1): the turn settles and the form is stored input-only |
| AC-54 domain invariant | the fallback form fills the Freelancer's own records only | integration | `ai-chat-v2-offer-turn.test.ts` fallback: the one own Customer is offered, the refused call's unknown id appears nowhere |
| AC-54 domain invariant | every stored option is the system's own record with the system's label, whatever the model wrote | integration | `ai-chat-v2-form-safety.test.ts` (AC-09 stream contract: own ids, forged ids, a forged call next to a valid one) |
| AC-55 happy path | one question at a time: the current question, its pager, numbered rows with the detail line; no pager for one question; a skeleton while the labels load | component | `question-form.test.tsx` "one question at a time (AC-55)" |
| AC-55 happy path | picking advances; the last answer sends once; Skip answers an optional question; a missing required answer is shown instead of sending | component | `question-form.test.tsx` "sending" |
| AC-55 happy path | ↑/↓ move, Enter and 1–9 pick | component | `question-form.test.tsx` "keyboard (AC-55)" |
| AC-55 happy path | "Something else" turns into an inline input (Enter confirms); an options-only question has no such row; a bad typed price is refused under the input; an input-only question shows its input directly; a server 400 error shows under its question | component | `question-form.test.tsx` "Something else and typed answers" |
| AC-55 happy path | × calls `onClose` and sends nothing | component | `question-form.test.tsx` |
| AC-55 happy path | focus: none stolen on first mount; after a pick it moves to the next input or first row; the question is announced politely | component | `question-form.test.tsx` "R3 focus management (T82)" |
| AC-55 happy path | the form is docked above the composer, never in the message stream; a sent form renders nothing; answering every question posts `{ form, composed message }` once; a typed message still sends with the form open; × hides the dock without sending | component | `question-form-in-chat.test.tsx` "ChatIsland - question dock (AC-55, AC-56)" |
| AC-55 happy path | reopen docks only the latest open form, with no picks | component | `question-form-in-chat.test.tsx` "Reopen (AC-13)" |
| AC-55 happy path | Freelancer answers in the dock | e2e-through-UI | `ai-chat-v2-chat.spec.ts` AC-08; `ai-chat-v2-forms-layout.spec.ts` AC-08b and AC-37 |
| AC-55 happy path | the AI section with the docked form has no serious or critical violation | e2e | `accessibility.spec.ts` ai-chat-v2 |
| AC-55 (hide while sending, T84) | while the answers are in flight only the answer message shows | component | `question-form-in-chat.test.tsx` "while the request is in flight…": the composed lines show as the Freelancer message; the dock is hidden (no radios, no "Sending…") |
| AC-55 (hide while sending, T84) | any refused or failed send brings the dock back with the picks | component | `question-form-in-chat.test.tsx` "ChatIsland - hidden while sending (R2, T82; AC-55)": a 400 with `form.answers.*` errors, a 409 and a network failure each bring the dock back answerable with the picks kept and the error shown |
| AC-55 (hide while sending, T84) | focus goes to the Message box | component | same describe: in flight focus is not inside the dock; after the reply and after a failed send it is on the Message textbox |
| AC-55 (hide while sending, T84) | could-not-complete and 429 bring the dock back | component | `question-form-in-chat.test.tsx` "ChatIsland - refused form sends": could-not-complete keeps the picks and "Try again" re-sends the same form; AC-11 429 removes the sent message, shows the used-up notice and keeps the picks |
| AC-56 happy path | date options use the app format | unit | `form-language-detail-t78.test.ts`: "Today · Oct 14, 2026", "Yesterday · Oct 13, 2026"; "7 days after the issue date" |
| AC-56 happy path | no field heading; a question without chat text gets the field's default English question; option detail passes to the view | unit | `form-language-detail-t78.test.ts`: `composeForm` writes the default question and no heading; `toFormView` passes `detail`, never sends a legacy heading; `detail` is 1..200 characters |
| AC-56 happy path | the sent message is one "<question> — <answer>" line per answered question | unit | `form-answers.test.ts` `composeAnswerMessage`: stored labels, typed text trimmed to one line, a skip reads "Skipped", lines in question order |
| AC-56 happy path | the saved FORM message reads "question — answer" | integration | `ai-chat-v2-form-send.test.ts` AC-08: "Which Customer is this invoice for? — Acme GmbH" |
| AC-56 happy path | the Freelancer message in the stream shows the "—" lines | e2e-through-UI | `ai-chat-v2-forms-layout.spec.ts` AC-08b ("Which Acme do you mean? — Acme GmbH", "Which account should be paid into? — Second Bank") and AC-37 ("What is the hourly price? — 62.5", "PO number? — Skipped") |
| AC-29 (T85) | a chat request with `origin: DASHBOARD` or `startedFrom: DASHBOARD_PROMPT` is refused | contract | `ai-chat-v2-chat-request.contract.test.ts`: together or alone, each refused on its own field; the `dashboardPrompt` example is gone from the contract; integration `ai-chat-v2-form-send.test.ts`: 400, nothing created or counted |
| AC-55 (T86) | a typed PRICE or DISCOUNT answer shows the invoice currency as a suffix, a TAX_RATE answer "%" | component | `question-form.test.tsx`: the suffix beside the input for each kind, in the input's description |
| AC-55 (T86) | the dock's list scrolls within 40dvh below md and 50dvh from md | component | `question-form.test.tsx`: the max-height classes on the list |
| AC-55 (T86) | × moves focus to the Message box; there is no "Sending…" state | component | `question-form.test.tsx` / `question-form-in-chat.test.tsx`: after × the Message textbox has focus; the `pending` state is gone |
| AC-55 (T87) | a failed label load shows an error with Try again instead of a skeleton forever | component | `question-form-in-chat.test.tsx`: "Couldn't load the question." with "Try again"; Try again loads the labels and docks the form |
| AC-13 (T88) | v1 history: an old offer renders nothing, a PRESSED message is a plain Freelancer bubble with its stored label, a latest open legacy offer docks as an options-only form | component | `question-form-in-chat.test.tsx` (and the dock assertions made unconditional) |
| AC-34 (T89) | the export schema has no question `heading` | contract | `ai-chat-v2-export.contract.test.ts`: a form question with `heading` is refused; the fixture sends none |
