// Self-check for the dashboard's graded review scheduler. Run: node tests/test-schedule.js
const assert = require('assert');
const { scheduleReview } = require('../skills/dashboard/server/validate');

const today = new Date('2026-01-01');
const known = { intervalDays: 20, easeFactor: 2.5, repetitions: 4 };

assert.deepStrictEqual(scheduleReview(undefined, 'good', today),
  { easeFactor: 2.5, intervalDays: 7, repetitions: 1, nextReview: '2026-01-08' });
assert.strictEqual(scheduleReview(undefined, 'hard', today).intervalDays, 3);
assert.strictEqual(scheduleReview(undefined, 'easy', today).intervalDays, 14);
assert.strictEqual(scheduleReview(known, 'good', today).intervalDays, 50);
// A lapse shortens the interval; it does not reset a known concept to daily review.
assert.strictEqual(scheduleReview(known, 'again', today).intervalDays, 5);
assert.strictEqual(scheduleReview(known, 'again', today).repetitions, 0);
assert.strictEqual(scheduleReview({ intervalDays: 1, easeFactor: 1.3, repetitions: 0 }, 'again', today).easeFactor, 1.3);
// With a deadline, the next review lands before it, never after.
assert.strictEqual(scheduleReview(known, 'good', today, '2026-01-11').nextReview, '2026-01-10');
assert.strictEqual(scheduleReview(undefined, 'hard', today, '2026-03-01').intervalDays, 3);
assert.throws(() => scheduleReview(undefined, 'meh', today));

console.log('schedule: all checks passed');
