// `server-only` throws outside the Next.js server bundle; neutralise it for integration runs.
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));
