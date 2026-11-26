import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;

export const now = () => Date.now();

export function num(v, name, { min = -Infinity, max = Infinity } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, 'invalid_' + name);
  }
  return n;
}

export function str(v, name, { max = 200, optional = false } = {}) {
  if (v == null || v === '') {
    if (optional) return null;
    throw new HttpError(400, 'missing_' + name);
  }
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, 'invalid_' + name);
  return v.trim();
}

export const lat = (v) => num(v, 'lat', { min: -90, max: 90 });
export const lng = (v) => num(v, 'lng', { min: -180, max: 180 });

// Simple in-memory sliding-window limiter. Use Redis when running several servers.
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      return false;
    }
    arr.push(t);
    hits.set(key, arr);
    if (hits.size > 50000) hits.clear();
    return true;
  };
}

// Express 5 forwards async errors itself; this keeps handlers short.
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
