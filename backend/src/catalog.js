// Incident catalog. Keys only: the app holds the Arabic / Kurdish / English labels.
// Drivers can only pick from these preset comments, so no free text, no abuse,
// and nothing to type while driving.
//
// Note: there is deliberately no "checkpoint / police" type. Security points are
// reported as a neutral "slowdown" until legal review says otherwise.

const MIN = 60 * 1000;

export const INCIDENT_TYPES = {
  jam: {
    ttl: 30 * MIN,
    subtypes: ['moderate', 'heavy', 'standstill'],
    comments: ['moving_slowly', 'completely_stopped', 'clearing_up', 'use_alternative'],
    routePenaltySec: { moderate: 60, heavy: 180, standstill: 300 },
  },
  accident: {
    ttl: 45 * MIN,
    subtypes: ['minor', 'major'],
    comments: ['lane_blocked', 'emergency_on_scene', 'cleared_to_side', 'use_alternative'],
    routePenaltySec: { minor: 90, major: 240 },
  },
  closed: {
    ttl: 120 * MIN,
    subtypes: ['road', 'lane'],
    comments: ['road_works', 'event', 'detour_available', 'use_alternative'],
    routePenaltySec: { road: 0, lane: 120 },
    blocksRoute: ['road'],
  },
  flooding: {
    ttl: 180 * MIN,
    subtypes: ['shallow', 'deep'],
    comments: ['passable_with_care', 'water_is_deep', 'cars_stuck', 'use_alternative'],
    routePenaltySec: { shallow: 120, deep: 600 },
  },
  hazard: {
    ttl: 60 * MIN,
    subtypes: ['pothole', 'object', 'stopped_vehicle', 'construction', 'animal'],
    comments: ['on_the_road', 'on_the_shoulder', 'drive_carefully', 'cleared'],
    routePenaltySec: {},
  },
  slowdown: {
    ttl: 40 * MIN,
    subtypes: [],
    comments: ['moving_slowly', 'long_queue', 'clearing_up', 'use_alternative'],
    routePenaltySec: { _: 120 },
  },
  visibility: {
    ttl: 90 * MIN,
    subtypes: ['dust', 'fog', 'smoke'],
    comments: ['very_low_visibility', 'drive_carefully', 'clearing_up'],
    routePenaltySec: {},
  },
};

export function isValidIncident(type, subtype) {
  const t = INCIDENT_TYPES[type];
  if (!t) return false;
  if (subtype == null || subtype === '') return true;
  return t.subtypes.includes(subtype);
}

export function isValidComment(type, key) {
  return Boolean(INCIDENT_TYPES[type]?.comments.includes(key));
}

export function penaltyFor(type, subtype) {
  const p = INCIDENT_TYPES[type]?.routePenaltySec || {};
  return p[subtype] ?? p._ ?? 0;
}

export function blocksRoute(type, subtype) {
  return Boolean(INCIDENT_TYPES[type]?.blocksRoute?.includes(subtype));
}
