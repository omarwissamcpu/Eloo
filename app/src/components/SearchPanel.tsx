// Full-screen search: Home / Work shortcuts, saved places, live results.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLng, Place, SearchResult } from '../api';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { fmtDistance } from '../format';
import { distance } from '../nav/geo';
import { Txt } from './ui';
import { radius, space } from '../theme';

export type Destination = { name: string; address: string; lat: number; lng: number };
export type SearchPurpose = 'go' | 'home' | 'work';

type Props = {
  purpose: SearchPurpose;
  near: LatLng | null;
  onPick: (d: Destination) => void;
  onClose: () => void;
  onAskSet: (kind: 'home' | 'work') => void;
};

export function SearchPanel({ purpose, near, onPick, onClose, onAskSet }: Props) {
  const { c, t, row, rtl } = useSettings();
  const { call, places } = useSession();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoading(true);
      try {
        const nearQs = near ? `&lat=${near.lat}&lng=${near.lng}` : '';
        const r = await call<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}${nearQs}`, { signal: ctrl.signal });
        setResults(r.results);
      } catch {
        // keep previous results
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q, near, call]);

  const home = places.find((p) => p.kind === 'home');
  const work = places.find((p) => p.kind === 'work');
  const favorites = places.filter((p) => p.kind === 'favorite');
  const fromPlace = (p: Place, fallback: string): Destination => ({ name: p.label || fallback, address: p.address || '', lat: p.lat, lng: p.lng });

  const shortcut = (kind: 'home' | 'work', p: Place | undefined) => (
    <Pressable
      key={kind}
      onPress={() => (p ? onPick(fromPlace(p, t(kind))) : onAskSet(kind))}
      style={({ pressed }) => [s.shortcut, { backgroundColor: c.cardAlt, flexDirection: row, opacity: pressed ? 0.7 : 1 }]}
    >
      <Txt size={22}>{kind === 'home' ? '🏠' : '💼'}</Txt>
      <View style={{ marginHorizontal: space(2), flex: 1 }}>
        <Txt weight="700">{t(kind)}</Txt>
        <Txt size={13} muted numberOfLines={1}>{p ? p.address || p.label || '' : t(kind === 'home' ? 'setHome' : 'setWork')}</Txt>
      </View>
    </Pressable>
  );

  const header = purpose === 'go' && q.trim().length < 2 ? (
    <View>
      <View style={{ flexDirection: row, gap: space(3), marginBottom: space(4) }}>
        {shortcut('home', home)}
        {shortcut('work', work)}
      </View>
      {favorites.length > 0 && <Txt weight="700" muted size={13} style={{ marginBottom: space(2) }}>{t('favorites')}</Txt>}
      {favorites.map((p) => (
        <Row key={p.id} icon="⭐" title={p.label || p.address || ''} subtitle={p.address || ''} onPress={() => onPick(fromPlace(p, ''))} />
      ))}
    </View>
  ) : purpose !== 'go' ? (
    <Txt muted style={{ marginBottom: space(3) }}>{t(purpose === 'home' ? 'setHome' : 'setWork')} · {t('setFromSearch')}</Txt>
  ) : undefined;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, paddingTop: insets.top + space(2) }]}>
      <View style={[s.bar, { flexDirection: row, backgroundColor: c.card, borderColor: c.border }]}>
        <Pressable onPress={onClose} hitSlop={12} style={{ paddingHorizontal: space(2) }}>
          <Txt size={22}>{rtl ? '→' : '←'}</Txt>
        </Pressable>
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={c.muted}
          returnKeyType="search"
          style={[s.input, { color: c.text, textAlign: rtl ? 'right' : 'left' }]}
        />
        {loading ? <ActivityIndicator style={{ marginHorizontal: space(2) }} /> : null}
      </View>
      <FlatList
        data={results}
        keyExtractor={(r) => r.id + r.lat}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space(4), paddingBottom: insets.bottom + space(8) }}
        ListHeaderComponent={header}
        ListEmptyComponent={q.trim().length >= 2 && !loading ? <Txt muted center style={{ marginTop: space(6) }}>{t('noResults')}</Txt> : undefined}
        renderItem={({ item }) => (
          <Row
            icon="📍"
            title={item.name}
            subtitle={item.address}
            trailing={near ? fmtDistance(distance([near.lng, near.lat], [item.lng, item.lat]), t) : undefined}
            onPress={() => onPick({ name: item.name, address: item.address, lat: item.lat, lng: item.lng })}
          />
        )}
      />
    </View>
  );
}

function Row({ icon, title, subtitle, trailing, onPress }: { icon: string; title: string; subtitle: string; trailing?: string; onPress: () => void }) {
  const { c, row } = useSettings();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, { flexDirection: row, borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
      <Txt size={20}>{icon}</Txt>
      <View style={{ flex: 1, marginHorizontal: space(3) }}>
        <Txt weight="600" numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt size={13} muted numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {trailing ? <Txt size={13} muted>{trailing}</Txt> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { marginHorizontal: space(4), borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', paddingHorizontal: space(2), minHeight: 54 },
  input: { flex: 1, fontSize: 17, paddingHorizontal: space(2), minHeight: 50 },
  shortcut: { flex: 1, borderRadius: radius.md, padding: space(3), alignItems: 'center' },
  row: { alignItems: 'center', paddingVertical: space(3.5), borderBottomWidth: StyleSheet.hairlineWidth },
});
