import 'server-only';
import { cache } from 'react';

import { auth } from '@/auth';

/**
 * The session for this server render, read once (React `cache`): the acting Freelancer and the AI section's greeting
 * share it, so the greeting's account name adds no second auth() call and user lookup (ai-chat-v2 review R16-9).
 * Outside a server render (server actions, tests) it reads on every call, exactly like auth().
 */
export const readSession = cache(() => auth());
