---
id: T17
title: "Render legacy non-web addresses as plain text and never load them as images"
layer: "ui"
deps: ["T16"]
blocks: ["T20"]
acs: ["AC-21"]
files_hint: ["components/layout/contacts/contact-card/contact-card.tsx", "components/invoice-editor/invoice-pdf-document.tsx", "components/settings/profile-settings.tsx", "components/customers/", "components/sender-profiles/", "tests/component/"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

# T17 — Render legacy non-web addresses as plain text and never load them as images

## Place in the sequence

- **Blocked by:** T16 — Accept only http(s) web addresses for website and image fields, in forms and the business layer · **Blocks:** T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit · **Wave:** 3 (needs `isWebAddress` from T16).
- **Lane:** own lane. UI tasks are not auto-serialized; no `files_hint` overlap with T7, T12 or T14.

## Why (user story)

> **As a** Freelancer
> **I want** the app to tell my browser to block injected content, refuse framing, use encrypted connections only, and accept only web addresses as customer websites
> **So that** a malicious link or stored value cannot run in my session
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task delivers the display half: a stored value that fails `isWebAddress` is never an `href` or an image `src`, and the editors show the web-address field message.

## Inlined context

> **Unsafe stored URLs.** Website, image and logo values pass the web-address rule on save. On display, a value that fails the rule, including the copy on an issued invoice, is rendered as plain text: never an `href`, never an image `src`, on SCR-09 and in the invoice PDF (SCR-10). Stored data is not rewritten.
>
> — `sad.md §8, Unsafe stored URLs, verbatim` · full text: [sad.md](../sad.md)

> **SCR-09 legacy address** — A stored website, image or logo that fails `isWebAddress`, saved before this change. The website renders as **plain text** with no `href`. The image gets no `src`, so `AvatarFallback` initials show. The stored value is not rewritten. The rule sits in `ContactCard` (D-S4). Components: `ContactCard`, `AvatarFallback`.
>
> **SCR-05 legacy address (lists)** — **D-S4:** the Customers list and the Sender profiles list render through `ContactCard`. A stored website that fails `isWebAddress` renders as plain text with no `href`. A stored image or logo that fails it gets no `src` and shows `AvatarFallback` initials.
>
> **SCR-05 validation: profile image** — Settings → Profile: an avatar URL that fails `isWebAddress` → `FieldError` "The address must start with http:// or https://." The avatar preview shows fallback initials, never the value as `src`. Nothing is saved (decision D-3). Components: `ProfileSettings`, `Field`, `FieldError`, `AvatarFallback`.
>
> **SCR-07 validation: web address** — `website` or `image` is not http(s). The client resolver (`isWebAddress`) — or, if the form was bypassed, the server `VALIDATION` `fieldErrors` mapped through `form.setError` — shows `FieldError` "The address must start with http:// or https://." next to the field. Nothing is saved, and the editor stays open. Components: `Field`, `Input`, `FieldError` (`CustomerForm`).
>
> **SCR-08 validation: website** — same message via client resolver or server `fieldErrors` through the existing `form.setError` loop (`SenderProfileForm`). **validation: logo** unchanged, https only.
>
> **SCR-10 legacy address** — The copy of the sender logo kept on the invoice fails `isWebAddress`. `InvoicePDFDocument` currently renders any stored `data:` logo directly; that path is removed, so a non-web logo is never rendered as an image and the PDF shows no logo. No customer or sender website is printed in the PDF today, so there is no link to neutralise. The stored copy is not rewritten.
>
> — `screens.md §SCR-05, SCR-07, SCR-08, SCR-09, SCR-10, abridged` · full text: [screens.md](../screens.md)

```text
|  ( AC )  Acme Corp                       |  <- initials: legacy image has no src
|  🌐 javascript:alert(1)                  |  <- plain text, not a link
```
— `screens.md §SCR-09, wireframe, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** The new messages reuse the existing shadcn/ui primitives and tokens from `docs/design-system.md`. No new primitive and no new client state library.
>
> — `sad.md §4, UI architecture, abridged` · full text: [sad.md](../sad.md)

Code facts at breakdown time: `contact-card.tsx:54` renders `AvatarImage src={avatar.src}`; `contact-card.tsx:112-114` renders the website with `href={contactInfo.website}`; `invoice-pdf-document.tsx:192` keeps `senderProfile.logo` when it `startsWith('data:')`; `profile-settings.tsx:44` previews `user.image`.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-21 (US-08) — error

> **Given** a Freelancer editing a customer or a sender profile
> **When** they save a website, or any other web address or image address they type, that is not a web address (http or https), for example a script or data link
> **Then** the system refuses to save and tells them the address must start with http or https. A non-web value saved before this change, including the copy kept on an issued invoice, is shown as plain text, never as a clickable link or a loaded image; stored data is not rewritten
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `components/layout/contacts/contact-card/contact-card.tsx`: render `AvatarImage` only when `isWebAddress(avatar.src)`; pass `href` for the website only when it passes, otherwise show the raw value as plain text (no `https?://` stripping needed for the plain-text case).
- [ ] Check `components/customers/` (`customer-info-sidebar.tsx`, `customers-list.tsx`) and `components/sender-profiles/` (`sender-profile-info-sidebar.tsx`, `sender-profiles-list.tsx`) render through `ContactCard`; route any direct `href`/`src` use through the same rule.
- [ ] `components/invoice-editor/invoice-pdf-document.tsx`: remove the `startsWith('data:')` logo path (line ~192); a non-web snapshot logo renders no image.
- [ ] `components/settings/profile-settings.tsx`: avatar preview uses `src` only when `isWebAddress`, else `AvatarFallback`; resolver shows the `FieldError`.
- [ ] `customer-form.tsx` / `sender-profile-form.tsx`: confirm server `fieldErrors` for `website`/`image` map through `form.setError` and show under the field.
- [ ] Component tests in `tests/component/`: ContactCard legacy website → no anchor, text shown; legacy image → no `img`, initials shown; valid https → link + image; PDF document with `data:` logo → no `Image`; profile avatar `javascript:` → field error, fallback preview; customer form server `fieldErrors` → `FieldError` text.

## Edge cases

| Case | Behaviour |
|---|---|
| Stored website `javascript:alert(1)` | plain text, no `<a>` |
| Stored image `data:image/png;base64,…` | no `src`; `AvatarFallback` initials |
| Valid `https://` website / image | clickable link / loaded image (unchanged) |
| Issued invoice snapshot logo `data:…` | PDF shows no logo; snapshot not rewritten |
| Valid https logo | fetched server-side into `logoBase64` and rendered (unchanged) |
| Empty / null website or image | rendered as today (nothing / initials) |
| Profile avatar typed as `data:` | `FieldError`; preview shows initials, never the typed value as `src` |

## Definition of Done

- [ ] Component tests for ContactCard, InvoicePDFDocument, ProfileSettings and the forms' field-error mapping pass.
- [ ] No component renders a value failing `isWebAddress` as `href` or `src` (grep of touched components confirms).
- [ ] Stored data untouched (no migration, no write path changed here).
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
