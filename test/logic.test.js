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

test('LT_ST_COUNT is 132 and P_LT_HIT is 1/97.1', () => {
  assert.equal(logic.LT_ST_COUNT, 132);
  assert.equal(logic.P_LT_HIT, 1 / 97.1);
});

test('spinLt returns hit when the draw beats P_LT_HIT, miss otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.spinLt()), 'hit');
  assert.equal(withMockRandom([0.5], () => logic.spinLt()), 'miss');
});

test('rollInitialMode is A under 70%, B otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.rollInitialMode()), 'A');
  assert.equal(withMockRandom([0.8], () => logic.rollInitialMode()), 'B');
});

test('rollNextMode from A is A under 50%, B otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.rollNextMode('A')), 'A');
  assert.equal(withMockRandom([0.6], () => logic.rollNextMode('A')), 'B');
});

test('rollNextMode from B is A under 93%, B otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.rollNextMode('B')), 'A');
  assert.equal(withMockRandom([0.95], () => logic.rollNextMode('B')), 'B');
});

test('rollAddOnSuccess is true under 50%, false otherwise', () => {
  assert.equal(withMockRandom([0], () => logic.rollAddOnSuccess()), true);
  assert.equal(withMockRandom([0.6], () => logic.rollAddOnSuccess()), false);
});

test('resolveModeBAddOns stops immediately on the first failed roll (0 add-ons)', () => {
  const result = withMockRandom([0.6], () => logic.resolveModeBAddOns());
  assert.deepEqual(result, { addOnCount: 0, extraActual: 0, extraNominal: 0 });
});

test('resolveModeBAddOns chains through successes until the first failure', () => {
  // success, success, then failure -> 2 add-ons
  const result = withMockRandom([0, 0, 0.6], () => logic.resolveModeBAddOns());
  assert.deepEqual(result, { addOnCount: 2, extraActual: 5600, extraNominal: 6000 });
});

test('COLOR_ORDER and COLOR_TABLE match the mode->color spec table', () => {
  assert.deepEqual(logic.COLOR_ORDER, ['rainbow', 'red', 'green', 'blue']);
  assert.deepEqual(logic.COLOR_TABLE.A, { rainbow: 0,    red: 0.03, green: 0.194, blue: 0.776 });
  assert.deepEqual(logic.COLOR_TABLE.B, { rainbow: 0.15, red: 0.40, green: 0.315, blue: 0.135 });
});

test('rollCutinColor for mode A picks red/green/blue by cumulative threshold (never rainbow)', () => {
  // A cumulative: rainbow<0, red<0.03, green<0.224, blue<1.0
  assert.equal(withMockRandom([0],    () => logic.rollCutinColor('A')), 'red');
  assert.equal(withMockRandom([0.1],  () => logic.rollCutinColor('A')), 'green');
  assert.equal(withMockRandom([0.5],  () => logic.rollCutinColor('A')), 'blue');
});

test('rollCutinColor for mode B picks across all 4 colors by cumulative threshold', () => {
  // B cumulative: rainbow<0.15, red<0.55, green<0.865, blue<1.0
  assert.equal(withMockRandom([0],    () => logic.rollCutinColor('B')), 'rainbow');
  assert.equal(withMockRandom([0.3],  () => logic.rollCutinColor('B')), 'red');
  assert.equal(withMockRandom([0.6],  () => logic.rollCutinColor('B')), 'green');
  assert.equal(withMockRandom([0.9],  () => logic.rollCutinColor('B')), 'blue');
});

test('createLtState starts with 132 ST, the given mode, and zeroed counters', () => {
  assert.deepEqual(logic.createLtState('A'), {
    mode: 'A',
    stRemaining: 132,
    totalHits: 0,
    actualBalls: 0,
    nominalBalls: 0,
  });
  assert.equal(logic.createLtState('B').mode, 'B');
});

test('applyLtSpin: a miss with ST remaining decrements stRemaining and reports miss', () => {
  const state = logic.createLtState('A');
  const { ltState, outcome } = withMockRandom([0.5], () => logic.applyLtSpin(state));
  assert.equal(outcome, 'miss');
  assert.equal(ltState.stRemaining, 131);
});

test('applyLtSpin: a miss on the last ST spin reports lt_end', () => {
  const state = { ...logic.createLtState('A'), stRemaining: 1 };
  const { ltState, outcome } = withMockRandom([0.5], () => logic.applyLtSpin(state));
  assert.equal(outcome, 'lt_end');
  assert.equal(ltState.stRemaining, 0);
});

test('applyLtSpin: a mode-A hit awards 700/750, resets ST to 132, and rolls next mode + color', () => {
  const state = logic.createLtState('A');
  // draws: [0]=spinLt hit, [0]=rollNextMode('A')->'A', [0]=rollCutinColor('A')->'red'
  const { ltState, outcome, hitActual, hitNominal, addOnCount, nextModeColor } =
    withMockRandom([0, 0, 0], () => logic.applyLtSpin(state));
  assert.equal(outcome, 'hit_mode_a');
  assert.equal(hitActual, 700);
  assert.equal(hitNominal, 750);
  assert.equal(addOnCount, 0);
  assert.equal(nextModeColor, 'red');
  assert.equal(ltState.stRemaining, 132);
  assert.equal(ltState.mode, 'A');
  assert.equal(ltState.totalHits, 1);
  assert.equal(ltState.actualBalls, 700);
  assert.equal(ltState.nominalBalls, 750);
});

test('applyLtSpin: a mode-B hit with no add-ons awards 2800/3000 and rolls next mode + color', () => {
  const state = logic.createLtState('B');
  // draws: [0]=spinLt hit, [0.6]=rollAddOnSuccess->false (0 add-ons), [0]=rollNextMode('B')->'A', [0]=rollCutinColor('A')->'red'
  const { ltState, outcome, hitActual, hitNominal, addOnCount, nextModeColor } =
    withMockRandom([0, 0.6, 0, 0], () => logic.applyLtSpin(state));
  assert.equal(outcome, 'hit_mode_b');
  assert.equal(hitActual, 2800);
  assert.equal(hitNominal, 3000);
  assert.equal(addOnCount, 0);
  assert.equal(nextModeColor, 'red');
  assert.equal(ltState.mode, 'A');
  assert.equal(ltState.stRemaining, 132);
  assert.equal(ltState.actualBalls, 2800);
  assert.equal(ltState.nominalBalls, 3000);
});

test('applyLtSpin: a mode-B hit with 2 chained add-ons awards the full stacked total', () => {
  const state = logic.createLtState('B');
  // draws: [0]=spinLt hit, add-ons=[0,0,0.6] (2 add-ons), [0.95]=rollNextMode('B')->'B', [0]=rollCutinColor('B')->'rainbow'
  const { ltState, outcome, hitActual, hitNominal, addOnCount, nextModeColor } =
    withMockRandom([0, 0, 0, 0.6, 0.95, 0], () => logic.applyLtSpin(state));
  assert.equal(outcome, 'hit_mode_b');
  assert.equal(hitActual, 2800 + 5600);
  assert.equal(hitNominal, 3000 + 6000);
  assert.equal(addOnCount, 2);
  assert.equal(nextModeColor, 'rainbow');
  assert.equal(ltState.mode, 'B');
});

test('rollInitialLtEntry returns a mode and a color consistent with that mode', () => {
  // [0]=rollInitialMode->'A', [0]=rollCutinColor('A')->'red'
  const entry = withMockRandom([0, 0], () => logic.rollInitialLtEntry());
  assert.deepEqual(entry, { mode: 'A', color: 'red' });
});
