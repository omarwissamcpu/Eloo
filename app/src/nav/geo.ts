export type LngLat = [number, number];

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Cumulative distance (m) at each vertex of a line. */
export function cumulative(coords: LngLat[]) {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + distance(coords[i - 1], coords[i]));
  return out;
}

/** Projects a point on a line: distance from the line, and distance travelled along it. */
export function project(p: LngLat, coords: LngLat[], cum: number[], fromIndex = 0, window = 400) {
  const k = Math.cos(rad(p[1]));
  let best = { dist: Infinity, along: 0, index: fromIndex };
  const end = Math.min(coords.length - 1, fromIndex + window);
  for (let i = Math.max(0, fromIndex - 5); i < end; i++) {
    const a = coords[i], b = coords[i + 1];
    const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
    const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const x = ax + t * dx, y = ay + t * dy;
    const dist = Math.sqrt(x * x + y * y) * rad(1) * R;
    if (dist < best.dist) best = { dist, along: cum[i] + t * (cum[i + 1] - cum[i]), index: i };
  }
  return best;
}

/** Index of the vertex closest to a point (used to place maneuvers on the line). */
export function nearestVertex(p: LngLat, coords: LngLat[], from = 0) {
  let bi = from, bd = Infinity;
  for (let i = from; i < coords.length; i++) {
    const d = Math.abs(coords[i][0] - p[0]) + Math.abs(coords[i][1] - p[1]);
    if (d < bd) { bd = d; bi = i; }
    if (d < 1e-7) break;
  }
  return bi;
}

export function bounds(coords: LngLat[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (y < s) s = y;
    if (x > e) e = x;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}
