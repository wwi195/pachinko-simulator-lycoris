# pachinko-simulator-lycoris Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pachinko-simulator-lycoris`, a pachinko simulator for "eリコリス・リコイル", reusing `pachinko-simulator-ghoul`'s architecture and UI shell but with Lycoris Recoil's own probabilities and a hidden-internal-mode ST-based LT (RUSH) structure, per `docs/superpowers/specs/2026-07-12-lycoris-spec-design.md`.

**Architecture:** Same 3-file static layout as ghoul (`index.html` / `style.css` / `script.js`), plus a DOM-free `logic.js` holding all pure probability/state-transition logic, unit-tested with Node's built-in `node:test`. White-based visual theme (no dark background this time). No images, no Supabase this round.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, no npm dependencies. Tests run via `node --test "test/**/*.test.js"` (the glob form — `node --test test/` is known to fail with MODULE_NOT_FOUND on this machine's Node v24.15.0).

---

## Key design decisions carried over from ghoul (re-affirmed here for a fresh implementer with no prior context)

- `logic.js` is loaded via a plain `<script src="logic.js">` tag before `script.js`, both non-module classic scripts sharing one global lexical scope — no bundler, no `window.` prefixing, no ES modules.
- `logic.js` is dual-mode: a `if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }` guard at the bottom exports for Node's `require` (tests) while staying inert in the browser.
- Random-number-driven functions must be deterministically testable: always call `Math.random()` directly (never wrap it), so tests can monkey-patch `Math.random` via a `withMockRandom(values, fn)` helper.
- Multi-way weighted distributions (the 5-way normal bonus split, the 4-way color table) use a **single** `Math.random()` draw compared against **cumulative** thresholds — not independent per-branch draws — since these are genuinely mutually-exclusive outcomes that must sum to exactly 100%.
- **Critical constraint from the spec:** the internal LT mode (`'A'` or `'B'`) must be stored only for internal computation (inside the LT state object) and must **never** be read by any rendering/`buildScreen` function. Only the *color* rolled from the mode is ever displayed. Every task below that touches `game.lt` or the LT screens must respect this — if you ever find yourself writing `game.lt.mode` inside a `buildScreen` template string, stop, you've broken the spec's core constraint.

---

## Task 1: Project scaffold

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-lycoris\package.json`
- Create: `C:\Users\ab_99\pachinko-simulator-lycoris\.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pachinko-simulator-lycoris",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
```

- [ ] **Step 3: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: scaffold project"
```

---

## Task 2: logic.js — spin-rate constants and normal-mode hit/bonus-type roll

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-lycoris\logic.js`
- Test: `C:\Users\ab_99\pachinko-simulator-lycoris\test\logic.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: FAIL — `Cannot find module '../logic.js'`

- [ ] **Step 3: Write minimal implementation**

Create `logic.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add spin-rate constants and normal-mode hit/bonus-type roll"
```

---

## Task 3: logic.js — LT hit roll, mode transitions, add-on loop, color roll

**Files:**
- Modify: `logic.js`
- Modify: `test/logic.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: FAIL — `logic.LT_ST_COUNT` etc. are undefined

- [ ] **Step 3: Write minimal implementation**

Add to `logic.js` (before the `module.exports` block, after Task 2's additions):

```js
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
```

Update the `module.exports` object to also include:
`LT_ST_COUNT, P_LT_HIT, spinLt, rollInitialMode, rollNextMode, rollAddOnSuccess, resolveModeBAddOns, COLOR_ORDER, COLOR_TABLE, rollCutinColor,`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: PASS (all tests so far — 17 total: 6 from Task 2 + 11 new)

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add LT hit roll, mode transitions, add-on loop, color roll"
```

---

## Task 4: logic.js — LT ST state reducer and initial-entry helper

**Files:**
- Modify: `logic.js`
- Modify: `test/logic.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/logic.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: FAIL — `logic.createLtState` is not a function

- [ ] **Step 3: Write minimal implementation**

Add to `logic.js` (before `module.exports`, after Task 3's additions):

```js
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
      addOnCount: 0,
      nextModeColor,
    };
  }

  const addOns = resolveModeBAddOns();
  const hitActual = 2800 + addOns.extraActual;
  const hitNominal = 3000 + addOns.extraNominal;
  const nextMode = rollNextMode('B');
  const nextModeColor = rollCutinColor(nextMode);
  const newState = {
    mode: nextMode,
    stRemaining: LT_ST_COUNT,
    totalHits: ltState.totalHits + 1,
    actualBalls: ltState.actualBalls + hitActual,
    nominalBalls: ltState.nominalBalls + hitNominal,
  };
  return {
    ltState: newState,
    outcome: 'hit_mode_b',
    hitActual,
    hitNominal,
    addOnCount: addOns.addOnCount,
    nextModeColor,
  };
}

function rollInitialLtEntry() {
  const mode = rollInitialMode();
  const color = rollCutinColor(mode);
  return { mode, color };
}
```

Update `module.exports` to also include: `createLtState, applyLtSpin, rollInitialLtEntry,`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: PASS (all tests — this is the full logic.js suite, should be 24 total: 17 from before + 7 new)

- [ ] **Step 5: Commit**

```bash
git add logic.js test/logic.test.js
git commit -m "feat: add LT ST state reducer and initial-entry helper"
```

---

## Task 5: index.html — page skeleton

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-lycoris\index.html`

- [ ] **Step 1: Create index.html**

Mirrors `pachinko-simulator-ghoul`'s header/log structure and element IDs (so `script.js` can target them the same way), with the RUSH-stats-bar renamed to LT stats and title text for Lycoris Recoil. No images this round.

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>パチンコシミュレーター（eリコリス・リコイル）</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">

    <div id="title-bar">パチンコ　eリコリス・リコイル</div>

    <div id="header">

      <div class="hrow hrow1">
        <div class="spins-block">
          <span class="spins-current" id="current-spins">0</span>
          <span class="spins-unit">回</span>
          <span class="spins-sep">／累計</span>
          <span class="spins-total" id="total-spins-disp">0</span>
          <span class="spins-unit">回</span>
        </div>
        <div id="mode-badge">通常時</div>
        <div class="esup-block">
          <div class="esup-label">ST残り</div>
          <div class="esup-value" id="rush-count">－</div>
        </div>
      </div>

      <div class="hrow hrow2">
        <div class="money-block">
          <span class="money-label">持ち球</span>
          <span class="money-value gold" id="mochi-dama">0</span>
          <span class="money-unit">球</span>
        </div>
        <div class="money-block">
          <span class="money-label">投資</span>
          <span class="money-value red" id="toushi-value">0</span>
          <span class="money-unit">円</span>
        </div>
        <div class="money-block">
          <span class="money-label">収支</span>
          <span class="money-value red" id="shuushi-value">0</span>
          <span class="money-unit">円</span>
        </div>
      </div>

      <div class="hrow hrow3">
        <div class="hrow3-header">
          <span class="hrow3-title">大当たり総回数</span>
          <span class="total-hit-block">
            <span class="total-hit-count" id="total-hit-count">0回</span>
          </span>
          <span class="fee-block" id="fee-block">16回転/千円</span>
        </div>
        <div class="hrow3-normal-line">
          <span class="hit-label2">通常時初当たり</span>
          <span class="hit-count" id="normal-first-hit">0回</span>
          <span class="hit-prob" id="normal-first-prob">1/―</span>
        </div>
        <div class="hrow3-stats">
          <div class="hit-item">
            <span class="hit-label2">LT突入</span>
            <span class="hit-count" id="lt-entry-count">0回</span>
            <span class="rush-entry" id="lt-entry-info">(突入率 0%)</span>
          </div>
        </div>
      </div>

    </div><!-- /header -->

    <div id="main-screen"></div>

    <div id="rush-stats-bar">
      <div class="rsb-header">
        <span class="rsb-title">通算LT成績</span>
        <span class="rsb-item">
          <span class="rsb-label">大当たり</span>
          <span class="rsb-val" id="rs-chain">0回</span>
          <span class="rsb-prob" id="rs-prob">1/―</span>
        </span>
        <span class="rsb-item">
          <span class="rsb-label">総回転</span>
          <span class="rsb-val" id="rs-spins">0回</span>
        </span>
      </div>
    </div>

    <div id="log-area">
      <div id="log-title">履歴</div>
      <div id="log-list"></div>
    </div>

  </div>
  <script src="logic.js"></script>
  <script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add page skeleton (index.html)"
```

---

## Task 6: style.css — white-based visual theme

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-lycoris\style.css`

- [ ] **Step 1: Create style.css**

A fresh white-based stylesheet (not copied from ghoul's dark theme this time — the color values invert, but the class names/structure mirror ghoul's `style.css` 1:1 so `script.js`'s templates need no class-name changes).

```css
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  background: #f5f5f7;
  color: #222;
  font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif;
  max-width: 390px;
  margin: 0 auto;
  min-height: 100vh;
  overflow-x: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #ffffff;
}

/* タイトル */
#title-bar {
  background: linear-gradient(135deg, #ffe3e8, #ffd0d8);
  border-bottom: 2px solid #e63950;
  text-align: center;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: bold;
  color: #b5202f;
  letter-spacing: 1px;
}

/* ========== ヘッダー ========== */
#header {
  background: #ffffff;
  border-bottom: 2px solid #e63950;
  position: sticky;
  top: 0;
  z-index: 10;
}

.hrow {
  display: flex;
  align-items: center;
  padding: 6px 12px;
}

.hrow1 {
  justify-content: space-between;
  border-bottom: 1px solid #eee;
}

.spins-block { display: flex; align-items: baseline; gap: 2px; }
.spins-current { font-size: 20px; font-weight: bold; color: #e63950; }
.spins-total   { font-size: 16px; font-weight: bold; color: #666; }
.spins-unit    { font-size: 11px; color: #999; }
.spins-sep     { font-size: 11px; color: #aaa; margin: 0 3px; }

#mode-badge {
  font-size: 12px;
  font-weight: bold;
  padding: 5px 12px;
  border-radius: 20px;
  background: #f2f2f4;
  border: 1px solid #ddd;
  color: #666;
  transition: all 0.3s;
}
#mode-badge.rush { background: #ffe3e8; border-color: #e63950; color: #b5202f; }

.esup-block { text-align: right; min-width: 60px; }
.esup-label { font-size: 10px; color: #999; }
.esup-value { font-size: 18px; font-weight: bold; color: #e63950; }

.hrow2 {
  justify-content: space-around;
  border-bottom: 1px solid #eee;
  padding: 5px 12px;
}

.money-block { display: flex; align-items: baseline; gap: 4px; }
.money-label { font-size: 10px; color: #999; }
.money-value { font-size: 19px; font-weight: bold; }
.money-value.gold  { color: #c9a227; }
.money-value.red   { color: #d24141; }
.money-value.green { color: #2e9e5b; }
.money-unit  { font-size: 11px; color: #999; }

.hrow3 {
  flex-direction: column;
  padding: 4px 12px 6px;
  gap: 3px;
}

.hrow3-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.hrow3-title {
  font-size: 11px;
  font-weight: bold;
  color: #666;
  letter-spacing: 0.5px;
}

.hrow3-normal-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 2px;
}

.hrow3-stats {
  display: flex;
  gap: 14px;
  width: 100%;
  flex-wrap: wrap;
}

.hit-item {
  display: flex;
  align-items: baseline;
  gap: 3px;
  flex-wrap: wrap;
}

.hit-label2 { font-size: 9px; color: #999; }
.hit-count  { font-size: 12px; font-weight: bold; color: #333; }
.hit-prob   { font-size: 9px; color: #aaa; }
.rush-entry { font-size: 9px; color: #d2694a; }

.total-hit-block { display: flex; align-items: baseline; gap: 3px; }
.total-hit-count { font-size: 12px; font-weight: bold; color: #c9a227; }

.fee-block { font-size: 9px; color: #aaa; white-space: nowrap; }

/* ========== メイン画面 ========== */
#main-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 20px;
  min-height: 380px;
}

.screen {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* STARTボタン */
.btn-start {
  width: 148px;
  height: 148px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ff6b81, #e63950);
  border: 5px solid #ffe3e8;
  font-size: 26px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 0 24px rgba(230,57,80,0.25), 0 4px 12px rgba(0,0,0,0.12);
  transition: transform 0.1s, box-shadow 0.1s;
}
.btn-start:active { transform: scale(0.94); }

.btn-start.rush-btn {
  background: radial-gradient(circle at 35% 35%, #ff9d6a, #d2694a);
  border-color: #ffe0cc;
}

/* アクションボタン */
.btn-action {
  width: 100%;
  max-width: 300px;
  padding: 15px;
  border-radius: 12px;
  background: linear-gradient(135deg, #e63950, #b5202f);
  border: 2px solid #ffb0bb;
  font-size: 17px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: opacity 0.1s, transform 0.1s;
}
.btn-action:active { opacity: 0.8; transform: scale(0.97); }

/* サブボタン */
.btn-sub {
  font-size: 14px;
  color: #666;
  background: none;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 8px 20px;
  cursor: pointer;
}
.btn-sub:active { opacity: 0.7; }

/* 確率表示 */
.prob-hint { font-size: 11px; color: #999; }

/* 結果テキスト */
.result-main {
  font-size: 34px;
  font-weight: bold;
  letter-spacing: 2px;
}
.result-main.win    { color: #c9a227; }
.result-main.lose   { color: #aaa; }

.result-balls { font-size: 30px; font-weight: bold; color: #c9a227; }
.result-sub   { font-size: 14px; color: #999; }

/* LT(RUSH) */
.rush-title {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1.3;
  text-align: center;
  color: #c9a227;
}

.cutin-flavor {
  font-size: 15px;
  font-weight: bold;
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.cutin-flavor.color-red    { color: #e63950; }
.cutin-flavor.color-green  { color: #2e9e5b; }
.cutin-flavor.color-blue   { color: #3d7fd6; }
.cutin-flavor.color-rainbow {
  background: linear-gradient(90deg, #ff3b3b, #ff9d3b, #ffe93b, #3bff6a, #3bcfff, #6a3bff, #ff3bcf, #ff3b3b);
  background-size: 400% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: rush-rainbow 3s linear infinite;
}
@keyframes rush-rainbow {
  0%   { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
}

.rush-sub { font-size: 16px; color: #666; }
.rush-sub span { font-size: 32px; font-weight: bold; color: #d2694a; }

.chain-label {
  font-size: 15px;
  font-weight: bold;
  color: #d2694a;
  letter-spacing: 1px;
}

/* 振り分けボックス */
.vibun-box {
  width: 100%;
  max-width: 300px;
  background: #fbfbfc;
  border-radius: 12px;
  border: 2px solid #eee;
  padding: 18px;
  text-align: center;
}
.vibun-box.rush-box   { border-color: #e63950; background: #fff5f6; }

.bonus-main {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1.2;
}
.bonus-main.premium  { color: #c9a227; }
.bonus-main.standard { color: #d2694a; }

.bonus-sub { font-size: 13px; color: #888; margin-top: 5px; }

/* 一括回転 */
.spin-rate-block {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.spin-rate-label { font-size: 11px; color: #999; }
.spin-rate-select {
  background: #fff;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
}

.auto-spin-btns { display: flex; gap: 12px; margin-top: 4px; }

.btn-auto {
  flex: 1;
  padding: 12px 0;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #ccc;
  font-size: 15px;
  font-weight: bold;
  color: #333;
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
  max-width: 200px;
}
.btn-auto:active { background: #f2f2f2; transform: scale(0.96); }

.auto-spin-wrap  { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.spin-cost-hint  { font-size: 9px; color: #aaa; }

.btn-taiten {
  font-size: 12px;
  color: #999;
  background: none;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 6px 18px;
  cursor: pointer;
  margin-top: 4px;
}
.btn-taiten:active { opacity: 0.7; }

/* RUSH中の3種回転ボタン */
.rush-spin-btns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  width: 100%;
  max-width: 320px;
}
.btn-rush-spin {
  flex: 1;
  padding: 10px 0;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #ccc;
  font-size: 13px;
  font-weight: bold;
  color: #333;
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
}
.btn-rush-spin:active { background: #f2f2f2; transform: scale(0.96); }
.btn-rush-spin.skip {
  background: linear-gradient(135deg, #e63950, #b5202f);
  border-color: #ffb0bb;
  color: #fff;
}
.btn-rush-spin:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.btn-rush-spin.skip:disabled {
  background: #eee;
  border-color: #ddd;
  color: #aaa;
}

/* ========== リザルト ========== */
.rush-result-title {
  font-size: 20px;
  font-weight: bold;
  color: #c9a227;
  letter-spacing: 2px;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
  width: 100%;
  max-width: 300px;
  text-align: center;
}

.rush-result-box {
  width: 100%;
  max-width: 300px;
  background: #fbfbfc;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 14px 16px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
}
.result-row.highlight { background: rgba(201,162,39,0.08); border-radius: 6px; padding: 6px 4px; }

.rr-label { font-size: 13px; color: #888; }
.rr-val   { font-size: 15px; font-weight: bold; color: #333; }
.rr-val.gold { color: #c9a227; font-size: 18px; }

.result-hr { border: none; border-top: 1px solid #eee; margin: 8px 0; }

.rr-section {
  font-size: 10px;
  color: #999;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

/* ========== 通算LT成績 ========== */
#rush-stats-bar {
  background: #fafafa;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding: 5px 12px;
  flex-shrink: 0;
}
.rsb-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 3px;
}
.rsb-title {
  font-size: 10px;
  font-weight: bold;
  color: #d2694a;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.rsb-item { display: flex; align-items: baseline; gap: 3px; }
.rsb-label { font-size: 9px; color: #999; }
.rsb-val   { font-size: 12px; font-weight: bold; color: #333; }
.rsb-prob  { font-size: 9px; color: #999; }

/* ========== ログ ========== */
#log-area {
  background: #fafafa;
  border-top: 1px solid #eee;
  max-height: 140px;
  overflow-y: auto;
  flex-shrink: 0;
}
#log-title { font-size: 10px; color: #aaa; padding: 5px 12px 2px; letter-spacing: 1px; }
.log-item {
  font-size: 12px;
  padding: 4px 12px;
  border-bottom: 1px solid #f0f0f0;
  color: #888;
}
.log-item.win   { color: #b5872a; }
.log-item.rush  { color: #e63950; }
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: add white-based visual theme"
```

---

## Task 7: script.js — game state and normal-mode flow

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-lycoris\script.js`

- [ ] **Step 1: Write the game state object and normal-mode handlers**

```js
'use strict';

const game = {
  state: 'normal_idle',
  mode: 'normal',
  spinRate: DEFAULT_SPIN_RATE,
  mochiDama: 0,
  toushi: 0,
  totalSpins: 0,
  currentSpins: 0,
  lastHitSpins: 0,
  bonusCounts: { premium: 0, firstLycoris: 0, chinanagoPromotion: 0, lycoris: 0, chinanago: 0 },
  ltEntryCount: 0,
  totalLtHits: 0,
  ltAllStats: { ltTotalSpins: 0 },
  lt: null,
  pending: {},
  eigyoAlertShown: false,
  log: [],
};

function addLog(text, type = '') {
  game.log.unshift({ text, type });
  if (game.log.length > 50) game.log.pop();
  renderLog();
}

// ---- 球数・投資 ----

function consumeSpinCost() {
  const cost = calcSpinCost(game.spinRate);
  if (game.mochiDama >= cost) {
    game.mochiDama -= cost;
  } else {
    const shortfall = cost - game.mochiDama;
    game.mochiDama = 0;
    const units = Math.ceil(shortfall / 250);
    game.toushi   += units * 1000;
    game.mochiDama = units * 250 - shortfall;
  }
}

function addBalls(n) {
  game.mochiDama += n;
}

function handleSpinRateChange(value) {
  game.spinRate = Number(value);
  render();
}

// ---- 通常時ハンドラ ----

function checkEigyoAlert() {
  if (!game.eigyoAlertShown && game.totalSpins >= 2000) {
    game.eigyoAlertShown = true;
    setState('eigyo_alert');
    return true;
  }
  return false;
}

// 1回転処理。演出発生など画面遷移が起きたら true を返す
function runNormalSpin() {
  game.totalSpins++;
  game.currentSpins++;
  consumeSpinCost();
  const result = spinNormal();

  if (result === 'hit') {
    const typeKey = rollBonusType();
    const info = BONUS_TYPES[typeKey];
    game.bonusCounts[typeKey]++;
    addBalls(info.actual);
    game.currentSpins = 0;
    game.lastHitSpins = game.totalSpins;
    game.pending = { typeKey, entersLt: info.entersLt };
    addLog(`大当たり！ ${typeKey} ＋${info.actual}球`, 'win');
    setState('bonus_result');
    return true;
  }
  return false;
}

function handleStart() {
  if (checkEigyoAlert()) return;
  if (!runNormalSpin()) {
    setState('lose_result');
  }
}

function autoSpin(count) {
  for (let i = 0; i < count; i++) {
    if (checkEigyoAlert()) return;
    if (runNormalSpin()) return;
  }
  setState('normal_idle');
}

function handleBonusContinue() {
  if (game.pending.entersLt) {
    const entry = rollInitialLtEntry();
    game.lt = createLtState(entry.mode);
    game.mode = 'rush';
    game.ltEntryCount++;
    game.pending = { cutinColor: entry.color };
    addLog('LT突入！', 'rush');
    setState('lt_cutin');
  } else {
    backToNormal();
  }
}

function handleLtCutinContinue() {
  setState('lt_idle');
}

function backToNormal() {
  game.mode = 'normal';
  setState('normal_idle');
}

// ---- 営業終了・退店 ----

function handleEigyoHai() {
  setState(game.mode === 'rush' ? 'lt_idle' : 'normal_idle');
}

function handleEigyoIie() {
  setState('taiten_result');
}

function handleTaiten() {
  setState('taiten_result');
}

function resetGame() {
  game.state           = 'normal_idle';
  game.mode            = 'normal';
  game.spinRate        = DEFAULT_SPIN_RATE;
  game.mochiDama       = 0;
  game.toushi          = 0;
  game.totalSpins      = 0;
  game.currentSpins    = 0;
  game.lastHitSpins    = 0;
  game.bonusCounts     = { premium: 0, firstLycoris: 0, chinanagoPromotion: 0, lycoris: 0, chinanago: 0 };
  game.ltEntryCount    = 0;
  game.totalLtHits     = 0;
  game.ltAllStats      = { ltTotalSpins: 0 };
  game.lt              = null;
  game.pending         = {};
  game.eigyoAlertShown = false;
  game.log             = [];
  render();
}
```

## Context for the implementer

This is Task 7 of a 10-task plan for `pachinko-simulator-lycoris`. Tasks 1-6 (scaffold, `logic.js` fully built and tested, `index.html`, `style.css`) are done. `script.js` calls `setState`, `render`, `renderLog` — forward references resolved in Task 9, not this one. Don't stub them.

**Domain notes:**
- `game.pending.entersLt` is read from `BONUS_TYPES[typeKey].entersLt` (Task 2) — three of the five bonus types always enter LT, two never do; there is no additional random roll for LT entry beyond the bonus-type roll itself.
- `game.lt` holds the LT state object from `createLtState()` (Task 4) — `{ mode, stRemaining, totalHits, actualBalls, nominalBalls }`. **`mode` must never be read by any rendering code** — see the "Key design decisions" section at the top of this plan.
- `handleBonusContinue()` is the point where, if the bonus type grants LT entry, the initial mode+color are rolled via `rollInitialLtEntry()` and a `lt_cutin` screen is shown before the player ever sees the ST-idle screen — this matches the spec's requirement that the color cutin appears on first entry too, not just on continuing hits inside LT.
- Task 8 will add `handleLtSpin`/`handleLtSpin10`/`handleLtSkip` and wire `handleLtCutinContinue()`'s onward flow (currently it just goes to `lt_idle` — correct for both the first entry and continuing-hit cases, since `game.mode` is already set to `'rush'` by the time this fires).

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "feat: add game state and normal-mode flow handlers"
```

---

## Task 8: script.js — LT-mode flow (ST reducer wiring, cutin, 1/10/skip)

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Append LT-mode handlers**

Add to `script.js`, after `backToNormal()` (before the "営業終了・退店" section):

```js
// ---- LT(ST)中ハンドラ ----

// 1回転処理。画面遷移が起きたら true を返す
function runLtSpin(opts = {}) {
  game.ltAllStats.ltTotalSpins++;
  const { ltState, outcome, hitActual, hitNominal, addOnCount, nextModeColor } = applyLtSpin(game.lt);
  game.lt = ltState;

  if (outcome === 'miss') {
    if (!opts.silent) {
      addLog(`ST残り${ltState.stRemaining}回`);
      setState('lt_miss');
      return true;
    }
    return false;
  }

  if (outcome === 'lt_end') {
    addLog('ST終了 → LTリザルトへ');
    setState('lt_result');
    return true;
  }

  game.totalLtHits++;
  addBalls(hitActual);
  game.pending = { hitActual, hitNominal, addOnCount, nextModeColor };
  addLog(`当選！ ＋${hitActual}球 (上乗せ${addOnCount}連)`, 'rush');
  setState('lt_hit_result');
  return true;
}

function handleLtSpin() {
  runLtSpin();
}

function handleLtSpin10() {
  for (let i = 0; i < 10; i++) {
    if (runLtSpin({ silent: true })) return;
  }
  setState('lt_idle');
}

function handleLtSkip() {
  for (;;) {
    if (runLtSpin({ silent: true })) return;
    if (game.lt.stRemaining <= 10) {
      setState('lt_idle');
      return;
    }
  }
}

function handleLtHitContinue() {
  setState('lt_cutin');
}

function handleLtMissContinue() {
  setState('lt_idle');
}

function handleLtResultEnd() {
  addLog('LT終了 → 通常時へ');
  game.mode = 'normal';
  game.lt = null;
  setState('normal_idle');
}
```

## Context for the implementer

This is Task 8 of a 10-task plan for `pachinko-simulator-lycoris`. Task 7 (game state, normal-mode flow) is done. `script.js` currently ends with the "営業終了・退店" section and `resetGame()` — insert the new block **before** that section, right after `backToNormal()`.

**Domain notes:**
- `runLtSpin` mirrors the exact silent/non-silent pattern already proven correct in `pachinko-simulator-ghoul`'s RUSH handlers: a miss only renders when not silent; a hit or `lt_end` always renders regardless of the silent flag. `handleLtSpin()` (no `opts`) always shows a screen on every outcome including miss — this is deliberate, matching a bugfix already made in the sibling project (a manual single-spin action must always produce visible feedback).
- After a hit, `handleLtHitContinue()` transitions to `lt_cutin` (not straight back to `lt_idle`) — the spec requires the color-coded "ラッシュ開始！" cutin to appear after **every** hit (including chained mode-B add-ons, which are already fully resolved inside `applyLtSpin` before this handler ever runs), not just the first LT entry.
- `handleLtSkip()`'s `<= 10` early-stop and the corresponding UI disable (Task 9) mirror an already-approved UX refinement from the sibling ghoul project: skip fast-forwards through misses but always leaves the last 10 ST spins for manual (1回転/10回転) play.
- `game.pending` here holds `{ hitActual, hitNominal, addOnCount, nextModeColor }` after a hit — note `nextModeColor` is what gets rendered on the following `lt_cutin` screen; the underlying `mode` that produced it is never stored in `pending`, only its already-resolved color.

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "feat: add LT-mode flow (ST reducer wiring, cutin, 1/10/skip spins)"
```

---

## Task 9: script.js — rendering layer

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Append the rendering layer**

Add to `script.js`, after `resetGame()`:

```js
// ---- 状態セット & レンダリング ----

function setState(state) {
  game.state = state;
  render();
}

function render() {
  renderHeader();
  renderModeBadge();
  renderMainScreen();
  renderRushStats();
}

function renderHeader() {
  const mochiInt = Math.floor(game.mochiDama);
  document.getElementById('mochi-dama').textContent   = mochiInt.toLocaleString();
  document.getElementById('toushi-value').textContent = game.toushi.toLocaleString();

  const shuushi   = mochiInt * 4 - game.toushi;
  const shuushiEl = document.getElementById('shuushi-value');
  shuushiEl.textContent = (shuushi >= 0 ? '+' : '') + shuushi.toLocaleString();
  shuushiEl.className   = 'money-value ' + (shuushi >= 0 ? 'green' : 'red');
  document.getElementById('current-spins').textContent = game.currentSpins.toLocaleString();
  document.getElementById('total-spins-disp').textContent = game.totalSpins.toLocaleString();

  const rushCountEl = document.getElementById('rush-count');
  rushCountEl.textContent = game.mode === 'rush' ? `${game.lt.stRemaining}回` : '－';

  const totalBonusHits = Object.values(game.bonusCounts).reduce((a, b) => a + b, 0);
  document.getElementById('total-hit-count').textContent = (totalBonusHits + game.totalLtHits) + '回';
  document.getElementById('normal-first-hit').textContent  = totalBonusHits + '回';
  document.getElementById('normal-first-prob').textContent = totalBonusHits > 0 && game.totalSpins > 0
    ? '1/' + Math.round(game.totalSpins / totalBonusHits).toLocaleString()
    : '1/―';

  document.getElementById('lt-entry-count').textContent = game.ltEntryCount + '回';
  const ltEntryRate = totalBonusHits > 0 ? Math.round(game.ltEntryCount / totalBonusHits * 100) : 0;
  document.getElementById('lt-entry-info').textContent = `(突入率 ${ltEntryRate}%)`;

  document.getElementById('fee-block').textContent = `${game.spinRate}回転/千円`;
}

function renderModeBadge() {
  const el = document.getElementById('mode-badge');
  if (game.mode === 'rush') {
    el.textContent = 'LT中';
    el.className = 'rush';
  } else {
    el.textContent = '通常時';
    el.className = '';
  }
}

function renderMainScreen() {
  document.getElementById('main-screen').innerHTML = buildScreen(game.state);
}

function spinRateOptionsHtml() {
  return SPIN_RATE_OPTIONS.map(rate =>
    `<option value="${rate}" ${rate === game.spinRate ? 'selected' : ''}>${rate}回転</option>`
  ).join('');
}

function tenThousandYenSpins() {
  return game.spinRate * 10;
}

const BONUS_LABELS = {
  premium: 'PREMIUM LYCORECO BONES',
  firstLycoris: 'First Lycoris BONUS',
  chinanagoPromotion: 'チンアナゴ BONUS（昇格）',
  lycoris: 'Lycoris BONUS',
  chinanago: 'チンアナゴ BONUS',
};

const CUTIN_COLOR_LABELS = { rainbow: '虹', red: '赤', green: '緑', blue: '青' };

function buildScreen(state) {
  switch (state) {

    case 'normal_idle':
      return `<div class="screen">
        <button class="btn-start" onclick="handleStart()">START</button>
        <p class="prob-hint">大当たり確率 1/259.7</p>
        <div class="spin-rate-block">
          <span class="spin-rate-label">1000円あたりの回転数</span>
          <select class="spin-rate-select" onchange="handleSpinRateChange(this.value)">
            ${spinRateOptionsHtml()}
          </select>
        </div>
        <div class="auto-spin-btns">
          <div class="auto-spin-wrap">
            <button class="btn-auto" onclick="autoSpin(${tenThousandYenSpins()})">1万円分回す</button>
            <p class="spin-cost-hint">約${tenThousandYenSpins()}回転分</p>
          </div>
        </div>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;

    case 'bonus_result': {
      const info = BONUS_TYPES[game.pending.typeKey];
      const label = BONUS_LABELS[game.pending.typeKey];
      return `<div class="screen">
        <div class="vibun-box ${info.entersLt ? 'rush-box' : ''}">
          <p class="bonus-main ${info.entersLt ? 'premium' : 'standard'}">${label}</p>
          <p class="bonus-sub">${info.nominal}個（＋${info.actual}球獲得）</p>
        </div>
        <button class="btn-action" onclick="handleBonusContinue()">▶ 次へ</button>
      </div>`;
    }

    case 'lose_result':
      return `<div class="screen">
        <p class="result-main lose">はずれ</p>
        <button class="btn-sub" onclick="backToNormal()" style="margin-top:8px;">続ける</button>
      </div>`;

    case 'lt_cutin': {
      const color = game.pending.cutinColor;
      return `<div class="screen">
        <p class="cutin-flavor color-${color}">ラッシュ開始！（${CUTIN_COLOR_LABELS[color]}）</p>
        <p class="rush-title" style="color:#c9a227;">SPECIAL LycoReco RUSH<br>HYPER DELUXE</p>
        <button class="btn-action" onclick="handleLtCutinContinue()">▶ 次へ</button>
      </div>`;
    }

    case 'lt_idle': {
      const skipDisabled = game.lt.stRemaining <= 10;
      return `<div class="screen">
        <p class="rush-sub">ST残り <span>${game.lt.stRemaining}</span> 回</p>
        <div class="rush-spin-btns">
          <button class="btn-rush-spin" onclick="handleLtSpin()">1回転</button>
          <button class="btn-rush-spin" onclick="handleLtSpin10()">10回転</button>
          <button class="btn-rush-spin skip" ${skipDisabled ? 'disabled' : 'onclick="handleLtSkip()"'}>スキップ</button>
        </div>
        <p class="prob-hint">大当たり確率 1/97.1</p>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;
    }

    case 'lt_hit_result': {
      const { hitActual, hitNominal, addOnCount } = game.pending;
      return `<div class="screen">
        <div class="vibun-box rush-box">
          <p class="bonus-main premium">${hitNominal}個</p>
          <p class="bonus-sub">＋${hitActual}球獲得${addOnCount > 0 ? `（上乗せ${addOnCount}連含む）` : ''}</p>
        </div>
        <button class="btn-action" onclick="handleLtHitContinue()" style="margin-top:16px;">▶ 次へ</button>
      </div>`;
    }

    case 'lt_miss':
      return `<div class="screen">
        <p class="result-main lose">外れ</p>
        <p style="color:#d2694a; font-size:18px; margin-top:4px;">ST残り ${game.lt.stRemaining}回</p>
        <button class="btn-sub" onclick="handleLtMissContinue()" style="margin-top:12px;">続ける</button>
      </div>`;

    case 'lt_result': {
      const s = game.lt;
      return `<div class="screen">
        <p class="rush-result-title">LT リザルト</p>
        <div class="rush-result-box">
          <div class="result-row highlight">
            <span class="rr-label">当選回数</span>
            <span class="rr-val gold">${s.totalHits}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">獲得出玉</span>
            <span class="rr-val gold">${s.actualBalls.toLocaleString()}球</span>
          </div>
          <div class="result-row">
            <span class="rr-label">表示出玉</span>
            <span class="rr-val">${s.nominalBalls.toLocaleString()}個</span>
          </div>
        </div>
        <button class="btn-action" onclick="handleLtResultEnd()" style="margin-top:16px;">▶ 通常へ戻る</button>
      </div>`;
    }

    case 'eigyo_alert':
      return `<div class="screen">
        <p style="font-size:22px; font-weight:bold; color:#c9a227; text-align:center; line-height:1.6;">
          営業時間終了になりました
        </p>
        <p style="font-size:16px; color:#666; text-align:center;">このまま居座り続けますか？</p>
        <div style="display:flex; gap:16px; margin-top:8px;">
          <button class="btn-action" style="flex:1;" onclick="handleEigyoHai()">はい</button>
          <button class="btn-action" style="flex:1; background:linear-gradient(135deg,#999,#666); border-color:#ccc;"
            onclick="handleEigyoIie()">いいえ</button>
        </div>
      </div>`;

    case 'taiten_result': {
      const mochi    = Math.floor(game.mochiDama);
      const mochiYen = mochi * 4;
      const shuushi  = mochiYen - game.toushi;
      const shuushiColor = shuushi >= 0 ? '#2e9e5b' : '#d24141';
      const shuushiSign  = shuushi >= 0 ? '＋' : '';
      return `<div class="screen">
        <p style="font-size:24px; font-weight:bold; color:#666;">退店します</p>
        <div class="rush-result-box" style="max-width:320px;">
          <p class="rr-section" style="margin-bottom:8px;">収支発表</p>
          <div class="result-row">
            <span class="rr-label">総回転数</span>
            <span class="rr-val">${game.totalSpins.toLocaleString()}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">投資金額</span>
            <span class="rr-val" style="color:#d24141;">${game.toushi.toLocaleString()}円</span>
          </div>
          <div class="result-row">
            <span class="rr-label">持ち球換算</span>
            <span class="rr-val">${mochiYen.toLocaleString()}円</span>
          </div>
          <hr class="result-hr">
          <div class="result-row highlight">
            <span class="rr-label" style="font-weight:bold;">収支</span>
            <span class="rr-val" style="color:${shuushiColor}; font-size:22px;">
              ${shuushiSign}${shuushi.toLocaleString()}円
            </span>
          </div>
          <hr class="result-hr">
          <div class="result-row">
            <span class="rr-label">LT突入</span>
            <span class="rr-val">${game.ltEntryCount}回</span>
          </div>
        </div>
        <button class="btn-action" onclick="resetGame()" style="margin-top:8px;">▶ 最初の画面に戻る</button>
      </div>`;
    }

    default:
      return `<div class="screen"><p>...</p></div>`;
  }
}

function renderRushStats() {
  const hits  = game.totalLtHits;
  const spins = game.ltAllStats.ltTotalSpins;
  const prob  = hits > 0 && spins > 0
    ? '1/' + (spins / hits).toFixed(1)
    : '1/―';
  document.getElementById('rs-chain').textContent = hits + '回';
  document.getElementById('rs-prob').textContent  = prob;
  document.getElementById('rs-spins').textContent = spins + '回';
}

function renderLog() {
  const el = document.getElementById('log-list');
  el.innerHTML = game.log.map(item =>
    `<div class="log-item ${item.type}">${item.text}</div>`
  ).join('');
}

render();
```

## Context for the implementer

This is Task 9 of a 10-task plan for `pachinko-simulator-lycoris` — the final `script.js` increment, after which the whole app becomes runnable in a browser for the first time (Task 10 is manual verification, not this one). Tasks 7-8 are done.

**Critical spec constraint — verify before committing:** re-read every `case` in `buildScreen` above and confirm none of them reference `game.lt.mode`. Only `game.lt.stRemaining`, `.totalHits`, `.actualBalls`, `.nominalBalls` are ever read for rendering; `.mode` exists on the object (set by `logic.js`'s `createLtState`/`applyLtSpin`) but is consumed only by `script.js`'s LT-mode handlers (Task 8) to feed into `applyLtSpin`, never by anything in this rendering layer. If you find yourself wanting to display `game.lt.mode` for debugging or completeness, stop — that's the one behavior explicitly forbidden by the design spec.

**Domain notes:**
- Every `onclick`/`onchange` handler referenced in the templates above must resolve to a function already defined in Tasks 7-8: `handleStart`, `autoSpin`, `handleSpinRateChange`, `handleBonusContinue`, `backToNormal`, `handleLtCutinContinue`, `handleLtSpin`, `handleLtSpin10`, `handleLtSkip`, `handleLtHitContinue`, `handleLtMissContinue`, `handleLtResultEnd`, `handleEigyoHai`, `handleEigyoIie`, `handleTaiten`, `resetGame`. Cross-check before committing.
- `BONUS_LABELS`/`CUTIN_COLOR_LABELS` are presentation-only lookup tables that belong in `script.js` (not `logic.js`), since `logic.js` deals in the internal `typeKey`/`color` string values, not display text.
- `#rs-6000`/`#rs-3000`-equivalent per-type breakdown was intentionally **not** carried over from ghoul's RUSH-stats-bar, since this game's LT payouts aren't split into two fixed named tiers the way ghoul's were — the simpler "当選回数/回転あたり確率/総回転" trio is sufficient here and matches what's wired in `index.html` (Task 5) and `renderRushStats` above.

## Before You Begin (for the implementer)

If anything about the mode-hiding constraint, the handler cross-references, or the screen flow is unclear, **ask now** rather than guessing.

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "feat: add rendering layer (screens, header stats, LT stats, log)"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full logic.js test suite**

Run: `cd /c/Users/ab_99/pachinko-simulator-lycoris && node --test "test/**/*.test.js"`
Expected: PASS, 0 failures (24 tests)

- [ ] **Step 2: Open the page in a browser**

```powershell
Start-Process "C:\Users\ab_99\pachinko-simulator-lycoris\index.html"
```

(Or drive it headlessly with Playwright, mocking `Math.random` the same way `pachinko-simulator-ghoul`'s verification scripts did, if a real browser isn't available in the environment.)

- [ ] **Step 3: Walk through the normal-mode golden path**

- Click START repeatedly (or use 1万円分回す) until a bonus hits. Confirm the `bonus_result` screen shows the correct type label, nominal, and actual ball count for whichever of the 5 types occurred.
- If the type enters LT (premium/firstLycoris/chinanagoPromotion): clicking ▶次へ should show the `lt_cutin` screen with a colored "ラッシュ開始！" line and a gold "SPECIAL LycoReco RUSH HYPER DELUXE" line, then ▶次へ leads to `lt_idle` with ST残り 132 and mode badge "LT中".
- If the type does not enter LT (lycoris/chinanago): clicking ▶次へ should return straight to `normal_idle`, mode badge back to "通常時".
- Confirm a plain miss on a manual START click shows `lose_result` (はずれ), not a frozen screen.

- [ ] **Step 4: Walk through the LT golden path**

- From `lt_idle`, click 1回転 several times; confirm misses decrement ST残り and show `lt_miss`, and any hit shows `lt_hit_result` with correct ball counts (700/750 for a mode-A-shaped hit, or 2800+/3000+ multiples of 2800/3000 for a mode-B-shaped hit with add-ons), followed by ▶次へ going to `lt_cutin` (with some color) then back to `lt_idle` with ST残り reset to 132.
- Click 10回転 and confirm it silently fast-forwards through misses, stopping only on a hit or ST-end.
- Click スキップ and confirm it stops at ST残り10 (not 0), and that the スキップ button becomes disabled once ST残り ≤ 10 while 1回転/10回転 remain usable.
- Let ST reach 0 with no further hits (via manual 1回転 clicks once skip is disabled) and confirm `lt_result` shows correct 当選回数/獲得出玉/表示出玉, then ▶通常へ戻る returns to `normal_idle` with mode badge "通常時".

- [ ] **Step 5: Confirm the mode-hiding constraint holds visually**

- Across all screens visited in Steps 3-4, confirm the internal mode ('A'/'B') is never shown as literal text anywhere in the UI — only the color-coded cutin line should ever hint at it.

- [ ] **Step 6: Sanity-check 退店 and 営業時間終了**

- Click 退店する from `normal_idle`, confirm 収支発表 shows correct totals, then ▶最初の画面に戻る resets everything.
- (Optional, slow) Run 1万円分回す repeatedly until totalSpins ≥ 2000 and confirm the 営業時間終了 alert appears once.

- [ ] **Step 7: Fix any bugs found during manual verification, then commit**

```bash
git add -A
git commit -m "fix: address issues found during manual end-to-end verification"
```

(Skip this commit if no fixes were needed.)

---

## Self-Review Notes

- **Spec coverage:** normal-mode hit rate + 5-way bonus distribution with per-type fixed LT-entry (Task 2), LT hit rate + 132-ST reset-on-hit (Task 3/4), mode A/B payouts and transitions (Task 3/4), mode-B add-on loop (Task 3/4), color table + cutin display incl. on first entry (Task 3/4/7/9), spin-rate 14/16/18/20 + 1万円分回す (Task 2/7/9), 1/10/skip-to-10 LT controls (Task 8/9), white theme (Task 6) — all covered.
- **Placeholder scan:** none; every task's code block is complete and final as written (no intentionally-broken interim states this time, having learned from the ghoul plan's earlier draft mistake).
- **Type/name consistency:** `game.lt` (not `game.rush`), `game.bonusCounts` (keyed by the 5 `BONUS_TYPE_ORDER` strings), `game.ltEntryCount`/`game.totalLtHits`/`game.ltAllStats.ltTotalSpins` — consistent across Tasks 7-9.
- **Mode-hiding constraint:** explicitly called out in the "Key design decisions" preamble and re-stated as a verification checkpoint in Task 9's context and Task 10 Step 5 — this is the spec's single most important non-obvious constraint and is easy for an implementer to accidentally violate by "helpfully" surfacing the mode for debugging.
