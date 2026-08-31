import type { Message, Thread } from './types.js';
import { findParticipant, canSeeMessage } from './participants.js';

/**
 * Unread, computed per participant.
 *
 * The whole reason this is a function over a per-participant high-water mark,
 * rather than a boolean column on the message, is that "read" is not a property
 * of a message — it is a property of a *pair*. The moment a thread has three
 * participants, a single `read_at` on the row means the first person to open it
 * clears the badge for everyone else.
 */

/** Messages this actor can see, did not write, and has not caught up to. */
export function unreadMessages(
  thread: Thread,
  actorId: string,
  messages: readonly Message[],
): Message[] {
  const p = findParticipant(thread, actorId);
  if (!p) return [];
  const since = p.lastReadAt?.getTime() ?? null;
  return messages.filter((m) => {
    if (m.threadId !== thread.id) return false;
    if (m.authorId === actorId) return false;
    if (!canSeeMessage(p, m)) return false;
    // Never read anything → everything visible from someone else is unread.
    if (since === null) return true;
    return m.createdAt.getTime() > since;
  });
}

export function unreadCount(thread: Thread, actorId: string, messages: readonly Message[]): number {
  return unreadMessages(thread, actorId, messages).length;
}

/**
 * How many threads have at least one unread message for this actor.
 *
 * This is the nav-badge number. It counts threads, not messages, because that
 * is what the badge means — "places that want you", not "things to read".
 */
export function unreadThreadCount(
  entries: readonly { thread: Thread; messages: readonly Message[] }[],
  actorId: string,
): number {
  return entries.filter((e) => unreadCount(e.thread, actorId, e.messages) > 0).length;
}
