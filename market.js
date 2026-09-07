export const ASSETS = [
  {
    id: 'POTATO',
    name: 'Картофельные поля',
    short: 'Картошка',
    emoji: '🥔',
    seed: 1071,
    base: 1.40,
    vol: 0.26,
    eventChance: 0.10,
    eventAmp: 0.22,
    color: '#E0A445',
    glow: 'rgba(224,164,69,.35)',
    about: 'Скучно, надёжно, растёт из земли. Идеальный первый актив.',
    news: [
      ['Урожай в Гомельской области побил рекорд', 1],
      ['Драники объявили блюдом года', 1],
      ['Колорадский жук вышел на охоту', -1],
      ['Склад затопило, картошка проросла', -1],
      ['Фермер купил комбайн, все в шоке', 1],
      ['Минторг: цена на драники под контролем', -1]
    ]
  },
  {
    id: 'FISH',
    name: 'Редкие рыбки',
    short: 'Рыбки',
    emoji: '🐠',
    seed: 2213,
    base: 6.20,
    vol: 0.62,
    eventChance: 0.16,
    eventAmp: 0.40,
    color: '#3FC7C0',
    glow: 'rgba(63,199,192,.35)',
    about: 'Модный и нервный рынок. Одна редкая особь двигает график.',
    news: [
      ['Найдена рыба с узором как у Мондриана', 1],
      ['Коллекционер скупил весь аквариум', 1],
      ['У главного заводчика отключили фильтр', -1],
      ['Рыбка оказалась крашеной, скандал', -1],
      ['Аквариумисты объединились в картель', 1],
      ['Кот. Просто кот.', -1]
    ]
  },
  {
    id: 'SAND',
    name: 'Песок',
    short: 'Песок',
    emoji: '🏖️',
    seed: 3317,
    base: 0.32,
    vol: 0.19,
    eventChance: 0.07,
    eventAmp: 0.16,
    color: '#C9B79A',
    glow: 'rgba(201,183,154,.3)',
    about: 'Самый спокойный график в игре. Копится медленно, зато не сгорает.',
    news: [
      ['Стройка века требует ещё вагон песка', 1],
      ['Пляж переименовали в биржевой хаб', 1],
      ['Дождь. Песок мокрый. Все грустят', -1],
      ['Дети построили замок, запасы тают', 1],
      ['Обнаружено, что песка вообще-то много', -1],
      ['Стекольный завод поднял закупку', 1]
    ]
  },
  {
    id: 'POPPY',
    name: 'Маковые поля',
    short: 'Мак',
    emoji: '🌺',
    seed: 4409,
    base: 11.50,
    vol: 0.70,
    eventChance: 0.24,
    eventAmp: 0.48,
    color: '#E23E57',
    glow: 'rgba(226,62,87,.4)',
    about: 'Взлетает и обваливается сильнее всех. Не заходи сюда на весь баланс.',
    news: [
      ['Кондитеры скупают мак под рулеты', 1],
      ['Сезон булок объявлен открытым', 1],
      ['Проверка на поле, торги штормит', -1],
      ['Пчёлы устроили забастовку', -1],
      ['Мак попал в клип, спрос удвоился', 1],
      ['Оптовик передумал в последний момент', -1]
    ]
  },
  {
    id: 'DUPLODER',
    name: '$DUPLODER',
    short: 'DUPLODER',
    emoji: '🕳️',
    seed: 5501,
    base: 0.042,
    vol: 0.92,
    eventChance: 0.30,
    eventAmp: 0.62,
    rug: 0.55,
    color: '#8B5CF6',
    glow: 'rgba(139,92,246,.4)',
    about: 'Монета без сайта, без команды и без совести. Иногда даёт иксы.',
    news: [
      ['Фонд закупил дупла на весь баланс', 1],
      ['Листинг на бирже, о которой никто не слышал', 1],
      ['Инфлюенсер поставил дупло на аватарку', 1],
      ['Кит слил мешок прямо в стакан', -1],
      ['Разработчик вышел покурить и не вернулся', -1],
      ['Сайт проекта оказался презентацией в Ворде', -1]
    ]
  },
  {
    id: 'MUSORDROP',
    name: '$MUSORDROP',
    short: 'MUSORDROP',
    emoji: '🗑️',
    seed: 6607,
    base: 0.0013,
    vol: 1.05,
    eventChance: 0.34,
    eventAmp: 0.78,
    rug: 0.62,
    color: '#22D3EE',
    glow: 'rgba(34,211,238,.4)',
    about: 'Самая честная монета: в названии всё написано. Ходит на сотни процентов.',
    news: [
      ['Аирдроп раздали, все побежали продавать', -1],
      ['Мусоровоз объявлен официальным талисманом', 1],
      ['Комьюнити выкупило дно, дно оказалось люком', -1],
      ['Биржа включила торги, стакан пустой', -1],
      ['Мем про мусорку залетел в рекомендации', 1],
      ['Кто-то купил на всю зарплату и угадал', 1]
    ]
  }
];

export const BY_ID = Object.fromEntries(ASSETS.map(a => [a.id, a]));

export function fmtPrice(p) {
  if (p >= 100) return p.toFixed(1);
  if (p >= 1) return p.toFixed(3);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

const OCTAVES = [
  [6500, 1.0],
  [26000, 0.9],
  [140000, 1.15],
  [820000, 1.5],
  [4600000, 1.9]
];
const OCT_SUM = OCTAVES.reduce((s, o) => s + o[1], 0);

export const EVENT_WINDOW = 90000;
export const EVENT_SPAN = EVENT_WINDOW * 2;

function hash(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 374761393) + Math.imul(b, 668265263) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

function noise(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(seed, i);
  const b = hash(seed, i + 1);
  return a + (b - a) * f * f * (3 - 2 * f);
}

export function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function basePrice(assetId, t) {
  const a = BY_ID[assetId];
  if (!a) return 0;
  let s = 0;
  for (let i = 0; i < OCTAVES.length; i++) {
    const [period, amp] = OCTAVES[i];
    s += amp * (2 * noise(a.seed + i * 17, t / period) - 1);
  }
  return a.base * Math.exp(s / OCT_SUM * a.vol * 2.1);
}

function shape(p) {
  if (p <= 0 || p >= 1) return 0;
  const v = Math.sin(Math.PI * p);
  return v * v;
}

export function makeEvents(secret, assetId, fromW, toW) {
  const a = BY_ID[assetId];
  const out = [];
  for (let w = fromW; w <= toW; w++) {
    if (hash(secret ^ a.seed, w) >= a.eventChance) continue;
    const dir = hash(secret ^ (a.seed + 1), w) < (a.rug || 0.46) ? -1 : 1;
    const amp = a.eventAmp * (0.45 + hash(secret ^ (a.seed + 2), w) * 0.85);
    const pool = a.news.filter(n => n[1] === dir);
    if (!pool.length) continue;
    const n = Math.floor(hash(secret ^ (a.seed + 3), w) * pool.length) % pool.length;
    out.push({ a: assetId, w, d: dir, m: +amp.toFixed(4), n });
  }
  return out;
}

export function makeAllEvents(secret, fromW, toW) {
  const out = [];
  for (const a of ASSETS) out.push(...makeEvents(secret, a.id, fromW, toW));
  return out;
}

export function packEvents(list) {
  const idx = Object.fromEntries(ASSETS.map((a, i) => [a.id, i]));
  return (list || []).map(e => [idx[e.a], e.w, e.d, Math.round(e.m * 1000), e.n]);
}

export function unpackEvents(rows) {
  return (rows || []).map(r => ({ a: ASSETS[r[0]].id, w: r[1], d: r[2], m: r[3] / 1000, n: r[4] }));
}

export function indexEvents(list) {
  const map = new Map();
  for (const e of list || []) map.set(e.a + ':' + e.w, e);
  return map;
}

export function eventText(e) {
  const a = BY_ID[e.a];
  if (!a) return '';
  const pool = a.news.filter(n => n[1] === e.d);
  return pool.length ? pool[e.n % pool.length][0] : '';
}

export function priceAt(assetId, t, events) {
  const px = basePrice(assetId, t);
  if (!events || !events.size) return px;
  const w = Math.floor(t / EVENT_WINDOW);
  let mul = 1;
  for (let k = w - 1; k <= w; k++) {
    const e = events.get(assetId + ':' + k);
    if (!e) continue;
    mul *= 1 + e.d * e.m * shape((t - k * EVENT_WINDOW) / EVENT_SPAN);
  }
  const out = px * Math.max(mul, 0.12);
  return Math.max(out, BY_ID[assetId].base * 0.02);
}

export function candles(assetId, interval, count, now, events) {
  const last = Math.floor(now / interval) * interval;
  const out = [];
  const steps = 10;
  for (let i = count - 1; i >= 0; i--) {
    const start = last - i * interval;
    const end = Math.min(start + interval, now);
    const o = priceAt(assetId, start, events);
    let h = o, l = o, c = o;
    for (let s = 1; s <= steps; s++) {
      const p = priceAt(assetId, start + (end - start) * (s / steps), events);
      if (p > h) h = p;
      if (p < l) l = p;
      c = p;
    }
    out.push({ t: start, o, h, l, c, live: end < start + interval });
  }
  return out;
}

export function changePct(assetId, now, events, span = 300000) {
  const then = priceAt(assetId, now - span, events);
  return then ? (priceAt(assetId, now, events) - then) / then * 100 : 0;
}

export function spark(assetId, now, events, span = 300000, points = 30) {
  const out = [];
  for (let i = 0; i < points; i++) out.push(priceAt(assetId, now - span + span * i / (points - 1), events));
  return out;
}

export function feedFrom(list, now, limit = 12) {
  return (list || [])
    .map(e => ({ asset: e.a, dir: e.d, text: eventText(e), ts: e.w * EVENT_WINDOW }))
    .filter(x => x.text && x.ts < now + 60000)
    .sort((x, y) => y.ts - x.ts)
    .slice(0, limit);
}
export const PERKS = [
  { id: 'tax', emoji: '🧾', name: 'Свой человек в налоговой', price: 60, about: 'Комиссия падает с 0.4% до 0.15%' },
  { id: 'wallet', emoji: '👛', name: 'Толстый кошелёк', price: 120, about: 'Пособие $15 и раз в час вместо четырёх' },
  { id: 'farm', emoji: '🚜', name: 'Батрак на ферме', price: 180, about: '+$1.20 в час, пока тебя нет. Копится до 8 часов' },
  { id: 'insider', emoji: '🕶️', name: 'Инсайдер', price: 400, about: 'Новости приходят за 25 секунд до движения цены' },
  { id: 'shovel', emoji: '🥇', name: 'Золотая лопата', price: 1500, about: 'Двойной ежедневный дроп и медаль в топе' }
];

export const RANKS = [
  [0, 'Бомж с телефона'],
  [25, 'Подсобник'],
  [75, 'Барыга с рынка'],
  [200, 'Фермер средней руки'],
  [600, 'Оптовик'],
  [1500, 'Картофельный магнат'],
  [5000, 'Мусорный лорд'],
  [15000, 'Хозяин полей']
];

export function rankOf(peak) {
  let i = 0;
  while (i + 1 < RANKS.length && peak >= RANKS[i + 1][0]) i++;
  const next = RANKS[i + 1];
  return {
    level: i + 1,
    title: RANKS[i][1],
    from: RANKS[i][0],
    to: next ? next[0] : null,
    progress: next ? Math.min(1, (peak - RANKS[i][0]) / (next[0] - RANKS[i][0])) : 1
  };
}

export const DAILY_MS = 20 * 3600e3;
export const FARM_RATE = 1.2;
export const FARM_CAP_MS = 8 * 3600e3;

export function feeFor(perks) {
  return perks && perks.tax ? 0.0015 : 0.004;
}

export const QUESTS = [
  { id: 'trades', emoji: '🔁', name: 'Сделать 10 сделок за день', goal: 10, reward: 3 },
  { id: 'meme', emoji: '🕳️', name: 'Тронуть мемкоин', goal: 1, reward: 2 },
  { id: 'volume', emoji: '📊', name: 'Наторговать на $50 оборота', goal: 50, reward: 4 }
];

export function dayStart(t) {
  return Math.floor(t / 864e5) * 864e5;
}
