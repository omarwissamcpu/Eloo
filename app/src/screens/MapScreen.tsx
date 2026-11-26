// The main screen. Modes: browse the map → preview routes → navigate.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import type { Incident, LatLng, Route } from '../api';
import { EMERGENCY_NUMBER } from '../config';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useIncidents } from '../hooks/useIncidents';
import { useNavigation } from '../nav/useNavigation';
import { bounds, type LngLat } from '../nav/geo';
import { errorKey } from '../errors';
import { ElooMap } from '../components/ElooMap';
import { SearchPanel, type Destination, type SearchPurpose } from '../components/SearchPanel';
import { RoutePanel } from '../components/RoutePanel';
import { NavPanel } from '../components/NavPanel';
import { ReportSheet } from '../components/ReportSheet';
import { IncidentSheet } from '../components/IncidentSheet';
import { Avatar, Btn, Card, RoundButton, Txt, shadowStyle } from '../components/ui';
import { Settings } from './Settings';
import { radius, space } from '../theme';

type Me = LatLng & { heading: number };

export function MapScreen() {
  const { c, t, row, voiceOn, voiceId, effectiveLang } = useSettings();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const { incidents, loadArea, upsert, remove } = useIncidents();

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<'browse' | 'preview' | 'nav'>('browse');
  const [search, setSearch] = useState<SearchPurpose | null>(null);
  const [backToSettings, setBackToSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const centeredOnce = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3500);
  }, []);

  // ---- Location ------------------------------------------------------------
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 10 }, (loc) => {
        const next = { lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading ?? 0 };
        setMe(next);
        if (!centeredOnce.current) {
          centeredOnce.current = true;
          camera.current?.flyTo({ center: [next.lng, next.lat], zoom: 15, duration: 800 });
        }
      });
    })().catch(() => setPermission('denied'));
    return () => sub?.remove();
  }, []);

  const recenter = () => me && camera.current?.flyTo({ center: [me.lng, me.lat], zoom: 15, duration: 600 });

  // ---- Routing -------------------------------------------------------------
  const fetchRoutes = useCallback(
    async (from: LatLng, to: LatLng) => (await session.call<{ routes: Route[] }>('/route', { body: { from, to, mode: 'car' } })).routes,
    [session],
  );

  const preview = useCallback(
    async (d: Destination) => {
      setDestination(d);
      setMode('preview');
      setRoutes([]);
      setSelectedId(null);
      setRouteError(null);
      if (!me) {
        setRouteError(t('locationNeeded'));
        camera.current?.flyTo({ center: [d.lng, d.lat], zoom: 15, duration: 600 });
        return;
      }
      setRouteLoading(true);
      try {
        const rs = await fetchRoutes(me, d);
        setRoutes(rs);
        setSelectedId(rs[0]?.id ?? null);
        if (rs.length) {
          const all = rs.flatMap((r) => r.geometry.coordinates) as LngLat[];
          camera.current?.fitBounds(bounds(all), { padding: { top: insets.top + 80, bottom: 380, left: 40, right: 40 }, duration: 700 });
        }
      } catch (e) {
        setRouteError(t(errorKey(e)));
      } finally {
        setRouteLoading(false);
      }
    },
    [me, fetchRoutes, insets.top, t],
  );

  const closePreview = () => {
    setMode('browse');
    setRoutes([]);
    setDestination(null);
  };

  const onPick = async (d: Destination) => {
    const purpose = search;
    setSearch(null);
    if (purpose === 'home' || purpose === 'work') {
      try {
        await session.savePlace({ kind: purpose, label: t(purpose), address: [d.name, d.address].filter(Boolean).join('، '), lat: d.lat, lng: d.lng });
        showToast(t('saved'));
      } catch (e) {
        showToast(t(errorKey(e)));
      }
      if (backToSettings) setShowSettings(true);
      setBackToSettings(false);
      return;
    }
    preview(d);
  };

  const isSaved = !!destination && session.places.some((p) => Math.abs(p.lat - destination.lat) < 1e-5 && Math.abs(p.lng - destination.lng) < 1e-5);

  // ---- Screens -------------------------------------------------------------
  if (showSettings) {
    return (
      <Settings
        onClose={() => setShowSettings(false)}
        onSetPlace={(kind) => {
          setShowSettings(false);
          setBackToSettings(true);
          setSearch(kind);
        }}
      />
    );
  }

  const selected = routes.find((r) => r.id === selectedId) || null;
  const bottomInset = mode === 'preview' ? 330 : mode === 'nav' ? 110 : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ElooMap
        ref={camera}
        navigating={mode === 'nav'}
        routes={mode === 'nav' && selected ? [selected] : routes}
        selectedRouteId={selectedId}
        onSelectRoute={setSelectedId}
        incidents={incidents}
        onIncidentPress={setOpenIncident}
        destination={destination}
        onLongPress={mode === 'browse' ? (p) => preview({ name: t('droppedPin'), address: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, ...p }) : undefined}
        onAreaChange={loadArea}
        bottomInset={bottomInset}
      />

      {mode === 'browse' && (
        <>
          <View style={[s.topBar, { top: insets.top + space(2), flexDirection: row }]}>
            <Pressable onPress={() => setSearch('go')} style={[s.searchPill, { backgroundColor: c.card, flexDirection: row }]}>
              <Txt size={18}>🔍</Txt>
              <Txt muted size={17} style={{ flex: 1, marginHorizontal: space(2) }}>{t('searchPlaceholder')}</Txt>
            </Pressable>
            <Pressable onPress={() => setShowSettings(true)} style={[s.avatarBtn, { backgroundColor: c.card }]} accessibilityLabel={t('settings')}>
              <Avatar id={session.user?.avatar} size={44} />
            </Pressable>
          </View>

          {permission === 'denied' && (
            <Card style={[s.permission, { top: insets.top + 80 }]}>
              <Txt weight="800">{t('locationNeeded')}</Txt>
              <Txt muted size={14} style={{ marginVertical: space(2) }}>{t('locationNeededBody')}</Txt>
              <Btn small title={t('openSettings')} onPress={() => Linking.openSettings()} />
            </Card>
          )}

          <View style={[s.sideStack, { bottom: insets.bottom + space(8), [row === 'row' ? 'right' : 'left']: space(4) }]}>
            <RoundButton icon="◎" label="My location" onPress={recenter} style={{ marginBottom: space(3) }} />
            <RoundButton icon="⚠️" label={t('report')} onPress={() => setReportOpen(true)} color={c.warning} />
          </View>
        </>
      )}

      {mode !== 'preview' && (
        <Pressable
          onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}
          accessibilityRole="button"
          accessibilityLabel={t('call911')}
          style={({ pressed }) => [
            s.sos,
            { backgroundColor: c.danger, opacity: pressed ? 0.85 : 1, bottom: (mode === 'nav' ? 110 + space(10) : insets.bottom + space(8)), [row === 'row' ? 'left' : 'right']: space(4) },
          ]}
        >
          <Txt size={13} weight="800" style={{ color: '#fff' }} center>SOS</Txt>
          <Txt size={18} weight="800" style={{ color: '#fff' }} center>{EMERGENCY_NUMBER}</Txt>
        </Pressable>
      )}

      {mode === 'preview' && destination && (
        <RoutePanel
          destination={destination}
          routes={routes}
          loading={routeLoading}
          error={routeError}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onClose={closePreview}
          saved={isSaved}
          onSave={() => {
            if (isSaved) return;
            session.savePlace({ kind: 'favorite', label: destination.name, address: destination.address, lat: destination.lat, lng: destination.lng })
              .then(() => showToast(t('saved')))
              .catch((e) => showToast(t(errorKey(e))));
          }}
          onGo={() => selected && setMode('nav')}
          bottomInset={insets.bottom}
        />
      )}

      {mode === 'nav' && selected && destination && (
        <ActiveNav
          route={selected}
          destination={destination}
          lang={effectiveLang}
          voiceOn={voiceOn && !muted}
          voiceId={voiceId}
          fetchRoutes={fetchRoutes}
          sendProbes={(points) => session.call('/traffic/probes', { body: { points } })}
          onRouteChange={(r) => {
            setRoutes([r]);
            setSelectedId(r.id);
          }}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onReport={() => setReportOpen(true)}
          onEnd={() => {
            closePreview();
            recenter();
          }}
          onPosition={(p) => setMe(p)}
        />
      )}

      {search && <SearchPanel purpose={search} near={me} onPick={onPick} onClose={() => { setSearch(null); if (backToSettings) { setBackToSettings(false); setShowSettings(true); } }} onAskSet={(k) => setSearch(k)} />}

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} position={me} onReported={(inc, msg) => { upsert(inc); showToast(msg); }} />
      <IncidentSheet incident={openIncident} me={me} onClose={() => setOpenIncident(null)} onChanged={(inc) => { upsert(inc); setOpenIncident(inc); }} onRemoved={remove} />

      {toast && (
        <View pointerEvents="none" style={[s.toast, { top: insets.top + (mode === 'nav' ? 140 : 76), backgroundColor: c.text }]}>
          <Txt center weight="700" style={{ color: c.bg }}>{toast}</Txt>
        </View>
      )}
    </View>
  );
}

// Lives only while driving, so the GPS/voice hook starts and stops with navigation.
function ActiveNav(props: {
  route: Route;
  destination: Destination;
  lang: ReturnType<typeof useSettings>['effectiveLang'];
  voiceOn: boolean;
  voiceId: string | null;
  fetchRoutes: (from: LatLng, to: LatLng) => Promise<Route[]>;
  sendProbes: (points: object[]) => Promise<unknown>;
  onRouteChange: (r: Route) => void;
  muted: boolean;
  onToggleMute: () => void;
  onReport: () => void;
  onEnd: () => void;
  onPosition: (p: Me) => void;
}) {
  const nav = useNavigation({
    initialRoute: props.route,
    lang: props.lang,
    voiceOn: props.voiceOn,
    voiceId: props.voiceId,
    sendProbes: props.sendProbes,
    reroute: async (from) => {
      const rs = await props.fetchRoutes({ lng: from[0], lat: from[1] }, props.destination);
      return rs[0] ?? null;
    },
  });

  const { onRouteChange, onPosition } = props;
  useEffect(() => {
    if (nav.route !== props.route) onRouteChange(nav.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.route]);
  useEffect(() => {
    if (nav.position) onPosition({ lng: nav.position.coord[0], lat: nav.position.coord[1], heading: nav.position.heading });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.position]);

  return <NavPanel nav={nav} muted={props.muted} onToggleMute={props.onToggleMute} onEnd={props.onEnd} onReport={props.onReport} />;
}

const s = StyleSheet.create({
  topBar: { position: 'absolute', left: space(4), right: space(4), alignItems: 'center', gap: space(3) },
  searchPill: { flex: 1, minHeight: 56, borderRadius: radius.pill, alignItems: 'center', paddingHorizontal: space(5), ...shadowStyle },
  avatarBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...shadowStyle },
  permission: { position: 'absolute', left: space(4), right: space(4) },
  sideStack: { position: 'absolute' },
  sos: { position: 'absolute', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...shadowStyle },
  toast: { position: 'absolute', left: space(8), right: space(8), borderRadius: radius.md, padding: space(3), opacity: 0.95 },
});
