---
status: Draft
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-02"
feature_size: "M"
---

# Spec — security-patch

> **Glossary:** [CONTEXT](../../../CONTEXT.md) (project-wide; this feature adds *Sign-in link* and *Dashboard period*)
> **Reference module / docs / channels used:** [`brief.md`](./brief.md) (findings S1–S7 + related hygiene), [`docs/architecture-map.md`](../../architecture-map.md), the code paths the brief cites. Hardening decisions this builds on: deny-by-default (architecture-hardening ADR-0001) and the shared rate limiter (architecture-hardening ADR-0008).

## 1. Context

invoiceFlow is about to become a public portfolio demo, followed by an in-app AI chat and an external Assistant connection. Both bring automated traffic and new callers. A read-only audit and a dependency advisory scan of the current surface found holes that put every Freelancer's account and data at risk. Several of them are reachable by a Visitor without signing in:

- The web framework and the sign-in components are outdated and carry published critical advisories: remote code execution, edge-check bypass, and sign-in links delivered to the wrong mailbox.
- The edge treats any non-empty sign-in result as a signed-in user.
- Anyone can make the app send unlimited sign-in emails.
- A single dashboard link can make the server compute millions of chart days.
- Mail can be sent without encryption.
- Server actions on public pages can be invoked anonymously.
- The error-reporting relay is open to anyone, and the browser protection headers are thin.

The trigger is the public launch. Once the demo URL is shared and the AI chat ships, these holes become an incident rather than a finding. The brief scopes the work as small, mostly independent fixes that ship before `ai-chat`.

**Committed approach.** Close each hole at the point every caller passes through, not only in the page the brief cites:

- The sign-in-email limit applies to every route that sends a Sign-in link.
- "Signed in" means a verified session and nothing else.
- Anonymous action calls are refused however the request is shaped.
- The Dashboard period cap is one rule shared by the link reader and the business layer.

Thresholds follow what comparable products do. A hosted auth service publishes a per-source limit of 30 requests per 5 minutes. Reporting tools cap custom ranges at 2–5 years and keep "all time" as a separate preset. None of the sources sets an hourly per-address ceiling for sign-in emails, which is the gap a slow mail-bomb exploits, so this spec adds one: 5 per hour. The sharpest failure mode found is that an enforced content-security policy, written naively, silently breaks sign-in, the dashboard chart and invoice PDFs. Enforcement is therefore gated on those flows passing with zero violations. Success: no critical or high advisory in production packages, and no anonymous path to mail-bombing, CPU exhaustion or action invocation.

Decisions taken during the interview, recorded for traceability:

- **Dependency upgrades ship together.** The framework, sign-in library and mail library upgrades land in one change. The user's rationale: close every critical advisory at once. The accepted cost is that a regression is harder to bisect.
- **The content-security policy is enforced from the first release, not report-only.** A zero-violation gate on the core flows (AC-20) replaces the report-only week.
- **Missing mail settings stay a configuration error.** There is no "email sign-in disabled" mode. The CI build that used to fail without them no longer runs, and deploy environments carry the settings.
- **New user-facing messages are accepted scope.** The brief allowed almost no new UI; the interview added three messages: the dashboard filter's 5-year notice (AC-07b), "sign-in by email temporarily unavailable" (AC-15) and "you can export again at …" (AC-24).
- **Sign-in-email limits:** at most 5 per address per hour and 30 per source per 5 minutes, with no extra per-address cooldown. When the limit cannot be checked, no email is sent (fail-closed).

## 2. Goals

- No published critical or high advisory affects code that runs in production when the app goes public.
- Freelancers' data and private actions are never reachable without a verified session. This holds even when the sign-in service misbehaves or a request is crafted to look like a public one.
- A Visitor cannot use the app to flood a mailbox, exhaust the app's sending capacity, or tie up the server with a single link.
- The browser receives baseline protections against injected content, framing and downgrade attacks, and the core flows keep working under them.

## 3. Non-goals

- **Replacing the beta sign-in library with a stable alternative.** Upgrading within the current line closes the advisories. A switch is its own decision and is revisited with the Assistant work.
- **An "email sign-in disabled" mode when mail settings are missing.** The user decided that a missing mail setting is a configuration error to catch at deploy, not a degraded mode that could silently remove email sign-in in production.
- **Invoice correctness rules.** These are covered by `invoice-integrity`.
- **Assistant- and AI-specific protections** (tool caps, access tokens, the Assistant endpoint). These are designed with the features that introduce them.
- **Moving the hosting region next to the database.** This is a performance concern, not a security one.
- **Removing every inline script and style the framework emits.** The enforced policy is a baseline that lets today's flows run. A stricter per-request policy is a follow-up.

## 4. User stories

### US-01: Run on patched components

**As a** Freelancer
**I want** the app to run on framework, sign-in and mail components with no known critical or high advisories
**So that** my account and invoices are not exposed to published exploits

### US-02: Unverified sessions stay outside

**As a** Freelancer
**I want** private pages, data and actions to treat anything short of a verified session as a Visitor
**So that** a sign-in misconfiguration or error never exposes my data

### US-03: Bounded dashboard period

**As a** Freelancer
**I want** the dashboard to accept custom Dashboard periods of up to 5 years, refuse longer ones in the filters with an explanation, and fall back safely when a link carries one
**So that** the dashboard stays fast and nobody can stall the app by sending me a crafted link

### US-04: Clear refusal for over-long periods

**As an** Assistant acting for a Freelancer
**I want** a request for dashboard figures over a period longer than 5 years to be refused with a plain reason
**So that** I can ask again for a shorter period instead of waiting on a request that never finishes

### US-05: Limited sign-in emails

**As a** Freelancer
**I want** the number of Sign-in links sent to my address, and from any single source, to be limited
**So that** nobody can flood my inbox or burn the app's email capacity, and email sign-in keeps working for everyone

### US-06: Safe sign-in email delivery

**As a** Visitor signing in by email
**I want** my Sign-in link sent only over an encrypted mail connection, and only to a well-formed address
**So that** the link and the mail account's credentials cannot be read or redirected in transit

### US-07: No anonymous actions

**As a** Freelancer
**I want** every server-side action except the sign-in actions on the sign-in page to refuse callers without a verified session
**So that** an action that forgets its own check can never be invoked anonymously

### US-08: Browser protections

**As a** Freelancer
**I want** the app to tell my browser to block injected content, refuse framing, use encrypted connections only, and accept only web addresses as customer websites
**So that** a malicious link or stored value cannot run in my session

### US-09: Limited data export

**As a** Freelancer
**I want** my full data export limited to a few runs per hour, with failed runs not counted
**So that** a leaked session or a looping script cannot overload the app, while I can still export whenever I need

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the release candidate of the app
**When** the dependency advisory audit runs over the packages that ship to production
**Then** it reports zero critical and zero high advisories, and the ship notes list every remaining development-only advisory with the reason it is not reachable in production

### AC-02 (US-01) — happy path

**Given** the upgraded components are deployed to a preview environment
**When** a Freelancer signs in with Google, signs in with a Sign-in link that actually arrives in a real mailbox, and opens every private page
**Then** every step works as before the upgrade, and the full page-access sweep passes

### AC-03 (US-01) — domain invariant

**Given** a Freelancer whose account was created with an email address before the upgrade
**When** they request and open a Sign-in link for that same address after the upgrade
**Then** they land in their existing account with all their data, because one email address belongs to exactly one account, and the system never creates a second, empty account for it

### AC-04 (US-02) — authorization

**Given** the sign-in check returns anything other than a verified session, for example an error state caused by a misconfiguration
**When** that caller requests a private page, private data or a private action
**Then** the system treats the caller as a Visitor: a page request is sent to sign in, a data or action request is refused with no data, and nothing private runs

### AC-05 (US-02) — happy path

**Given** a Freelancer holds a genuine session issued by the real sign-in flow, not a hand-built one
**When** they open the dashboard and any other private page
**Then** they reach it directly and are never bounced back to sign in

### AC-06 (US-02) — error

**Given** the sign-in check itself fails while a Visitor opens the sign-in page or the landing page
**When** the page loads
**Then** the page renders without an endless redirect loop, and the Visitor can sign in once the check recovers

### AC-07 (US-03) — domain invariant

**Given** a Freelancer opens a dashboard link whose custom Dashboard period is longer than 5 years
**When** the dashboard loads
**Then** it shows the default period (the current month), the same as for any malformed link, within normal dashboard load time, because a custom Dashboard period can never exceed 5 years

### AC-07b (US-03) — error

**Given** a Freelancer choosing a custom Dashboard period in the dashboard filters
**When** they pick a range longer than 5 years
**Then** the filter does not apply it and tells them that a custom period can be at most 5 years and that "all time" shows their full history

### AC-08 (US-03) — domain invariant

**Given** a Freelancer in any time zone opens a dashboard link with a custom Dashboard period of exactly 5 years, or one of 5 years and one day
**When** the dashboard loads each of them
**Then** the 5-year period is applied, the longer one falls back to the default period, and the link reading and the business rule agree on the same boundary

### AC-09 (US-03) — happy path

**Given** a Freelancer whose invoices span more than 5 years
**When** they choose the "all time" preset
**Then** the dashboard shows their full history, because the preset is not a custom period and the cap does not apply

### AC-10 (US-04) — error

**Given** an Assistant acting for a Freelancer
**When** it asks for dashboard figures over a period longer than 5 years
**Then** the system refuses before computing anything and tells it in plain language that the period must be at most 5 years

### AC-11 (US-05) — happy path

**Given** an address that has received fewer than 5 Sign-in links in the past hour, and a source that has made fewer than 30 requests in the past 5 minutes
**When** a Visitor requests a Sign-in link for that address
**Then** the link is sent and the Visitor sees the "check your inbox" confirmation

### AC-12 (US-05) — domain invariant

**Given** an address has already received 5 Sign-in links in the past hour, counting every spelling that delivers to the same mailbox the way sign-in matches addresses
**When** anyone requests another link for it, whether from the sign-in page or by calling the sign-in service directly
**Then** no email is sent, and the requester sees the same "check your inbox" confirmation, with no noticeable difference in wording or response time from a sent link

### AC-13 (US-05) — authorization

**Given** one source has made 30 Sign-in link requests within 5 minutes
**When** it requests another link for any address
**Then** no email is sent, and the requester sees the same "check your inbox" confirmation

### AC-14 (US-05) — cross-context

**Given** a Freelancer's address is currently limited for Sign-in links, for example because someone else flooded it
**When** the Freelancer signs in with Google for the same account
**Then** they sign in normally, because the email limit governs sending links and never blocks other sign-in methods

### AC-15 (US-05) — error

**Given** the system cannot check the sign-in-email limits right now
**When** a Visitor requests a Sign-in link
**Then** no email is sent, and the Visitor is told that sign-in by email is temporarily unavailable and that they can try again shortly or sign in with Google

### AC-16 (US-06) — error

**Given** the mail server does not offer an encrypted connection
**When** the app tries to send a Sign-in link
**Then** the email is not sent unencrypted, the Visitor sees the generic "could not send, try again" message, and the failure is reported to error tracking

### AC-17 (US-06) — error

**Given** a Visitor on the sign-in page
**When** they request a Sign-in link for an address longer than 254 characters or one containing non-ASCII characters
**Then** the system refuses before sending anything and tells the Visitor to enter a valid email address

### AC-18 (US-07) — authorization

**Given** a Visitor on any public page
**When** they invoke any server-side action other than the sign-in actions on the sign-in page, however the request is shaped (with or without the usual action marker, as a form submission or otherwise)
**Then** the system refuses without running the action and returns no data

### AC-19 (US-07) — happy path

**Given** a Visitor on the sign-in page
**When** they request a Sign-in link or choose to sign in with Google
**Then** the sign-in action runs and they continue the sign-in flow as before

### AC-20 (US-08) — happy path

**Given** the content-security policy is enforced in a preview environment
**When** a Freelancer signs in with Google and with a Sign-in link, views the dashboard chart, downloads and prints an invoice PDF, and a client-side error is triggered
**Then** every flow completes with zero policy violations, and the client-side error reaches error tracking; the policy is not released to production until all of these pass

### AC-21 (US-08) — error

**Given** a Freelancer editing a customer or a sender profile
**When** they save a website that is not a web address (http or https), for example a script or data link
**Then** the system refuses to save and tells them the website must be a web address starting with http or https

### AC-22 (US-08) — authorization

**Given** anyone sends error reports through the app's error-reporting relay addressed to an error-tracking project other than the app's own
**When** the relay receives them
**Then** it refuses to forward them, so the app's domain cannot be used to deliver reports anywhere else

### AC-23 (US-09) — happy path

**Given** a Freelancer who has completed fewer than 3 data exports in the past hour
**When** they request a full data export
**Then** they receive the export file

### AC-24 (US-09) — domain invariant

**Given** a Freelancer has completed 3 data exports in the past hour
**When** they request a fourth
**Then** the system refuses and tells them when they can export again; an export that failed on the system's side does not count towards the 3

### AC-25 (US-09) — authorization

**Given** two Freelancers sharing one network
**When** one of them reaches the export limit
**Then** the other can still export, because the export limit counts per Freelancer and never across accounts

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Dashboard load, any link including an over-long period, p95 | ≤ 2 s | dashboard chart spans in error tracking, 7-day window after release |
| Sign-in link request, limited vs sent | median response times differ by ≤ 150 ms | integration test, 50 requests of each kind |
| Sign-in link request, p95 | ≤ 1.5 s | sign-in spans in error tracking |
| Limit-record retention | records older than 24 h are purged at least daily, by a sweep that covers every key, not only the caller's | integration test + row count checked in the ship stage |
| Targeted-lockout alert | an address limited for 3 consecutive hourly windows raises one alert to the owner | integration test |
| Limiter failure mode (sign-in) | fail-closed: no email when limits cannot be checked | integration test with the limit store unavailable |
| Client error reporting after release | browser error events arrive within 5 min of a synthetic error on production | post-deploy smoke in the ship stage |
| Production advisories | 0 critical, 0 high | advisory audit in the ship stage |
| Configuration documentation | every environment variable the app reads is listed in the example env file under the exact name the app reads | review checklist |

## 6.1 Security / privacy

- **Data classification:** Confidential. The feature changes how sessions are recognized and stores sign-in attempt records tied to email addresses and network sources.
- **Personal data touched:** new short-lived limit records hold a normalized email address (or a one-way digest of it) and a network source address, both personal data. They are kept ≤ 24 h, never shown to anyone, and removed by the retention sweep and on account deletion where they map to an account.
- **AuthZ/AuthN impact:**
  - "Signed in" now means a verified session with a known account. Any other sign-in result is a Visitor.
  - Every server-side action except the sign-in actions on the sign-in page requires a verified session before it runs, whatever page it is called from.
  - The export limit is counted per Freelancer.
  - The sign-in-email limit is counted per normalized address and per source, at the point every sign-in route shares.
- **Abuse cases:**
  - **Mail-bombing a victim:** capped at 5 links per address per hour, with a neutral response. The victim can still sign in with Google (AC-14).
  - **Targeted lockout:** an attacker keeps a victim's address limited. The window is bounded at 1 hour, Google sign-in is unaffected, and an address that stays limited for 3 consecutive windows raises an alert.
  - **Address enumeration through the limiter:** a limited request looks identical to a sent one in wording and timing (AC-12, NFR row 2).
  - **Header-less or form-encoded action calls from a public page:** refused (AC-18).
  - **Relay abuse:** the error-reporting relay forwards only to the app's own project (AC-22).
  - **Stored script in a website field:** only http(s) web addresses are accepted (AC-21), and the enforced content-security policy blocks inline injection (AC-20).
- **Security review:** Required. This is an M-size change to the authentication boundary, adds new personal data in the limit records, and changes browser security headers. Run `/security-review` before ship.

## 7. Metrics / KPIs

- **Critical/high advisories in production packages.** Baseline: 6 critical and 75 high in production packages (production-only advisory audit, 2026-10-02). Target: 0 at merge, still 0 thirty days after release.
- **Sign-in emails sent per completed email sign-in.** Baseline: TBD. Measurement plan: count sends from the mail provider log and completed email sign-ins from the app for the 14 days before release. Target: ≤ 1.5 within 30 days of release.
- **Dashboard requests that time out.** Baseline: TBD. Measurement plan: count timed-out dashboard spans in error tracking for the 14 days before release. Target: 0 within 30 days of release.
- **Browser error-report volume after release.** Baseline: the daily average for the 14 days before release. Target: no drop of more than 50 % in the 7 days after release, so monitoring has not gone dark.

## 8. Open questions

- [ ] Where do enforced content-security-policy violation reports go, so a missed source shows up before users report it? Default now: error tracking. — owner: Dmytro Hopko, due: before `sdd:design` completes
- [ ] Does any existing account use a non-ASCII email address that the new rule (AC-17) would lock out? Default now: refuse non-ASCII, and check production accounts first. — owner: Dmytro Hopko, due: before `sdd:tasks`
- [ ] Should the strict-transport header cover subdomains, given that a mail provider's click-tracking subdomain may be plain-text only? Default now: no subdomains until checked. — owner: Dmytro Hopko, due: before `sdd:design` completes
