---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Dmytro Hopko", "Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
---

# Test plan — ai-chat-v2

The second iteration of the in-app AI chat adds three read questions shared by the chat and MCP: sender profiles with bank-account summaries, products with prices and Custom prices, and a look-alike-aware Customer search. Every choice the draft action asks for becomes an **Offered choice**: a button built in code from the resolver's issue, stored server-side and pressed as a counted message that refers to exactly that record. An invalid press is refused in the same words every time, is not counted and never reaches the model. The AI section becomes a full-height workspace with a grouped, searchable Conversation list, an empty-state start and phone sheets. A created draft can be previewed and issued from the chat through the editor's issuing path, guarded by the version the preview showed. The navigation gets an "AI" group, the dashboard gets an AI block with a prompt box, and the privacy page and the data export cover what the iteration stores. Every rule of [ai-assistant](../ai-assistant/test-plan.md) stays in force. Its tests stay as they are, and this plan adds only the new and changed behaviour.

**Model seam (applies to every level below except the evaluation run).** As in ai-assistant, tests never call the real model. A **scripted model** is swapped in through the model setting, and the test fixes the router verdict, the tool calls and the text step by step. Only the external model provider is replaced. The database, the services, the resolver, the offer builder, the press check, the counters and the stream stay real. Every press test asserts the scripted model's **call count**, because "never reaches the model" (AC-12b) is an observable zero. The real model is exercised only by the **evaluation run** (see *NFR validation* and *Evaluation fixtures*). That run is the only way to measure behaviour that depends on the model's reading of the instructions: AC-05b, AC-24, and the narration of a pressed record (sad.md §11).

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure rules, no I/O: the shared name fold over the look-alike fixture set; the offer builder (issue → kind, options, labels, the 8 cap, the first offer-able issue in the order Customer → sender profile → currency → bank account → product); the look-alike label rule (email or "no email"); the choice pin per kind; the last-four mask of an account number; Conversation grouping by local date (Today / Yesterday / Previous 7 days / Older) and the title search; the "at the bottom" rule (≤ 48 px); the dashboard prompt's message rule (trimmed, 1–2,000 characters); the start-point mapping from the address (`from`, `handoff`); the navigation "AI" group in the route config; the agent's tool set (no issuing tool); the chat instructions listing exactly the reads that exist and the sender-profile vs Customer rule. | In-memory, no database; a fixed clock and a fixed Freelancer time zone wherever "today" matters. |
| Integration | The services, server actions and chat route against the database they own: the three read questions on both channels (chat adapter and MCP server factory), offer storage in the turn's save, the press check, claim and release, offer close on a typed message, reopen, the issue-from-preview action over the invoice status service with the expected version (including concurrent confirms), the preview load, Conversation summaries and the dashboard's latest three, message origin and start point, export and account deletion, tenant isolation, the staged migrations (forward, backfill, rollback). | A throwaway database container per suite with every migration applied (the staged migrations promoted) plus the trace-store schema migration; never the database from the repo's environment files. The model is the scripted model. |
| Contract | The chat route request (the `choice` field, `origin`, `startedFrom`) and stream (the `data-offer` part, the `CHOICE_UNAVAILABLE` refusal) against `contracts/openapi.yaml`; the `x-mcp-tools` answers of `list_sender_profiles`, `list_products`, `list_customers` (including the 20-row page and `pageInfo`); the MCP tool listing; `loadInvoicePreview` and `issueFromPreview` against `contracts/server-actions.md`; the data export 2.3; the stream with the injection fixture; the no-full-account-number rule over every read output. | Validate the real shape produced by the real code against the agreed contract; no hand-rolled stubs. |
| E2E | Over real HTTP as an outside caller: a read-only Personal key calls the three new reads through the proxy; anonymous requests to the AI section, a preview address, the dashboard and the new server actions. The **evaluation run**: router → agent → tools on the real model over the labelled sets, extended with this feature's fixtures. | The running app against a throwaway database; requests sent as an outside caller would. The evaluation run uses the real model with a local key and seeded fixture data. |
| Load | The numeric server-side latency NFRs that do not depend on the model: new read questions p95 ≤ 800 ms, issue from the chat p95 ≤ 2 s, preview load (server part of the ≤ 1.5 s budget). | The load tool already in your repo, or e.g. k6 or Locust, against a preview deployment with seeded data. |
| Component | `OfferedChoices` (skeleton, pressable, pressing, chosen, inactive, refused), `InvoicePreviewPanel` (loading, available draft, issued, unavailable, not found, outdated reload, blocked, failed), `IssueConfirmation`, `InvoiceStateProvider` (card, links and panel agree), `DashboardAiBlock` (prompt default, validation errors, used-up, latest three, none yet), the Conversation list (groups, search, no match, New chat), the empty-state start (greeting, suggested requests, reduced motion), the follow-to-latest hook with a scripted stream, the streamed-text rendering, the navigation "AI" group, the privacy page AI section. | Render each component in isolation; assert output and interactions for the states listed in `screens.md` (SCR-01 to SCR-09, SCR-13). |
| Visual-regression | SCR-02 New Conversation (empty state), SCR-03 Conversation with SCR-04 Offered choices (pressable and chosen), SCR-06 preview panel beside the messages at 1440 × 900, SCR-09 Dashboard AI block. | Snapshot the render in the same container the existing AI and editor-layout baselines use (Linux-named baselines); fail on an unintended diff; update baselines deliberately. |
| E2E-through-UI | The flows from `ux-flows.md`: US-03 press an Offered choice to a card, and reopen with the chosen mark; US-04 full-height layout at three sizes; US-05 empty state to first reply; US-06 phone sheets; US-07 and US-08 preview and issue, including the two-tab cases; US-09 navigation group; US-10 dashboard prompt and Create invoice with AI; US-11 streamed reply; the accessibility pass over the AI section, the preview panel and the dashboard AI block. | Drive the real UI in a browser against a throwaway database with the scripted model; one test per flow. |

## AC coverage

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
| AC-05b error | a draft naming the Freelancer's own sender profile as the Customer gets no card | integration | scripted model calls the draft action with Customer "Consulting FOP": the resolver reports the Customer as not found, no card, no Offered choice is stored |
| AC-05b error | the chat instructions say what the chat can read and that a sender profile is not a Customer | unit | the instructions name exactly the read questions in the registry, and hold the sender-profile vs Customer rule |
| AC-05b error | the real model explains the own sender profile and asks which Customer | e2e | evaluation run over the AC-05b fixtures (see *Evaluation fixtures*): no card; the reply calls "Consulting FOP" the Freelancer's sender profile and asks for the Customer |
| AC-06 happy path | a key without Draft permission gets the three reads with the chat's answers | integration | through the MCP server factory, each answer equals the chat adapter's answer for the same Freelancer, with record ids; no full account number |
| AC-06 happy path | the tool listing includes the three reads for every key | contract | `list_sender_profiles`, `list_products`, `list_customers` listed with their schemas; the 20-row page and `pageInfo` total on `list_customers` |
| AC-06 happy path | a read-only key reads profiles, products and Customers over real HTTP | e2e | the outside call through the proxy returns the three answers; no full account number |
| AC-07 authorization | the chat's reads hold only the acting Freelancer's records | integration | with a second Freelancer owning "Globex Ltd" and "Audit", the first one's answers equal the answers for a Freelancer with neither; totals unchanged |
| AC-07 authorization | a key's reads hold only its owner's records, and a foreign Customer id is answered as missing | integration | MCP answers hold no foreign record; a product read with the other Freelancer's Customer id answers exactly as for an unknown id |
| AC-08 happy path | two matching Customers become one Customer offer with two options | unit | the ambiguous-Customer issue maps to a `CUSTOMER` offer with "Acme Corp" and "Acme GmbH" in order |
| AC-08 happy path | an ambiguous drafting message stores an offer with the reply and streams it | integration | one open offer tied to the reply message; the stream carries the offer part with its id; no card |
| AC-08 happy path | pressing "Acme GmbH" claims the offer, saves the label as the message and continues to the card | integration | offer chosen with that option; message saved as "Acme GmbH" with origin pressed; one slot used; card for Acme GmbH |
| AC-08 happy path | the press request and the offer part match the contract | contract | request `choice { offerId, optionId }` and the `data-offer` part match `openapi.yaml` |
| AC-08 happy path | the buttons render and a press sends the offer and option ids | component | two buttons with the stored labels; a press sends `{ offerId, optionId }` and shows the pressing state on that button only |
| AC-08 happy path | Freelancer presses a Customer button and gets the card | e2e-through-UI | buttons appear under the reply; after the press the sent message reads "Acme GmbH" and a card for Acme GmbH shows |
| AC-08 happy path | Offered choices under a reply stay as approved | visual-regression | no unintended diff for the pressable and chosen states |
| AC-08b happy path | a request unclear in two ways offers the first choice only | unit | with Customer and bank-account issues together, only the Customer offer is built |
| AC-08b happy path | Customer press, then account press, then card | integration | first reply: Customer offer only; after the press, the next reply: a bank-account offer with the two USD accounts; after that press: a card for Acme GmbH with the pressed account; two slots used |
| AC-09 domain invariant | the offer builder reads only the resolver's issue | unit | the same issue gives the same options whatever text accompanies it |
| AC-09 domain invariant | the streamed offers equal the builder's output, whatever the model writes | contract | with scripted text naming an account the resolver did not find, and a Customer note asking for a button "Evil Corp", every offer part equals the builder's output for the issue; no option comes from text |
| AC-09 domain invariant | a stored-text injection never adds a stored option | integration | the stored offer's options are exactly the resolver's findings; no "Evil Corp" row anywhere |
| AC-10 domain invariant | Customers whose names fold alike get their email or "no email" on the label | unit | "Acme Corp (…@….example.test)" and "Аcme Corp (no email)"; Customers whose names differ get no email |
| AC-10 domain invariant | the pressed look-alike Customer is pinned by id and stays pinned | integration | pressing the Cyrillic one gives a card with that Customer's id; when the scripted model calls the draft action again with the text "Acme Corp", the pin still wins |
| AC-10 domain invariant | labels render verbatim, including the email part | component | the button text equals the stored label |
| AC-10 domain invariant | the real model names the pressed record in its reply | e2e | evaluation run over the pressed-record fixture: the reply names "Acme GmbH" as the Customer, never "Acme Corp" |
| AC-11 domain invariant | the last message is a press and counts; the next press is refused as used up | integration | with 29 used: the first press uses the 30th slot and is processed; the second (a valid option) gets the used-up answer with renewal time; that offer stays open with no chosen option; the scripted model is called once in total |
| AC-11 domain invariant | a refused press marks nothing and shows the used-up notice | component | no button marked chosen; the used-up notice with renewal time renders; buttons stay pressable |
| AC-12 domain invariant | a newer typed message closes the open offer with no choice | integration | the earlier offer is closed with no chosen option; only the new reply's offer, if any, is open |
| AC-12 domain invariant | earlier buttons render inactive with the chosen one marked | component | not pressable; the chosen button marked with a check and a screen-reader "(chosen)" |
| AC-12b authorization | a press for an older reply's offer is refused uniformly | integration | refusal "no longer available"; no slot used; scripted model not called; no offer state changed; no message saved |
| AC-12b authorization | a press for another Freelancer's offer is refused uniformly | integration | the same refusal body as the older-offer case, byte for byte; nothing counted, called or changed; the draft does not move toward that record |
| AC-12b authorization | a press for an offer or option that never existed is refused uniformly | integration | the same refusal body; nothing counted, called or changed |
| AC-12b authorization | a press for an already chosen offer, and a lost claim race, are refused uniformly | integration | on two connections pressing the same option, one is processed and the other gets the same refusal with its slot released |
| AC-12b authorization | the unavailable refusal has one shape and one wording | contract | the refusal matches `openapi.yaml` with the `CHOICE_UNAVAILABLE` detail and the fixed words for every cause |
| AC-12b authorization | an unavailable press shows the fixed message and asks to choose again | component | the message renders; no button marked chosen |
| AC-13 cross-context | a reopened Conversation shows its offers with the chosen one marked | integration | the reopen load returns the three account options and the chosen option of each offer |
| AC-13 cross-context | an open button whose account was deleted since is refused without counting | integration | the press gets the uniform refusal; no slot used; the offer stays open |
| AC-13 cross-context | an open button whose account moved to another currency is refused the same way | integration | the same refusal; nothing counted |
| AC-13 cross-context | Freelancer reopens a past Conversation and sees the chosen option | e2e-through-UI | the earlier reply shows the three options with the pressed one marked |
| AC-14 error | more than 8 options build no offer and report the count | unit | twelve matches give "too many" with count 12 |
| AC-14 error | twelve "Studio" Customers store no offer | integration | no offer row; the reply part carries the count 12 for the model to state |
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
| AC-29 happy path | the dashboard prompt writes a one-time hand-off and opens the AI section | component | the hand-off entry holds the text; the address carries only the hand-off id, never the text |
| AC-29 happy path | the AI section takes the hand-off once and sends it | component | the first message is sent once; a reload or a second mount sends nothing |
| AC-29 happy path | a dashboard first message records its origin and start point and counts once | integration | message origin dashboard; Conversation started from the dashboard prompt; one slot used |
| AC-29 happy path | Freelancer sends "who owes me money?" from the dashboard | e2e-through-UI | the AI section opens on a new Conversation with the message sent and the reply being written; the counter dropped by one |
| AC-30 happy path | the dashboard's latest Conversations are the three newest by last message | integration | three of five, newest first, owner-scoped |
| AC-30 happy path | the dashboard AI block renders the latest links, all-Conversations link, Create invoice with AI and none yet | component | three links; the all-Conversations link; the action next to the invoice action pointing to the drafting start from the dashboard; "no Conversations yet" with none |
| AC-30 happy path | a Conversation started from Create invoice with AI records that start point | integration | started from the dashboard's Create action |
| AC-30 happy path | Freelancer opens a latest Conversation and uses Create invoice with AI | e2e-through-UI | the link reopens the Conversation; the action opens a new Conversation ready to draft |
| AC-30 happy path | the dashboard AI block stays as approved | visual-regression | no unintended diff |
| AC-31 error | the message rule rejects empty and over-limit text | unit | empty or spaces only → rejected; 2,000 characters accepted; 2,001 rejected |
| AC-31 error | an empty or too long prompt is not sent | component | the box shows "a message is needed" or the length limit; no hand-off written; no navigation |
| AC-32 cross-context | with the allowance used up, the prompt box offers the editor | component | the used-up text with renewal time and the create-by-hand link; no send control |
| AC-32 cross-context | the used-up dashboard creates nothing | integration | the allowance state reports zero left; no Conversation, no message, no slot change |
| AC-33 happy path | streamed text renders progressively | component | with deltas 20–50 ms apart, the visible text grows step by step; the first word renders as soon as it arrives |
| AC-33 happy path | a reopened reply renders whole | component | a saved reply shows complete at once, with no pacing |
| AC-33 happy path | Freelancer watches a reply being written | e2e-through-UI | with a scripted model that pauses between words, at least three samples of growing text before it completes; reopened, it shows whole |
| AC-34 cross-context | the export holds offers, choices, message origins and start points | integration | every Conversation with its messages, each offer with its options and chosen option, each message's origin, each Conversation's start point; this Freelancer's only |
| AC-34 cross-context | the export's new fields match the contract | contract | export version 2.3 shape |
| AC-34 cross-context | account deletion leaves no offer, message or Conversation | integration | zero rows for the account in every AI table, offers included |
| AC-35 happy path | the privacy page's AI section names what is stored, how long, who processes it and what the reads share | component | the stored items, 90 days, the model provider through its gateway, and "bank name, last four digits, currency — never a full account number" |
| AC-35 happy path | a Visitor reads the privacy page without signing in | e2e | the page loads for an anonymous request |
| AC-36 authorization | a press without a session is refused before anything runs | integration | no slot, no offer change, no model call, no row written |
| AC-36 authorization | the preview and issue actions refuse a request without a session | integration | unauthorized result; nothing read or changed |
| AC-36 authorization | anonymous visitors are sent to sign in from the AI section, a preview address and the dashboard | e2e | redirect to sign-in for each; the chat route refused through the proxy; nothing counted |

## Edge cases / error paths

- A press whose `optionId` is not a whole number, or whose `offerId` is malformed → expected: the request is rejected before the press check. Nothing is counted and the model is not called.
- A press that carries free text in the message part → expected: the text is ignored and the saved message is the stored label (contract and integration).
- A press for an offer from another Conversation of the same Freelancer → expected: the uniform "no longer available" refusal.
- A press while a turn in the same Conversation is still running → expected: serialized by the Conversation lock. At most one claim succeeds.
- A pressed turn that fails at the provider or runs out of steps → expected: the slot is released and the offer goes back to open with no chosen option, so nothing is marked (fault-injection integration test).
- A typed message whose turn fails → expected: the open offer stays open. A failed turn closes nothing.
- A pressed product that was archived, or no longer has a price in the invoice currency → expected: the uniform refusal, not counted.
- A pressed sender profile that was deleted → expected: the uniform refusal, not counted.
- A currency option → expected: always valid when pressed (no record to go stale).
- An offer with a single option (near miss, or the one other sender profile) → expected: shown as one button and pressable like any other.
- Exactly 8 matching options → expected: an offer with 8 buttons. 9 → no offer and the count.
- Look-alike Customers where one has no email → expected: its label ends "no email".
- A typed message that repeats a button's label → expected: treated as typed text and matched by name, never as a press (origin typed).
- A request body claiming `origin: DASHBOARD` on a message that is not a Conversation's first → expected: ignored. The origin is set by the server.
- An unknown `from` value on the drafting start → expected: started from the AI section, no error. `start=draft` with no `from` → started from the invoice list.
- A dashboard hand-off entry that is missing, already taken, or blocked by the browser → expected: a plain new Conversation. Nothing is sent or counted (component).
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
- The trace export → expected: the new spans (`chat.choice-check`, `invoices.issue-from-preview`, the read tools) carry metadata only, with no labels, names or record data (the existing metadata-only contract test extended).
- Keyboard → expected: every Offered choice, the panel, the dialog and the dashboard prompt box can be reached and used by keyboard (e2e accessibility pass).

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
- **NFR: Offered choices 100 % from the draft action, 0 from model text** → the stream contract test with the injection fixture (AC-09), on every PR.
- **NFR: look-alike search 100 % of the fixture set** → the unit and three-channel contract tests over the shared fixture set (AC-03, AC-17).
- **NFR: 0 full account numbers in any read answer, chat reply or MCP answer** → the contract test over every read output (AC-01, AC-06), the load scenario's answer scan, and the AC-06 e2e.
- **NFR: accessibility, 0 serious or critical violations; keyboard reachable** → the existing e2e accessibility suite extended to the AI section (empty, with Offered choices), the preview panel with the dialog open, and the dashboard AI block.
- **NFR: model cost per message p95 ≤ USD 0.02, unchanged by the new reads** → not a load test. It depends on the model provider, whose free-tier request cap a load run would use up for every Freelancer. Measured weekly from per-message trace metadata, as spec §6 states.

## CI placement

- On every PR: unit, component and contract (the fast job), and integration (the separate job with a throwaway database). This includes:
  - the press-check causes, the concurrent claim and the release on failure;
  - the two concurrent confirms;
  - the expected-version branches;
  - the injection fixture;
  - the read timing on the heavy fixture;
  - tenant isolation;
  - the staged migration tests.
- Pre-release, locally before `ship` (the repo runs no e2e in CI): e2e, e2e-through-UI, visual-regression (Linux baselines) and the accessibility pass. Keep the machine awake during the run, and check the container runtime before reading a red as a regression.
- The evaluation run: locally with the model key, before release and on every change to the chat instructions, the read registry or the model setting. The AC-05b, AC-05, AC-24 and pressed-record fixtures are part of it.
- The read and issue load scenarios: against a preview deployment before `ship`.
