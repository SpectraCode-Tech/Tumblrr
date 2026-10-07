import test from 'node:test'; import assert from 'node:assert/strict';
import { clampPrefs, E164, cleanPhone, ephemeralAllowed, moderationDecision } from '../src/rules.js';

test('minors only get a 2-year band and never reach 18', () => {
  assert.deepEqual(clampPrefs(15, 10, 40), [13, 17]);
  assert.deepEqual(clampPrefs(13, 13, 99), [13, 15]);
  for (let age = 13; age < 18; age++) {
    const [lo, hi] = clampPrefs(age, 1, 99);
    assert.ok(lo >= 13 && hi <= 17 && lo >= age - 2 && hi <= age + 2, `age ${age}`);
  }
});
test('adults are never matched below 18', () => {
  assert.deepEqual(clampPrefs(25, 10, 40), [18, 40]);
  assert.deepEqual(clampPrefs(30), [28, 32]);
  assert.ok(clampPrefs(19, 13, 25)[0] >= 18);
});
test('phone numbers need international format', () => {
  assert.ok(E164.test(cleanPhone('+234 801-234 5678')));
  assert.ok(!E164.test('08012345678'));
  assert.ok(!E164.test('+0123456789'));
});
test('view-once and self-destruct need mutual sexual consent', () => {
  assert.equal(ephemeralAllowed('none', false), true);
  assert.equal(ephemeralAllowed('once', false), false);
  assert.equal(ephemeralAllowed('timed', false), false);
  assert.equal(ephemeralAllowed('once', true), true);
});
test('moderation decisions', () => {
  assert.equal(moderationDecision({ sexual: false, minors: false }, false), null);
  assert.ok(moderationDecision({ sexual: true, minors: false }, false));
  assert.equal(moderationDecision({ sexual: true, minors: false }, true), null);
  assert.ok(moderationDecision({ sexual: true, minors: true }, true), 'minors always blocked, even with consent');
});
import { requestDecision, mediaUnlocked, REQUEST_LIMIT } from '../src/rules.js';
test('message requests: initiator is capped until accepted', () => {
  assert.equal(requestDecision('pending', 1, 1, REQUEST_LIMIT - 1), null);
  assert.ok(requestDecision('pending', 1, 1, REQUEST_LIMIT));
  assert.equal(requestDecision('pending', 1, 2, 99), null, 'the recipient can always reply');
  assert.equal(requestDecision('accepted', 1, 1, 99), null);
  assert.ok(requestDecision('declined', 1, 2, 0));
});
test('media is locked until the chat is accepted', () => {
  assert.equal(mediaUnlocked('pending'), false);
  assert.equal(mediaUnlocked('declined'), false);
  assert.equal(mediaUnlocked('accepted'), true);
});
import { canEdit, canDelete } from '../src/rules.js';
test('edit window is 15 minutes and delete-for-everyone is 48 hours', () => {
  const now = Date.now();
  assert.ok(canEdit(new Date(now - 10 * 60e3), now));
  assert.ok(!canEdit(new Date(now - 16 * 60e3), now));
  assert.ok(canDelete(new Date(now - 47 * 3600e3), now));
  assert.ok(!canDelete(new Date(now - 49 * 3600e3), now));
});
