import {
  ASSETS, BY_ID, PERKS, priceAt, candles, changePct, spark, feedFrom,
  unpackEvents, fmtPrice, rankOf, feeFor, EVENT_WINDOW
} from './market.js';
import { createChart, sparkline } from './chart.js';
import { store, offline } from './store.js';

const $ = id => document.getElementById(id);
const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
const sign = v => (v >= 0 ? '+' : '') + v.toFixed(2);
const qtyText = q => q >= 1000 ? Math.round(q).toLocaleString('ru') : q.toFixed(3);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ago = ts => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? s + ' с назад' : s < 3600 ? Math.round(s / 60) + ' мин назад' : Math.round(s / 3600) + ' ч назад';
};

const TFS = [[5000, '5с'], [15000, '15с'], [60000, '1м'], [300000, '5м']];

let U = null;
let quests = [];
let offset = 0;
let asset = 'POTATO';
let tf = 5000;
let busy = false;
let mode = 'register';
let newsIdx = 0;
let lastPx = {};
let sparkAt = 0;
let evList = [];
let EV = new Map();
let syncing = false;
let lastSync = 0;
let lastTouch = Date.now();
let boardCache = null;
let warned = false;

const now = () => Date.now() + offset;
const chart = createChart($('cv'));

function mergeEvents(list) {
  for (const e of list || []) {
    const k = e.a + ':' + e.w;
    if (!EV.has(k)) {
      EV.set(k, e);
      evList.push(e);
    }
  }
  const cut = Math.floor((now() - 12 * 3600e3) / EVENT_WINDOW);
  if (evList.length > 900) evList = evList.filter(e => e.w >= cut);
}

function applySync(r) {
  if (r.user) {
    U = r.user;
    U.holdings = U.holdings || {};
    U.perks = U.perks || {};
  }
  if (r.quests) quests = r.quests;
  if (r.serverTime) offset = r.serverTime - Date.now();
  if (r.events) mergeEvents(unpackEvents(r.events));
  lastSync = Date.now();
  if (warned) {
    warned = false;
    $('ticker').classList.remove('stale');
  }
}

async function syncNow(full) {
  if (syncing || !store.hasToken()) return;
  syncing = true;
  try {
    const from = full ? undefined : Math.max(lastSync - 3 * EVENT_WINDOW, now() - 7 * 3600e3);
    applySync(await store.sync(from));
  } catch (e) {
    if (String(e.message).includes('войти')) {
      showGate();
    } else if (!warned && Date.now() - lastSync > 90000) {
      warned = true;
      $('ticker').classList.add('stale');
      $('ticker').innerHTML = '<span>📡</span><em>Нет связи с сервером, цены могут врать</em>';
    }
  }
  syncing = false;
}

function equity(t = now()) {
  if (!U) return 0;
  let e = U.cash;
  for (const [id, h] of Object.entries(U.holdings || {})) e += h.qty * priceAt(id, t, EV);
  return e;
}

const held = id => (U && U.holdings && U.holdings[id]) || { qty: 0, avg: 0 };
const owns = id => !!(U && U.perks && U.perks[id]);

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2400);
}

function buzz(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* вход */

function setMode(m) {
  mode = m;
  $('go').textContent = m === 'register' ? 'Начать с $10' : 'Войти';
  $('sw').innerHTML = m === 'register' ? 'Уже торговал? <b>Войти</b>' : 'Первый раз? <b>Создать ферму</b>';
  $('sw').querySelector('b').onclick = () => setMode(m === 'register' ? 'login' : 'register');
}

function showGate() {
  U = null;
  $('gate').style.display = '';
  $('nav').hidden = true;
  document.querySelectorAll('.view').forEach(s => s.classList.remove('on'));
}

$('go').onclick = async () => {
  const u = $('u').value.trim();
  const p = $('p').value;
  if (u.length < 3) return ($('err').textContent = 'Позывной от 3 символов');
  if (p.length < 4) return ($('err').textContent = 'Пароль от 4 символов');
  $('go').disabled = true;
  $('err').textContent = '';
  try {
    await store.auth(mode, u, p);
    await boot();
  } catch (e) {
    $('err').textContent = e.message;
  }
  $('go').disabled = false;
};

$('p').onkeydown = e => { if (e.key === 'Enter') $('go').click(); };

/* каркас */

function go(v) {
  if (!U) return;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('.nav button').forEach(b => b.setAttribute('aria-current', b.dataset.v === v ? 'page' : 'false'));
  if (v === 'bag') drawBag();
  if (v === 'top') drawTop();
  if (v === 'shop') drawShop();
  if (v === 'me') drawMe();
  if (v === 'trade') requestAnimationFrame(() => { chart.resize(); paintTrade(); });
}

$('nav').onclick = e => {
  const b = e.target.closest('button');
  if (b) { go(b.dataset.v); buzz(); }
};

/* торги */

function buildChips() {
  $('chips').innerHTML = ASSETS.map(a => `
    <button class="chip" data-a="${a.id}" style="--c:${a.color}" aria-selected="${a.id === asset}">
      <span class="n">${a.emoji} ${a.short}</span>
      <span class="p mono" data-p></span>
      <span class="d mono" data-d></span>
      <span data-s></span>
    </button>`).join('');
  $('chips').onclick = e => {
    const b = e.target.closest('.chip');
    if (b) pick(b.dataset.a);
  };
}

function pick(id) {
  asset = id;
  const a = BY_ID[id];
  document.documentElement.style.setProperty('--accent', a.color);
  document.documentElement.style.setProperty('--glow', a.glow);
  document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-selected', c.dataset.a === id));
  const el = document.querySelector(`.chip[data-a="${id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  $('cname').textContent = `${a.emoji} ${a.short}`;
  $('hint').textContent = a.about;
  buzz();
}

function shift(dir) {
  const i = ASSETS.findIndex(a => a.id === asset);
  pick(ASSETS[(i + dir + ASSETS.length) % ASSETS.length].id);
}

let swipeX = null;
const chartBox = document.querySelector('.chart');
chartBox.addEventListener('touchstart', e => { swipeX = e.touches[0].clientX; }, { passive: true });
chartBox.addEventListener('touchend', e => {
  if (swipeX === null) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1);
  swipeX = null;
}, { passive: true });

window.addEventListener('keydown', e => {
  if (!U || document.activeElement.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') shift(1);
  if (e.key === 'ArrowLeft') shift(-1);
});

function buildTf() {
  $('tf').innerHTML = TFS.map(([v, l]) => `<button data-t="${v}" aria-pressed="${v === tf}">${l}</button>`).join('');
  $('tf').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    tf = +b.dataset.t;
    document.querySelectorAll('#tf button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.t === tf));
  };
}

function buildQuick() {
  const parts = [['25%', .25], ['50%', .5], ['Всё', 1], ['Позиция', -1]];
  $('quick').innerHTML = parts.map(([l, v]) => `<button data-q="${v}">${l}</button>`).join('');
  $('quick').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    const q = +b.dataset.q;
    $('amt').value = (q === -1 ? held(asset).qty * priceAt(asset, now(), EV) : U.cash * q).toFixed(2);
    buzz();
    paintTrade();
  };
}

function paintTrade() {
  if (!U) return;
  const t = now();
  const eq = equity(t);

  $('eq').textContent = money(eq);
  $('eq2').textContent = money(eq);
  $('cash').textContent = money(U.cash);
  const d = eq - 10;
  $('pnl').innerHTML = `<span class="${d >= 0 ? 'up' : 'down'}">${sign(d)}$</span>`;

  const doSpark = t - sparkAt > 900;
  if (doSpark) sparkAt = t;

  for (const a of ASSETS) {
    const el = document.querySelector(`.chip[data-a="${a.id}"]`);
    if (!el) continue;
    const p = priceAt(a.id, t, EV);
    const pe = el.querySelector('[data-p]');
    pe.textContent = '$' + fmtPrice(p);
    if (lastPx[a.id] !== undefined && Math.abs(p - lastPx[a.id]) > 1e-12) {
      pe.className = 'p mono ' + (p > lastPx[a.id] ? 'up' : 'down');
    }
    lastPx[a.id] = p;
    const ch = changePct(a.id, t, EV);
    const de = el.querySelector('[data-d]');
    de.textContent = sign(ch) + '%';
    de.className = 'd mono ' + (ch >= 0 ? 'up' : 'down');
    if (doSpark) sparkline(el.querySelector('[data-s]'), spark(a.id, t, EV), a.color);
  }

  const bars = window.innerWidth > 860 ? 76 : window.innerWidth > 400 ? 40 : 32;
  chart.draw(candles(asset, tf, bars, t, EV), BY_ID[asset].color);

  const mine = held(asset);
  if (mine.qty > 0) {
    const pnl = mine.avg ? (priceAt(asset, t, EV) - mine.avg) / mine.avg * 100 : 0;
    $('pos').innerHTML = `${qtyText(mine.qty)} шт · <span class="${pnl >= 0 ? 'up' : 'down'}">${sign(pnl)}%</span>`;
  } else {
    $('pos').textContent = 'позиции нет';
  }

  const px = priceAt(asset, t, EV);
  const amt = parseFloat($('amt').value) || 0;
  $('qty').textContent = qtyText(amt / px);
  $('buy').disabled = busy || amt <= 0 || amt > U.cash + 1e-9;
  $('sell').disabled = busy || held(asset).qty <= 0;
}

function paintTicker() {
  if (!U) return;
  const items = feedFrom(evList, now(), 10);
  if (!items.length) return;
  const it = items[newsIdx % items.length];
  const soon = it.ts > now();
  $('ticker').innerHTML = `<span>${soon ? '🕶️' : it.dir > 0 ? '🚀' : '💀'}</span>` +
    `<em>${BY_ID[it.asset].emoji} ${esc(it.text)}${soon ? ' — вот-вот' : ''}</em>`;
}

async function act(side) {
  if (busy || !U) return;
  const px = priceAt(asset, now(), EV);
  const amt = parseFloat($('amt').value) || 0;
  const qty = side === 'buy' ? amt / px / (1 + feeFor(U.perks)) : Math.min(amt / px, held(asset).qty);
  if (!isFinite(qty) || qty <= 0) return;
  busy = true;
  buzz(18);
  try {
    const r = await store.trade(asset, side, qty);
    applySync(r);
    toast(`${side === 'buy' ? 'Куплено' : 'Продано'} ${qtyText(r.qty)} ${BY_ID[asset].emoji} по $${fmtPrice(r.price)}`);
  } catch (e) {
    toast(e.message);
    if (e.message.includes('войти')) showGate();
  }
  busy = false;
  paintTrade();
}

$('buy').onclick = () => act('buy');
$('sell').onclick = () => act('sell');
$('amt').oninput = () => paintTrade();

/* портфель */

function drawBag() {
  const t = now();
  const rows = Object.entries(U.holdings || {}).filter(([, h]) => h.qty > 0);
  if (!rows.length) {
    $('bag').innerHTML = `<div class="empty">Пусто. Возьми картошки на пробу — она хотя бы не обнуляется.</div>`;
    return;
  }
  $('bag').innerHTML = rows.map(([id, h]) => {
    const a = BY_ID[id];
    const val = h.qty * priceAt(id, t, EV);
    const pnl = val - h.qty * h.avg;
    const pct = h.avg ? pnl / (h.qty * h.avg) * 100 : 0;
    return `<div class="row">
      <span style="font-size:22px">${a.emoji}</span>
      <div class="grow">
        <div class="ttl">${a.short}</div>
        <div class="sub mono">${qtyText(h.qty)} · вход $${fmtPrice(h.avg)}</div>
      </div>
      <div>
        <div class="val mono">${money(val)}</div>
        <div class="sub mono ${pnl >= 0 ? 'up' : 'down'}" style="text-align:right">${sign(pnl)}$ · ${sign(pct)}%</div>
      </div>
    </div>`;
  }).join('') + `<button class="btn ghost" id="closeAll" style="width:100%;margin-top:6px">Продать всё</button>`;

  $('closeAll').onclick = async e => {
    e.target.disabled = true;
    for (const [id, h] of Object.entries(U.holdings || {})) {
      try {
        const r = await store.trade(id, 'sell', h.qty);
        U = r.user;
      } catch (err) { toast(err.message); }
      await new Promise(r => setTimeout(r, 320));
    }
    toast('Позиции закрыты');
    drawBag();
  };
}

/* топ */

async function drawTop() {
  if (!boardCache) $('top').innerHTML = `<div class="empty">Считаем чужие деньги…</div>`;
  try {
    if (!boardCache || Date.now() - boardCache.at > 30000) {
      boardCache = { at: Date.now(), data: await store.board() };
    }
    const { rows, me, tape } = boardCache.data;
    const idx = rows.findIndex(r => r.username === me);
    $('myrank').textContent = idx >= 0 ? '#' + (idx + 1) : 'вне топа';
    $('topts').textContent = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    const tapeHtml = (tape || []).length ? `<h3 class="sec">Живая лента</h3>` + tape.map(x => `
      <div class="row tape">
        <span class="${x.side === 'buy' ? 'up' : 'down'}">${x.side === 'buy' ? '▲' : '▼'}</span>
        <div class="grow">
          <div class="ttl">${esc(x.username)} ${x.side === 'buy' ? 'взял' : 'слил'} ${qtyText(x.qty)} ${BY_ID[x.asset] ? BY_ID[x.asset].emoji : ''}</div>
          <div class="sub">${ago(x.ts)}</div>
        </div>
        <div class="val mono">$${fmtPrice(x.price)}</div>
      </div>`).join('') : '';

    $('top').innerHTML = tapeHtml + `<h3 class="sec">Топ по капиталу</h3>` + rows.map((r, i) => `
      <div class="row ${r.username === me ? 'me' : ''}">
        <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <div class="grow">
          <div class="ttl">${r.vip ? '🥇 ' : ''}${esc(r.username)}</div>
          <div class="sub">${rankOf(r.equity).title}</div>
        </div>
        <div class="val mono">${money(r.equity)}</div>
      </div>`).join('');
  } catch (e) {
    $('top').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* лавка */

function drawShop() {
  $('shopCash').textContent = money(U.cash);
  const ready = Date.now() - (U.dailyTs || 0) >= 20 * 3600e3;
  $('daily').textContent = ready ? `Забрать дроп${U.streak ? ` · серия ${U.streak}` : ''}` : 'Дроп уже брал, приходи завтра';
  $('daily').disabled = !ready;

  $('quests').innerHTML = quests.map(q => {
    const done = q.value >= q.goal;
    return `<div class="row quest">
      <span style="font-size:20px">${q.emoji}</span>
      <div class="grow">
        <div class="ttl">${q.name}</div>
        <div class="bar"><i style="width:${Math.min(100, q.value / q.goal * 100).toFixed(0)}%"></i></div>
        <div class="sub mono">${q.id === 'volume' ? '$' + q.value.toFixed(0) : Math.floor(q.value)} из ${q.id === 'volume' ? '$' + q.goal : q.goal}</div>
      </div>
      <button class="buyperk" data-q="${q.id}" ${q.claimed || !done ? 'disabled' : ''}>${q.claimed ? 'Забрал' : '+$' + q.reward}</button>
    </div>`;
  }).join('');

  $('quests').onclick = async e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    try {
      const r = await store.quest(b.dataset.q);
      applySync(r);
      toast(`Задание закрыто, +${money(r.reward)}`);
      buzz(25);
      drawShop();
    } catch (err) { toast(err.message); }
  };

  $('shop').innerHTML = PERKS.map(p => {
    const has = owns(p.id);
    return `<div class="row perk ${has ? 'has' : ''}">
      <span style="font-size:22px">${p.emoji}</span>
      <div class="grow">
        <div class="ttl">${p.name}</div>
        <div class="sub">${p.about}</div>
      </div>
      <button class="buyperk" data-p="${p.id}" ${has || U.cash < p.price ? 'disabled' : ''}>${has ? 'Есть' : '$' + p.price}</button>
    </div>`;
  }).join('');

  $('shop').onclick = async e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    try {
      const r = await store.perk(b.dataset.p);
      U = r.user;
      toast('Куплено. Работает уже сейчас');
      buzz(25);
      if (b.dataset.p === 'insider') await syncNow(true);
      drawShop();
    } catch (err) { toast(err.message); }
  };
}

$('daily').onclick = async () => {
  try {
    const r = await store.daily();
    U = r.user;
    toast(`Дроп +${money(r.reward)} · серия ${r.streak} ${'🔥'.repeat(Math.min(r.streak, 3))}`);
    buzz(30);
    drawShop();
  } catch (e) { toast(e.message); }
};

/* профиль */

const BADGES = [
  ['🌱', 'Первая сделка', u => u.trades >= 1],
  ['🔁', '25 сделок', u => u.trades >= 25],
  ['🧠', '100 сделок', u => u.trades >= 100],
  ['💵', 'Капитал $50', u => u.peak >= 50],
  ['🏦', 'Капитал $250', u => u.peak >= 250],
  ['👑', 'Капитал $1000', u => u.peak >= 1000],
  ['🍜', 'Жил на пособие', u => u.lastGrant > 0],
  ['🌺', 'Трогал мак', u => (u.log || []).some(l => l.asset === 'POPPY')],
  ['🕳️', 'Держал дупло', u => (u.log || []).some(l => l.asset === 'DUPLODER')],
  ['🗑️', 'Копался в мусоре', u => (u.log || []).some(l => l.asset === 'MUSORDROP')],
  ['🔥', 'Серия 3 дня', u => (u.streak || 0) >= 3]
];

function drawMe() {
  const t = now();
  const r = rankOf(U.peak);
  $('nick2').textContent = U.username;
  $('rankLine').textContent = `${r.level} уровень · ${r.title}`;
  $('bar').style.width = (r.progress * 100).toFixed(0) + '%';
  $('barTxt').textContent = r.to ? `до следующего ранга ${money(r.to - U.peak)}` : 'потолок взят';
  $('stats').innerHTML = `
    <div><small>Капитал</small><b>${money(equity(t))}</b></div>
    <div><small>Свободно</small><b>${money(U.cash)}</b></div>
    <div><small>Максимум</small><b>${money(U.peak)}</b></div>
    <div><small>Сделок</small><b>${U.trades}</b></div>`;
  $('badges').innerHTML = BADGES.map(([e, n, f]) => `<span class="badge ${f(U) ? 'on' : ''}">${e} ${n}</span>`).join('');
  const log = U.log || [];
  $('hist').innerHTML = log.length ? log.slice(0, 12).map(l => `
    <div class="row">
      <span class="${l.side === 'buy' ? 'up' : 'down'}">${l.side === 'buy' ? '▲' : '▼'}</span>
      <div class="grow">
        <div class="ttl">${BY_ID[l.asset] ? BY_ID[l.asset].emoji : '?'} ${qtyText(l.qty)}</div>
        <div class="sub mono">${new Date(l.ts).toLocaleTimeString('ru')}</div>
      </div>
      <div class="val mono">$${fmtPrice(l.price)}</div>
    </div>`).join('') : `<div class="empty">Сделок пока нет</div>`;
}

$('grant').onclick = async () => {
  try {
    const r = await store.grant();
    U = r.user;
    toast('Пособие получено. Не спусти всё на мусор');
    drawMe();
  } catch (e) { toast(e.message); }
};

$('out').onclick = () => {
  store.logout();
  location.reload();
};

/* запуск */

async function boot() {
  const s = await store.sync();
  applySync(s);
  $('gate').style.display = 'none';
  $('nav').hidden = false;
  $('nick').textContent = U.username;
  buildChips();
  buildTf();
  buildQuick();
  pick(asset);
  go('trade');
  requestAnimationFrame(() => { chart.resize(); paintTrade(); });
  paintTicker();
  if (s.farmed > 0.05) toast(`Батрак наработал ${money(s.farmed)}, пока тебя не было`);
  else if (!U.trades) setTimeout(() => toast('Начни с картошки: сумма, «Купить», потом продай дороже'), 900);
}

setMode('register');
if (store.hasToken()) boot().catch(() => { store.logout(); showGate(); });

setInterval(() => { if (U && !document.hidden) paintTrade(); }, 220);
setInterval(() => { if (U) { newsIdx++; paintTicker(); } }, 6000);

setInterval(() => {
  if (!U || document.hidden || busy) return;
  const idle = Date.now() - lastTouch > 3 * 60e3;
  if (Date.now() - lastSync >= (idle ? 60000 : 20000)) syncNow();
}, 5000);

['pointerdown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true }));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && U) {
    lastTouch = Date.now();
    syncNow();
  }
});
