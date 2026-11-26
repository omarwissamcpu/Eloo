// Route preview: alternatives with traffic delay, save the place, Go.
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Route } from '../api';
import { useSettings } from '../state/settings';
import { fmtClock, fmtDistance, fmtDuration } from '../format';
import { Btn, Card, Txt } from './ui';
import { radius, space } from '../theme';
import type { Destination } from './SearchPanel';

type Props = {
  destination: Destination;
  routes: Route[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGo: () => void;
  onClose: () => void;
  onSave: () => void;
  saved: boolean;
  bottomInset: number;
};

export function RoutePanel({ destination, routes, loading, error, selectedId, onSelect, onGo, onClose, onSave, saved, bottomInset }: Props) {
  const { c, t, row, effectiveLang } = useSettings();
  const fastest = routes.filter((r) => !r.blocked).reduce<Route | null>((a, r) => (!a || r.duration < a.duration ? r : a), null);

  return (
    <Card style={[s.wrap, { paddingBottom: bottomInset + space(4) }]}>
      <View style={{ flexDirection: row, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Txt size={19} weight="800" numberOfLines={1}>{destination.name}</Txt>
          {destination.address ? <Txt size={13} muted numberOfLines={1}>{destination.address}</Txt> : null}
        </View>
        <Pressable onPress={onSave} hitSlop={10} style={s.icon} accessibilityLabel={t('save')}>
          <Txt size={22}>{saved ? '⭐' : '☆'}</Txt>
        </Pressable>
        <Pressable onPress={onClose} hitSlop={10} style={s.icon} accessibilityLabel={t('close')}>
          <Txt size={22} muted>✕</Txt>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={c.primary} />
          <Txt muted style={{ marginTop: space(2) }}>{t('calculating')}</Txt>
        </View>
      ) : error ? (
        <View style={s.center}><Txt style={{ color: c.danger }} weight="600">{error}</Txt></View>
      ) : routes.length === 0 ? (
        <View style={s.center}><Txt muted>{t('noRoute')}</Txt></View>
      ) : (
        <ScrollView style={{ maxHeight: 230, marginTop: space(3) }}>
          {routes.map((r) => {
            const active = r.id === selectedId;
            const delayMin = Math.round(r.trafficDelay / 60);
            return (
              <Pressable
                key={r.id}
                onPress={() => onSelect(r.id)}
                style={[s.route, { flexDirection: row, borderColor: active ? c.primary : c.border, backgroundColor: active ? c.cardAlt : 'transparent' }]}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: row, alignItems: 'center', gap: space(2) }}>
                    <Txt size={20} weight="800" style={{ color: delayMin >= 5 ? c.warning : c.text }}>{fmtDuration(r.duration, t)}</Txt>
                    {fastest?.id === r.id && routes.length > 1 ? (
                      <View style={[s.badge, { backgroundColor: c.success }]}><Txt size={12} weight="700" style={{ color: '#fff' }}>{t('fastest')}</Txt></View>
                    ) : null}
                  </View>
                  <Txt size={13} muted numberOfLines={1}>
                    {fmtDistance(r.distance, t)} · {t('arriveAt', { time: fmtClock(new Date(Date.now() + r.duration * 1000), effectiveLang) })}
                    {r.summary ? ` · ${r.summary}` : ''}
                  </Txt>
                  {delayMin >= 1 ? <Txt size={13} weight="600" style={{ color: c.warning }}>{t('trafficDelay', { min: delayMin })}</Txt> : null}
                  {r.blocked ? <Txt size={13} weight="700" style={{ color: c.danger }}>⛔ {t('blocked')}</Txt> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Btn title={t('go')} icon="➤" onPress={onGo} disabled={loading || !selectedId} style={{ marginTop: space(4) }} />
    </Card>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  icon: { paddingHorizontal: space(2), paddingVertical: space(1) },
  center: { alignItems: 'center', paddingVertical: space(6) },
  route: { borderWidth: 2, borderRadius: radius.md, padding: space(3), marginBottom: space(2) },
  badge: { borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: 2 },
});
