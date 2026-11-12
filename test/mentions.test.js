import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mentionMatcher, mentionsAny } from '../dist/index.js';

test('a handle is matched as a whole word', () => {
  assert.equal(mentionsAny('@cat who is right?', ['@cat']), true);
  assert.equal(mentionsAny('who is right, @cat?', ['@cat']), true);
  assert.equal(mentionsAny('ask @cat', ['@cat']), true);
  assert.equal(mentionsAny('@Cat', ['@cat']), true, 'case is ignored');
});

test('a longer handle that starts the same way is somebody else', () => {
  assert.equal(mentionsAny('see the @catalogue', ['@cat']), false);
  assert.equal(mentionsAny('@cats are great', ['@cat']), false);
  assert.equal(mentionsAny('@cat_2', ['@cat']), false);
});

test('an address is not a mention', () => {
  assert.equal(mentionsAny('write to me@cat.example', ['@cat']), false);
});

test('a short alias does not fire inside ordinary words', () => {
  assert.equal(mentionsAny('I had to wait again', ['ai']), false);
  assert.equal(mentionsAny('ask the AI.', ['ai']), true);
});

test('letters outside ASCII are still letters', () => {
  // \W would call "ü" a boundary and match "ai" inside "aiü".
  assert.equal(mentionsAny('aiü', ['ai']), false);
  assert.equal(mentionsAny('über @käthe!', ['@käthe']), true);
});

test('punctuation in an alias is literal', () => {
  assert.equal(mentionsAny('ping a.b now', ['a.b']), true);
  assert.equal(mentionsAny('ping axb now', ['a.b']), false);
});

test('an empty alias matches nothing', () => {
  assert.equal(mentionsAny('anything at all', ['', '   ']), false);
  assert.equal(mentionsAny('anything at all', []), false);
});

test('a matcher is reusable', () => {
  const mentioned = mentionMatcher(['@cat', 'assistant']);
  assert.equal(mentioned('hello assistant'), true);
  assert.equal(mentioned('hello @cat'), true);
  assert.equal(mentioned('hello'), false);
});
