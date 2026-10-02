// First step of `pnpm build` (ADR-0008, AC-26): fail and name every missing setting.
// @ts-expect-error node's type stripping needs the explicit .ts extension
import { missingSettings } from '../lib/env/required-settings.ts';

const missing = missingSettings(process.env);
if (missing.length > 0) {
  console.error(`Missing required settings:\n${missing.map((n) => `  - ${n}`).join('\n')}`);
  process.exit(1);
}
