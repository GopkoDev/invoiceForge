# Audit — data-model editor-ux (2026-10-09)

## Outcome

**No schema change. Zero staged migrations.** `docs/features/editor-ux/migrations/` is intentionally not created. This is a valid outcome, not a failure. The spec adds no field and stores or sends nothing new (spec §6.1). The SAD rules out any schema, migration or index (SAD §2, §4, §6 note, §7). `data-model.md` documents the existing entities the feature reads and the existing index behind each SAD §6 read.

Nothing was written into the live `prisma/migrations/` tree. With no staged pair, `implement` has nothing to promote. `tasks` must not generate a `layer: migration` task.

## Conventions (derived)

- Source: architecture-map §Migrations (`prisma migrate`, split schema `prisma/schema/{base,auth,invoice}.prisma`, folders `YYYYMMDDhhmmss_snake_case`) + SAD §2/§4/§8. They are corroborated by `prisma/migrations/` and the schema.
- Promote-time hint (for reference only): the repo is timestamp-named; the latest folder is `20261007100300_single_default_bank_account`.
- Convention deviations: none (nothing generated).

## Self-check (4 mandatory)

| Check | Result |
|---|---|
| Naming matches the repo | PASS — n/a, no DDL; every index name cited exists in `prisma/migrations/` (verified by grep) |
| Down reversibility | PASS — n/a, no `.up.sql` |
| FK indexes | PASS — every FK the feature reads already has an index (`SenderProfile_userId_idx`, `InvoiceItem_invoiceId_idx`, `Invoice_senderProfileId_idx`, `Invoice_customerId_idx`, `CustomPrice_customerId_idx`) |
| Convention adherence | PASS — no house style imposed |

Mermaid: `mmdc` is not installed. The structural lint passed: valid cardinality glyphs (`||--o{`) and `type name [PK|FK|UK] "comment"` attribute lines.

## Drift detection

The domain layer is the Prisma client generated from `prisma/schema/*.prisma`, so `field-without-column` / `column-without-field` cannot arise between the code and the schema file. Every column the feature reads (`User.timeZone`, `Invoice.issueDate/dueDate/version/subtotal/taxRate/taxAmount/discount/shipping/total/currency`, `InvoiceItem.quantity/rate/amount`, `SenderProfile.isDefault/invoicePrefix/invoiceCounter`, `BankAccount.isDefault`, `CustomPrice.createdAt`) exists in the schema and has a creating migration. A schema-vs-migrations diff (`prisma migrate diff --from-migrations`) needs a shadow database and was not run offline. **No drift found; no `_drift/` fixes proposed.**

## Data-level dependency (not a schema change)

AC-08 shows `issueDate` / `dueDate` as their **UTC** calendar day. That is correct for values stored at 00:00:00 UTC by `20261005100000_normalize_invoice_calendar_dates`. Legacy values whose owner has no saved time zone are not yet at midnight and are also read as their UTC day, which that migration specifies. The test plan should include one such legacy fixture (see data-model.md "Test fixtures").

## Breaking-change decompositions

None.

## Open `<!-- TBD -->`

None.

## Next stage

Route `standard`. `api` is N/A here: no contract change (no new or changed endpoint, server action, event or public signature — SAD §4). Skip target: `/sdd:tasks editor-ux`. Because the feature targets `web-frontend`, `screens` runs between `api` and `tasks` if UI states are needed.
