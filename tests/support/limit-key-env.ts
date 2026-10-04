// Integration tests run without the production .env: give the limit-key HMAC a test-only
// secret, matching the one the limit-event factory hashes with.
import { TEST_LIMIT_KEY_SECRET } from './factories/limit-event';

process.env.LIMIT_KEY_SECRET ??= TEST_LIMIT_KEY_SECRET;
