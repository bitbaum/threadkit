import type { Message } from './types.js';

/**
 * Reconciling what the client has with what the server just said.
 *
 * Three things arrive out of order in any real chat: the optimistic bubble you
 * drew locally, the confirmed row that came back from your write, and whatever
 * a realtime subscription or a poll delivers. Get this wrong and the same
 * message renders twice — the single most common visible bug in a chat UI.
 */

/** Newest-last ordering with a deterministic tiebreak, so equal timestamps never jitter. */
export function compareMessages(a: Message, b: Message): number {
  const delta = a.createdAt.getTime() - b.createdAt.getTime();
  if (delta !== 0) return delta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merge `incoming` into `existing`, preferring the server's version of anything
 * both sides have.
 *
 * Identity is `id` first, then `clientId`. The `clientId` pass is what retires
 * an optimistic bubble: the stored row carries the same `clientId`, so it
 * replaces the placeholder in place instead of arriving as a second message.
 */
export function mergeMessages(
  existing: readonly Message[],
  incoming: readonly Message[]
): Message[] {
  const byId = new Map<string, Message>();
  const idByClientId = new Map<string, string>();

  const put = (m: Message) => {
    // A confirmed row supersedes the optimistic one that shares its clientId.
    if (m.clientId) {
      const placeholderId = idByClientId.get(m.clientId);
      if (placeholderId && placeholderId !== m.id) byId.delete(placeholderId);
      idByClientId.set(m.clientId, m.id);
    }
    byId.set(m.id, m);
  };

  for (const m of existing) put(m);
  for (const m of incoming) put(m);

  return [...byId.values()].sort(compareMessages);
}

/**
 * True when this message is still awaiting its server row.
 *
 * Exposed so a UI can render it at reduced opacity, with no tick, and without a
 * timestamp it might have to correct a moment later.
 */
export function isPending(m: Message): boolean {
  return m.clientId !== undefined && m.id === m.clientId;
}
