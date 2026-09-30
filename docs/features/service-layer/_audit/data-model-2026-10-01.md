# Data-model audit — service-layer (2026-10-01)

## Outcome

**No schema change. Zero staged migrations.** `docs/features/service-layer/migrations/` is intentionally absent. This is a valid outcome of `data-model`: the spec rules out any change to the stored data model and any data migration (spec §3, §6). Nothing was written into the live `prisma/migrations/` tree.

## Conventions detected

- Tool: `prisma migrate` (architecture-map `migration_tool`), with the split schema in `prisma/schema/{base,auth,invoice}.prisma`.
- Naming: folders `YYYYMMDDhhmmss_snake_case`. Prisma default index names. The latest is `20260930200100_drop_invoice_number_exact_unique` (16 migrations in all).
- **Promote-time hint:** not applicable, because nothing is staged. A later schema feature would take the next timestamp at promotion.
- Deviations from convention: none.

## Self-check

| Check | Result |
|---|---|
| Naming matches the repo | Pass. No new identifiers. Every index named in `data-model.md` exists under that name in `prisma/migrations/` |
| Down reversibility | N/A. No up migration, so there is nothing to reverse |
| FK indexes | Pass for this feature, which adds no FK. **Pre-existing gap:** `Invoice.bankAccountId` has no index (see findings) |
| Convention adherence | Pass. No convention imposed |
| ER diagram parses | Pass (`mmdc`) |

## Drift detection

The domain layer is the Prisma schema itself, and the TypeScript DTOs in `types/` are derived from it, not persisted. Comparing the schema's `@@index` / `@@unique` / `@id` declarations with the indexes that the migration SQL creates and drops found no `field-without-column`, `column-without-field`, `type-mismatch` or `nullability-mismatch`. Nothing was written to `_drift/`.

## Findings (deferred, not blockers)

1. **`Invoice(bankAccountId)` has no index.** The FK is `ON DELETE RESTRICT`, so deleting a bank account scans `Invoice` for the check. This gap is pre-existing, and no SAD §6 flow queries by bank account. Recommendation: add the index in the next schema feature (an existing table, so `CREATE INDEX CONCURRENTLY`, one statement per migration).
2. **Composite dashboard index** `Invoice(senderProfileId, status, currency, issueDate)`. Deferred to roughly 100,000 invoices per Freelancer (SAD §7).
3. **Trigram search index.** Deferred to roughly 10,000 records per list per Freelancer (SAD §7, ADR-0005).
4. **Owner path of `CustomPrice` writes.** The owner path is `customer.userId`, and writes must also check `product.userId`. That makes it the one entity whose owner-scoped write needs two relation filters. The Prisma relation-filter-in-unique-`where` risk (SAD §11) applies here first.

## TBD

None.

Next stage: `api service-layer`.
