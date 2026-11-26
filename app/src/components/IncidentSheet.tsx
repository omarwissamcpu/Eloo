// Incident details: what, when, how far, preset comments, still there / not there.
import React, { useState } from 'react';
import { View } from 'react-native';
import type { Incident, LatLng } from '../api';
import { typeOf } from '../catalog';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { fmtAgo, fmtDistance } from '../format';
import { distance } from '../nav/geo';
import { errorKey } from '../errors';
import type { StringKey } from '../i18n/strings';
import { Btn, Chip, Sheet, Txt } from './ui';
import { space } from '../theme';

type Props = {
  incident: Incident | null;
  me: LatLng | null;
  onClose: () => void;
  onChanged: (inc: Incident) => void;
  onRemoved: (id: string) => void;
};

export function IncidentSheet({ incident, me, onClose, onChanged, onRemoved }: Props) {
  const { c, t, row } = useSettings();
  const { call } = useSession();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!incident) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const type = typeOf(incident.type);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote(t('thanks'));
    } catch (e) {
      setNote(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const vote = (still: boolean) =>
    act(async () => {
      const r = await call<{ incident?: Incident; removed?: boolean }>(`/incidents/${incident.id}/vote`, { body: { still } });
      if (r.removed) {
        onRemoved(incident.id);
        onClose();
      } else if (r.incident) onChanged(r.incident);
    });

  const comment = (key: string) =>
    act(async () => {
      const r = await call<{ incident: Incident }>(`/incidents/${incident.id}/comments`, { body: { key } });
      onChanged(r.incident);
    });

  const counts = Object.fromEntries(incident.comments.map((x) => [x.key, x.count]));

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ flexDirection: row, alignItems: 'center', marginBottom: space(1) }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: type.color, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={26}>{type.icon}</Txt>
        </View>
        <View style={{ flex: 1, marginHorizontal: space(3) }}>
          <Txt size={20} weight="800">
            {t(('inc_' + type.key) as StringKey)}
            {incident.subtype ? ` · ${t(('sub_' + incident.subtype) as StringKey)}` : ''}
          </Txt>
          <Txt muted size={14}>
            {fmtAgo(incident.createdAt, t)}
            {me ? ` · ${t('away', { d: fmtDistance(distance([me.lng, me.lat], [incident.lng, incident.lat]), t) })}` : ''}
            {incident.confirms > 0 ? ` · ${t('confirmed', { n: incident.confirms })}` : ''}
          </Txt>
        </View>
      </View>

      <Txt weight="700" muted size={13} style={{ marginTop: space(4), marginBottom: space(2) }}>{t('quickUpdate')}</Txt>
      <View style={{ flexDirection: row, flexWrap: 'wrap' }}>
        {type.comments.map((k) => (
          <Chip key={k} label={`${t(('cm_' + k) as StringKey)}${counts[k] ? ` · ${counts[k]}` : ''}`} active={Boolean(counts[k])} onPress={() => !busy && comment(k)} />
        ))}
      </View>

      <View style={{ flexDirection: row, gap: space(3), marginTop: space(4) }}>
        <Btn title={t('stillThere')} icon="👍" onPress={() => vote(true)} disabled={busy} style={{ flex: 1 }} />
        <Btn title={t('notThere')} icon="👎" variant="secondary" onPress={() => vote(false)} disabled={busy} style={{ flex: 1 }} />
      </View>
      {note ? <Txt center weight="600" style={{ marginTop: space(3), color: note === t('thanks') ? c.success : c.danger }}>{note}</Txt> : null}
    </Sheet>
  );
}
