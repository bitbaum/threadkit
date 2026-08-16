import type { Message, Participant, Thread } from './types.js';

/**
 * Authorization. Every access decision in the library lands here.
 *
 * These are pure functions over data you already loaded, which is the point:
 * the usual way this goes wrong is a `where` clause that is correct while there
 * is exactly one clinic, one doctor, or one tenant, and silently wrong on the
 * day there are two. A predicate you can unit-test against a three-participant
 * thread does not have that failure mode.
 */

export function findParticipant(
  thread: Thread,
  actorId: string
): Participant | undefined {
  return thread.participants.find(p => p.actorId === actorId);
}

/** Has this actor ever been part of the thread? Necessary, never sufficient — see `canSeeMessage`. */
export function canRead(thread: Thread, actorId: string): boolean {
  return findParticipant(thread, actorId) !== undefined;
}

/**
 * May this actor post right now?
 *
 * Someone who has left keeps their history but loses their voice, so `leftAt`
 * is compared against the clock rather than merely being present.
 */
export function canWrite(thread: Thread, actorId: string, now: Date = new Date()): boolean {
  const p = findParticipant(thread, actorId);
  if (!p) return false;
  if (p.canWrite === false) return false;
  if (p.leftAt && p.leftAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * The half-open interval `[from, to)` of message timestamps this participant may see.
 * `from === null` means "since the beginning"; `to === null` means "still open".
 */
export function visibilityWindow(p: Participant): { from: Date | null; to: Date | null } {
  const from = p.visibleFrom === 'thread-start' ? null : (p.visibleFrom ?? p.joinedAt);
  return { from, to: p.leftAt ?? null };
}

export function canSeeMessage(p: Participant, message: Message): boolean {
  const { from, to } = visibilityWindow(p);
  const at = message.createdAt.getTime();
  if (from && at < from.getTime()) return false;
  if (to && at >= to.getTime()) return false;
  return true;
}

/**
 * The messages this actor may see, in the order they were given.
 *
 * A non-participant gets an empty list rather than an exception, so a caller
 * that forgets to check `canRead` first still leaks nothing. Failing closed is
 * the entire point.
 */
export function visibleMessages(
  thread: Thread,
  actorId: string,
  messages: readonly Message[]
): Message[] {
  const p = findParticipant(thread, actorId);
  if (!p) return [];
  return messages.filter(m => m.threadId === thread.id && canSeeMessage(p, m));
}

/**
 * Who has seen this message, derived from each participant's read high-water mark.
 *
 * The author is excluded — "seen by" means seen by someone else. Participants
 * who could never see the message are excluded too, so a receipt never implies
 * access that does not exist.
 */
export function readersOf(thread: Thread, message: Message): Participant[] {
  return thread.participants.filter(p => {
    if (p.actorId === message.authorId) return false;
    if (!canSeeMessage(p, message)) return false;
    if (!p.lastReadAt) return false;
    return p.lastReadAt.getTime() >= message.createdAt.getTime();
  });
}
