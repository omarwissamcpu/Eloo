// Small geo helpers: distances, bearings, geohash, point-to-line distance.

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Buckets are centred on N, NE, E, ... so a road heading due east never flips between two buckets.
export const headingBucket = (deg) => Math.floor(((((deg % 360) + 360) % 360) + 22.5) / 45) % 8;

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export function geohash(lat, lng, precision = 7) {
  let latR = [-90, 90];
  let lngR = [-180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    const r = even ? lngR : latR;
    const v = even ? lng : lat;
    const mid = (r[0] + r[1]) / 2;
    if (v >= mid) {
      ch |= 1 << (4 - bit);
      r[0] = mid;
    } else {
      r[1] = mid;
    }
    even = !even;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// Distance in metres from point P to segment AB, using a local flat projection
// (accurate to well under a metre at city scale).
export function pointToSegment(p, a, b) {
  const k = Math.cos(toRad(p[1]));
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return Math.sqrt(x * x + y * y) * (Math.PI / 180) * R;
}

// coords: [[lng, lat], ...]
export function distanceToLine(point, coords) {
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const d = pointToSegment(point, coords[i - 1], coords[i]);
    if (d < best) best = d;
  }
  return best;
}

export function bbox(coords, padDeg = 0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX - padDeg, minY - padDeg, maxX + padDeg, maxY + padDeg];
}
