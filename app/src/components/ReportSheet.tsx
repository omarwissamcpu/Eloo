// Two taps to report: pick what you see, optionally how bad, send.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Incident, LatLng } from '../api';
import { INCIDENT_TYPES, type IncidentType } from '../catalog';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { errorKey } from '../errors';
import type { StringKey } from '../i18n/strings';
import { Btn, Chip, Sheet, Txt } from './ui';
import { radius, space } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  position: (LatLng & { heading?: number }) | null;
  onReported: (inc: Incident, message: string) => void;
};

export function ReportSheet({ visible, onClose, position, onReported }: Props) {
  const { c, t, row } = useSettings();
  const { call } = useSession();
  const [type, setType] = useState<IncidentType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setType(null);
      setError(null);
    }
  }, [visible]);

  const send = async (tp: IncidentType, subtype: string | null) => {
    if (!position) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ incident: Incident; merged: boolean }>('/incidents', {
        body: { type: tp.key, subtype, lat: position.lat, lng: position.lng, heading: position.heading ?? null },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onReported(r.incident, t(r.merged ? 'reportMerged' : 'reportSent'));
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt size={22} weight="800" style={{ marginBottom: space(4) }}>
        {type ? `${type.icon} ${t(('inc_' + type.key) as StringKey)}` : t('whatsHappening')}
      </Txt>

      {!type ? (
        <View style={[s.grid, { flexDirection: row }]}>
          {INCIDENT_TYPES.map((tp) => (
            <Pressable
              key={tp.key}
              disabled={!position || busy}
              onPress={() => (tp.subtypes.length ? setType(tp) : send(tp, null))}
              style={({ pressed }) => [s.tile, { backgroundColor: c.cardAlt, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[s.iconCircle, { backgroundColor: tp.color }]}>
                <Txt size={28} center>{tp.icon}</Txt>
              </View>
              <Txt size={14} weight="700" center numberOfLines={2}>{t(('inc_' + tp.key) as StringKey)}</Txt>
            </Pressable>
          ))}
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: row, flexWrap: 'wrap' }}>
            {type.subtypes.map((st) => (
              <Chip key={st} label={t(('sub_' + st) as StringKey)} onPress={() => send(type, st)} />
            ))}
          </View>
          <Btn title={t('sendNow')} loading={busy} onPress={() => send(type, null)} style={{ marginTop: space(3) }} />
          <Btn title={t('back')} variant="ghost" onPress={() => setType(null)} style={{ marginTop: space(1) }} />
        </View>
      )}
      {error ? <Txt style={{ color: c.danger, marginTop: space(3) }} weight="600">{error}</Txt> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  grid: { flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '31%', borderRadius: radius.md, paddingVertical: space(3), paddingHorizontal: space(1), alignItems: 'center', marginBottom: space(3) },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space(2) },
});
