import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeMessages, readState, unreadMessages, visibleMessages } from '../dist/index.js';

const T0 = new Date('2026-01-01T09:00:00Z');
const T1 = new Date('2026-01-01T10:00:00Z');
const T2 = new Date('2026-01-01T11:00:00Z');

const person = (actorId, extra = {}) => ({
  actorId,
  kind: 'human',
  joinedAt: T0,
  visibleFrom: 'thread-start',
  ...extra,
});

const message = { id: 'm1', threadId: 't1', authorId: 'ada', body: 'hello', createdAt: T1 };

test('nobody else has read it yet', () => {
  const thread = { id: 't1', createdAt: T0, participants: [person('ada'), person('ben')] };
  const state = readState(thread, message);
  assert.equal(state.state, 'none');
  assert.equal(state.audience, 1);
});

test('read by the only other person is read by all', () => {
  const thread = {
    id: 't1',
    createdAt: T0,
    participants: [person('ada'), person('ben', { lastReadAt: T2 })],
  };
  assert.equal(readState(thread, message).state, 'all');
});

test('in a group, one reader of two is some, not all', () => {
  const thread = {
    id: 't1',
    createdAt: T0,
    participants: [person('ada'), person('ben', { lastReadAt: T2 }), person('cy')],
  };
  const state = readState(thread, message);
  assert.equal(state.state, 'some');
  assert.deepEqual(
    state.readers.map((p) => p.actorId),
    ['ben'],
  );
  assert.equal(state.audience, 2);
});

test('an assistant in the room does not hold a message at unread', () => {
  const thread = {
    id: 't1',
    createdAt: T0,
    participants: [
      person('ada'),
      person('ben', { lastReadAt: T2 }),
      { actorId: 'cat', kind: 'ai', joinedAt: T0, visibleFrom: 'thread-start' },
    ],
  };
  const state = readState(thread, message);
  assert.equal(state.state, 'all');
  assert.equal(state.audience, 1);
});

test('somebody who left is not waited for', () => {
  const thread = {
    id: 't1',
    createdAt: T0,
    participants: [person('ada'), person('ben', { lastReadAt: T2 }), person('cy', { leftAt: T2 })],
  };
  assert.equal(readState(thread, message).state, 'all');
});

test('a message nobody else can see has no audience and no readers', () => {
  const thread = {
    id: 't1',
    createdAt: T0,
    participants: [person('ada'), person('ben', { visibleFrom: T2, lastReadAt: T2 })],
  };
  const state = readState(thread, message);
  assert.equal(state.state, 'none');
  assert.equal(state.audience, 0);
});

test('rows that carry more than the package knows come back as they were', () => {
  // The generic signatures: a consumer's own fields survive every function.
  const thread = { id: 't1', createdAt: T0, participants: [person('ada'), person('ben')] };
  const rich = { ...message, senderName: 'Ada', attachments: [] };
  const [merged] = mergeMessages([], [rich]);
  assert.equal(merged.senderName, 'Ada');
  assert.equal(visibleMessages(thread, 'ben', [rich])[0].senderName, 'Ada');
  assert.equal(unreadMessages(thread, 'ben', [rich])[0].senderName, 'Ada');
});

test('a message of only files is a message', () => {
  const thread = { id: 't1', createdAt: T0, participants: [person('ada'), person('ben')] };
  const photo = {
    id: 'm2',
    threadId: 't1',
    authorId: 'ada',
    body: '',
    createdAt: T1,
    attachments: [
      { id: 'a1', kind: 'image', name: 'cat.jpg', mimeType: 'image/jpeg', bytes: 1200 },
    ],
  };
  assert.equal(unreadMessages(thread, 'ben', [photo]).length, 1);
  assert.equal(visibleMessages(thread, 'ben', [photo])[0].attachments[0].name, 'cat.jpg');
});
