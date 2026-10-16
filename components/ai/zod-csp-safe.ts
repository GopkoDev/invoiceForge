// The AI SDK validates its stream with Zod 4 schemas. Zod probes `new Function('')` to decide
// whether to compile validators, and under our CSP (no 'unsafe-eval') that probe is reported as a
// violation on /ai. Turning the compiled path off keeps the page free of violations; the
// interpreted path is the same validation. Import this module before anything from 'ai'.
import { config } from 'zod/v4/core';

config({ jitless: true });
