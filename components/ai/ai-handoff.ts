// ai-chat-v2 T26 (ADR-0009; sad.md §6 critical flow 3): the dashboard prompt reaches the AI section through a
// one-time sessionStorage entry. The address carries only the id (`/ai?handoff={id}`), never the text; the island
// takes and deletes the entry once, so a reload, Back or another tab finds nothing and sends nothing.

export const HANDOFF_PARAM = 'handoff';
const KEY_PREFIX = 'ai-handoff:';

function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Stores the prompt under a new one-time id; null when the browser blocks storage. */
export function writeHandoff(text: string): string | null {
  try {
    const id = newId();
    window.sessionStorage.setItem(KEY_PREFIX + id, text);
    return id;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

/** Subscribes to entries being taken (for useSyncExternalStore). */
export function subscribeHandoffs(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** True while an entry is waiting under `id`; false when missing, taken or blocked. */
export function hasHandoff(id: string): boolean {
  try {
    return window.sessionStorage.getItem(KEY_PREFIX + id) !== null;
  } catch {
    return false;
  }
}

/** Takes the prompt stored under `id` and deletes it; null when missing, already taken or blocked. */
export function takeHandoff(id: string): string | null {
  try {
    const key = KEY_PREFIX + id;
    const text = window.sessionStorage.getItem(key);
    if (text === null) return null;
    window.sessionStorage.removeItem(key);
    listeners.forEach((notify) => notify());
    return text;
  } catch {
    return null;
  }
}
