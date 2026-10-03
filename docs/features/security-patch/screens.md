---
status: draft
feature_size: "M"
tool: "code"
updated_at: "2026-10-02"
---

# Screens — security-patch

> The canonical **screen manifest** — every screen in every state — produced by `screens` (between
> `api` and `tasks`) and read by `tasks` (each `ui` task cites SCR ids + states), `implement`
> (builds the screen to the declared states) and `review` (the built screen must match this).
> Downstream stages reference **only this manifest** — never the raw Figma / `.pen` file.

## Source

- **Tool:** code. Copied from `docs/design-system.md`, which is a code-only canon. This is the canon's own mode, not a degradation.
- **File:** the wireframes are inline below. Only states with a new or changed layout get one. Unchanged states point to the existing page.
- **Component inventory:** the registered components in `docs/design-system.md` (`LoadError`, `ConfirmationModal`), plus the de-facto primitives in `components/ui/*`: `Alert`, `Avatar`/`AvatarImage`/`AvatarFallback`, `Button`, `Calendar`, `Card`, `Field`/`FieldError`/`FieldDescription`, `Input`, `Popover`, `Spinner`, `Sonner` toasts. App components reused by name:
  - `LoginForm` (`components/auth/login-form.tsx`)
  - `DashboardFilters` (`components/dashboard/header/dashboard-filters.tsx`)
  - `GdprSettings`, `ProfileSettings` (`components/settings/`)
  - `CustomerForm`, `CustomerInfoSidebar`, `CustomersList` (`components/customers/`)
  - `SenderProfileForm`, `SenderProfileInfoSidebar`, `SenderProfilesList` (`components/sender-profiles/`)
  - `ContactCard` (`components/layout/contacts/contact-card/`)
  - `InvoicePDFDocument`, `PDFPreviewPanel` (`components/invoice-editor/`)
- **Posture:** responsive-both (from `ux-flows.md`). Every state below works at desktop and phone widths.
- **Strings:** inline, because the app has no i18n layer. A message the contract fixes is shown **verbatim** from its exported constant or from the result's `error` / `fieldErrors`:
  - `EMAIL_SIGNIN_UNAVAILABLE`, `EMAIL_SEND_FAILED` (`lib/actions/login-actions.ts`)
  - `PERIOD_TOO_LONG` (`lib/validations/dashboard-period.ts`)
  - the web-address messages (`lib/validations/web-address.ts`)
- **Error routing** (`contracts/server-actions.md` §ActionResult): the new `RATE_LIMITED` goes to an inline message on the current screen, never to `error.tsx`. Every other code keeps the architecture-hardening routing.
- **Decisions made in this stage** (screens confirm, 2026-10-02):
  - SCR-02 copy becomes neutral (D-S1).
  - The AC-07b notice is shown inline in the filter popover (D-S2).
  - The export limit is shown as an inline `Alert` (D-S3).
  - The legacy-address display rule lives in `ContactCard`, so it also covers the lists on SCR-05 (D-S4).

## Screens

### SCR-01 — Sign-in

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Visitor opens sign-in. Also when the sign-in check fails: the page renders, with no redirect loop (AC-06; flow US-02 A5 → A6) | `LoginForm` (unchanged layout) | existing page |
| redirected | A private page was requested without a verified session: none, malformed, or the check threw (AC-04; flow US-02 A2 → A4) | `LoginForm` | existing page |
| loading | Link request in flight. The button shows "Sending…" and stays in that state for the response floor on both the sent and the limited path (AC-12, AC-13) | `LoginForm`, `Button` + spinner (existing) | existing page |
| validation | `signInWithEmail` → `VALIDATION`, or the client schema refuses: longer than 254 characters or not ASCII-only. `FieldError` "Enter a valid email address." shows under the email `Input`. Nothing is sent (AC-17; flow US-06 E1 → E2) | `Field`, `Input`, `FieldError` | wireframe below |
| error: email unavailable | `signInWithEmail` → `FAILED` `EMAIL_SIGNIN_UNAVAILABLE`: `toast.error` "Sign-in by email is temporarily unavailable. Try again shortly, or sign in with Google." Google stays enabled (AC-15; flow US-05 S2 → S3) | `Sonner` (existing `toast.error(result.error)` path) | wireframe below |
| error: could not send | `signInWithEmail` → `FAILED` `EMAIL_SEND_FAILED`: `toast.error` "We couldn't send the sign-in email. Try again." (AC-16; flow US-06 E4 → E6) | `Sonner` | — |
| error: link expired | Opening an expired or used Sign-in link lands on the existing sign-in error message (sad.md §6 flow 9 `else token expired`) | existing `(auth)/error` page | existing page |
| success | Link sent **or** limited, which are indistinguishable → SCR-02 (AC-11, AC-12, AC-13). Google → SCR-04, even while the address is limited (AC-14) | — | SCR-02 / SCR-04 |
| empty | N/A: a form page with no Freelancer data | — | — |

```text
+------------------------------------------+
|   Login with your Google account or email|
|  [x] I confirm I am 18+ and agree to ... |
|  [ G  Login with Google               ]  |
|  ---------- OR CONTINUE WITH EMAIL ------|
|  [ xn--ü@exämple.com                   ] |  <- red outline
|  Enter a valid email address.            |  <- FieldError (validation)
|  [ ✉ Continue                          ] |
+------------------------------------------+
 toast (error: email unavailable), bottom of screen:
 ( ! Sign-in by email is temporarily unavailable.
     Try again shortly, or sign in with Google. )
```

### SCR-02 — Check your inbox

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Reached after a link request that was sent **or** limited. Both paths show the same page, with identical wording and a comparable wait (AC-11, AC-12, AC-13). **Copy change (D-S1):** the current "A sign in link has been sent to your email address." claims a send that the limited path never made. It is replaced by one neutral line that is true for both paths | `Card`, `CardHeader`, `CardDescription`, `CardContent` (existing page) | wireframe below |
| loading | N/A: a static page, rendered once the redirect completes | — | — |
| empty | N/A: no data | — | — |
| error | N/A: every send failure stays on SCR-01 (AC-15, AC-16). A limited request is deliberately **not** an error (spec §6.1 enumeration) | — | — |

```text
+------------------------------------------+
|                 ( ✉ )                    |
|            Check your email              |
|  If this address can receive sign-in     |
|  links, we've sent one. Check your inbox.|
+------------------------------------------+
```

### SCR-03 — Landing page

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Visitor opens `/`. It renders even when the sign-in check fails, with no redirect loop (AC-06; flow US-02 A5 → A6) | existing landing components (unchanged) | existing page |
| loading | N/A: unchanged by this feature | — | — |
| empty | N/A: public marketing page with no Freelancer data | — | — |
| error | N/A: a failed sign-in check is the `default` row, not an error state. No other branch reaches this page | — | — |

Wireframe: the existing page is unchanged. Only its behaviour under a failing check is pinned.

### SCR-04 — Dashboard

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| loading | Page request in flight | existing `dashboard/loading.tsx` skeletons | existing |
| default | Verified session, period from the link: a preset (default this month), "All time" with the full history and no cap (AC-09), or a custom period within 5 calendar years (AC-05, AC-08; flow US-03 D2/D3/D4). The filter label shows the applied range | `DashboardFilters`, existing dashboard sections | existing page |
| default (link fallback) | A custom period longer than 5 years, or a malformed one, falls back **silently** to the current month, with no notice and no slow load (AC-07, AC-08 boundary; flow US-03 D1 → D2) | as default | existing page |
| validation: period too long | In the filter `Calendar`, the Freelancer picks a range whose end is past start + 5 calendar years. **D-S2:** the range is not applied and there is no navigation. The `Popover` stays open with the selection visible, and an inline `Alert` under the calendar shows `PERIOD_TOO_LONG`. The notice clears on the next pick: a preset, or a range within the cap (AC-07b; flow US-03 F0 → F1; sad.md §6 flow 4 `else`) | `Popover`, `Calendar`, `Alert` | wireframe below |
| empty | Unchanged: the existing per-section empty rendering for a period with no invoices | existing | existing |
| error | Load fails → `LoadError` via the segment `error.tsx` (unchanged). A data request while the check fails is refused → `goToSignIn()` → the session-check route, which shows SCR-05 **check unavailable** while the check still fails and SCR-01 only once the account is definitively gone. The session is not ended (AC-04; flow US-02 A3 → A7 → A8) | `LoadError` | existing |

```text
+------------------------------------------------------------+
| Dashboard                         [📅 Jan 01, 2026 - ...]   |
|   +-----------+------------------------------------------+ |
|   | This Month| <  Jan 2020  >        <  Feb 2026  >     | |
|   | Last Month|  [01]..............    .........[02]     | |
|   | This Year |                                          | |
|   | Last Year | (!) A custom period can be at most 5     | |
|   | All Time  |     years. Choose "All time" to see your | |
|   |           |     full history.                        | |
|   +-----------+------------------------------------------+ |
|  (dashboard below still shows the previous applied period) |
+------------------------------------------------------------+
```

### SCR-05 — Other private page

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Verified session opens any private page directly, and is never bounced to sign-in (AC-05; flow US-02 A3) | existing pages | existing |
| redirected | No verified session at the edge → SCR-01 (AC-04; flow US-02 A2 → A4) | — | SCR-01 |
| check unavailable | The edge saw a verified session, but the server-side account check fails. The layout's `requireLiveUser()` redirects to the session-check route, whose own check fails again, or which gets no session while a session cookie is present. That route answers `503` with `Cache-Control: no-store` and `Retry-After`, and never sets a cookie expiry. The page uses LoadError's wording: "We couldn't load your data", "Something went wrong on our side. Your data is safe and you are still signed in. Try again." The **Try again** link goes to the requested page, taken from `?next=` or a same-origin Referer. It is used only when it is a same-origin relative path that is not under `/api/`. Otherwise the link goes to `/dashboard` (AC-04; flow US-02 A2 → A8; sad.md §6 flow 2) | static HTML rendered by `app/api/auth/clear-session/route.ts`, with the `LoadError` copy and the `Empty`/`Button` tokens | wireframe below |
| action refused | A data or action request while the check fails → `UNAUTHORIZED` → existing `goToSignIn()` routing. The session is not ended (AC-04; flow US-02 A7) | existing routing | — |
| legacy address (lists) | **D-S4:** the Customers list and the Sender profiles list render through `ContactCard`. A stored website that fails `isWebAddress` renders as plain text with no `href`. A stored image or logo that fails it gets no `src` and shows `AvatarFallback` initials (AC-21 display rule; same rule as SCR-09) | `ContactCard`, `AvatarFallback` | see SCR-09 wireframe |
| validation: profile image | Settings → Profile: an avatar URL that fails `isWebAddress` → `FieldError` "The address must start with http:// or https://." The avatar preview shows fallback initials, never the value as `src`. Nothing is saved (decision D-3, `contracts/server-actions.md` §Web-address rule) | `ProfileSettings`, `Field`, `FieldError`, `AvatarFallback` | — |
| loading / empty / error | Unchanged: each route keeps its existing `loading.tsx`, empty state and `error.tsx` → `LoadError` | existing | existing |

Wireframe: no new layout except **check unavailable**. A route handler serves this state, so it can't mount the React `LoadError`. It mirrors that component in static HTML instead, with no script, and it follows the light or dark system theme. The other changes are refusal routing, the plain-text rule and one field message.

```text
+------------------------------------------------------------+
|                                                            |
|                          [ /!\ ]                           |
|               We couldn't load your data                   |
|    Something went wrong on our side. Your data is safe     |
|          and you are still signed in. Try again.           |
|                                                            |
|                       [ Try again ]                        |
|                  (→ the requested page)                    |
+------------------------------------------------------------+
```

### SCR-06 — Privacy & data settings

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Freelancer opens privacy settings | `GdprSettings` (existing) | existing page |
| loading | Export in flight: the export `Button` shows a `Spinner` and is disabled (existing `isExporting`) | `Button`, `Spinner` | existing |
| success | `200` → the file downloads + `toast.success` (unchanged). It counts toward the limit even if the file is abandoned (AC-23, AC-24) | `Sonner` | — |
| rate-limited | `429` `RATE_LIMITED` with `details.retryAt`. **D-S3:** an inline `Alert` inside the export card reads "You've reached the export limit. You can export again at {retryAt as local HH:mm}." No toast, and no `error.tsx`. The button stays enabled, and the alert clears on the next export attempt (AC-24; flow US-09 X1 → X5; contract §ActionResult "inline message") | `Alert`, `AlertTitle` | wireframe below |
| error | `500` (export failed on the system side, place freed) or limit store unavailable → existing `toast.error` "Your data couldn't be exported. Try again." (AC-24; flow US-09 X2 → X4) | `Sonner` | — |
| unauthorized | `401` → `goToSignIn()` (unchanged, AC-04) | — | SCR-01 |
| empty | N/A: a settings page with no list | — | — |

```text
+--------------------------------------------------+
| Export your data                                 |
| Download a copy of all your data (JSON).         |
| +----------------------------------------------+ |
| | (!) You've reached the export limit.         | |
| |     You can export again at 14:32.           | |
| +----------------------------------------------+ |
| [ ⤓ Export my data ]                             |
+--------------------------------------------------+
| Delete account ... (unchanged)                   |
+--------------------------------------------------+
```

### SCR-07 — Customer editor

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Create or edit a Customer (unchanged layout) | `CustomerForm` | existing page |
| validation: web address | `website` or `image` is not http(s), for example `javascript:` or `data:`. The client resolver (`isWebAddress`) — or, if the form was bypassed, the server `VALIDATION` `fieldErrors` mapped through `form.setError` — shows `FieldError` "The address must start with http:// or https://." next to the field. Nothing is saved, and the editor stays open (AC-21; flow US-08 W1 → W2; sad.md §6 flow 7, both `alt` levels) | `Field`, `Input`, `FieldError` | wireframe below |
| loading | Save in flight (unchanged submit state) | existing | existing |
| success | Saved → SCR-09 (unchanged) | `Sonner` | SCR-09 |
| error | Other failures keep the existing `toast.error(result.error)` | `Sonner` | — |
| empty | N/A: a form | — | — |

```text
| Website                                  |
| [ javascript:alert(1)                  ] |  <- red outline
| The address must start with http:// or https://.
| Branding — Image URL                     |
| [ data:image/png;base64,...            ] |  <- red outline
| The address must start with http:// or https://.
```

### SCR-08 — Sender profile editor

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Edit a sender profile (unchanged layout) | `SenderProfileForm` | existing page |
| validation: website | `website` is not http(s) → `FieldError` "The address must start with http:// or https://.", shown by the client resolver or by the server `fieldErrors` through the existing `form.setError` loop. Nothing is saved (AC-21; flow US-08 W1 → W2) | `Field`, `Input`, `FieldError` | as SCR-07 wireframe |
| validation: logo | Unchanged rule, https only: "The link must be a secure web address (https://…)." (architecture-hardening AC-04, stricter than AC-21) | `FieldError` | existing |
| loading / success / error | Unchanged: save in flight; saved → SCR-09; other failures → `toast.error` | existing | existing |
| empty | N/A: a form | — | — |

### SCR-09 — Customer / sender profile detail

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Stored addresses pass `isWebAddress`: the website is a clickable link and the image or logo loads (flow US-08 W3) | `CustomerInfoSidebar` / `SenderProfileInfoSidebar` → `ContactCard`, `AvatarImage` | existing page |
| legacy address | A stored website, image or logo that fails `isWebAddress`, saved before this change. The website renders as **plain text** with no `href`. The image gets no `src`, so `AvatarFallback` initials show. The stored value is not rewritten (AC-21; flow US-08 V1 → V2; sad.md §6 flow 7 `else legacy`). The rule sits in `ContactCard` (D-S4) | `ContactCard`, `AvatarFallback` | wireframe below |
| loading / empty / error | Unchanged: existing `loading.tsx`, `not-found.tsx` and `error.tsx` → `LoadError` | existing | existing |

```text
+------------------------------------------+
|  ( AC )  Acme Corp                       |  <- initials: legacy image has no src
|  ✉ billing@acme.com                      |
|  ☎ +1 555 0100                           |
|  🌐 javascript:alert(1)                  |  <- plain text, not a link
+------------------------------------------+
```

### SCR-10 — Invoice PDF

| State | Trigger / condition | Components (from the inventory) | Source-ref |
|---|---|---|---|
| default | Preview, download or print with a valid https logo: the logo is fetched server-side into `logoBase64` and rendered (unchanged) | `PDFPreviewPanel`, `InvoicePDFDocument` | existing |
| legacy address | The copy of the sender logo kept on the invoice fails `isWebAddress`. `InvoicePDFDocument` currently renders any stored `data:` logo directly; that path is removed, so a non-web logo is never rendered as an image and the PDF shows no logo. No customer or sender website is printed in the PDF today, so there is no link to neutralise. The stored copy is not rewritten (AC-21; flow US-08 V2) | `InvoicePDFDocument` | — |
| loading / error | Unchanged: the existing preview loading and logo-warning handling | existing | existing |
| empty | N/A: a document view of one invoice | — | — |

Wireframe: no new layout. The PDF only loses a logo it must not load.

## Coverage notes

- **Inventory:** every SCR-01…SCR-10 row in `ux-flows.md` has a section above.
- **Not drawn (no screen):** AC-01, AC-10, AC-18, AC-22, AC-25, AC-26, AC-27 (see `ux-flows.md` §AC coverage). AC-20 (CSP) adds no state. It must hold for every state above with zero policy violations, including `AvatarImage` sources, the dashboard chart and the PDF preview.
- **Beyond the ux-flows inventory:** the Settings → Profile avatar field (decision D-3) and the Customers / Sender profiles lists (D-S4) are both parts of SCR-05. They are listed there, not as new SCR ids.

## New components

None — all screens compose the existing inventory. `ContactCard`, `DashboardFilters`, `GdprSettings`, `InvoicePDFDocument` and the two forms gain states. None needs a new primitive.

| Component | Why no existing primitive fits | Registered in design-system |
|---|---|---|
| — | — | — |
