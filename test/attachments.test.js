import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ATTACHMENT_POLICY,
  attachmentExpiresAt,
  attachmentKind,
  checkAttachment,
  isAbandonedUpload,
  isAttachmentExpired,
  storedBytes,
} from '../dist/index.js';

const MB = 1024 * 1024;

test('a type the policy does not name is refused, whatever it is called', () => {
  // The two that matter: both can carry script, and a reader opens them from
  // the storage origin.
  assert.equal(attachmentKind('image/svg+xml'), null);
  assert.equal(attachmentKind('text/html'), null);
  assert.equal(attachmentKind('application/x-msdownload'), null);
  assert.deepEqual(checkAttachment({ mimeType: 'image/svg+xml', bytes: 10 }), {
    ok: false,
    reason: 'type',
  });
});

test('a missing type is refused rather than guessed from the name', () => {
  assert.equal(attachmentKind(''), null);
  assert.equal(checkAttachment({ mimeType: '', bytes: 10 }).ok, false);
});

test('each accepted type lands in the kind a reader will meet it as', () => {
  assert.equal(attachmentKind('image/jpeg'), 'image');
  assert.equal(attachmentKind('IMAGE/PNG'), 'image');
  assert.equal(attachmentKind('video/mp4'), 'video');
  assert.equal(attachmentKind('audio/webm'), 'audio');
  assert.equal(attachmentKind('application/pdf'), 'file');
  // Parameters say nothing about what the file is.
  assert.equal(attachmentKind('text/plain; charset=utf-8'), 'file');
});

test('a family pattern accepts the whole family and nothing beside it', () => {
  const policy = {
    ...DEFAULT_ATTACHMENT_POLICY,
    accept: { ...DEFAULT_ATTACHMENT_POLICY.accept, audio: ['audio/*'] },
  };
  assert.equal(attachmentKind('audio/flac', policy), 'audio');
  assert.equal(attachmentKind('audiobook/flac', policy), null);
});

test('a file over its kind’s ceiling is refused with the ceiling', () => {
  const check = checkAttachment({ mimeType: 'video/mp4', bytes: 51 * MB });
  assert.deepEqual(check, { ok: false, reason: 'size', kind: 'video', maxBytes: 50 * MB });
  assert.deepEqual(checkAttachment({ mimeType: 'video/mp4', bytes: 50 * MB }), {
    ok: true,
    kind: 'video',
  });
});

test('a photo and a video do not share a ceiling', () => {
  assert.equal(checkAttachment({ mimeType: 'image/jpeg', bytes: 11 * MB }).ok, false);
  assert.equal(checkAttachment({ mimeType: 'video/mp4', bytes: 11 * MB }).ok, true);
});

test('a ceiling of zero turns a kind off', () => {
  const policy = {
    ...DEFAULT_ATTACHMENT_POLICY,
    maxBytes: { ...DEFAULT_ATTACHMENT_POLICY.maxBytes, video: 0 },
  };
  assert.deepEqual(checkAttachment({ mimeType: 'video/mp4', bytes: 1 }, {}, policy), {
    ok: false,
    reason: 'type',
  });
});

test('an empty file is refused before anything else is asked', () => {
  assert.deepEqual(checkAttachment({ mimeType: 'image/png', bytes: 0 }), {
    ok: false,
    reason: 'empty',
  });
  assert.deepEqual(checkAttachment({ mimeType: 'image/png', bytes: Number.NaN }), {
    ok: false,
    reason: 'empty',
  });
});

test('a message takes only so many files', () => {
  const full = checkAttachment({ mimeType: 'image/png', bytes: 10 }, { onMessage: 10 });
  assert.deepEqual(full, { ok: false, reason: 'count', maxPerMessage: 10 });
  assert.equal(checkAttachment({ mimeType: 'image/png', bytes: 10 }, { onMessage: 9 }).ok, true);
});

test('the quota counts what is already stored, and says how much that is', () => {
  const quota = DEFAULT_ATTACHMENT_POLICY.quotaBytes;
  const over = checkAttachment({ mimeType: 'image/png', bytes: 2 * MB }, { usedBytes: quota - MB });
  assert.deepEqual(over, {
    ok: false,
    reason: 'quota',
    quotaBytes: quota,
    usedBytes: quota - MB,
  });
  // Exactly filling the quota is allowed; one byte more is not.
  assert.equal(
    checkAttachment({ mimeType: 'image/png', bytes: MB }, { usedBytes: quota - MB }).ok,
    true,
  );
});

test('a policy with no quota never refuses for room', () => {
  const policy = { ...DEFAULT_ATTACHMENT_POLICY, quotaBytes: null };
  const check = checkAttachment(
    { mimeType: 'image/png', bytes: MB },
    { usedBytes: Number.MAX_SAFE_INTEGER - 2 * MB },
    policy,
  );
  assert.equal(check.ok, true);
});

test('the wrong type is the answer even when the quota is also full', () => {
  // Cheapest-first: a person is told the thing they can actually change.
  const check = checkAttachment(
    { mimeType: 'text/html', bytes: MB },
    { usedBytes: DEFAULT_ATTACHMENT_POLICY.quotaBytes },
  );
  assert.equal(check.reason, 'type');
});

test('stored bytes add up, and a negative size counts for nothing', () => {
  assert.equal(storedBytes([]), 0);
  assert.equal(storedBytes([{ bytes: 10 }, { bytes: 5 }, { bytes: -3 }]), 15);
});

test('with no retention a sent file is kept as long as its message', () => {
  const sentAt = new Date('2026-01-01T00:00:00Z');
  assert.equal(attachmentExpiresAt(sentAt), null);
  assert.equal(isAttachmentExpired(sentAt, new Date('2036-01-01T00:00:00Z')), false);
});

test('with a retention a sent file expires on the day the policy names', () => {
  const policy = { ...DEFAULT_ATTACHMENT_POLICY, retentionDays: 90 };
  const sentAt = new Date('2026-01-01T00:00:00Z');
  assert.equal(attachmentExpiresAt(sentAt, policy).toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(isAttachmentExpired(sentAt, new Date('2026-03-31T23:59:59Z'), policy), false);
  assert.equal(isAttachmentExpired(sentAt, new Date('2026-04-01T00:00:00Z'), policy), true);
});

test('an upload that was never sent is abandoned after the policy’s hours, not before', () => {
  const uploadedAt = new Date('2026-01-01T00:00:00Z');
  assert.equal(isAbandonedUpload(uploadedAt, new Date('2026-01-01T23:59:59Z')), false);
  assert.equal(isAbandonedUpload(uploadedAt, new Date('2026-01-02T00:00:00Z')), true);
});
