import { API_URL } from './config';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | null; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'server_error');
  return data as T;
}

// ---- Shared types (mirror the backend responses) ---------------------------

export type User = {
  id: string;
  phone: string | null;
  isGuest: boolean;
  name: string | null;
  avatar: string | null;
  lang: string;
  points: number;
};

export type Place = {
  id: string;
  kind: 'home' | 'work' | 'favorite';
  label: string | null;
  address: string | null;
  lat: number;
  lng: number;
};

export type SearchResult = { id: string; name: string; address: string; category: string | null; lat: number; lng: number };

export type Step = {
  type: string;
  modifier: string | null;
  exit: number | null;
  location: [number, number];
  name: string | null;
  ref: string | null;
  distance: number;
  duration: number;
};

export type Route = {
  id: string;
  distance: number;
  baseDuration: number;
  duration: number;
  trafficDelay: number;
  trafficCoverage: number;
  blocked: boolean;
  incidents: string[];
  summary: string;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  steps: Step[];
};

export type Incident = {
  id: string;
  type: string;
  subtype: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  createdAt: number;
  expiresAt: number;
  confirms: number;
  denies: number;
  comments: { key: string; count: number; last: number }[];
};

export type LatLng = { lat: number; lng: number };
