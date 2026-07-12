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

function createLtState(initialMode) {
  return {
    mode: initialMode,
    stRemaining: LT_ST_COUNT,
    totalHits: 0,
    actualBalls: 0,
    nominalBalls: 0,
  };
}

function applyLtSpin(ltState) {
  const result = spinLt();
  const stRemaining = ltState.stRemaining - 1;

  if (result === 'miss') {
    if (stRemaining <= 0) {
      return { ltState: { ...ltState, stRemaining: 0 }, outcome: 'lt_end' };
    }
    return { ltState: { ...ltState, stRemaining }, outcome: 'miss' };
  }

  if (ltState.mode === 'A') {
    const nextMode = rollNextMode('A');
    const nextModeColor = rollCutinColor(nextMode);
    const newState = {
      mode: nextMode,
      stRemaining: LT_ST_COUNT,
      totalHits: ltState.totalHits + 1,
      actualBalls: ltState.actualBalls + 700,
      nominalBalls: ltState.nominalBalls + 750,
    };
    return {
      ltState: newState,
      outcome: 'hit_mode_a',
      hitActual: 700,
      hitNominal: 750,
      nextModeColor,
    };
  }

  // mode B: resolve only the base win here. The add-on chain is driven
  // step-by-step by the caller via applyAddOnStep, so each add-on can be
  // shown as its own "上乗せ3000発！" screen instead of being pre-resolved.
  const newState = {
    mode: ltState.mode,
    stRemaining: LT_ST_COUNT,
    totalHits: ltState.totalHits + 1,
    actualBalls: ltState.actualBalls + 2800,
    nominalBalls: ltState.nominalBalls + 3000,
  };
  return {
    ltState: newState,
    outcome: 'hit_mode_b_base',
    hitActual: 2800,
    hitNominal: 3000,
  };
}

// One step of the mode-B add-on chain. Call repeatedly after a
// 'hit_mode_b_base' (or a prior 'addon_hit') until it returns 'addon_end'.
function applyAddOnStep(ltState) {
  if (rollAddOnSuccess()) {
    const newState = {
      ...ltState,
      actualBalls: ltState.actualBalls + 2800,
      nominalBalls: ltState.nominalBalls + 3000,
    };
    return { ltState: newState, outcome: 'addon_hit', hitActual: 2800, hitNominal: 3000 };
  }
  const nextMode = rollNextMode('B');
  const nextModeColor = rollCutinColor(nextMode);
  return { ltState: { ...ltState, mode: nextMode }, outcome: 'addon_end', nextModeColor };
}

function rollInitialLtEntry() {
  const mode = rollInitialMode();
  const color = rollCutinColor(mode);
  return { mode, color };
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
    COLOR_ORDER,
    COLOR_TABLE,
    rollCutinColor,
    createLtState,
    applyLtSpin,
    applyAddOnStep,
    rollInitialLtEntry,
  };
}
