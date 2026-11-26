// Must match backend/src/catalog.js. Labels live in i18n/strings.ts (inc_*, sub_*, cm_*).

export type IncidentType = {
  key: string;
  icon: string;
  color: string;
  subtypes: string[];
  comments: string[];
};

export const INCIDENT_TYPES: IncidentType[] = [
  { key: 'jam', icon: '🚗', color: '#F97316', subtypes: ['moderate', 'heavy', 'standstill'], comments: ['moving_slowly', 'completely_stopped', 'clearing_up', 'use_alternative'] },
  { key: 'accident', icon: '💥', color: '#E5303A', subtypes: ['minor', 'major'], comments: ['lane_blocked', 'emergency_on_scene', 'cleared_to_side', 'use_alternative'] },
  { key: 'closed', icon: '⛔', color: '#B91C1C', subtypes: ['road', 'lane'], comments: ['road_works', 'event', 'detour_available', 'use_alternative'] },
  { key: 'flooding', icon: '🌊', color: '#0EA5E9', subtypes: ['shallow', 'deep'], comments: ['passable_with_care', 'water_is_deep', 'cars_stuck', 'use_alternative'] },
  { key: 'hazard', icon: '⚠️', color: '#F59E0B', subtypes: ['pothole', 'object', 'stopped_vehicle', 'construction', 'animal'], comments: ['on_the_road', 'on_the_shoulder', 'drive_carefully', 'cleared'] },
  { key: 'slowdown', icon: '🐢', color: '#8B5CF6', subtypes: [], comments: ['moving_slowly', 'long_queue', 'clearing_up', 'use_alternative'] },
  { key: 'visibility', icon: '🌫️', color: '#64748B', subtypes: ['dust', 'fog', 'smoke'], comments: ['very_low_visibility', 'drive_carefully', 'clearing_up'] },
];

export const typeOf = (key: string) => INCIDENT_TYPES.find((t) => t.key === key) || INCIDENT_TYPES[4];

export const AVATARS = {
  male: [
    { id: 'm1', emoji: '👨', bg: '#DBEAFE' },
    { id: 'm2', emoji: '🧔', bg: '#DCFCE7' },
    { id: 'm3', emoji: '👨‍🦱', bg: '#FEF3C7' },
    { id: 'm4', emoji: '👴', bg: '#EDE9FE' },
  ],
  female: [
    { id: 'f1', emoji: '👩', bg: '#FCE7F3' },
    { id: 'f2', emoji: '🧕', bg: '#E0F2FE' },
    { id: 'f3', emoji: '👩‍🦱', bg: '#FFEDD5' },
    { id: 'f4', emoji: '👵', bg: '#F3E8FF' },
  ],
};

export const avatarById = (id: string | null | undefined) =>
  [...AVATARS.male, ...AVATARS.female].find((a) => a.id === id) || { id: 'none', emoji: '🙂', bg: '#E5E7EB' };
