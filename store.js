import { API_BASE } from './config.js';
import { priceAt, PERKS, DAILY_MS, FARM_RATE, FARM_CAP_MS, feeFor } from './market.js';

const BASE = (API_BASE || '').replace(/\/+$/, '');
const GRANT_MS = 4 * 3600e3;
const KEY = 'fb.local';

export const offline = !BASE;

let token = localStorage.getItem('fb.token') || '';

if (!offline && token.startsWith('local:')) {
  token = '';
  localStorage.removeItem('fb.token');
}

async function call(path, body, method = 'POST') {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('Сервер не отвечает');
  }
  const data = await res.json().catch(() => ({ error: 'Сервер прислал ерунду' }));
  if (res.status === 401) {
    token = '';
    localStorage.removeItem('fb.token');
  }
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
  return {
    username, cash: 10, holdings: {}, trades: 0, peak: 10,
    lastGrant: 0, perks: {}, farmTs: 0, dailyTs: 0, streak: 0,
    log: [], joined: Date.now()
  };
}

const BOTS = ['Дядя_Толя', 'kartoshka_king', 'Аквариумист', 'Песочница228', 'ХоминсТрейдер', 'ФермерШрёдингер', 'Гуппи_Лорд', 'ЗапорожецGT'];

function botBoard(now) {
  return BOTS.map((name, i) => {
    const r = Math.abs(Math.sin((Math.floor(now / 60000) + i * 977) * (i + 3) * 0.7));
    return { username: name, equity: 6 + Math.pow(r, 2.2) * 320 * (1 + i * 0.35) };
  });
}

function equity(u, now) {
  let e = u.cash;
  for (const [id, h] of Object.entries(u.holdings)) e += h.qty * priceAt(id, now);
  return e;
}

function mine() {
  const all = db.read();
  const rec = all[token.slice(6)];
  if (!rec) throw new Error('Сессия потеряна, войди заново');
  return { all, u: rec.u };
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
    } else {
      const r = await call('/api/' + mode, { username, password });
      token = r.token;
    }
    localStorage.setItem('fb.token', token);
  },

  logout() {
    token = '';
    localStorage.removeItem('fb.token');
  },

  async state() {
    if (offline) {
      const { all, u } = mine();
      let farmed = 0;
      if (u.perks.farm) {
        const span = Math.min(Date.now() - (u.farmTs || Date.now()), FARM_CAP_MS);
        farmed = Math.max(0, span / 3600e3 * FARM_RATE);
        u.cash += farmed;
        u.farmTs = Date.now();
        db.write(all);
      }
      return { user: u, farmed, serverTime: Date.now() };
    }
    return call('/api/state', null, 'GET');
  },

  async trade(asset, side, qty) {
    if (offline) {
      const { all, u } = mine();
      const now = Date.now();
      const fee = feeFor(u.perks);
      const price = priceAt(asset, now);
      const h = u.holdings[asset] || { qty: 0, avg: 0 };
      let done = qty;
      if (side === 'buy') {
        const max = u.cash / (price * (1 + fee));
        if (qty > max * 1.05) throw new Error('Не хватает денег');
        done = Math.min(qty, max);
        if (done <= 0) throw new Error('Не хватает денег');
        u.cash -= done * price * (1 + fee);
        h.avg = (h.avg * h.qty + done * price) / (h.qty + done);
        h.qty += done;
      } else {
        done = Math.min(qty, h.qty);
        if (done <= 0) throw new Error('Нечего продавать');
        u.cash += done * price * (1 - fee);
        h.qty -= done;
      }
      if (h.qty < 1e-9) delete u.holdings[asset]; else u.holdings[asset] = h;
      u.trades++;
      u.log.unshift({ asset, side, qty: done, price, ts: now });
      u.log = u.log.slice(0, 20);
      u.peak = Math.max(u.peak, equity(u, now));
      db.write(all);
      return { user: u, price, qty: done, fee };
    }
    return call('/api/trade', { asset, side, qty });
  },

  async perk(id) {
    const perk = PERKS.find(p => p.id === id);
    if (offline) {
      const { all, u } = mine();
      if (u.perks[id]) throw new Error('Уже куплено');
      if (u.cash < perk.price) throw new Error('Не хватает денег');
      u.cash -= perk.price;
      u.perks[id] = 1;
      if (id === 'farm') u.farmTs = Date.now();
      db.write(all);
      return { user: u };
    }
    return call('/api/perk', { id });
  },

  async daily() {
    if (offline) {
      const { all, u } = mine();
      const now = Date.now();
      const since = now - u.dailyTs;
      if (since < DAILY_MS) throw new Error(`Дроп будет через ${Math.max(1, Math.ceil((DAILY_MS - since) / 3600e3))} ч`);
      u.streak = since < DAILY_MS * 2.4 ? Math.min(u.streak + 1, 7) : 1;
      u.dailyTs = now;
      const reward = 2 * u.streak * (u.perks.shovel ? 2 : 1);
      u.cash += reward;
      db.write(all);
      return { user: u, reward, streak: u.streak };
    }
    return call('/api/daily');
  },

  async grant() {
    if (offline) {
      const { all, u } = mine();
      const now = Date.now();
      const fat = !!u.perks.wallet;
      const wait = fat ? 3600e3 : GRANT_MS;
      if (equity(u, now) > 2) throw new Error('Пособие дают только на мели');
      if (now - u.lastGrant < wait) throw new Error('Рано, приходи позже');
      u.cash += fat ? 15 : 5;
      u.lastGrant = now;
      db.write(all);
      return { user: u };
    }
    return call('/api/grant');
  },

  async board() {
    if (offline) {
      const now = Date.now();
      const all = db.read();
      const me = all[token.slice(6)].u.username;
      const rows = botBoard(now)
        .concat(Object.values(all).map(x => ({
          username: x.u.username,
          equity: equity(x.u, now),
          vip: !!x.u.perks.shovel
        })))
        .sort((a, b) => b.equity - a.equity)
        .slice(0, 50);
      return { rows, me };
    }
    return call('/api/leaderboard', null, 'GET');
  }
};
