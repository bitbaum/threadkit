import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canRead,
  canWrite,
  readersOf,
  unreadCount,
  visibleMessages,
} from '../dist/index.js';

const T0 = new Date('2026-01-01T09:00:00Z');
const T1 = new Date('2026-01-01T10:00:00Z');
const T2 = new Date('2026-01-01T11:00:00Z');
const T3 = new Date('2026-01-01T12:00:00Z');

const patient = { actorId: 'patient-1', kind: 'human', role: 'patient', joinedAt: T0 };
const drA = { actorId: 'dr-a', kind: 'human', role: 'clinician', joinedAt: T0 };

function thread(participants, id = 'thread-1') {
  return { id, participants, createdAt: T0 };
}

function msg(id, authorId, createdAt, body = 'hello') {
  return { id, threadId: 'thread-1', authorId, body, createdAt };
}

test('a clinician who is not a participant sees nothing, whatever their role says', () => {
  const t = thread([patient, drA]);
  const messages = [msg('m1', 'patient-1', T1)];

  // dr-b is a clinician in the same clinic — and that is not a key to this thread.
  assert.equal(canRead(t, 'dr-b'), false);
  assert.equal(canWrite(t, 'dr-b'), false);
  assert.deepEqual(visibleMessages(t, 'dr-b', messages), []);
});

test('a clinician added later does not see what was said before they joined', () => {
  const drB = { actorId: 'dr-b', kind: 'human', role: 'clinician', joinedAt: T2 };
  const t = thread([patient, drA, drB]);
  const messages = [msg('m1', 'patient-1', T1), msg('m2', 'dr-a', T3)];

  const seen = visibleMessages(t, 'dr-b', messages).map(m => m.id);
  assert.deepEqual(seen, ['m2'], 'history before joining is not granted by default');
});

test('granting thread-start hands over the whole history, on purpose', () => {
  const drB = {
    actorId: 'dr-b',
    kind: 'human',
    role: 'clinician',
    joinedAt: T2,
    visibleFrom: 'thread-start',
  };
  const t = thread([patient, drA, drB]);
  const messages = [msg('m1', 'patient-1', T1), msg('m2', 'dr-a', T3)];

  const seen = visibleMessages(t, 'dr-b', messages).map(m => m.id);
  assert.deepEqual(seen, ['m1', 'm2']);
});

test('someone who left keeps their history and stops receiving what comes next', () => {
  const locum = {
    actorId: 'locum',
    kind: 'human',
    role: 'clinician',
    joinedAt: T0,
    leftAt: T2,
  };
  const t = thread([patient, locum]);
  const messages = [msg('m1', 'patient-1', T1), msg('m2', 'patient-1', T3)];

  assert.deepEqual(visibleMessages(t, 'locum', messages).map(m => m.id), ['m1']);
  assert.equal(canWrite(t, 'locum', T3), false, 'a departed participant loses their voice');
  assert.equal(canRead(t, 'locum'), true, 'but not what they already saw');
});

test('an observer can read but cannot write', () => {
  const supervisor = {
    actorId: 'supervisor',
    kind: 'human',
    role: 'observer',
    joinedAt: T0,
    canWrite: false,
  };
  const t = thread([patient, drA, supervisor]);
  const messages = [msg('m1', 'patient-1', T1)];

  assert.equal(canRead(t, 'supervisor'), true);
  assert.equal(canWrite(t, 'supervisor'), false);
  assert.equal(visibleMessages(t, 'supervisor', messages).length, 1);
});

test('a stranger gets an empty list rather than an error, so a missing check leaks nothing', () => {
  const t = thread([patient, drA]);
  const messages = [msg('m1', 'patient-1', T1)];

  // Caller forgot to gate on canRead. Failing closed is the point.
  assert.deepEqual(visibleMessages(t, 'nobody', messages), []);
  assert.equal(unreadCount(t, 'nobody', messages), 0);
});

test('a read receipt never implies access the reader does not have', () => {
  const drB = {
    actorId: 'dr-b',
    kind: 'human',
    role: 'clinician',
    joinedAt: T2,
    lastReadAt: T3,
  };
  const t = thread([patient, drB]);
  const early = msg('m1', 'patient-1', T1);

  // dr-b's clock says they have read up to T3, but m1 predates their window.
  assert.deepEqual(readersOf(t, early).map(p => p.actorId), []);
});
