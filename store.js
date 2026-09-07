import { API_BASE } from './config.js';
import {
  priceAt, indexEvents, makeAllEvents, packEvents, PERKS, QUESTS, dayStart,
  EVENT_WINDOW, DAILY_MS, FARM_RATE, FARM_CAP_MS, feeFor
} from './market.js';

const BASE = (globalThis.__FB_API || API_BASE || '').replace(/\/+$/, '');
const GRANT_MS = 4 * 3600e3;
const HISTORY_MS = 7 * 3600e3;
const LOCAL_SEED = 20260907;
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
    quests: {}, day: {}, log: [], joined: Date.now()
  };
}

const BOTS = ['Дядя_Толя', 'kartoshka_king', 'Аквариумист', 'Песочница228', 'ХоминсТрейдер', 'ФермерШрёдингер', 'Гуппи_Лорд', 'ЗапорожецGT'];

function botBoard(now) {
  return BOTS.map((name, i) => {
    const r = Math.abs(Math.sin((Math.floor(now / 60000) + i * 977) * (i + 3) * 0.7));
    return { username: name, equity: 6 + Math.pow(r, 2.2) * 320 * (1 + i * 0.35) };
  });
}

function normalize(u) {
  if (!u || typeof u !== 'object') return null;
  u.holdings = u.holdings && typeof u.holdings === 'object' ? u.holdings : {};
  u.perks = u.perks && typeof u.perks === 'object' ? u.perks : {};
  u.quests = u.quests && typeof u.quests === 'object' ? u.quests : {};
  u.day = u.day && typeof u.day === 'object' ? u.day : {};
  u.log = Array.isArray(u.log) ? u.log : [];
  u.cash = Number.isFinite(u.cash) ? u.cash : 10;
  u.peak = Number.isFinite(u.peak) ? u.peak : u.cash;
  u.trades = Number.isFinite(u.trades) ? u.trades : 0;
  u.lastGrant = Number.isFinite(u.lastGrant) ? u.lastGrant : 0;
  u.dailyTs = Number.isFinite(u.dailyTs) ? u.dailyTs : 0;
  u.farmTs = Number.isFinite(u.farmTs) ? u.farmTs : 0;
  u.streak = Number.isFinite(u.streak) ? u.streak : 0;
  for (const [id, h] of Object.entries(u.holdings)) {
    if (!h || !Number.isFinite(h.qty) || h.qty <= 0) delete u.holdings[id];
    else if (!Number.isFinite(h.avg)) h.avg = 0;
  }
  return u;
}

function mine() {
  const all = db.read();
  const rec = all[token.slice(6)];
  if (!rec || !rec.u) throw new Error('Сессия потеряна, войди заново');
  return { all, u: normalize(rec.u) };
}

function localEvents(from, to) {
  return makeAllEvents(LOCAL_SEED, Math.floor(from / EVENT_WINDOW) - 1, Math.floor(to / EVENT_WINDOW));
}

function localMarket(t) {
  return indexEvents(localEvents(t - EVENT_WINDOW * 3, t));
}

function equity(u, now) {
  if (!u || !u.holdings) return 0;
  const ev = localMarket(now);
  let e = u.cash;
  for (const [id, h] of Object.entries(u.holdings)) e += h.qty * priceAt(id, now, ev);
  return e;
}

function dayBucket(u, now) {
  const key = String(dayStart(now));
  if (!u.day || u.day.key !== key) u.day = { key, trades: 0, volume: 0, meme: 0 };
  return u.day;
}

function localQuests(u, now) {
  const d = dayBucket(u, now);
  const claimed = u.quests[String(dayStart(now))] || [];
  return QUESTS.map(q => ({
    id: q.id, emoji: q.emoji, name: q.name, goal: q.goal, reward: q.reward,
    value: Math.min(q.id === 'trades' ? d.trades : q.id === 'meme' ? d.meme : d.volume, q.goal),
    claimed: claimed.includes(q.id)
  }));
}

export const store = {
  hasToken: () => !!token,

  async auth(mode, username, password) {
    if (offline) {
      const all = db.read();
      const key = username.toLowerCase();
      if (!/^[\wА-Яа-яЁё-]{3,16}$/u.test(username)) throw new Error('Позывной: 3–16 букв, цифр или _');
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

  async sync(from) {
    const t = Date.now();
    if (offline) {
      const { all, u } = mine();
      let farmed = 0;
      if (u.perks.farm) {
        const span = Math.min(t - (u.farmTs || t), FARM_CAP_MS);
        farmed = Math.max(0, span / 3600e3 * FARM_RATE);
        u.cash += farmed;
        u.farmTs = t;
      }
      dayBucket(u, t);
      db.write(all);
      return {
        user: u,
        farmed,
        serverTime: t,
        quests: localQuests(u, t),
        events: packEvents(localEvents(from || t - HISTORY_MS, t + 60000))
      };
    }
    return call('/api/sync?from=' + Math.round(from || t - HISTORY_MS), null, 'GET');
  },

  async trade(asset, side, qty) {
    if (offline) {
      const { all, u } = mine();
      const now = Date.now();
      const fee = feeFor(u.perks);
      const price = priceAt(asset, now, localMarket(now));
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
      const d = dayBucket(u, now);
      d.trades++;
      d.volume += done * price;
      if (asset === 'DUPLODER' || asset === 'MUSORDROP') d.meme++;
      u.log.unshift({ asset, side, qty: done, price, ts: now });
      u.log = u.log.slice(0, 20);
      u.peak = Math.max(u.peak, equity(u, now));
      db.write(all);
      return { user: u, price, qty: done, fee, quests: localQuests(u, now), serverTime: now };
    }
    return call('/api/trade', { asset, side, qty });
  },

  async perk(id) {
    if (offline) {
      const { all, u } = mine();
      const perk = PERKS.find(p => p.id === id);
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

  async quest(id) {
    if (offline) {
      const { all, u } = mine();
      const now = Date.now();
      const q = QUESTS.find(x => x.id === id);
      const cur = localQuests(u, now).find(x => x.id === id);
      if (cur.claimed) throw new Error('Награда уже получена');
      if (cur.value < q.goal) throw new Error('Задание ещё не выполнено');
      const key = String(dayStart(now));
      u.quests = { [key]: (u.quests[key] || []).concat(id) };
      u.cash += q.reward;
      db.write(all);
      return { user: u, reward: q.reward, quests: localQuests(u, now) };
    }
    return call('/api/quest', { id });
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
      if (equity(u, now) > 2) throw new Error('Пособие дают только на мели');
      if (now - u.lastGrant < (fat ? 3600e3 : GRANT_MS)) throw new Error('Рано, приходи позже');
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
      const rec = all[token.slice(6)];
      if (!rec || !rec.u) throw new Error('Сессия потеряна, войди заново');
      const me = normalize(rec.u);
      const rows = botBoard(now)
        .concat(Object.values(all)
          .map(x => normalize(x && x.u))
          .filter(Boolean)
          .map(u => ({
            username: u.username,
            equity: equity(u, now),
            vip: !!u.perks.shovel
          })))
        .sort((a, b) => b.equity - a.equity)
        .slice(0, 50);
      const tape = (me.log || []).slice(0, 12).map(l => ({ ...l, username: me.username }));
      return { rows, me: me.username, tape };
    }
    return call('/api/leaderboard', null, 'GET');
  }
};
