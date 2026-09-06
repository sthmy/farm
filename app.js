import { ASSETS, BY_ID, PERKS, priceAt, candles, changePct, spark, feed, fmtPrice, rankOf, feeFor } from './market.js';
import { createChart, sparkline } from './chart.js';
import { store, offline } from './store.js';

const $ = id => document.getElementById(id);
const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
const sign = v => (v >= 0 ? '+' : '') + v.toFixed(2);
const qtyText = q => q >= 1000 ? Math.round(q).toLocaleString('ru') : q.toFixed(3);

const TFS = [[5000, '5с'], [15000, '15с'], [60000, '1м'], [300000, '5м']];

let U = null;
let offset = 0;
let asset = 'POTATO';
let tf = 5000;
let busy = false;
let mode = 'register';
let newsIdx = 0;
let lastPx = {};
let sparkAt = 0;

const now = () => Date.now() + offset;
const chart = createChart($('cv'));

function equity(t = now()) {
  if (!U) return 0;
  let e = U.cash;
  for (const [id, h] of Object.entries(U.holdings || {})) e += h.qty * priceAt(id, t);
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

function accent(a) {
  document.documentElement.style.setProperty('--accent', a.color);
  document.documentElement.style.setProperty('--glow', a.glow);
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
  if (v === 'trade') chart.resize();
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
    if (!b) return;
    pick(b.dataset.a);
  };
}

function pick(id) {
  asset = id;
  accent(BY_ID[id]);
  document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-selected', c.dataset.a === id));
  $('cname').textContent = `${BY_ID[id].emoji} ${BY_ID[id].short}`;
  $('hint').textContent = BY_ID[id].about;
  buzz();
}

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
    $('amt').value = (q === -1 ? held(asset).qty * priceAt(asset, now()) : U.cash * q).toFixed(2);
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
    const p = priceAt(a.id, t);
    const pe = el.querySelector('[data-p]');
    pe.textContent = '$' + fmtPrice(p);
    if (lastPx[a.id] !== undefined && Math.abs(p - lastPx[a.id]) > 1e-12) {
      pe.className = 'p mono ' + (p > lastPx[a.id] ? 'up' : 'down');
    }
    lastPx[a.id] = p;
    const ch = changePct(a.id, t);
    const de = el.querySelector('[data-d]');
    de.textContent = sign(ch) + '%';
    de.className = 'd mono ' + (ch >= 0 ? 'up' : 'down');
    if (doSpark) sparkline(el.querySelector('[data-s]'), spark(a.id, t), a.color);
  }

  chart.draw(candles(asset, tf, window.innerWidth > 860 ? 76 : 44, t), BY_ID[asset].color);

  const px = priceAt(asset, t);
  const amt = parseFloat($('amt').value) || 0;
  $('qty').textContent = qtyText(amt / px);
  $('buy').disabled = busy || amt <= 0 || amt > U.cash + 1e-9;
  $('sell').disabled = busy || held(asset).qty <= 0;
}

function paintTicker() {
  if (!U) return;
  const ahead = owns('insider') ? 25000 : 0;
  const items = feed(now() + ahead, 10);
  if (!items.length) return;
  const it = items[newsIdx % items.length];
  const soon = it.ts > now();
  $('ticker').innerHTML = `<span>${soon ? '🕶️' : it.dir > 0 ? '🚀' : '💀'}</span>` +
    `<em>${BY_ID[it.asset].emoji} ${it.text}${soon ? ' — вот-вот' : ''}</em>`;
}

async function act(side) {
  if (busy || !U) return;
  const px = priceAt(asset, now());
  const amt = parseFloat($('amt').value) || 0;
  const fee = feeFor(U.perks);
  const qty = side === 'buy' ? amt / px / (1 + fee) : Math.min(amt / px, held(asset).qty);
  if (qty <= 0) return;
  busy = true;
  buzz(18);
  try {
    const r = await store.trade(asset, side, qty);
    U = r.user;
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
    const val = h.qty * priceAt(id, t);
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

  $('closeAll').onclick = async () => {
    for (const [id, h] of Object.entries(U.holdings || {})) {
      try {
        const r = await store.trade(id, 'sell', h.qty);
        U = r.user;
      } catch (e) { toast(e.message); }
    }
    toast('Позиции закрыты');
    drawBag();
  };
}

/* топ */

async function drawTop() {
  $('top').innerHTML = `<div class="empty">Считаем чужие деньги…</div>`;
  try {
    const { rows, me } = await store.board();
    const idx = rows.findIndex(r => r.username === me);
    $('myrank').textContent = idx >= 0 ? '#' + (idx + 1) : 'вне топа';
    $('topts').textContent = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    $('top').innerHTML = rows.map((r, i) => `
      <div class="row ${r.username === me ? 'me' : ''}">
        <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <div class="grow"><div class="ttl">${r.vip ? '🥇 ' : ''}${r.username}</div>
        <div class="sub">${rankOf(r.equity).title}</div></div>
        <div class="val mono">${money(r.equity)}</div>
      </div>`).join('');
  } catch (e) {
    $('top').innerHTML = `<div class="empty">${e.message}</div>`;
  }
}

/* лавка */

function drawShop() {
  $('shopCash').textContent = money(U.cash);
  const ready = Date.now() - (U.dailyTs || 0) >= 20 * 3600e3;
  $('daily').innerHTML = ready
    ? `Забрать дроп${U.streak ? ` · серия ${U.streak}` : ''}`
    : `Дроп уже брал, приходи завтра`;
  $('daily').disabled = !ready;

  $('shop').innerHTML = PERKS.map(p => {
    const has = owns(p.id);
    const poor = U.cash < p.price;
    return `<div class="row perk ${has ? 'has' : ''}">
      <span style="font-size:22px">${p.emoji}</span>
      <div class="grow">
        <div class="ttl">${p.name}</div>
        <div class="sub">${p.about}</div>
      </div>
      <button class="buyperk" data-p="${p.id}" ${has || poor ? 'disabled' : ''}>
        ${has ? 'Есть' : '$' + p.price}
      </button>
    </div>`;
  }).join('');

  $('shop').onclick = async e => {
    const b = e.target.closest('.buyperk');
    if (!b) return;
    try {
      const r = await store.perk(b.dataset.p);
      U = r.user;
      toast('Куплено. Проверь, что изменилось');
      buzz(25);
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
        <div class="ttl">${BY_ID[l.asset].emoji} ${qtyText(l.qty)}</div>
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
  const s = await store.state();
  U = s.user;
  U.holdings = U.holdings || {};
  U.perks = U.perks || {};
  offset = s.serverTime - Date.now();
  $('gate').style.display = 'none';
  $('nav').hidden = false;
  $('nick').textContent = U.username;
  buildChips();
  buildTf();
  buildQuick();
  pick(asset);
  go('trade');
  chart.resize();
  paintTrade();
  paintTicker();
  if (s.farmed > 0.05) toast(`Батрак наработал ${money(s.farmed)}, пока тебя не было`);
}

setMode('register');
if (store.hasToken()) boot().catch(() => { store.logout(); showGate(); });

setInterval(() => { if (U && !document.hidden) paintTrade(); }, 220);
setInterval(() => { if (U) { newsIdx++; paintTicker(); } }, 6000);
setInterval(async () => {
  if (!U || offline || document.hidden || busy) return;
  try {
    const s = await store.state();
    U = s.user;
    offset = s.serverTime - Date.now();
  } catch {}
}, 25000);
