import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { normalizePhone } from '../src/auth.js';
import { geohash } from '../src/geo.js';

// A straight east-bound road in Baghdad (Karrada area), ~1.1 km, 10 segments.
const ROAD = Array.from({ length: 11 }, (_, i) => [44.40 + i * 0.001, 33.30]);
const fakeOsrm = async ({ mode }) => [
  {
    distance: 930, duration: 100,
    geometry: { type: 'LineString', coordinates: ROAD },
    legs: [{
      summary: 'Karrada St',
      annotation: { duration: Array(10).fill(10), speed: Array(10).fill(9.3) }, // ~33 km/h normal
      steps: [
        { maneuver: { type: 'depart', location: ROAD[0] }, name: 'Karrada St', distance: 930, duration: 100 },
        { maneuver: { type: 'arrive', location: ROAD[10] }, name: '', distance: 0, duration: 0 },
      ],
    }],
    mode,
  },
  {
    distance: 1500, duration: 140,
    geometry: { type: 'LineString', coordinates: [[44.40, 33.30], [44.405, 33.305], [44.41, 33.30]] },
    legs: [{ summary: 'Side road', annotation: { duration: [70, 70], speed: [5.4, 5.4] }, steps: [] }],
  },
];
const fakeSearch = async ({ q }) => [{ id: 'n1', name: q, address: 'Baghdad', lat: 33.3, lng: 44.4 }];

let ctx, base;
before(async () => {
  const cfg = loadConfig({ dbPath: ':memory:', exposeDevCodes: true, smsProvider: 'console' });
  ctx = createApp(cfg, { db: openDb(':memory:'), routeProvider: fakeOsrm, searchProvider: fakeSearch });
  await new Promise((r) => ctx.server.listen(0, r));
  base = `http://127.0.0.1:${ctx.server.address().port}/v1`;
});
after(() => ctx.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const guest = async () => (await call('POST', '/auth/guest', { lang: 'ar' })).body.token;

test('phone numbers normalise to +964', () => {
  assert.equal(normalizePhone('0770 123 4567'), '+9647701234567');
  assert.equal(normalizePhone('+964 770 123 4567'), '+9647701234567');
  assert.equal(normalizePhone('009647701234567'), '+9647701234567');
  assert.equal(normalizePhone('12345'), null);
});

test('geohash matches the reference implementation', () => {
  assert.equal(geohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
});

test('guest sign-in, profile, unauthorised access', async () => {
  const r = await call('POST', '/auth/guest', { lang: 'ckb' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.isGuest, true);
  assert.equal(r.body.user.lang, 'ckb');
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/me', null, 'bad.token.here')).status, 401);
  const p = await call('PATCH', '/me', { name: 'Omar', avatar: 'm2' }, r.body.token);
  assert.equal(p.body.user.name, 'Omar');
  assert.equal((await call('PATCH', '/me', { avatar: 'zz' }, r.body.token)).status, 400);
});

test('phone sign-up upgrades the guest account and keeps its places', async () => {
  const token = await guest();
  await call('POST', '/places', { kind: 'home', label: 'Home', lat: 33.31, lng: 44.36 }, token);
  const req = await call('POST', '/auth/otp/request', { phone: '07701112233' });
  assert.equal(req.status, 200);
  assert.equal(req.body.phone, '+9647701112233');
  assert.equal((await call('POST', '/auth/otp/verify', { phone: '07701112233', code: '000000' === req.body.devCode ? '111111' : '000000' }, token)).status, 400);
  const ok = await call('POST', '/auth/otp/verify', { phone: '07701112233', code: req.body.devCode }, token);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.isGuest, false);
  const places = await call('GET', '/places', null, ok.body.token);
  assert.equal(places.body.places.length, 1);
  // Code is single-use.
  assert.equal((await call('POST', '/auth/otp/verify', { phone: '07701112233', code: req.body.devCode })).status, 400);
  // Immediate resend is throttled.
  await call('POST', '/auth/otp/request', { phone: '07709998877' });
  assert.equal((await call('POST', '/auth/otp/request', { phone: '07709998877' })).status, 429);
});

test('saved places: one home, many favorites, owner-only delete', async () => {
  const a = await guest(), b = await guest();
  await call('POST', '/places', { kind: 'home', lat: 33.3, lng: 44.3 }, a);
  await call('POST', '/places', { kind: 'home', lat: 33.4, lng: 44.4 }, a);
  const fav = await call('POST', '/places', { kind: 'favorite', label: 'Mutanabbi St', lat: 33.34, lng: 44.39 }, a);
  const list = (await call('GET', '/places', null, a)).body.places;
  assert.equal(list.filter((p) => p.kind === 'home').length, 1);
  assert.equal(list.find((p) => p.kind === 'home').lat, 33.4);
  assert.equal((await call('DELETE', `/places/${fav.body.place.id}`, null, b)).body.deleted, false);
  assert.equal((await call('DELETE', `/places/${fav.body.place.id}`, null, a)).body.deleted, true);
});

test('incidents: report, merge duplicates, preset comments only, vote away, live events', async () => {
  const reporter = await guest(), other = await guest(), third = await guest(), fourth = await guest();
  const socket = ioClient(base.replace('/v1', ''), { auth: { token: reporter }, transports: ['websocket'] });
  const events = [];
  socket.onAny((name, payload) => events.push([name, payload]));
  await new Promise((r) => socket.on('connect', r));

  assert.equal((await call('POST', '/incidents', { type: 'police', lat: 33.3, lng: 44.4 }, reporter)).status, 400);
  assert.equal((await call('POST', '/incidents', { type: 'jam', subtype: 'nope', lat: 33.3, lng: 44.4 }, reporter)).status, 400);

  const created = await call('POST', '/incidents', { type: 'accident', subtype: 'major', lat: 33.30, lng: 44.403 }, reporter);
  assert.equal(created.status, 201);
  const id = created.body.incident.id;

  const dup = await call('POST', '/incidents', { type: 'accident', lat: 33.3002, lng: 44.4031 }, other);
  assert.equal(dup.body.merged, true);
  assert.equal(dup.body.incident.id, id);

  assert.equal((await call('POST', `/incidents/${id}/comments`, { key: 'you are idiots' }, other)).status, 400);
  const c = await call('POST', `/incidents/${id}/comments`, { key: 'lane_blocked' }, other);
  assert.equal(c.status, 201);
  assert.deepEqual(c.body.incident.comments.map((x) => x.key), ['lane_blocked']);

  const listed = await call('GET', '/incidents?bbox=44.3,33.2,44.5,33.4', null, other);
  assert.equal(listed.body.incidents.length, 1);
  assert.equal((await call('GET', '/incidents?bbox=40,30,48,37', null, other)).status, 400);

  assert.equal((await call('POST', `/incidents/${id}/vote`, { still: false }, reporter)).status, 400); // own report
  // other confirmed via merge; three "not there" votes beat it by 2 → need net -3
  await call('POST', `/incidents/${id}/vote`, { still: false }, other);
  await call('POST', `/incidents/${id}/vote`, { still: false }, third);
  const last = await call('POST', `/incidents/${id}/vote`, { still: false }, fourth);
  assert.equal(last.body.removed, true);
  assert.equal((await call('GET', '/incidents?bbox=44.3,33.2,44.5,33.4', null, other)).body.incidents.length, 0);

  await new Promise((r) => setTimeout(r, 100));
  const names = events.map((e) => e[0]);
  assert.ok(names.includes('incident:new'));
  assert.ok(names.includes('incident:update'));
  assert.ok(names.includes('incident:removed'));
  socket.close();
});

test('socket rejects connections without a valid token', async () => {
  const s = ioClient(base.replace('/v1', ''), { auth: { token: 'nope' }, transports: ['websocket'], reconnection: false });
  const err = await new Promise((r) => s.on('connect_error', r));
  assert.equal(err.message, 'unauthorized');
  s.close();
});

test('route: traffic probes slow a road down and incidents re-rank routes', async () => {
  const t = await guest();
  const free = await call('POST', '/route', { from: { lat: 33.30, lng: 44.40 }, to: { lat: 33.30, lng: 44.41 } }, t);
  assert.equal(free.status, 200);
  assert.equal(free.body.routes[0].id, 'r0');
  assert.equal(Math.round(free.body.routes[0].duration), 100);
  assert.ok(free.body.routes[0].steps.length === 2);

  // Drivers crawling east at ~2 m/s (7 km/h) along the main road.
  const nowMs = Date.now();
  const points = [];
  for (let k = 0; k < 4; k++) for (let i = 0; i < 10; i++) {
    points.push({ lat: 33.30, lng: 44.4005 + i * 0.001, speed: 2, heading: 90, accuracy: 8, ts: nowMs - k * 1000 });
  }
  const pr = await call('POST', '/traffic/probes', { points }, t);
  assert.equal(pr.body.accepted, 40);
  // Bad samples are dropped.
  assert.equal((await call('POST', '/traffic/probes', { points: [{ lat: 33.3, lng: 44.4, speed: 999, heading: 90, ts: nowMs }] }, t)).body.accepted, 0);

  const slow = await call('POST', '/route', { from: { lat: 33.30, lng: 44.40 }, to: { lat: 33.30, lng: 44.41 } }, t);
  const main = slow.body.routes.find((r) => r.summary === 'Karrada St');
  assert.ok(main.duration > 300, `expected jam, got ${main.duration}`);
  assert.ok(main.trafficCoverage > 0.9);
  assert.equal(slow.body.routes[0].summary, 'Side road'); // the side road is now faster

  // A full road closure on the side road pushes it last.
  await call('POST', '/incidents', { type: 'closed', subtype: 'road', lat: 33.305, lng: 44.405 }, t);
  const closed = await call('POST', '/route', { from: { lat: 33.30, lng: 44.40 }, to: { lat: 33.30, lng: 44.41 } }, t);
  assert.equal(closed.body.routes[0].summary, 'Karrada St');
  assert.equal(closed.body.routes[1].blocked, true);
});

test('search and validation', async () => {
  const t = await guest();
  const r = await call('GET', '/search?q=' + encodeURIComponent('المتنبي') + '&lat=33.3&lng=44.4', null, t);
  assert.equal(r.body.results[0].name, 'المتنبي');
  assert.equal((await call('POST', '/route', { from: { lat: 200, lng: 1 }, to: { lat: 1, lng: 1 } }, t)).status, 400);
  assert.equal((await call('GET', '/nothing')).status, 404);
});
