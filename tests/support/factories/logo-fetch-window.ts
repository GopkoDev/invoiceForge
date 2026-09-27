// TODO(T01): LogoFetchWindow doesn't exist yet - `prisma/schema/*.prisma` has no such model
// (data-model.md §Entities, "new (wave 1, ADR-0008)"). T01 adds the migration and Prisma model;
// once it does, replace this stub with a real `prisma.logoFetchWindow.create(...)` factory
// keyed on (userId, windowStart), and add "LogoFetchWindow" to
// tests/support/db/truncate.ts APP_TABLES.
//
// Left as a stub rather than invented schema, per this task's brief: "leave a clearly marked
// TODO stub or skip it rather than inventing schema".

export function createLogoFetchWindow(): never {
  throw new Error(
    'createLogoFetchWindow: LogoFetchWindow model does not exist yet - T01 adds it. ' +
      'See tests/support/factories/logo-fetch-window.ts.'
  );
}
