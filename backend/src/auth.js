// Auth: guest accounts, phone sign-up with one-time codes, signed tokens (HS256).
import crypto from 'node:crypto';
import { HttpError, newId, now, str, rateLimiter, h } from './util.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function signToken(cfg, userId) {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: userId, iat: Math.floor(now() / 1000), exp: Math.floor(now() / 1000) + cfg.tokenTtlDays * 86400 });
  const sig = crypto.createHmac('sha256', cfg.jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(cfg, token) {
  if (typeof token !== 'string') return null;
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const expected = crypto.createHmac('sha256', cfg.jwtSecret).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp * 1000 < now()) return null;
    return data.sub;
  } catch {
    return null;
  }
}

// Iraqi mobile numbers: 07XX XXX XXXX, +9647XX..., 9647XX... → +9647XXXXXXXXX.
// Other international numbers in E.164 are accepted too (for going international later).
export function normalizePhone(input) {
  const raw = String(input || '').replace(/[\s\-()]/g, '').replace(/^00/, '+');
  let m = raw.match(/^(?:\+?964|0)?(7\d{9})$/);
  if (m) return '+964' + m[1];
  m = raw.match(/^\+[1-9]\d{7,14}$/);
  if (m) return raw;
  return null;
}

async function sendSms(cfg, phone, text) {
  if (cfg.smsProvider === 'console') {
    console.log(`[sms] to ${phone}: ${text}`);
    return;
  }
  if (cfg.smsProvider === 'twilio') {
    const { sid, token, from } = cfg.twilio;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: from, Body: text }),
    });
    if (!res.ok) throw new HttpError(502, 'sms_failed');
    return;
  }
  throw new HttpError(500, 'sms_provider_not_configured');
}

const hashCode = (cfg, phone, code) => crypto.createHmac('sha256', cfg.otpPepper).update(`${phone}:${code}`).digest('hex');

export function publicUser(u) {
  return {
    id: u.id,
    phone: u.phone,
    isGuest: Boolean(u.is_guest),
    name: u.name,
    avatar: u.avatar,
    lang: u.lang,
    points: u.points,
  };
}

export function authMiddleware(cfg, db) {
  return h(async (req, _res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const id = verifyToken(cfg, token);
    const user = id && (await db.get('SELECT * FROM users WHERE id = ?', id));
    if (!user) throw new HttpError(401, 'unauthorized');
    req.user = user;
    next();
  });
}

export function authRoutes(router, cfg, db) {
  const insertUser = (...a) => db.run('INSERT INTO users (id, phone, is_guest, lang, created_at) VALUES (?, ?, ?, ?, ?)', ...a);
  const userById = (id) => db.get('SELECT * FROM users WHERE id = ?', id);
  const otpLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
  const ipLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 30 });
  const LANGS = ['ar', 'ckb', 'en'];

  router.post('/auth/guest', h(async (req, res) => {
    const lang = LANGS.includes(req.body?.lang) ? req.body.lang : 'ar';
    const id = newId('u');
    await insertUser(id, null, 1, lang, now());
    const user = await userById(id);
    res.status(201).json({ token: signToken(cfg, id), user: publicUser(user) });
  }));

  router.post('/auth/otp/request', h(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) throw new HttpError(400, 'invalid_phone');
    if (!otpLimiter(phone) || !ipLimiter(req.ip)) throw new HttpError(429, 'too_many_requests');
    const prev = await db.get('SELECT sent_at FROM otps WHERE phone = ?', phone);
    if (prev && now() - prev.sent_at < 30 * 1000) throw new HttpError(429, 'wait_before_resend');
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await db.run(`INSERT INTO otps (phone, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at`,
      phone, hashCode(cfg, phone, code), now() + 5 * 60 * 1000, now());
    await sendSms(cfg, phone, `eloo: ${code}`);
    const out = { phone, expiresInSec: 300 };
    if (cfg.smsProvider === 'console' && cfg.exposeDevCodes) out.devCode = code; // tests only
    res.json(out);
  }));

  router.post('/auth/otp/verify', h(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const code = str(req.body?.code, 'code', { max: 6 });
    if (!phone) throw new HttpError(400, 'invalid_phone');
    const row = await db.get('SELECT * FROM otps WHERE phone = ?', phone);
    if (!row || row.expires_at < now()) throw new HttpError(400, 'code_expired');
    if (row.attempts >= 5) throw new HttpError(429, 'too_many_attempts');
    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashCode(cfg, phone, code)));
    if (!ok) {
      await db.run('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?', phone);
      throw new HttpError(400, 'wrong_code');
    }
    await db.run('DELETE FROM otps WHERE phone = ?', phone);

    let user = await db.get('SELECT * FROM users WHERE phone = ?', phone);
    if (!user) {
      // Upgrade the current guest account (keeps saved places and points) or create a new one.
      const guestId = verifyToken(cfg, (req.headers.authorization || '').replace(/^Bearer /, ''));
      const guest = guestId && (await db.get('SELECT * FROM users WHERE id = ? AND is_guest = 1', guestId));
      if (guest) {
        await db.run('UPDATE users SET phone = ?, is_guest = 0 WHERE id = ?', phone, guest.id);
        user = await userById(guest.id);
      } else {
        const id = newId('u');
        const lang = ['ar', 'ckb', 'en'].includes(req.body?.lang) ? req.body.lang : 'ar';
        await insertUser(id, phone, 0, lang, now());
        user = await userById(id);
      }
    }
    res.json({ token: signToken(cfg, user.id), user: publicUser(user) });
  }));
}
