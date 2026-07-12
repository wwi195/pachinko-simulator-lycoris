'use strict';

const SPIN_RATE_OPTIONS = [14, 16, 18, 20];
const DEFAULT_SPIN_RATE = 16;

function calcSpinCost(spinRate) {
  return 250 / spinRate;
}

const P_HIT = 1 / 259.7;

function spinNormal() {
  return Math.random() < P_HIT ? 'hit' : 'miss';
}

const BONUS_TYPES = {
  premium:            { weight: 0.001, nominal: 1500, actual: 1400, entersLt: true },
  firstLycoris:       { weight: 0.449, nominal: 600,  actual: 560,  entersLt: true },
  chinanagoPromotion: { weight: 0.05,  nominal: 310,  actual: 290,  entersLt: true },
  lycoris:            { weight: 0.30,  nominal: 600,  actual: 560,  entersLt: false },
  chinanago:          { weight: 0.20,  nominal: 310,  actual: 290,  entersLt: false },
};
const BONUS_TYPE_ORDER = ['premium', 'firstLycoris', 'chinanagoPromotion', 'lycoris', 'chinanago'];

function rollBonusType() {
  const r = Math.random();
  let cumulative = 0;
  for (const key of BONUS_TYPE_ORDER) {
    cumulative += BONUS_TYPES[key].weight;
    if (r < cumulative) return key;
  }
  return BONUS_TYPE_ORDER[BONUS_TYPE_ORDER.length - 1];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPIN_RATE_OPTIONS,
    DEFAULT_SPIN_RATE,
    calcSpinCost,
    P_HIT,
    spinNormal,
    BONUS_TYPES,
    BONUS_TYPE_ORDER,
    rollBonusType,
  };
}
