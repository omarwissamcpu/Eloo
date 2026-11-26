// Crowd-sourced traffic: phones send anonymous speed samples while driving;
// we keep a decaying average speed per ~150 m cell and direction of travel.
import { geohash, headingBucket, bearing } from './geo.js';
import { HttpError, now, rateLimiter, h } from './util.js';

const TAU_MS = 10 * 60 * 1000; // older samples fade over ~10 minutes
const STALE_MS = 30 * 60 * 1000; // cells untouched for 30 min are ignored
const MIN_WEIGHT = 2; // need a few recent samples before we trust a cell

export function trafficService(db) {
  const getCell = db.prepare('SELECT * FROM traffic_cells WHERE cell = ? AND bucket = ?');
  const upsert = db.prepare(`INSERT INTO traffic_cells (cell, bucket, avg_speed, weight, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cell, bucket) DO UPDATE SET avg_speed = excluded.avg_speed, weight = excluded.weight, updated_at = excluded.updated_at`);

  function addSample({ lat, lng, speedKmh, heading, ts = now() }) {
    const cell = geohash(lat, lng, 7);
    const bucket = headingBucket(heading);
    const old = getCell.get(cell, bucket);
    let avg = speedKmh, w = 1;
    if (old) {
      const decay = Math.exp(-Math.max(0, ts - old.updated_at) / TAU_MS);
      const ow = old.weight * decay;
      w = ow + 1;
      avg = (old.avg_speed * ow + speedKmh) / w;
    }
    upsert.run(cell, bucket, avg, Math.min(w, 50), Math.max(ts, old?.updated_at || 0));
  }

  // Observed speed (km/h) for a point travelling at a given heading, or null if unknown.
  function observedSpeed(lat, lng, heading, t = now()) {
    const row = getCell.get(geohash(lat, lng, 7), headingBucket(heading));
    if (!row || t - row.updated_at > STALE_MS) return null;
    const w = row.weight * Math.exp(-(t - row.updated_at) / TAU_MS);
    return w >= MIN_WEIGHT ? row.avg_speed : null;
  }

  // Adjust route segment durations with live speeds.
  // coords: [[lng,lat],...]; durations[i], speeds[i] (m/s) describe coords[i] → coords[i+1].
  function adjustDuration(coords, durations, speeds) {
    let total = 0, base = 0, known = 0;
    const cache = new Map();
    for (let i = 0; i < durations.length; i++) {
      const d = durations[i] || 0;
      base += d;
      const a = coords[i], b = coords[i + 1];
      if (!a || !b) { total += d; continue; }
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const hd = bearing(a[1], a[0], b[1], b[0]);
      const key = geohash(mid[1], mid[0], 7) + ':' + headingBucket(hd);
      let obs = cache.get(key);
      if (obs === undefined) { obs = observedSpeed(mid[1], mid[0], hd); cache.set(key, obs); }
      const expected = (speeds?.[i] || 0) * 3.6;
      if (obs != null && expected > 0) {
        known += d;
        // Slower than normal stretches the time; never assume more than 30% faster than the map.
        const factor = Math.min(6, Math.max(0.77, expected / Math.max(obs, 3)));
        total += d * factor;
      } else {
        total += d;
      }
    }
    return { duration: total, baseDuration: base, coverage: base ? known / base : 0 };
  }

  return { addSample, observedSpeed, adjustDuration };
}

export function trafficRoutes(router, auth, svc) {
  const limiter = rateLimiter({ windowMs: 60 * 1000, max: 12 });

  // body: { points: [{ lat, lng, speed (m/s), heading (deg), accuracy (m), ts (ms) }] }
  router.post('/traffic/probes', auth, h(async (req, res) => {
    const pts = req.body?.points;
    if (!Array.isArray(pts) || pts.length === 0 || pts.length > 120) throw new HttpError(400, 'invalid_points');
    if (!limiter(req.user.id)) throw new HttpError(429, 'too_many_requests');
    let accepted = 0;
    const t = now();
    for (const p of pts) {
      const ok =
        p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 &&
        Number.isFinite(p.speed) && p.speed >= 0 && p.speed <= 60 && // ≤ 216 km/h
        Number.isFinite(p.heading) && p.heading >= 0 &&
        (p.accuracy == null || p.accuracy <= 40) &&
        Number.isFinite(p.ts) && p.ts <= t + 60000 && t - p.ts < 5 * 60 * 1000;
      if (!ok) continue;
      svc.addSample({ lat: p.lat, lng: p.lng, speedKmh: p.speed * 3.6, heading: p.heading, ts: p.ts });
      accepted++;
    }
    res.json({ accepted });
  }));
}
