import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAiTurn, whenMentioned } from '../dist/index.js';

const T0 = new Date('2026-01-01T09:00:00Z');
const T1 = new Date('2026-01-01T10:00:00Z');
const T2 = new Date('2026-01-01T11:00:00Z');
const T3 = new Date('2026-01-01T12:00:00Z');

const patient = { actorId: 'patient-1', kind: 'human', role: 'patient', joinedAt: T0 };
const doctor = { actorId: 'dr-a', kind: 'human', role: 'clinician', joinedAt: T0 };

function msg(id, authorId, createdAt, body = 'hello') {
  return { id, threadId: 'thread-1', authorId, body, createdAt };
}

/** Records what the model was shown, so the test can assert on the prompt itself. */
function spyComplete(reply = 'a reply') {
  const seen = [];
  const complete = async input => {
    seen.push(input);
    return reply;
  };
  return { complete, seen };
}

test('the AI sees only what it was granted, not the whole transcript', async () => {
  // The assistant joins an existing doctor-patient thread at T2. Everything
  // before that was said without it in the room.
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T2 };
  const thread = { id: 'thread-1', participants: [patient, doctor, ai], createdAt: T0 };
  const messages = [
    msg('m1', 'patient-1', T1, 'private history the model was never granted'),
    msg('m2', 'patient-1', T3, 'assistant, can you summarise my sleep?'),
  ];

  const { complete, seen } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
    model: 'test-model',
  });

  assert.equal(result.status, 'responded');
  assert.equal(seen.length, 1);
  assert.ok(
    !seen[0].prompt.includes('private history'),
    'a model added later must not be handed the history it was not granted'
  );
  assert.ok(seen[0].prompt.includes('summarise my sleep'));
});

test('the AI does not answer itself', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1), msg('m2', 'ai-1', T2)];

  const { complete, seen } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /most recent speaker/);
  assert.equal(seen.length, 0, 'a skipped turn must not spend a model call');
});

test('in a two-party thread the assistant answers every message', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1, 'no mention of it by name')];

  const { complete } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(result.status, 'responded');
});

test('in a group the assistant waits to be addressed', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, doctor, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1, 'doctor, my sleep has been poor')];

  const { complete, seen } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(result.status, 'skipped', 'a clinician and patient talking is not an invitation');
  assert.equal(seen.length, 0);
});

test('a near-miss word does not summon the assistant', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, doctor, ai], createdAt: T0 };
  // "again" and "wait" both contain "ai" — a substring match would fire here.
  const messages = [msg('m1', 'patient-1', T1, 'I had to wait again for the results')];

  const { complete } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
    shouldRespond: whenMentioned(['ai', 'assistant']),
  });

  assert.equal(result.status, 'skipped');
});

test('a paused assistant produces nothing', async () => {
  const ai = {
    actorId: 'ai-1',
    kind: 'ai',
    role: 'assistant',
    joinedAt: T0,
    canWrite: false,
  };
  const thread = { id: 'thread-1', participants: [patient, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  const { complete, seen } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /may not write/);
  assert.equal(seen.length, 0);
});

test('an assistant that is not a participant cannot speak into the thread', async () => {
  const thread = { id: 'thread-1', participants: [patient, doctor], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  const { complete, seen } = spyComplete();
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-uninvited',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /not a participant/);
  assert.equal(seen.length, 0);
});

test('the reply records which model produced it', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  const { complete } = spyComplete('  spaced reply  ');
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
    model: 'claude-opus-5',
    promptVersion: 'v3',
  });

  assert.equal(result.status, 'responded');
  assert.equal(result.body, 'spaced reply');
  assert.deepEqual(result.generatedBy, { model: 'claude-opus-5', promptVersion: 'v3' });
});

test('an empty model response is a skip, not an empty message in the record', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1)];

  const { complete } = spyComplete('   ');
  const result = await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /returned nothing/);
});

test('the transcript labels speakers by role, so real names need never reach the model', async () => {
  const ai = { actorId: 'ai-1', kind: 'ai', role: 'assistant', joinedAt: T0 };
  const thread = { id: 'thread-1', participants: [patient, ai], createdAt: T0 };
  const messages = [msg('m1', 'patient-1', T1, 'my sleep is poor')];

  const { complete, seen } = spyComplete();
  await runAiTurn(thread, messages, {
    actorId: 'ai-1',
    complete,
    systemPrompt: 'be helpful',
  });

  assert.equal(seen[0].prompt, 'patient: my sleep is poor');
});
