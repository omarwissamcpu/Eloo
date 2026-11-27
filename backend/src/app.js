import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { openDb } from './db.js';
import { authRoutes, authMiddleware, publicUser, verifyToken } from './auth.js';
import { incidentService, incidentRoutes } from './incidents.js';
import { trafficService, trafficRoutes } from './traffic.js';
import { routingRoutes, osrmProvider, photonProvider } from './routing.js';
import { HttpError, newId, now, str, lat, lng, h } from './util.js';

const AVATARS = ['m1', 'm2', 'm3', 'm4', 'f1', 'f2', 'f3', 'f4'];
const LANGS = ['ar', 'ckb', 'en'];

export async function createApp(cfg, overrides = {}) {
  const db = overrides.db || (await openDb(cfg.databaseUrl, cfg.databaseAuthToken));

  if (!cfg.jwtSecret) {
    // Create the signing secret once and keep it in the database.
    await db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', 'jwt_secret', crypto.randomBytes(32).toString('hex'));
    cfg.jwtSecret = (await db.get('SELECT value FROM settings WHERE key = ?', 'jwt_secret')).value;
  }
  if (!cfg.otpPepper) cfg.otpPepper = crypto.createHash('sha256').update(cfg.jwtSecret).digest('hex');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));

  const auth = authMiddleware(cfg, db);
  const incidents = incidentService(db, io);
  const traffic = trafficService(db);
  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true, time: now() }));

  authRoutes(api, cfg, db);

  // ---- Profile -------------------------------------------------------------
  api.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
  api.patch('/me', auth, h(async (req, res) => {
    const b = req.body || {};
    const name = b.name !== undefined ? str(b.name, 'name', { max: 40, optional: true }) : req.user.name;
    if (b.avatar !== undefined && !AVATARS.includes(b.avatar)) throw new HttpError(400, 'invalid_avatar');
    if (b.lang !== undefined && !LANGS.includes(b.lang)) throw new HttpError(400, 'invalid_lang');
    await db.run('UPDATE users SET name = ?, avatar = ?, lang = ? WHERE id = ?',
      name, b.avatar ?? req.user.avatar, b.lang ?? req.user.lang, req.user.id);
    res.json({ user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', req.user.id)) });
  }));
  api.delete('/me', auth, h(async (req, res) => {
    // Account deletion is required by the App Store and Google Play.
    await db.run('DELETE FROM places WHERE user_id = ?', req.user.id);
    await db.run('UPDATE users SET phone = NULL, name = NULL, avatar = NULL, is_guest = 1 WHERE id = ?', req.user.id);
    res.json({ deleted: true });
  }));

  // ---- Saved places (home, work, favorites) -------------------------------
  api.get('/places', auth, h(async (req, res) => {
    res.json({ places: await db.all('SELECT id, kind, label, address, lat, lng FROM places WHERE user_id = ? ORDER BY created_at', req.user.id) });
  }));
  api.post('/places', auth, h(async (req, res) => {
    const b = req.body || {};
    const kind = ['home', 'work', 'favorite'].includes(b.kind) ? b.kind : null;
    if (!kind) throw new HttpError(400, 'invalid_kind');
    const place = {
      id: newId('p'), kind,
      label: str(b.label, 'label', { max: 60, optional: true }),
      address: str(b.address, 'address', { max: 200, optional: true }),
      lat: lat(b.lat), lng: lng(b.lng),
    };
    if (kind !== 'favorite') await db.run('DELETE FROM places WHERE user_id = ? AND kind = ?', req.user.id, kind);
    const count = (await db.get('SELECT COUNT(*) AS n FROM places WHERE user_id = ?', req.user.id)).n;
    if (count >= 100) throw new HttpError(400, 'too_many_places');
    await db.run('INSERT INTO places (id, user_id, kind, label, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      place.id, req.user.id, place.kind, place.label, place.address, place.lat, place.lng, now());
    res.status(201).json({ place });
  }));
  api.delete('/places/:id', auth, h(async (req, res) => {
    const r = await db.run('DELETE FROM places WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    res.json({ deleted: r.changes > 0 });
  }));

  incidentRoutes(api, db, io, auth, incidents);
  trafficRoutes(api, auth, traffic);
  routingRoutes(api, auth, {
    routeProvider: overrides.routeProvider || osrmProvider(cfg.osrmUrl),
    searchProvider: overrides.searchProvider || photonProvider(cfg.photonUrl),
    traffic,
    incidents,
  });

  app.use('/v1', api);

  // Public pages (privacy policy & terms) for the app stores: https://<server>/privacy
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  app.get(['/privacy', '/terms'], (_req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));
  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.code || (status === 400 ? 'bad_request' : 'server_error') });
  });

  // Live updates: only signed-in clients may connect.
  io.use((socket, next) => {
    const id = verifyToken(cfg, socket.handshake.auth?.token);
    if (!id) return next(new Error('unauthorized'));
    socket.data.userId = id;
    next();
  });

  const sweeper = setInterval(() => incidents.expireOld().catch((e) => console.error('expire failed', e)), 60 * 1000);
  sweeper.unref();

  return {
    app, server, io, db, incidents, traffic,
    close: () => new Promise((resolve) => { clearInterval(sweeper); io.close(); server.close(() => { db.close?.(); resolve(); }); }),
  };
}
