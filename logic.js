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

const LT_ST_COUNT = 132;
const P_LT_HIT = 1 / 97.1;

function spinLt() {
  return Math.random() < P_LT_HIT ? 'hit' : 'miss';
}

function rollInitialMode() {
  return Math.random() < 0.7 ? 'A' : 'B';
}

function rollNextMode(currentMode) {
  if (currentMode === 'A') {
    return Math.random() < 0.5 ? 'A' : 'B';
  }
  return Math.random() < 0.93 ? 'A' : 'B';
}

function rollAddOnSuccess() {
  return Math.random() < 0.5;
}

function resolveModeBAddOns() {
  let addOnCount = 0;
  let extraActual = 0;
  let extraNominal = 0;
  while (rollAddOnSuccess()) {
    addOnCount++;
    extraActual += 2800;
    extraNominal += 3000;
  }
  return { addOnCount, extraActual, extraNominal };
}

const COLOR_ORDER = ['rainbow', 'red', 'green', 'blue'];
const COLOR_TABLE = {
  A: { rainbow: 0,    red: 0.03, green: 0.194, blue: 0.776 },
  B: { rainbow: 0.15, red: 0.40, green: 0.315, blue: 0.135 },
};

function rollCutinColor(mode) {
  const table = COLOR_TABLE[mode];
  const r = Math.random();
  let cumulative = 0;
  for (const color of COLOR_ORDER) {
    cumulative += table[color];
    if (r < cumulative) return color;
  }
  return COLOR_ORDER[COLOR_ORDER.length - 1];
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
    LT_ST_COUNT,
    P_LT_HIT,
    spinLt,
    rollInitialMode,
    rollNextMode,
    rollAddOnSuccess,
    resolveModeBAddOns,
    COLOR_ORDER,
    COLOR_TABLE,
    rollCutinColor,
  };
}
