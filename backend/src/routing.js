// Routing and place search. The app never talks to the map engines directly, so
// providers can be swapped (OSRM → Valhalla, Photon → own index) without an app update.
import { HttpError, lat, lng, str, num, h } from './util.js';
import { distanceToLine, bbox } from './geo.js';
import { penaltyFor, blocksRoute } from './catalog.js';

const PROFILES = { car: 'driving', bike: 'cycling', walk: 'foot' };
// Iraq, slightly padded. Search results are biased here.
const IRAQ_BBOX = [38.7, 29.0, 48.7, 37.4];

export function osrmProvider(baseUrl, fetchImpl = fetch) {
  return async function route({ from, to, via = [], mode = 'car', alternatives = true }) {
    const pts = [from, ...via, to].map((p) => `${p.lng},${p.lat}`).join(';');
    const qs = new URLSearchParams({
      alternatives: alternatives && via.length === 0 ? '3' : 'false',
      steps: 'true',
      geometries: 'geojson',
      overview: 'full',
      annotations: 'duration,speed',
    });
    const url = `${baseUrl}/route/v1/${PROFILES[mode] || 'driving'}/${pts}?${qs}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'eloo-backend/1.0' } });
    if (!res.ok) throw new HttpError(502, 'routing_unavailable');
    const data = await res.json();
    if (data.code === 'NoRoute') return [];
    if (data.code !== 'Ok') throw new HttpError(502, 'routing_failed');
    return data.routes;
  };
}

export function photonProvider(baseUrl, fetchImpl = fetch) {
  return async function search({ q, near, limit = 8 }) {
    const qs = new URLSearchParams({ q, limit: String(limit), bbox: IRAQ_BBOX.join(',') });
    if (near) { qs.set('lat', String(near.lat)); qs.set('lon', String(near.lng)); }
    const res = await fetchImpl(`${baseUrl}/api/?${qs}`, { headers: { 'User-Agent': 'eloo-backend/1.0' } });
    if (!res.ok) throw new HttpError(502, 'search_unavailable');
    const data = await res.json();
    return (data.features || []).map((f) => {
      const p = f.properties || {};
      const address = [p.street && [p.street, p.housenumber].filter(Boolean).join(' '), p.district, p.city || p.county, p.state]
        .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join('، ');
      return {
        id: `${p.osm_type || 'x'}${p.osm_id || ''}`,
        name: p.name || p.street || address,
        address,
        category: p.osm_value || p.osm_key || null,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      };
    });
  };
}

function simplifySteps(route) {
  const steps = [];
  for (const leg of route.legs) {
    for (const s of leg.steps) {
      steps.push({
        type: s.maneuver.type,          // turn, depart, arrive, roundabout, fork, merge, ...
        modifier: s.maneuver.modifier || null, // left, right, slight left, uturn, ...
        exit: s.maneuver.exit || null,  // roundabout exit number
        location: s.maneuver.location,  // [lng, lat]
        name: s.name || null,
        ref: s.ref || null,
        distance: s.distance,
        duration: s.duration,
      });
    }
  }
  return steps;
}

export function routingRoutes(router, auth, deps) {
  const { routeProvider, searchProvider, traffic, incidents } = deps;

  // body: { from: {lat,lng}, to: {lat,lng}, via?: [{lat,lng}], mode?: car|bike|walk, avoid?: ['incident ids'] }
  router.post('/route', auth, h(async (req, res) => {
    const b = req.body || {};
    const pt = (p, name) => {
      if (!p) throw new HttpError(400, 'missing_' + name);
      return { lat: lat(p.lat), lng: lng(p.lng) };
    };
    const from = pt(b.from, 'from');
    const to = pt(b.to, 'to');
    const via = Array.isArray(b.via) ? b.via.slice(0, 8).map((p) => pt(p, 'via')) : [];
    const mode = PROFILES[b.mode] ? b.mode : 'car';

    const raw = await routeProvider({ from, to, via, mode });
    if (!raw.length) return res.json({ routes: [] });

    const routes = raw.map((r, i) => {
      const coords = r.geometry.coordinates;
      let duration = r.duration, coverage = 0;
      if (mode === 'car') {
        const durs = [], speeds = [];
        for (const leg of r.legs) {
          durs.push(...(leg.annotation?.duration || []));
          speeds.push(...(leg.annotation?.speed || []));
        }
        if (durs.length) ({ duration, coverage } = traffic.adjustDuration(coords, durs, speeds));
      }

      // Incidents that sit on this route.
      const [minX, minY, maxX, maxY] = bbox(coords, 0.003);
      const onRoute = incidents.listInBox(minX, minY, maxX, maxY, 1000)
        .filter((inc) => distanceToLine([inc.lng, inc.lat], coords) < 30);
      let penalty = 0, blocked = false;
      for (const inc of onRoute) {
        penalty += penaltyFor(inc.type, inc.subtype);
        if (blocksRoute(inc.type, inc.subtype)) blocked = true;
      }

      return {
        id: `r${i}`,
        distance: r.distance,
        baseDuration: r.duration,
        duration: duration + penalty,
        trafficDelay: Math.max(0, duration + penalty - r.duration),
        trafficCoverage: Math.round(coverage * 100) / 100,
        blocked,
        incidents: onRoute.map((x) => x.id),
        summary: r.legs.map((l) => l.summary).filter(Boolean).join(' · '),
        geometry: { type: 'LineString', coordinates: coords },
        steps: simplifySteps(r),
      };
    });

    // Fastest open route first; blocked routes go last but stay visible.
    routes.sort((a, b) => (a.blocked - b.blocked) || (a.duration - b.duration));
    res.json({ routes });
  }));

  router.get('/search', auth, h(async (req, res) => {
    const q = str(req.query.q, 'q', { max: 120 });
    if (q.length < 2) return res.json({ results: [] });
    const near = req.query.lat != null && req.query.lng != null
      ? { lat: num(req.query.lat, 'lat', { min: -90, max: 90 }), lng: num(req.query.lng, 'lng', { min: -180, max: 180 }) }
      : null;
    res.json({ results: await searchProvider({ q, near }) });
  }));
}
