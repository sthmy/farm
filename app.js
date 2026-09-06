import { ASSETS, BY_ID, priceAt, candles, changePct, spark, feed } from './market.js';
import { createChart, sparkline } from './chart.js';
import { store, offline, FEE } from './store.js';

const $ = id => document.getElementById(id);
const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
const sign = v => (v >= 0 ? '+' : '') + v.toFixed(2);

const TFS = [[5000, '5с'], [15000, '15с'], [60000, '1м'], [300000, '5м']];

let U = null;
let offset = 0;
let asset = 'POTATO';
let tf = 5000;
let busy = false;
let mode = 'register';
let newsIdx = 0;

const now = () => Date.now() + offset;
const chart = createChart($('cv'));

function equity(t = now()) {
  if (!U) return 0;
  let e = U.cash;
  for (const [id, h] of Object.entries(U.holdings || {})) e += h.qty * priceAt(id, t);
  return e;
}

function held(id) {
  return (U.holdings || {})[id] || { qty: 0, avg: 0 };
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('on'), 2200);
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
  $('sw').innerHTML = m === 'register'
    ? 'Уже торговал? <b>Войти</b>'
    : 'Первый раз? <b>Создать ферму</b>';
  $('sw').querySelector('b').onclick = () => setMode(m === 'register' ? 'login' : 'register');
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
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('.nav button').forEach(b => {
    b.setAttribute('aria-current', b.dataset.v === v ? 'page' : 'false');
  });
  if (v === 'bag') drawBag();
  if (v === 'top') drawTop();
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
    asset = b.dataset.a;
    accent(BY_ID[asset]);
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-selected', c.dataset.a === asset));
    $('cname').textContent = `${BY_ID[asset].emoji} ${BY_ID[asset].short}`;
    $('hint').textContent = BY_ID[asset].about;
    buzz();
  };
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
    const px = priceAt(asset, now());
    $('amt').value = (q === -1 ? held(asset).qty * px : U.cash * q).toFixed(2);
    buzz();
  };
}

function paintTrade() {
  const t = now();
  const px = priceAt(asset, t);

  $('eq').textContent = money(equity(t));
  $('eq2').textContent = money(equity(t));
  $('cash').textContent = money(U.cash);
  const d = equity(t) - 10;
  $('pnl').innerHTML = `<span class="${d >= 0 ? 'up' : 'down'}">${sign(d)}$</span>`;

  for (const a of ASSETS) {
    const el = document.querySelector(`.chip[data-a="${a.id}"]`);
    if (!el) continue;
    const p = priceAt(a.id, t);
    const ch = changePct(a.id, t);
    el.querySelector('[data-p]').textContent = '$' + (p >= 1 ? p.toFixed(2) : p.toFixed(3));
    const dEl = el.querySelector('[data-d]');
    dEl.textContent = sign(ch) + '%';
    dEl.className = 'd mono ' + (ch >= 0 ? 'up' : 'down');
    sparkline(el.querySelector('[data-s]'), spark(a.id, t), a.color);
  }

  const cnt = window.innerWidth > 860 ? 76 : 44;
  chart.draw(candles(asset, tf, cnt, t), BY_ID[asset].color);

  const amt = parseFloat($('amt').value) || 0;
  $('qty').textContent = (amt / px).toFixed(3) + ' шт';
  $('buy').disabled = busy || amt <= 0 || amt > U.cash + 1e-9;
  $('sell').disabled = busy || held(asset).qty <= 0;
}

function paintTicker() {
  const items = feed(now(), 10);
  if (!items.length) return;
  const it = items[newsIdx % items.length];
  const a = BY_ID[it.asset];
  $('ticker').innerHTML = `<span>${it.dir > 0 ? '🚀' : '💀'}</span><em>${a.emoji} ${it.text}</em>`;
}

async function act(side) {
  if (busy) return;
  const px = priceAt(asset, now());
  const amt = parseFloat($('amt').value) || 0;
  let qty = side === 'buy' ? amt / px / (1 + FEE) : Math.min(amt / px, held(asset).qty);
  if (qty <= 0) return;
  busy = true;
  buzz(18);
  try {
    const r = await store.trade(asset, side, qty);
    U = r.user;
    const done = r.qty ?? qty;
    toast(`${side === 'buy' ? 'Куплено' : 'Продано'} ${done.toFixed(3)} ${BY_ID[asset].emoji} по $${r.price.toFixed(3)}`);
  } catch (e) {
    toast(e.message);
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
    $('bag').innerHTML = `<div class="empty">Пока пусто. Купи что-нибудь на вкладке «Торги» — картошка не кусается.</div>`;
    return;
  }
  $('bag').innerHTML = rows.map(([id, h]) => {
    const a = BY_ID[id];
    const px = priceAt(id, t);
    const val = h.qty * px;
    const pnl = val - h.qty * h.avg;
    const pct = h.avg ? pnl / (h.qty * h.avg) * 100 : 0;
    return `<div class="row">
      <span style="font-size:22px">${a.emoji}</span>
      <div class="grow">
        <div class="ttl">${a.short}</div>
        <div class="sub mono">${h.qty.toFixed(3)} шт · вход $${h.avg.toFixed(3)}</div>
      </div>
      <div>
        <div class="val mono">${money(val)}</div>
        <div class="sub mono ${pnl >= 0 ? 'up' : 'down'}" style="text-align:right">${sign(pnl)}$ · ${sign(pct)}%</div>
      </div>
    </div>`;
  }).join('') + `<button class="btn ghost" id="closeAll" style="width:100%;margin-top:6px">Продать всё</button>`;

  $('closeAll').onclick = async () => {
    for (const [id, h] of Object.entries(U.holdings || {})) {
      asset = id;
      try { const r = await store.trade(id, 'sell', h.qty); U = r.user; } catch (e) { toast(e.message); }
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
        <div class="grow"><div class="ttl">${r.username}</div></div>
        <div class="val mono">${money(r.equity)}</div>
      </div>`).join('');
  } catch (e) {
    $('top').innerHTML = `<div class="empty">${e.message}</div>`;
  }
}

/* профиль */

const BADGES = [
  ['🌱', 'Первая сделка', u => u.trades >= 1],
  ['🔁', '25 сделок', u => u.trades >= 25],
  ['🧠', '100 сделок', u => u.trades >= 100],
  ['💵', 'Капитал $50', u => u.peak >= 50],
  ['🏦', 'Капитал $250', u => u.peak >= 250],
  ['👑', 'Капитал $1000', u => u.peak >= 1000],
  ['🍜', 'Дошик', u => u.lastGrant > 0],
  ['🌺', 'Трогал мак', u => (u.log || []).some(l => l.asset === 'POPPY')]
];

function drawMe() {
  const t = now();
  $('nick2').textContent = U.username;
  $('stats').innerHTML = `
    <div><small>Капитал</small><b>${money(equity(t))}</b></div>
    <div><small>Свободно</small><b>${money(U.cash)}</b></div>
    <div><small>Максимум</small><b>${money(U.peak)}</b></div>
    <div><small>Сделок</small><b>${U.trades}</b></div>`;
  $('badges').innerHTML = BADGES.map(([e, n, f]) =>
    `<span class="badge ${f(U) ? 'on' : ''}">${e} ${n}</span>`).join('');
  const log = U.log || [];
  $('hist').innerHTML = log.length ? log.slice(0, 12).map(l => `
    <div class="row">
      <span class="${l.side === 'buy' ? 'up' : 'down'}">${l.side === 'buy' ? '▲' : '▼'}</span>
      <div class="grow">
        <div class="ttl">${BY_ID[l.asset].emoji} ${l.qty.toFixed(3)}</div>
        <div class="sub mono">${new Date(l.ts).toLocaleTimeString('ru')}</div>
      </div>
      <div class="val mono">$${l.price.toFixed(3)}</div>
    </div>`).join('') : `<div class="empty">Сделок пока нет</div>`;
}

$('grant').onclick = async () => {
  try {
    const r = await store.grant();
    U = r.user;
    toast('Пособие получено. Не спусти всё на мак');
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
  offset = s.serverTime - Date.now();
  $('gate').style.display = 'none';
  $('nav').hidden = false;
  $('nick').textContent = U.username;
  accent(BY_ID[asset]);
  buildChips();
  buildTf();
  buildQuick();
  $('hint').textContent = BY_ID[asset].about;
  go('trade');
  chart.resize();
  paintTrade();
  paintTicker();
}

setMode('register');
if (store.hasToken()) boot().catch(() => store.logout());

setInterval(() => { if (U && !document.hidden) paintTrade(); }, 220);
setInterval(() => { if (U) { newsIdx++; paintTicker(); } }, 6000);
setInterval(async () => {
  if (!U || offline || document.hidden) return;
  try { const s = await store.state(); U = s.user; offset = s.serverTime - Date.now(); } catch {}
}, 20000);
