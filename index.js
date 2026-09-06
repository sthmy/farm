import { priceAt, BY_ID } from './market.js';

const FEE = 0.004;
const GRANT_MS = 4 * 3600e3;
const TRADE_COOLDOWN = 250;
const enc = new TextEncoder();

function cors(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors(env) }
  });
}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(pad + '='.repeat((4 - pad.length % 4) % 4)), c => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payload, secret) {
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const data = head + '.' + body;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return data + '.' + b64url(sig);
}

async function verify(token, secret) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  return payload.exp > Date.now() ? payload : null;
}

async function hashPass(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64url(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return b64url(bits);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function loadUser(db, id) {
  const u = await db.prepare('select * from users where id = ?').bind(id).first();
  if (!u) return null;
  const hs = await db.prepare('select asset, qty, avg from holdings where user_id = ? and qty > 0').bind(id).all();
  const log = await db.prepare('select asset, side, qty, price, ts from trades where user_id = ? order by ts desc limit 20').bind(id).all();
  const holdings = {};
  for (const h of hs.results) holdings[h.asset] = { qty: h.qty, avg: h.avg };
  return {
    username: u.username,
    cash: u.cash,
    trades: u.trades,
    peak: u.peak,
    lastGrant: u.last_grant,
    holdings,
    log: log.results
  };
}

function equityOf(user, t) {
  let e = user.cash;
  for (const [id, h] of Object.entries(user.holdings)) e += h.qty * priceAt(id, t);
  return e;
}

async function auth(request, env) {
  const header = request.headers.get('authorization') || '';
  return verify(header.replace(/^Bearer\s+/i, ''), env.JWT_SECRET);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });

    try {
      if (path === '/api/register' || path === '/api/login') {
        const { username, password } = await request.json();
        const name = String(username || '').trim();
        if (!/^[\wА-Яа-яЁё_-]{3,16}$/u.test(name)) return json({ error: 'Позывной: 3–16 символов без пробелов' }, env, 400);
        if (String(password || '').length < 4) return json({ error: 'Пароль от 4 символов' }, env, 400);

        const existing = await env.DB.prepare('select * from users where lower(username) = lower(?)').bind(name).first();

        if (path === '/api/register') {
          if (existing) return json({ error: 'Позывной занят' }, env, 409);
          const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
          const hash = await hashPass(password, salt);
          const r = await env.DB.prepare(
            'insert into users (username, pass_hash, salt, cash, peak, created_at) values (?,?,?,10,10,?)'
          ).bind(name, hash, salt, Date.now()).run();
          const id = r.meta.last_row_id;
          return json({ token: await sign({ sub: id, u: name, exp: Date.now() + 30 * 864e5 }, env.JWT_SECRET) }, env);
        }

        if (!existing) return json({ error: 'Такого игрока нет' }, env, 404);
        const hash = await hashPass(password, existing.salt);
        if (!safeEqual(hash, existing.pass_hash)) return json({ error: 'Пароль не подошёл' }, env, 401);
        return json({ token: await sign({ sub: existing.id, u: existing.username, exp: Date.now() + 30 * 864e5 }, env.JWT_SECRET) }, env);
      }

      const me = await auth(request, env);
      if (!me) return json({ error: 'Нужно войти заново' }, env, 401);

      if (path === '/api/state') {
        const user = await loadUser(env.DB, me.sub);
        if (!user) return json({ error: 'Игрок не найден' }, env, 404);
        return json({ user, serverTime: Date.now() }, env);
      }

      if (path === '/api/trade') {
        const { asset, side, qty } = await request.json();
        const a = BY_ID[asset];
        const q = Number(qty);
        if (!a || (side !== 'buy' && side !== 'sell')) return json({ error: 'Неизвестный актив' }, env, 400);
        if (!isFinite(q) || q <= 0 || q > 1e12) return json({ error: 'Неверный объём' }, env, 400);

        const row = await env.DB.prepare('select cash, last_trade from users where id = ?').bind(me.sub).first();
        const t = Date.now();
        if (t - row.last_trade < TRADE_COOLDOWN) return json({ error: 'Слишком быстро' }, env, 429);

        const price = priceAt(asset, t);
        const h = await env.DB.prepare('select qty, avg from holdings where user_id = ? and asset = ?').bind(me.sub, asset).first()
          || { qty: 0, avg: 0 };

        let cash = row.cash;
        let nq = h.qty;
        let avg = h.avg;
        let done = q;

        if (side === 'buy') {
          const max = cash / (price * (1 + FEE));
          if (q > max * 1.05) return json({ error: 'Не хватает денег' }, env, 400);
          done = Math.min(q, max);
          cash -= done * price * (1 + FEE);
          avg = (avg * nq + done * price) / (nq + done);
          nq += done;
        } else {
          done = Math.min(q, h.qty);
          if (done <= 0) return json({ error: 'Нечего продавать' }, env, 400);
          cash += done * price * (1 - FEE);
          nq -= done;
        }

        await env.DB.batch([
          env.DB.prepare('insert into holdings (user_id, asset, qty, avg) values (?,?,?,?) on conflict(user_id, asset) do update set qty = ?, avg = ?')
            .bind(me.sub, asset, nq, avg, nq, avg),
          env.DB.prepare('update users set cash = ?, trades = trades + 1, last_trade = ? where id = ?')
            .bind(cash, t, me.sub),
          env.DB.prepare('insert into trades (user_id, asset, side, qty, price, ts) values (?,?,?,?,?,?)')
            .bind(me.sub, asset, side, done, price, t)
        ]);

        const user = await loadUser(env.DB, me.sub);
        const eq = equityOf(user, t);
        if (eq > user.peak) {
          await env.DB.prepare('update users set peak = ? where id = ?').bind(eq, me.sub).run();
          user.peak = eq;
        }
        return json({ user, price, qty: done }, env);
      }

      if (path === '/api/grant') {
        const user = await loadUser(env.DB, me.sub);
        const t = Date.now();
        if (equityOf(user, t) > 2) return json({ error: 'Пособие дают только на мели' }, env, 400);
        if (t - user.lastGrant < GRANT_MS) {
          const left = Math.ceil((GRANT_MS - (t - user.lastGrant)) / 60000);
          return json({ error: `Рано, приходи через ${left} мин` }, env, 429);
        }
        await env.DB.prepare('update users set cash = cash + 5, last_grant = ? where id = ?').bind(t, me.sub).run();
        return json({ user: await loadUser(env.DB, me.sub) }, env);
      }

      if (path === '/api/leaderboard') {
        const t = Date.now();
        const users = await env.DB.prepare('select id, username, cash from users order by peak desc limit 200').all();
        const ids = users.results.map(u => u.id);
        const marks = ids.map(() => '?').join(',') || '0';
        const hs = await env.DB.prepare(`select user_id, asset, qty from holdings where qty > 0 and user_id in (${marks})`).bind(...ids).all();
        const extra = {};
        for (const h of hs.results) extra[h.user_id] = (extra[h.user_id] || 0) + h.qty * priceAt(h.asset, t);
        const rows = users.results
          .map(u => ({ username: u.username, equity: u.cash + (extra[u.id] || 0) }))
          .sort((a, b) => b.equity - a.equity)
          .slice(0, 50);
        return json({ rows, me: me.u }, env);
      }

      return json({ error: 'Не туда' }, env, 404);
    } catch (e) {
      return json({ error: 'Сервер поперхнулся: ' + e.message }, env, 500);
    }
  }
};
