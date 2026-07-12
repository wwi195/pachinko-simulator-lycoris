'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../logic.js');

function withMockRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('SPIN_RATE_OPTIONS lists the four selectable rates with 16 as default', () => {
  assert.deepEqual(logic.SPIN_RATE_OPTIONS, [14, 16, 18, 20]);
  assert.equal(logic.DEFAULT_SPIN_RATE, 16);
});

test('calcSpinCost returns balls-per-spin for a given spins-per-1000-yen rate', () => {
  assert.equal(logic.calcSpinCost(16), 250 / 16);
  assert.equal(logic.calcSpinCost(14), 250 / 14);
  assert.equal(logic.calcSpinCost(18), 250 / 18);
  assert.equal(logic.calcSpinCost(20), 250 / 20);
});

test('P_HIT is 1/259.7', () => {
  assert.equal(logic.P_HIT, 1 / 259.7);
});

test('spinNormal returns hit when the draw beats P_HIT, miss otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.spinNormal()), 'hit');
  assert.equal(withMockRandom([0.5], () => logic.spinNormal()), 'miss');
});

test('BONUS_TYPE_ORDER lists all 5 types with correct nominal/actual/entersLt data', () => {
  assert.deepEqual(logic.BONUS_TYPE_ORDER, [
    'premium', 'firstLycoris', 'chinanagoPromotion', 'lycoris', 'chinanago',
  ]);
  assert.deepEqual(logic.BONUS_TYPES.premium,            { weight: 0.001, nominal: 1500, actual: 1400, entersLt: true });
  assert.deepEqual(logic.BONUS_TYPES.firstLycoris,       { weight: 0.449, nominal: 600,  actual: 560,  entersLt: true });
  assert.deepEqual(logic.BONUS_TYPES.chinanagoPromotion, { weight: 0.05,  nominal: 310,  actual: 290,  entersLt: true });
  assert.deepEqual(logic.BONUS_TYPES.lycoris,            { weight: 0.30,  nominal: 600,  actual: 560,  entersLt: false });
  assert.deepEqual(logic.BONUS_TYPES.chinanago,          { weight: 0.20,  nominal: 310,  actual: 290,  entersLt: false });
});

test('rollBonusType picks the type whose cumulative range contains the draw', () => {
  // cumulative thresholds: premium<0.001, firstLycoris<0.450, chinanagoPromotion<0.500, lycoris<0.800, chinanago<1.000
  assert.equal(withMockRandom([0],     () => logic.rollBonusType()), 'premium');
  assert.equal(withMockRandom([0.2],   () => logic.rollBonusType()), 'firstLycoris');
  assert.equal(withMockRandom([0.48],  () => logic.rollBonusType()), 'chinanagoPromotion');
  assert.equal(withMockRandom([0.6],   () => logic.rollBonusType()), 'lycoris');
  assert.equal(withMockRandom([0.9],   () => logic.rollBonusType()), 'chinanago');
});
