// App-wide configuration. Set EXPO_PUBLIC_API_URL in .env (see .env.example).

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/v1').replace(/\/$/, '');
export const SOCKET_URL = API_URL.replace(/\/v1$/, '');

// Free OpenStreetMap vector maps (OpenFreeMap). No key, no request limits.
// Self-host the tiles (or move to a paid provider) when traffic grows.
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

// Baghdad, Tahrir Square: where the map opens before GPS is ready.
export const DEFAULT_CENTER: [number, number] = [44.3874, 33.3333];

export const EMERGENCY_NUMBER = '911';

export const NAV = {
  offRouteMeters: 45, // further than this from the line counts as off route
  offRouteFixes: 3, // ...for this many GPS fixes in a row
  rerouteCooldownMs: 10000,
  arriveMeters: 30,
  probeUploadMs: 30000,
};
