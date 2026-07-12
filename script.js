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
  ltCycleSpins: 0,
  ltBonus750Count: 0,
  ltBonus3000Count: 0,
  ltUltimateDriveEntryCount: 0,
  ltUltimateDriveNominalBalls: 0,
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
    const interval = game.totalSpins - game.lastHitSpins;
    game.bonusCounts[typeKey]++;
    addBalls(info.actual);
    game.currentSpins = 0;
    game.lastHitSpins = game.totalSpins;
    game.pending = { typeKey, entersLt: info.entersLt, interval };
    addLog(`${interval}回転で大当たり！ ${typeKey} ＋${info.actual}球`, 'win');
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
    game.ltCycleSpins = 0;
    game.ltBonus750Count = 0;
    game.ltBonus3000Count = 0;
    game.ltUltimateDriveEntryCount = 0;
    game.ltUltimateDriveNominalBalls = 0;
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

// ---- LT(ST)中ハンドラ ----

// 1回転処理。画面遷移が起きたら true を返す
function runLtSpin(opts = {}) {
  game.ltAllStats.ltTotalSpins++;
  game.ltCycleSpins++;
  const { ltState, outcome, hitActual, hitNominal, nextModeColor } = applyLtSpin(game.lt);
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
  const spinsThisCycle = game.ltCycleSpins;
  game.ltCycleSpins = 0;

  if (outcome === 'hit_mode_a') {
    game.ltBonus750Count++;
    game.pending = { hitActual, hitNominal, cutinColor: nextModeColor, spinsThisCycle };
    addLog(`${spinsThisCycle}回転で当選！ ＋${hitActual}球`, 'rush');
    setState('lt_hit_result');
    return true;
  }

  // outcome === 'hit_mode_b_base' — show the base win first; the add-on
  // chain (if any) is rolled one step at a time from handleLtAddonRoll(),
  // each success escalating the displayed cumulative bonus (3000→6000→9000…)
  // and branding itself as "ULTIMATE DRIVE".
  game.ltBonus3000Count++;
  game.pending = { hitActual, hitNominal, spinsThisCycle, addOnCount: 0 };
  addLog(`${spinsThisCycle}回転で当選！ ボーナス3000 ＋${hitActual}球`, 'rush');
  setState('lt_hit_base_b');
  return true;
}

// モードBの上乗せ抽選を1回分だけ進める。「ボーナス3000」画面と
// 「ボーナスX000！ULTIMATE DRIVE」画面、どちらのボタンからも呼ばれる。
// 実際の獲得球数は毎回+2800球(グール版と同じ)だが、表示上のボーナス数は
// 3000→6000→9000…と累計で増えていく。
function handleLtAddonRoll() {
  const { ltState, outcome, hitActual, hitNominal, nextModeColor } = applyAddOnStep(game.lt);
  game.lt = ltState;

  if (outcome === 'addon_hit') {
    addBalls(hitActual);
    game.pending.addOnCount++;
    if (game.pending.addOnCount === 1) {
      game.ltUltimateDriveEntryCount++;
    }
    game.ltUltimateDriveNominalBalls += hitNominal;
    game.pending.hitActual = hitActual;
    game.pending.cumulativeNominal = 3000 + game.pending.addOnCount * 3000;
    addLog(`ボーナス${game.pending.cumulativeNominal}！ ULTIMATE DRIVE獲得 ＋${hitActual}球`, 'rush');
    setState('lt_addon_hit');
    return;
  }

  // outcome === 'addon_end'
  game.pending.cutinColor = nextModeColor;
  setState('lt_cutin');
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
  game.ltCycleSpins = 0;
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
  game.ltCycleSpins    = 0;
  game.ltBonus750Count = 0;
  game.ltBonus3000Count = 0;
  game.ltUltimateDriveEntryCount = 0;
  game.ltUltimateDriveNominalBalls = 0;
  game.pending         = {};
  game.eigyoAlertShown = false;
  game.log             = [];
  render();
}

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

// LT(ST)の理論継続率：132回転以内に一度でも当選する確率
function ltContinuationRatePercent() {
  return (100 * (1 - Math.pow(1 - P_LT_HIT, LT_ST_COUNT))).toFixed(1);
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
            <button class="btn-auto" onclick="autoSpin(${tenThousandYenSpins()})">1万円分</button>
            <p class="spin-cost-hint">約${tenThousandYenSpins()}回転分</p>
          </div>
        </div>
        <button class="btn-taiten" onclick="handleTaiten()">退店する</button>
      </div>`;

    case 'bonus_result': {
      const info = BONUS_TYPES[game.pending.typeKey];
      const label = BONUS_LABELS[game.pending.typeKey];
      return `<div class="screen">
        <p class="result-sub">${game.pending.interval}回転で大当たり</p>
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
        <p class="result-sub">継続率 ${ltContinuationRatePercent()}%</p>
        <button class="btn-action" onclick="handleLtCutinContinue()">▶ 次へ</button>
      </div>`;
    }

    case 'lt_idle': {
      const skipDisabled = game.lt.stRemaining <= 10;
      return `<div class="screen">
        <p class="chain-label">${game.lt.totalHits}連チャン中</p>
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
      const { hitActual, hitNominal, spinsThisCycle } = game.pending;
      return `<div class="screen">
        <p class="result-sub">${spinsThisCycle}回転で当選</p>
        <p class="chain-label">${game.lt.totalHits}連チャン中</p>
        <div class="vibun-box rush-box">
          <p class="bonus-main premium">${hitNominal}個</p>
          <p class="bonus-sub">＋${hitActual}球獲得</p>
        </div>
        <button class="btn-action" onclick="handleLtHitContinue()" style="margin-top:16px;">▶ 次へ</button>
      </div>`;
    }

    case 'lt_hit_base_b': {
      const { hitActual, spinsThisCycle } = game.pending;
      return `<div class="screen">
        <p class="result-sub">${spinsThisCycle}回転で当選</p>
        <p class="chain-label">${game.lt.totalHits}連チャン中</p>
        <div class="vibun-box rush-box">
          <p class="bonus-main premium">ボーナス3000</p>
          <p class="bonus-sub">＋${hitActual}球獲得</p>
        </div>
        <button class="btn-action" onclick="handleLtAddonRoll()" style="margin-top:16px;">▶ 次へ</button>
      </div>`;
    }

    case 'lt_addon_hit': {
      const { hitActual, addOnCount, cumulativeNominal } = game.pending;
      return `<div class="screen">
        <p class="chain-label">上乗せ${addOnCount}連目</p>
        <div class="vibun-box rush-box">
          <p class="bonus-main premium">ボーナス${cumulativeNominal}！</p>
          <p class="bonus-sub">ULTIMATE DRIVE獲得</p>
          <p class="bonus-sub">＋${hitActual}球獲得</p>
        </div>
        <button class="btn-action" onclick="handleLtAddonRoll()" style="margin-top:16px;">▷ ULTIMATE DRIVE</button>
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
            <span class="rr-label">連チャン数</span>
            <span class="rr-val gold">${s.totalHits}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">TOTAL</span>
            <span class="rr-val gold">${s.nominalBalls.toLocaleString()}個</span>
          </div>
          <div class="result-row">
            <span class="rr-label">獲得出玉</span>
            <span class="rr-val">${s.actualBalls.toLocaleString()}球</span>
          </div>
          <hr class="result-hr">
          <p class="rr-section">ボーナス内訳</p>
          <div class="result-row">
            <span class="rr-label">750ボーナス</span>
            <span class="rr-val">×${game.ltBonus750Count}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">3000ボーナス</span>
            <span class="rr-val">×${game.ltBonus3000Count}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">ULTIMATE DRIVE突入</span>
            <span class="rr-val">×${game.ltUltimateDriveEntryCount}回</span>
          </div>
          <div class="result-row">
            <span class="rr-label">ULTIMATE DRIVE表示出玉</span>
            <span class="rr-val">${game.ltUltimateDriveNominalBalls.toLocaleString()}個</span>
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
