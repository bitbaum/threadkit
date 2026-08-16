import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isPending, mergeMessages } from '../dist/index.js';

const T1 = new Date('2026-01-01T10:00:00Z');
const T2 = new Date('2026-01-01T11:00:00Z');

test('an optimistic message is replaced by its stored row, not duplicated', () => {
  const optimistic = {
    id: 'tmp-1',
    clientId: 'tmp-1',
    threadId: 't1',
    authorId: 'me',
    body: 'sent',
    createdAt: T1,
  };
  const stored = {
    id: 'server-1',
    clientId: 'tmp-1',
    threadId: 't1',
    authorId: 'me',
    body: 'sent',
    createdAt: T1,
  };

  const merged = mergeMessages([optimistic], [stored]);
  assert.equal(merged.length, 1, 'the placeholder and its confirmation are one message');
  assert.equal(merged[0].id, 'server-1');
});

test('the server version wins over the local one', () => {
  const local = { id: 'm1', threadId: 't1', authorId: 'me', body: 'draft', createdAt: T1 };
  const server = { id: 'm1', threadId: 't1', authorId: 'me', body: 'edited', createdAt: T1 };

  const merged = mergeMessages([local], [server]);
  assert.equal(merged[0].body, 'edited');
});

test('messages sharing a timestamp keep a stable order', () => {
  const a = { id: 'b', threadId: 't1', authorId: 'x', body: 'a', createdAt: T1 };
  const b = { id: 'a', threadId: 't1', authorId: 'x', body: 'b', createdAt: T1 };

  const once = mergeMessages([a, b], []).map(m => m.id);
  const twice = mergeMessages([b, a], []).map(m => m.id);
  assert.deepEqual(once, twice, 'insertion order must not change what the user sees');
  assert.deepEqual(once, ['a', 'b']);
});

test('merging is ordered by time, not by arrival', () => {
  const late = { id: 'm2', threadId: 't1', authorId: 'x', body: 'second', createdAt: T2 };
  const early = { id: 'm1', threadId: 't1', authorId: 'x', body: 'first', createdAt: T1 };

  assert.deepEqual(mergeMessages([late], [early]).map(m => m.id), ['m1', 'm2']);
});

test('a pending message is distinguishable from a confirmed one', () => {
  const pending = {
    id: 'tmp-9',
    clientId: 'tmp-9',
    threadId: 't1',
    authorId: 'me',
    body: 'x',
    createdAt: T1,
  };
  const confirmed = {
    id: 'server-9',
    clientId: 'tmp-9',
    threadId: 't1',
    authorId: 'me',
    body: 'x',
    createdAt: T1,
  };

  assert.equal(isPending(pending), true);
  assert.equal(isPending(confirmed), false);
});
