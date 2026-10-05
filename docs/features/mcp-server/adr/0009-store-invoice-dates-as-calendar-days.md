---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead"]
updated_at: "2026-10-05"
feature_size: "M"
ticket: "mcp-server"
---

# 0009 — Store invoice dates as calendar days

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** Dmytro Hopko (Architect), with Claude during the review fixes (review-2026-10-05 F-02, G-01; review-2026-10-05-r2 H-01, H-05, H-13)

## Context

Spec §1 says an invoice's issue date and due date are calendar days, compared with "today" in the account time zone (ADR-0006). Until this feature the editor stored the browser's local-midnight instant, or a time of day, in the `Invoice.issueDate` and `Invoice.dueDate` timestamp columns. The day an owner saw depended on their browser zone, so the overdue rule (ADR-0005), the dashboard periods and the Assistant date filters could disagree by a day. Changing what the two columns mean is irreversible: a value cut to a calendar day cannot be turned back into the original instant.

Most accounts have no saved zone when this release ships (`User.timeZone` is new and has no backfill), so the right day for their existing values is not known at migration time.

## Decision drivers

- Quality goal 1 / AC-12, AC-23b, AC-24: one overdue answer and one set of period figures on every surface.
- G-01: never lock in a wrong day. A legacy value read in the wrong zone moves to the day before or after, and that cannot be undone.
- ADR-0006: the account zone decides "today"; the browser only seeds it the first time.

## Considered options

1. **Calendar days at `T00:00:00Z`, converted lazily** — store the picked day at UTC midnight and compare by day; the migration converts only owners with a saved zone; every other owner's legacy values are converted when their zone is first saved.
2. **Calendar days, converted in one migration with a UTC fallback** — owners without a zone get their values cut at the UTC day. This was the first migration text (d836bd0). It moves a Kyiv local-midnight value to the day before, for good.
3. **Keep instants and compare them in the account zone** — no data change, but every reader (SQL, Prisma, TS, the editor) must convert, and a value saved from another browser zone still shows a different day.

## Decision outcome

**Chosen:** Option 1.

- **Storage and comparison.** An issue or due date is stored as that day at `T00:00:00Z` (the column stays timestamp). It is shown by its UTC Y/M/D in every browser zone and compared by day (`::date` / UTC-midnight bounds) by the overdue rule, the dashboard and Assistant periods and the Assistant date filters. Only "today" and the named period days come from the account zone.
- **Migration.** `20261005100000_normalize_invoice_calendar_dates` converts only the rows of owners whose saved zone `pg_timezone_names` knows. There is no UTC fallback. A value already at UTC midnight is left alone, so a second run changes nothing.
- **Lazy normalisation.** When `User.timeZone` goes from NULL to a value (the first-visit seed from the browser cookie, or a first settings save), the same transaction converts that Freelancer's legacy values to the day they saw, in that zone (`lib/services/_shared/invoice-calendar-days.ts`, the same expression as the migration). The saved zone is the "already done" marker, so a later zone change moves no date. Until then a legacy value is read as its UTC day. The `(protected)` and `(invoice-editor)` layouts both mount the seed cookie.
- **Editor save.** `updateInvoice` keeps an unedited legacy date. The editor sends the stored instants it was built from (`loadedIssueDate` / `loadedDueDate`, ISO datetimes). When the loaded value is not a UTC midnight and the submitted day equals its UTC day, the date is not rewritten. A client-supplied loaded value can at most make the save keep the stored value; it never writes a new one. Inside the update transaction the row's dates are re-read under `FOR UPDATE` (joined to the owner's `SenderProfile`), and an unedited date keeps that current value, so a normalisation that ran since the editor loaded is not overwritten.
- **Input.** The server action and the service accept only `yyyy-MM-dd` strings. A `Date` is refused. The editor's client-side check uses a separate client-only schema.

## Consequences

**Positive**
- The overdue rule, the dashboard and every Assistant compare the same day, whatever the browser zone.
- No value is cut before the right zone is known, so no wrong day is locked in by the migration or by an editor save.

**Negative**
- The day a legacy value becomes is decided by the browser zone at the first visit. A wrong browser zone at that moment (a VPN, travel, a misconfigured machine) cuts the legacy values to that zone's day. The owner accepted this risk; the dates stay editable.
- Until the first zone save, a legacy value shows its UTC day on surfaces that read it before the first dashboard or invoices visit.
- The migration was edited in place (d836bd0 had a UTC fallback; fba8a91 removed it under the same folder name). Any kept database that ran the old text has a checksum mismatch and dates already cut at the UTC day. This is a pre-ship check in spec §8 (review-2026-10-05-r2 H-02).
- The change is one-way: the down script is a no-op, because the old instants cannot be restored.

**Neutral**
- The previous build reads the new values as instants at UTC midnight, so a code rollback is safe.
- The update transaction takes one extra row lock on the invoice being saved.

## Links

- Spec: [[../spec.md]] §1, §8, AC-12, AC-23b, AC-24
- SAD: [[../sad.md]] §8 (Calendar-day storage)
- Data model: [[../data-model.md]]
- Related ADR: [[0005-compute-overdue-at-read-time-from-one-shared-rule-module]], [[0006-save-the-freelancer-time-zone-on-the-account]]
- Related: security-patch ADR-0004 (shared calendar dates and the 5-year rule)
- Reviews: [[../_review/review-2026-10-05-r2]] H-01, H-02, H-05, H-13
