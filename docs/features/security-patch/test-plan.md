---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["implementing engineer", "Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
---

# Test plan — security-patch

The app runs on patched framework, sign-in and mail components. "Signed in" means a verified session and nothing else, and anonymous server actions are refused however the request is shaped. Sign-in emails, the custom Dashboard period and data exports are bounded, and a limited Sign-in link request looks exactly like a sent one. Mail goes out only over verified TLS. The browser gets an enforced content-security policy plus transport headers, and the core flows keep working under them. The error-reporting relay forwards only to the app's own project.

## Levels

| Level | Scope | Strategy (generic — no tool names) |
|---|---|---|
| Unit | Pure logic: the verified-session predicate and the edge decision table (session shape × method × path), the five-year period rule and the link-period parser, address folding for the limit key, the address rule (≤ 254 chars, ASCII only), source keying (IPv4, IPv6 /64), the web-address rule, the security-header builder, the required-settings list, the dependency manifest checks, and the scan for unguarded server actions. | In-memory, no I/O. An injected clock where time matters. |
| Integration | Server actions, the sign-in service's email route, the email provider hooks, the limit store (advisory lock, windows, refusals, alert, purge), the export route, the dashboard loader and business-layer service, the error-reporting relay, and the production advisory audit. | A throwaway Postgres container per suite, with the repo migrations **plus** staged migration `01_create_limit_event` applied. An in-process fake SMTP server that speaks the real protocol, with three modes: TLS with a valid certificate, no TLS offered, and a certificate for the wrong host name. A local fake upstream for the relay. An injected clock. Never the `.env` database. |
| Contract | `/api/user/export` (success and limit refusal) against `contracts/openapi.yaml`. | Validate the real response against the agreed document. No hand-written stubs. |
| E2E | Request-boundary flows through the real entry point, edge proxy included: the page-access sweep with a genuine session, the sign-in check failing, and anonymous mutations in every shape. | A production build of the app against the throwaway database, driven over HTTP. The genuine session comes from completing the real Sign-in link flow against the fake SMTP server, never from a hand-built cookie. |
| Load | The latency NFRs: dashboard p95 and the Sign-in link request p95 plus the sent vs limited medians. | The load tool already in your repo, or e.g. k6 or Locust. Run against the preview environment. |
| Component | The UI states that screens.md adds: the SCR-01 validation and error messages, the SCR-04 period-too-long notice, the SCR-06 export-limit alert, the SCR-07 / SCR-08 / profile web-address field errors, the legacy-address rendering in `ContactCard`, and the SCR-10 PDF with a non-web logo. | Render in a component harness with props or mocked action results. Assert text and behaviour, with no full app boot. |
| Visual-regression | <!-- N/A: owner decision 2026-10-02. No new components, the repo has no visual-diff setup, and the component tests assert each new state's content. A CSP that breaks styles is caught by the AC-20 zero-violation gate. --> | — |
| E2E-through-UI | User-story flows driven through the rendered UI: Sign-in link request and sign-in (SCR-01 → SCR-02 → SCR-04), the sign-in page actions, and the AC-20 core-flow sweep under the enforced content-security policy. | Flow scripts come from `ux-flows.md`. They run on the preview environment with the real mail provider and a real mailbox (AC-02, AC-20), and locally against the production build and the fake SMTP server for everything else. |

## AC coverage

Every §5 acceptance criterion maps to at least one row. The owner confirmed the Level column on 2026-10-02, and `implement` writes each test at that level without re-deciding it. "Flow N" refers to sad.md §6, and "SCR-NN" to screens.md.

| AC (spec.md §5) | Test name (intent-based) | Level | Expected outcome |
|---|---|---|---|
| AC-01 | production advisory audit reports no critical or high advisory | integration | The advisory audit over production packages only finds zero critical and zero high advisories. The check lists the remaining development-only advisories so they can go into the ship notes. |
| AC-02 | Sign-in link and Google sign-in still work after the upgrade | e2e-through-UI | On preview, the Sign-in link reaches a real mailbox, opening it lands on SCR-04, and Google sign-in completes. |
| AC-02 | every private page opens after the upgrade | e2e-through-UI | The full page-access sweep passes on preview with the signed-in Freelancer. |
| AC-03 | Sign-in link for an existing address signs into the existing account | integration | A Freelancer seeded with an email account (plus a Google account link) completes a Sign-in link sign-in. Exactly one user exists for that address, and their invoices are visible. |
| AC-03 | differently-spelled address still resolves to its own exact account | integration | A link requested for a "+tag" or upper-case spelling signs into the account for that exact address. The limit grouping does not merge accounts. |
| AC-04 | anything other than a verified session is classified as a Visitor | unit | An error-state result, a session without an account id, a missing session and a thrown check all count as Visitor. Only a valid session with an account id counts as verified. |
| AC-04 | edge decision table for non-verified callers | unit | Private page → redirect to sign-in with a callback. Data request → refused as not signed in. Mutation outside the sign-in service and sign-in page → refused. Session cookies are left untouched in every case. |
| AC-04 | private action with an error-state session is refused with no data | integration | A server action called while the session check returns an error state is refused as not signed in. No private code runs and no data is returned. |
| AC-04 | failed sign-in check never ends an existing session | e2e | While the check fails, a private page redirects to sign-in and a data request is refused. Once it recovers, the same cookie opens the dashboard without signing in again. |
| AC-04 | check-unavailable page when the sign-in check itself fails (T32, S-08) | unit | A page request while the check fails gets a 503 "We couldn't load your data" HTML page with `Cache-Control: no-store` and `Retry-After`, and no `Set-Cookie`, so the session survives. "Try again" targets the requested page from `?next=`, else a same-origin Referer, else the dashboard; a cross-origin or header-injecting target is ignored (`tests/unit/api/clear-session.test.ts`). |
| AC-04 | Auth.js GET never clears the session cookie on a failed check (T40, T44) | unit | A GET to any Auth.js path, including `/api/auth/session`, `/api/auth//session` and `/api/auth/session/`, with an undecodable token or a throwing session callback keeps the session cookie. A response that writes a new session cookie keeps its stale-chunk expiries, and a POST sign-out still clears the cookie (`tests/unit/api/auth-session-route.test.ts`). A scan from the repo root finds no client-side session fetch (`tests/unit/no-client-session-fetch.test.ts`). |
| AC-05 | genuine session reaches every private page directly | e2e | A session from the real Sign-in link flow opens the dashboard and every private page in the route manifest, with no redirect to sign-in. |
| AC-06 | public pages are always reachable when the sign-in check fails | unit | In the edge decision table, the sign-in page and the landing page pass through when the check throws or errors. |
| AC-06 | sign-in and landing pages render without a redirect loop | e2e | With the sign-in check forced to fail, the sign-in page and the landing page each render in one response, with no redirect chain. Sign-in succeeds once the check recovers. |
| AC-07 | over-long or malformed link period falls back to the current month | unit | The link-period parser returns the default period for a custom period longer than 5 years and for malformed values. |
| AC-07 | dashboard opened with an over-long period shows the current month | integration | The dashboard loader returns this month's figures and never builds a day series longer than the cap. |
| AC-07b | five-year rule rejects a range longer than the cap | unit | The rule reports "too long" for a range past start + 5 calendar years. |
| AC-07b | filter refuses an over-long range and explains why | component | On SCR-04, picking such a range applies nothing and does not navigate. The popover stays open with an inline notice: at most 5 years, and "all time" shows the full history. The notice clears on the next valid pick or preset. |
| AC-08 | five-year boundary is a calendar-date rule independent of time zone | unit | 2021-01-01 → 2026-01-01 is allowed and 2021-01-01 → 2026-01-02 is not. A 29 February start counts to 28 February. The results are the same in UTC, in a far-ahead zone and in a far-behind zone. |
| AC-08 | link reader and business rule agree on the boundary | integration | Through the dashboard loader, the exact 5-year link is applied and the 5-years-and-a-day link falls back. The business-layer service accepts and refuses the same two periods. |
| AC-09 | "all time" preset is not a custom period | unit | The rule does not cap the "all time" preset. |
| AC-09 | "all time" shows history longer than 5 years | integration | A Freelancer with invoices spanning more than 5 years gets figures that include the oldest invoice. |
| AC-10 | business layer refuses an over-long period before computing | integration | A direct call to the dashboard service with a period longer than 5 years is refused with the plain reason that the period must be at most 5 years. No invoice query runs. |
| AC-11 | Sign-in link is sent when both limits have room | integration | One email reaches the fake SMTP server, one sent event is recorded for the address, the response is the neutral confirmation, and it completes no earlier than the response floor. |
| AC-11 | a send that hits the time bound stays counted | integration | A send that exceeds the time bound but is still delivered keeps its sent event and counts towards the address limit. The send is rejected, which the sign-in page shows as "could not send, try again", and the failure is tagged `SEND_TIMEOUT`. |
| AC-11 | requesting a Sign-in link shows "check your inbox" | e2e-through-UI | SCR-01 → SCR-02 with the neutral copy, and the link from the fake SMTP inbox opens SCR-04. |
| AC-12 | every spelling of a mailbox folds to one limit key | unit | Letter case, a "+tag" and, for Gmail addresses, dots in the local part give one key. Dots in a non-Gmail address stay significant. The key is a digest, never the raw address. |
| AC-12 | sixth link to one mailbox within an hour is not sent, from either route | integration | After 5 sent links, a 6th through the sign-in page action and a 6th through the sign-in service called directly both send nothing. Each gets the same neutral confirmation, held until the response floor. |
| AC-12 | refused, invalid and failed requests do not count toward the address limit | integration | Refused, invalid and failed sends record no sent event, and a link is still sent after them while fewer than 5 have been sent. |
| AC-13 | thirty-first request from one source within 5 minutes is not sent | integration | Requests 1–30 from one source are processed and the 31st sends nothing, whatever the address. The response is the neutral confirmation. An IPv6 source is counted per /64, and a client-set forwarding header does not change the source. |
| AC-14 | Google sign-in works while the address is limited for links | integration | With the address at its link limit, the Google sign-in callback for the same account completes and issues a session. |
| AC-15 | limit store unavailable means no email is sent | integration | With the database unreachable from the limiter, nothing reaches the fake SMTP server and the result says email sign-in is temporarily unavailable. |
| AC-15 | sign-in page explains that email sign-in is temporarily unavailable | component | SCR-01 shows the "temporarily unavailable, try again shortly or sign in with Google" message, and the Google button stays enabled. |
| AC-16 | mail is never sent without verified TLS | integration | When the fake SMTP server offers no TLS, or a certificate for the wrong host name, no message content is transmitted. The result is "could not send", and one failure report reaches error tracking. |
| AC-16 | sign-in page shows "could not send, try again" | component | SCR-01 shows the generic could-not-send message. |
| AC-17 | address rule refuses over-long and non-ASCII addresses | unit | A 254-character address passes. A 255-character address and one with any non-ASCII character are refused. |
| AC-17 | invalid address is refused on both routes before anything is sent | integration | The sign-in page action and the sign-in service called directly both refuse with "enter a valid email address". Nothing is sent and nothing is counted. |
| AC-17 | sign-in form shows the invalid-address message | component | SCR-01 shows the field error under the email input, and nothing is submitted. |
| AC-18 | no exported server action runs before a session check, except the sign-in actions | unit | The scan over every exported server-side action fails if one outside the sign-in actions runs code before resolving a verified session. |
| AC-18 | edge refuses anonymous mutations of every shape | unit | The decision table refuses non-GET/HEAD/OPTIONS requests without a verified session, with or without the action marker, form-encoded or not. The only exceptions are the sign-in service and the sign-in page. |
| AC-18 | anonymous call to a non-sign-in action is refused with no data | integration | Each private action called with no session is refused as not signed in. No write happens and nothing private is returned. |
| AC-18 | anonymous mutations are refused through the real entry point | e2e | Without a cookie, a POST to a public page with the action marker, one without the marker, a form-encoded POST and a POST to the sign-in page that names a non-sign-in action are all refused with no data. The sign-in service endpoints, the sign-in callback and the relay are not affected. |
| AC-19 | sign-in actions keep working on the sign-in page | e2e-through-UI | Requesting a Sign-in link on SCR-01 reaches SCR-02, and choosing Google starts the Google flow. |
| AC-20 | security headers carry the agreed baseline | unit | The header builder emits the enforced content-security policy, a framing refusal, a strict-transport header without subdomains, and a report destination for violations. |
| AC-20 | core flows complete with zero policy violations | e2e-through-UI | On preview under the enforced policy: Google sign-in, Sign-in link sign-in, the dashboard chart, invoice PDF download and print, a client-side error, and the full page-access sweep (settings, logo and customer-image previews, the Google profile picture, data export, legal pages) all complete. The run records zero policy-violation events, and the client error reaches error tracking. This is the gate before production release. |
| AC-21 | web-address rule accepts only http and https | unit | `http://` and `https://` addresses pass. `javascript:`, `data:`, `ftp:`, relative paths and protocol-relative values are refused. An empty value stays allowed where the field is optional. |
| AC-21 | saving a non-web address is refused | integration | Customer website and image, sender-profile website and the profile avatar each refuse a `javascript:` or `data:` value with the field error "must start with http or https". Nothing is saved. |
| AC-21 | editors show the web-address field error | component | SCR-07, SCR-08 and the profile settings show the message next to the field, both from the client check and from server field errors when the form is bypassed. |
| AC-21 | legacy non-web values render as plain text | component | `ContactCard` (SCR-05 lists, SCR-09 detail) renders a stored non-web website without a link and a non-web image without a source, so initials show. The stored value is unchanged. |
| AC-21 | invoice PDF never loads a non-web logo | component | The invoice PDF document with a `data:` logo copy renders no logo image, and nothing else in the PDF changes. |
| AC-22 | relay refuses reports for any other project | integration | Envelopes addressed to another project, to another host, or with no readable project are refused, and the fake upstream receives nothing. An envelope for the configured project is forwarded once. |
| AC-23 | export under the limit returns the file | integration | The export file is returned and one started event is recorded for the Freelancer. |
| AC-23 | export success response matches the contract | contract | The success response validates against `openapi.yaml`. |
| AC-24 | fourth export within an hour is refused with the retry time | integration | After 3 started exports, the 4th is refused, and the retry time equals the earliest counted start plus one hour (injected clock). |
| AC-24 | concurrent export requests never run more than three | integration | 5 simultaneous requests from one Freelancer start exactly 3 exports and refuse 2. |
| AC-24 | system-side export failure frees its place, an abandoned export still counts | integration | An export that fails on the system side is marked failed, and a new export can then start. An export whose file was produced counts even if the client never read it. |
| AC-24 | export limit refusal matches the contract | contract | The refusal validates against `openapi.yaml` and carries the retry time. |
| AC-24 | privacy settings show when the Freelancer can export again | component | SCR-06 shows the inline alert with the retry time in local hours and minutes, with no toast. The alert clears on the next attempt. |
| AC-25 | export limit counts per Freelancer, not per network | integration | Two Freelancers from the same source: one reaching the limit leaves the other free to export. |
| AC-26 | required settings list matches the example env file | unit | Every setting the app reads, including every mail and Google sign-in setting, is listed in `env.example` under the same name, and the reverse holds too. |
| AC-26 | deploy check stops and names a missing mail setting | unit | With any one required mail setting removed, the pre-traffic check fails and names that exact setting. With all settings present it passes. |
| AC-27 | database toolkit is on its latest 7.x and acceleration is gone | unit | The dependency manifest pins the database toolkit packages to the same latest 7.x release, and the database-acceleration extension is not a dependency or imported anywhere. |

## Edge cases / error paths

Each error and authorization criterion (AC-04, 06, 07b, 10, 13, 15, 16, 17, 18, 22, 25, 26) has its own rows above. These are the boundary and failure cases the spec and SAD imply on top of them:

- Exactly the 5th link to an address within an hour → expected: sent. The 6th → expected: not sent, neutral confirmation.
- Exactly the 30th source request within 5 minutes → expected: processed. The 31st → expected: not sent, neutral confirmation.
- Window slides (injected clock): the oldest sent link ages past one hour → expected: the next link is sent.
- Two simultaneous requests for one address that already has 4 sent links → expected: at most one more link is sent (per-key lock).
- A flooding source keeps requesting after hitting its limit → expected: no more than 30 source rows are written per 5 minutes.
- An address refused in each of 3 consecutive UTC hours → expected: one alert to error tracking that carries only the address digest. A 4th consecutive hour on the same day → expected: no second alert.
- Refusals in hours 1 and 3 but not in hour 2 → expected: no alert.
- Limited vs sent response timing, with an instant fake SMTP and with send latency drawn at random between 0 and the response floor → expected: the medians differ by ≤ 150 ms over 50 requests of each kind (spec §6 row 2).
- A send slower than the response floor → expected: the response waits for the send to finish, and the outcome is still reported in the same response.
- Opening an expired or already-used Sign-in link → expected: the existing sign-in error page. No session is issued.
- A client-set forwarding header that names a different source → expected: ignored. The source comes from the hosting platform's reported address.
- Daily purge called without the shared secret or with a wrong one → expected: refused, nothing deleted.
- Daily purge with rows older and younger than 24 h across all three scopes → expected: every older row is deleted for every key, younger rows stay, and a second run deletes nothing more.
- A limit write while stale rows exist → expected: the bounded opportunistic purge removes at most one batch of rows older than 24 h.
- Account deletion → expected: the Freelancer's export rows and the address rows for their digest are removed in the same transaction. Source rows stay until the sweep.
- Limit store fails on the export path → expected: the export does not run, and the Freelancer sees the generic "couldn't be exported, try again" message.
- Business-layer dashboard call with an inverted period (end before start) → expected: refused as an invalid period, nothing computed.
- Session cookie present but the check throws on a public page → expected: the page renders and the cookie is not cleared.
- Content-security-policy violation report sent to the configured destination → expected: it reaches error tracking (spec §8 OQ default).

## Test data

- **Seed strategy:** factories in `tests/support/factories` for `User` (with an email-provider account, a Google account link, or both), `Invoice` spread across more than 5 years, `Customer` and `SenderProfile` with legacy non-web `website` / `image` / logo values written straight to the database (bypassing validation), and `LimitEvent` rows per scope and outcome at chosen `at` times. Every limiter test passes `at` from the injected clock in `tests/support/clock.ts`, never the database clock (data-model "Time handling").
- **Integration dependency:** a throwaway Postgres container per suite, with the repo migrations plus the staged `01_create_limit_event` migration applied. The fake SMTP server and the fake relay upstream run inside the test process. No mocked datastore. The limit-store-unavailable case points the limiter at a stopped database, not at a stub.
- **E2E data:** a production build against its own throwaway database, with a Freelancer seeded per spec. The genuine session is obtained by completing the Sign-in link flow through the fake SMTP inbox. Preview runs (AC-02, AC-20, load) use a dedicated test Freelancer whose data is reset before each run.
- **Cleanup boundary:** per-test truncation of all tables, as the repo already does, not a wrapping transaction. The concurrency tests (AC-24, simultaneous sign-in requests) need committed rows visible across connections. The fake SMTP inbox and the relay upstream are cleared per test.

## NFR validation (load)

The load tool already in your repo, or e.g. k6 or Locust, run pre-release against the preview environment:

- **Dashboard load, p95 ≤ 2 s (spec §6 row 1)** → scenario: 5 requests/s for 5 minutes from a signed-in test Freelancer, mixing preset links, custom periods within the cap, over-long custom periods and malformed periods. Assert dashboard response p95 ≤ 2 s across the whole mix and on the over-long subset alone.
- **Sign-in link request, p95 ≤ 1.5 s and limited vs sent medians within 150 ms (spec §6 rows 2–3)** → scenario: 2 requests/s for 5 minutes, half to fresh addresses (sent) and half to addresses already at their limit (limited), with preview's mail settings pointed at a sink mailbox. Assert p95 ≤ 1.5 s and |median(sent) − median(limited)| ≤ 150 ms. The scenario spreads requests over enough test sources that the source limit (30 per 5 minutes) does not take over the mix.

The other numeric NFRs are verified outside load:

- Limit-record retention ≤ 24 h → the purge edge cases above (integration), plus the ship-stage row count.
- Targeted-lockout alert → the three-consecutive-hours edge cases above (integration, injected clock).
- Limiter fail-closed → AC-15 integration row.
- Client error reporting within 5 min, and production advisories 0 critical / 0 high → the ship-stage post-deploy smoke and audit (AC-01 is also checked in CI).
- Configuration documentation → AC-26 unit row plus the review checklist.

## CI placement

- **On every PR:** unit, component and contract suites. The integration suite runs too wherever a container runtime is available (it skips cleanly otherwise). The AC-01 advisory audit and the AC-18 server-action scan run here as well.
- **On every PR (heavier, against the local production build):** the e2e request-boundary suite (AC-04, AC-05, AC-06, AC-18) and the local e2e-through-UI flows (AC-11, AC-19).
- **Pre-release on preview:** the AC-02 and AC-20 e2e-through-UI runs (real Google, real mailbox, enforced policy, zero-violation gate) and the two load scenarios. The policy is not released to production until these pass.
- **Ship stage:** the post-deploy client-error smoke, the production advisory audit and the limit-record row count.
