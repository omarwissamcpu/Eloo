// Incident reports: create, list by map area, preset comments, "still there" votes.
// Live updates go out over socket.io as incident:new / incident:update / incident:removed.
import { INCIDENT_TYPES, isValidIncident, isValidComment } from './catalog.js';
import { HttpError, newId, now, str, lat, lng, num, rateLimiter, h } from './util.js';
import { haversine } from './geo.js';

const DENIES_TO_REMOVE = 3;

export function incidentService(db, io) {
  const getOne = (id) => db.get('SELECT * FROM incidents WHERE id = ?', id);

  async function toPublic(row) {
    const comments = await db.all(
      'SELECT comment_key AS key, COUNT(*) AS count, MAX(created_at) AS last FROM incident_comments WHERE incident_id = ? GROUP BY comment_key ORDER BY count DESC',
      row.id,
    );
    return {
      id: row.id,
      type: row.type,
      subtype: row.subtype,
      lat: row.lat,
      lng: row.lng,
      heading: row.heading,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      confirms: row.confirms,
      denies: row.denies,
      comments,
    };
  }

  const listInBox = (minLng, minLat, maxLng, maxLat, limit = 300) =>
    db.all(
      `SELECT * FROM incidents WHERE status = 'active' AND expires_at > ?
        AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY created_at DESC LIMIT ?`,
      now(), minLat, maxLat, minLng, maxLng, limit,
    );

  async function expireOld() {
    const rows = await db.all(`SELECT id FROM incidents WHERE status = 'active' AND expires_at <= ?`, now());
    for (const { id } of rows) {
      await db.run(`UPDATE incidents SET status = 'removed' WHERE id = ?`, id);
      io?.emit('incident:removed', { id });
    }
    return rows.length;
  }

  return { getOne, toPublic, listInBox, expireOld };
}

export function incidentRoutes(router, db, io, auth, svc) {
  const reportLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });
  const commentLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

  router.get('/incidents/catalog', (_req, res) => {
    const out = {};
    for (const [k, v] of Object.entries(INCIDENT_TYPES)) out[k] = { subtypes: v.subtypes, comments: v.comments, ttlMin: v.ttl / 60000 };
    res.json(out);
  });

  // GET /incidents?bbox=minLng,minLat,maxLng,maxLat
  router.get('/incidents', auth, h(async (req, res) => {
    const parts = String(req.query.bbox || '').split(',').map(Number);
    if (parts.length !== 4 || parts.some((x) => !Number.isFinite(x))) throw new HttpError(400, 'invalid_bbox');
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (maxLng - minLng > 5 || maxLat - minLat > 5) throw new HttpError(400, 'bbox_too_large');
    const rows = await svc.listInBox(minLng, minLat, maxLng, maxLat);
    res.json({ incidents: await Promise.all(rows.map(svc.toPublic)) });
  }));

  router.post('/incidents', auth, h(async (req, res) => {
    const b = req.body || {};
    const type = str(b.type, 'type', { max: 30 });
    const subtype = str(b.subtype, 'subtype', { max: 30, optional: true });
    if (!isValidIncident(type, subtype)) throw new HttpError(400, 'invalid_type');
    const la = lat(b.lat), ln = lng(b.lng);
    const heading = b.heading == null ? null : num(b.heading, 'heading', { min: 0, max: 360 });
    if (!reportLimiter(req.user.id)) throw new HttpError(429, 'too_many_reports');

    // Merge with a nearby report of the same type instead of creating a duplicate.
    const near = (await db.all(
      `SELECT * FROM incidents WHERE status = 'active' AND type = ? AND expires_at > ?
        AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
      type, now(), la - 0.002, la + 0.002, ln - 0.002, ln + 0.002,
    )).find((r) => haversine(r.lat, r.lng, la, ln) < 150);
    const ttl = INCIDENT_TYPES[type].ttl;

    if (near) {
      const already = await db.get('SELECT 1 AS x FROM incident_votes WHERE incident_id = ? AND user_id = ?', near.id, req.user.id);
      if (!already && near.user_id !== req.user.id) {
        await db.run('INSERT INTO incident_votes (incident_id, user_id, vote, created_at) VALUES (?, ?, 1, ?)', near.id, req.user.id, now());
        await db.run('UPDATE incidents SET confirms = confirms + 1, expires_at = MAX(expires_at, ?), subtype = COALESCE(?, subtype) WHERE id = ?',
          now() + ttl, subtype, near.id);
      }
      const merged = await svc.toPublic(await svc.getOne(near.id));
      io?.emit('incident:update', merged);
      return res.status(200).json({ incident: merged, merged: true });
    }

    // Reports from low-trust accounts expire faster.
    const trust = Math.max(0.3, Math.min(1.5, req.user.trust));
    const id = newId('inc');
    await db.run(`INSERT INTO incidents (id, user_id, type, subtype, lat, lng, heading, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, req.user.id, type, subtype, la, ln, heading, now(), now() + Math.round(ttl * trust));
    await db.run('UPDATE users SET points = points + 5 WHERE id = ?', req.user.id);
    const inc = await svc.toPublic(await svc.getOne(id));
    io?.emit('incident:new', inc);
    res.status(201).json({ incident: inc, merged: false });
  }));

  router.post('/incidents/:id/comments', auth, h(async (req, res) => {
    const row = await svc.getOne(req.params.id);
    if (!row || row.status !== 'active') throw new HttpError(404, 'not_found');
    const key = str(req.body?.key, 'key', { max: 40 });
    if (!isValidComment(row.type, key)) throw new HttpError(400, 'invalid_comment');
    if (!commentLimiter(req.user.id)) throw new HttpError(429, 'too_many_comments');
    const dup = await db.get('SELECT 1 AS x FROM incident_comments WHERE incident_id = ? AND user_id = ? AND comment_key = ?', row.id, req.user.id, key);
    if (!dup) await db.run('INSERT INTO incident_comments (id, incident_id, user_id, comment_key, created_at) VALUES (?, ?, ?, ?, ?)', newId('c'), row.id, req.user.id, key, now());
    const inc = await svc.toPublic(await svc.getOne(row.id));
    io?.emit('incident:update', inc);
    res.status(201).json({ incident: inc });
  }));

  // body: { still: true | false }
  router.post('/incidents/:id/vote', auth, h(async (req, res) => {
    const row = await svc.getOne(req.params.id);
    if (!row || row.status !== 'active') throw new HttpError(404, 'not_found');
    if (typeof req.body?.still !== 'boolean') throw new HttpError(400, 'invalid_vote');
    if (row.user_id === req.user.id) throw new HttpError(400, 'own_report');
    const vote = req.body.still ? 1 : -1;
    const prev = await db.get('SELECT vote FROM incident_votes WHERE incident_id = ? AND user_id = ?', row.id, req.user.id);
    if (prev?.vote === vote) return res.json({ incident: await svc.toPublic(row) });

    await db.run(`INSERT INTO incident_votes (incident_id, user_id, vote, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(incident_id, user_id) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at`, row.id, req.user.id, vote, now());
    const confirms = (await db.get('SELECT COUNT(*) AS n FROM incident_votes WHERE incident_id = ? AND vote = 1', row.id)).n;
    const denies = (await db.get('SELECT COUNT(*) AS n FROM incident_votes WHERE incident_id = ? AND vote = -1', row.id)).n;
    let expires = row.expires_at;
    if (vote === 1) expires = Math.max(expires, now() + INCIDENT_TYPES[row.type].ttl / 2);
    await db.run('UPDATE incidents SET confirms = ?, denies = ?, expires_at = ? WHERE id = ?', confirms, denies, expires, row.id);

    if (denies - confirms >= DENIES_TO_REMOVE) {
      await db.run(`UPDATE incidents SET status = 'removed' WHERE id = ?`, row.id);
      // The reporter's trust drops when a report is voted away, and rises when confirmed.
      await db.run('UPDATE users SET trust = MAX(0.3, trust - 0.1) WHERE id = ?', row.user_id);
      io?.emit('incident:removed', { id: row.id });
      return res.json({ removed: true });
    }
    if (vote === 1) await db.run('UPDATE users SET trust = MIN(1.5, trust + 0.02), points = points + 1 WHERE id = ?', row.user_id);
    const inc = await svc.toPublic(await svc.getOne(row.id));
    io?.emit('incident:update', inc);
    res.json({ incident: inc });
  }));
}
