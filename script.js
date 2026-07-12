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
