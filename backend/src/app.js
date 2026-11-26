import http from 'node:http';
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

export function createApp(cfg, overrides = {}) {
  const db = overrides.db || openDb(cfg.dbPath);
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
    db.prepare('UPDATE users SET name = ?, avatar = ?, lang = ? WHERE id = ?')
      .run(name, b.avatar ?? req.user.avatar, b.lang ?? req.user.lang, req.user.id);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  }));
  api.delete('/me', auth, (req, res) => {
    // Account deletion is required by the App Store and Google Play.
    db.prepare('DELETE FROM places WHERE user_id = ?').run(req.user.id);
    db.prepare("UPDATE users SET phone = NULL, name = NULL, avatar = NULL, is_guest = 1 WHERE id = ?").run(req.user.id);
    res.json({ deleted: true });
  });

  // ---- Saved places (home, work, favorites) -------------------------------
  api.get('/places', auth, (req, res) => {
    res.json({ places: db.prepare('SELECT id, kind, label, address, lat, lng FROM places WHERE user_id = ? ORDER BY created_at').all(req.user.id) });
  });
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
    if (kind !== 'favorite') db.prepare('DELETE FROM places WHERE user_id = ? AND kind = ?').run(req.user.id, kind);
    const count = db.prepare('SELECT COUNT(*) n FROM places WHERE user_id = ?').get(req.user.id).n;
    if (count >= 100) throw new HttpError(400, 'too_many_places');
    db.prepare('INSERT INTO places (id, user_id, kind, label, address, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(place.id, req.user.id, place.kind, place.label, place.address, place.lat, place.lng, now());
    res.status(201).json({ place });
  }));
  api.delete('/places/:id', auth, (req, res) => {
    const r = db.prepare('DELETE FROM places WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ deleted: r.changes > 0 });
  });

  incidentRoutes(api, db, io, auth, incidents);
  trafficRoutes(api, auth, traffic);
  routingRoutes(api, auth, {
    routeProvider: overrides.routeProvider || osrmProvider(cfg.osrmUrl),
    searchProvider: overrides.searchProvider || photonProvider(cfg.photonUrl),
    traffic,
    incidents,
  });

  app.use('/v1', api);
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

  const sweeper = setInterval(() => incidents.expireOld(), 60 * 1000);
  sweeper.unref();

  return {
    app, server, io, db, incidents, traffic,
    close: () => new Promise((resolve) => { clearInterval(sweeper); io.close(); server.close(() => resolve()); }),
  };
}
