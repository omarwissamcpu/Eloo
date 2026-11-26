// Active turn-by-turn navigation: follows GPS, tracks progress along the route,
// speaks instructions, re-routes when the driver leaves the route, and shares
// anonymous speed samples so everyone gets live traffic.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { Route, Step } from '../api';
import type { Lang } from '../i18n/strings';
import { NAV } from '../config';
import { cumulative, nearestVertex, project, type LngLat } from './geo';
import { instruction, isSilent, thenText, withDistance } from './instructions';
import { say, speechLang, stopSpeaking, voices } from './voice';

export type NavState = {
  route: Route;
  position: { coord: LngLat; heading: number; speed: number; accuracy: number } | null;
  next: Step | null;
  after: Step | null;
  distanceToNext: number;
  remainingDistance: number;
  remainingDuration: number;
  rerouting: boolean;
  arrived: boolean;
  weakGps: boolean;
};

type Options = {
  initialRoute: Route;
  lang: Lang;
  voiceOn: boolean;
  voiceId: string | null;
  reroute: (from: LngLat, heading: number) => Promise<Route | null>;
  sendProbes: (points: object[]) => Promise<unknown>;
};

export function useNavigation({ initialRoute, lang, voiceOn, voiceId, reroute, sendProbes }: Options): NavState {
  const [route, setRoute] = useState(initialRoute);
  const [position, setPosition] = useState<NavState['position']>(null);
  const [along, setAlong] = useState(0);
  const [rerouting, setRerouting] = useState(false);
  const [arrived, setArrived] = useState(false);

  const prepared = useMemo(() => {
    const coords = route.geometry.coordinates as LngLat[];
    const cum = cumulative(coords);
    let from = 0;
    const stepAlong = route.steps.map((s) => {
      from = nearestVertex(s.location, coords, from);
      return cum[from];
    });
    return { coords, cum, stepAlong, total: cum[cum.length - 1] || route.distance };
  }, [route]);

  // Mutable progress that must not trigger re-renders.
  const r = useRef({ index: 0, off: 0, lastReroute: 0, spoken: new Set<string>(), probes: [] as object[], arrived: false });
  const voiceRef = useRef({ on: voiceOn, lang: lang as Lang, id: voiceId as string | null });

  // Work out which language/voice the phone can actually speak.
  useEffect(() => {
    let alive = true;
    (async () => {
      const sl = await speechLang(lang);
      const all = await voices();
      const chosen = all.find((v) => v.identifier === voiceId);
      const idOk = chosen && chosen.language?.toLowerCase().startsWith(sl === 'ckb' ? 'ckb' : sl);
      if (alive) voiceRef.current = { on: voiceOn, lang: sl, id: idOk ? voiceId : null };
    })();
    return () => { alive = false; };
  }, [lang, voiceOn, voiceId]);

  const speak = (key: string, text: string) => {
    if (r.current.spoken.has(key)) return;
    r.current.spoken.add(key);
    if (voiceRef.current.on) say(text, voiceRef.current.lang, voiceRef.current.id);
  };

  const nextIndex = (a: number) => {
    const { stepAlong } = prepared;
    for (let i = 0; i < route.steps.length; i++) {
      if (stepAlong[i] > a + 3 && !isSilent(route.steps[i])) return i;
    }
    return route.steps.length - 1;
  };

  // Keep the screen on and follow GPS while navigating.
  useEffect(() => {
    activateKeepAwakeAsync('eloo-nav').catch(() => {});
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 3 },
      (loc) => onFix(loc),
    ).then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    }).catch(() => {});

    const uploader = setInterval(() => {
      const batch = r.current.probes.splice(0, 120);
      if (batch.length) sendProbes(batch).catch(() => {});
    }, NAV.probeUploadMs);

    return () => {
      cancelled = true;
      sub?.remove();
      clearInterval(uploader);
      deactivateKeepAwake('eloo-nav').catch(() => {});
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fresh closure for each route so onFix always sees the current one.
  const onFixRef = useRef<(loc: Location.LocationObject) => void>(() => {});
  const onFix = (loc: Location.LocationObject) => onFixRef.current(loc);

  onFixRef.current = (loc) => {
    if (r.current.arrived) return;
    const coord: LngLat = [loc.coords.longitude, loc.coords.latitude];
    const speed = Math.max(0, loc.coords.speed ?? 0);
    const heading = loc.coords.heading ?? 0;
    const accuracy = loc.coords.accuracy ?? 99;
    setPosition({ coord, heading, speed, accuracy });

    if (speed > 0.5 && heading >= 0 && accuracy <= 40) {
      r.current.probes.push({ lat: coord[1], lng: coord[0], speed, heading, accuracy, ts: loc.timestamp });
    }

    const { coords, cum, stepAlong, total } = prepared;
    const proj = project(coord, coords, cum, r.current.index);
    r.current.index = proj.index;

    // Off route → ask for a new route (not too often).
    if (proj.dist > NAV.offRouteMeters && accuracy < 35) r.current.off++;
    else r.current.off = 0;
    if (r.current.off >= NAV.offRouteFixes && Date.now() - r.current.lastReroute > NAV.rerouteCooldownMs) {
      r.current.lastReroute = Date.now();
      r.current.off = 0;
      setRerouting(true);
      reroute(coord, heading)
        .then((nr) => {
          if (!nr) return;
          r.current.index = 0;
          r.current.spoken = new Set();
          setAlong(0);
          setRoute(nr);
        })
        .finally(() => setRerouting(false));
      return;
    }

    const a = proj.along;
    setAlong(a);
    const remaining = total - a;
    if (remaining < NAV.arriveMeters) {
      r.current.arrived = true;
      setArrived(true);
      speak('arrive', instruction(route.steps[route.steps.length - 1], voiceRef.current.lang));
      return;
    }

    const i = nextIndex(a);
    const step = route.steps[i];
    const d = stepAlong[i] - a;
    const sl = voiceRef.current.lang;
    const text = instruction(step, sl);
    const farAt = speed > 20 ? 1500 : speed > 12 ? 800 : 400;
    const nearAt = Math.max(60, speed * 7);

    if (!r.current.spoken.has('start')) {
      r.current.spoken.add('start');
      if (d > nearAt) speak(`${i}:far`, withDistance(text, d, sl));
    }
    if (d <= farAt && d > nearAt * 2.5) speak(`${i}:far`, withDistance(text, d, sl));
    else if (d <= nearAt) {
      // Chain the following maneuver when it comes right after this one.
      const j = i + 1 < route.steps.length ? i + 1 : -1;
      const soon = j > 0 && stepAlong[j] - stepAlong[i] < 150 && !isSilent(route.steps[j]);
      const comma = sl === 'en' ? ', ' : '، ';
      speak(`${i}:now`, soon ? `${text}${comma}${thenText(instruction(route.steps[j], sl), sl)}` : text);
    }
  };

  const i = nextIndex(along);
  const next = route.steps[i] || null;
  let after: Step | null = null;
  for (let j = i + 1; j < route.steps.length; j++) if (!isSilent(route.steps[j])) { after = route.steps[j]; break; }
  const remainingDistance = Math.max(0, prepared.total - along);

  return {
    route,
    position,
    next,
    after,
    distanceToNext: Math.max(0, (prepared.stepAlong[i] ?? 0) - along),
    remainingDistance,
    remainingDuration: route.duration * (remainingDistance / Math.max(1, prepared.total)),
    rerouting,
    arrived,
    weakGps: (position?.accuracy ?? 0) > 50,
  };
}
