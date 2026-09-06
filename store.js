import { API_BASE } from './config.js';
import { ASSETS, priceAt } from './market.js';

const FEE = 0.004;
const GRANT_MS = 4 * 3600e3;
const KEY = 'fb.local';

export const offline = !API_BASE;

let token = localStorage.getItem('fb.token') || '';

async function call(path, body, method = 'POST') {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({ error: 'Сервер не отвечает' }));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

const db = {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  },
  write(v) { localStorage.setItem(KEY, JSON.stringify(v)); }
};

function blank(username) {
  return { username, cash: 10, holdings: {}, trades: 0, peak: 10, lastGrant: 0, log: [], joined: Date.now() };
}

const BOTS = ['Дядя_Толя', 'kartoshka_king', 'Аквариумист', 'Песочница228', 'МакаронникPro', 'ФермерШрёдингер', 'Гуппи_Лорд', 'ЗапорожецGT'];

function botBoard(now) {
  return BOTS.map((name, i) => {
    const t = Math.floor(now / 60000) + i * 977;
    const r = Math.abs(Math.sin(t * (i + 3) * 0.7)) ;
    return { username: name, equity: 6 + Math.pow(r, 2.2) * 320 * (1 + i * 0.35), bot: true };
  });
}

function localEquity(u, now) {
  let e = u.cash;
  for (const [id, h] of Object.entries(u.holdings)) e += h.qty * priceAt(id, now);
  return e;
}

export const store = {
  hasToken: () => !!token,

  async auth(mode, username, password) {
    if (offline) {
      const all = db.read();
      const key = username.toLowerCase();
      if (mode === 'register') {
        if (all[key]) throw new Error('Позывной занят');
        all[key] = { pass: password, u: blank(username) };
      } else {
        if (!all[key]) throw new Error('Такого игрока нет');
        if (all[key].pass !== password) throw new Error('Пароль не подошёл');
      }
      db.write(all);
      token = 'local:' + key;
      localStorage.setItem('fb.token', token);
      return;
    }
    const r = await call('/api/' + mode, { username, password });
    token = r.token;
    localStorage.setItem('fb.token', token);
  },

  logout() {
    token = '';
    localStorage.removeItem('fb.token');
  },

  async state() {
    if (offline) {
      const key = token.slice(6);
      const all = db.read();
      if (!all[key]) throw new Error('Сессия потеряна');
      return { user: all[key].u, serverTime: Date.now() };
    }
    return call('/api/state', null, 'GET');
  },

  async trade(asset, side, qty) {
    if (offline) {
      const key = token.slice(6);
      const all = db.read();
      const u = all[key].u;
      const now = Date.now();
      const price = priceAt(asset, now);
      const h = u.holdings[asset] || { qty: 0, avg: 0 };
      if (side === 'buy') {
        const max = u.cash / (price * (1 + FEE));
        if (qty > max * 1.05) throw new Error('Не хватает денег');
        qty = Math.min(qty, max);
        u.cash -= qty * price * (1 + FEE);
        h.avg = (h.avg * h.qty + qty * price) / (h.qty + qty);
        h.qty += qty;
      } else {
        if (qty > h.qty + 1e-9) throw new Error('Нечего продавать');
        qty = Math.min(qty, h.qty);
        u.cash += qty * price * (1 - FEE);
        h.qty -= qty;
      }
      if (h.qty < 1e-8) delete u.holdings[asset]; else u.holdings[asset] = h;
      u.trades++;
      u.log.unshift({ asset, side, qty, price, ts: now });
      u.log = u.log.slice(0, 40);
      u.peak = Math.max(u.peak, localEquity(u, now));
      db.write(all);
      return { user: u, price, qty };
    }
    return call('/api/trade', { asset, side, qty });
  },

  async grant() {
    if (offline) {
      const key = token.slice(6);
      const all = db.read();
      const u = all[key].u;
      const now = Date.now();
      if (localEquity(u, now) > 2) throw new Error('Пособие дают только на мели');
      if (now - u.lastGrant < GRANT_MS) throw new Error('Рано, приходи позже');
      u.cash += 5;
      u.lastGrant = now;
      db.write(all);
      return { user: u };
    }
    return call('/api/grant');
  },

  async board() {
    const now = Date.now();
    if (offline) {
      const key = token.slice(6);
      const all = db.read();
      const me = all[key].u;
      const rows = botBoard(now).concat(Object.values(all).map(x => ({
        username: x.u.username,
        equity: localEquity(x.u, now)
      })));
      rows.sort((a, b) => b.equity - a.equity);
      return { rows: rows.slice(0, 50), me: me.username };
    }
    return call('/api/leaderboard', null, 'GET');
  }
};

export const assets = ASSETS;
export { FEE, GRANT_MS };
