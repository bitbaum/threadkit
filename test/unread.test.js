import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unreadCount, unreadMessages, unreadThreadCount } from '../dist/index.js';

const T0 = new Date('2026-01-01T09:00:00Z');
const T1 = new Date('2026-01-01T10:00:00Z');
const T2 = new Date('2026-01-01T11:00:00Z');

function msg(id, authorId, createdAt) {
  return { id, threadId: 'thread-1', authorId, body: 'x', createdAt };
}

test('one person opening the thread does not clear the badge for everyone else', () => {
  // This is the bug a `read_at` column on the message row cannot avoid: the
  // first reader marks it read for all of them.
  const patient = { actorId: 'patient-1', kind: 'human', joinedAt: T0, lastReadAt: T2 };
  const drA = { actorId: 'dr-a', kind: 'human', joinedAt: T0, lastReadAt: T2 };
  const drB = { actorId: 'dr-b', kind: 'human', joinedAt: T0, lastReadAt: null };
  const thread = { id: 'thread-1', participants: [patient, drA, drB], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  assert.equal(unreadCount(thread, 'dr-a', messages), 0, 'dr-a has caught up');
  assert.equal(unreadCount(thread, 'dr-b', messages), 1, 'dr-b has not, and still owes a read');
});

test('your own messages are never unread to you', () => {
  const patient = { actorId: 'patient-1', kind: 'human', joinedAt: T0, lastReadAt: null };
  const drA = { actorId: 'dr-a', kind: 'human', joinedAt: T0, lastReadAt: null };
  const thread = { id: 'thread-1', participants: [patient, drA], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  assert.equal(unreadCount(thread, 'patient-1', messages), 0);
  assert.equal(unreadCount(thread, 'dr-a', messages), 1);
});

test('a participant who has never read owes every visible message from someone else', () => {
  const patient = { actorId: 'patient-1', kind: 'human', joinedAt: T0 };
  const drA = { actorId: 'dr-a', kind: 'human', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, drA], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1), msg('m2', 'patient-1', T2)];

  assert.deepEqual(
    unreadMessages(thread, 'dr-a', messages).map((m) => m.id),
    ['m1', 'm2'],
  );
});

test('unread never reaches back past the day you joined', () => {
  const patient = { actorId: 'patient-1', kind: 'human', joinedAt: T0 };
  const drB = { actorId: 'dr-b', kind: 'human', joinedAt: T2, lastReadAt: null };
  const thread = { id: 'thread-1', participants: [patient, drB], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  assert.equal(
    unreadCount(thread, 'dr-b', messages),
    0,
    'a message from before dr-b joined is not theirs to owe',
  );
});

test('the nav badge counts threads that want you, not messages to read', () => {
  const me = { actorId: 'me', kind: 'human', joinedAt: T0, lastReadAt: null };
  const other = { actorId: 'other', kind: 'human', joinedAt: T0 };
  const mk = (id) => ({ id, participants: [me, other], createdAt: T0 });

  const entries = [
    {
      thread: mk('t1'),
      messages: [
        { id: 'a', threadId: 't1', authorId: 'other', body: 'x', createdAt: T1 },
        { id: 'b', threadId: 't1', authorId: 'other', body: 'x', createdAt: T2 },
      ],
    },
    { thread: mk('t2'), messages: [] },
  ];

  assert.equal(
    unreadThreadCount(entries, 'me'),
    1,
    'two unread messages in one thread is one badge',
  );
});
