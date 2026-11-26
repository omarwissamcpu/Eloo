// Driving view: next turn on top, arrival info and big buttons at the bottom.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavState } from '../nav/useNavigation';
import { glyph, instruction } from '../nav/instructions';
import { useSettings } from '../state/settings';
import { fmtClock, fmtDistance, fmtDuration } from '../format';
import { Btn, Card, RoundButton, Txt } from './ui';
import { radius, space } from '../theme';

type Props = {
  nav: NavState;
  muted: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  onReport: () => void;
};

export function NavPanel({ nav, muted, onToggleMute, onEnd, onReport }: Props) {
  const { c, t, row, effectiveLang } = useSettings();
  const insets = useSafeAreaInsets();
  const eta = new Date(Date.now() + nav.remainingDuration * 1000);

  return (
    <>
      <View style={[s.top, { top: insets.top + space(2) }]}>
        <View style={[s.banner, { backgroundColor: nav.rerouting ? c.warning : '#0F5132', flexDirection: row }]}>
          {nav.rerouting ? (
            <Txt size={20} weight="800" style={{ color: '#fff', flex: 1 }}>{t('rerouting')}</Txt>
          ) : nav.arrived ? (
            <Txt size={24} weight="800" style={{ color: '#fff', flex: 1 }}>⚑ {t('arrived')}</Txt>
          ) : (
            <>
              <View style={s.glyphBox}>
                <Txt size={44} weight="800" style={{ color: '#fff' }} center>{glyph(nav.next)}</Txt>
                <Txt size={18} weight="800" style={{ color: '#fff' }} center>{fmtDistance(nav.distanceToNext, t)}</Txt>
              </View>
              <View style={{ flex: 1, marginHorizontal: space(3) }}>
                <Txt size={21} weight="800" style={{ color: '#fff' }} numberOfLines={3}>
                  {nav.next ? instruction(nav.next, effectiveLang) : ''}
                </Txt>
              </View>
            </>
          )}
        </View>
        {nav.after && !nav.rerouting && !nav.arrived ? (
          <View style={[s.then, { backgroundColor: '#0A3B24', flexDirection: row, alignSelf: row === 'row' ? 'flex-start' : 'flex-end' }]}>
            <Txt size={15} weight="700" style={{ color: '#fff' }}>{t('then')} {glyph(nav.after)}</Txt>
          </View>
        ) : null}
        {nav.weakGps ? <Txt size={13} weight="700" style={{ color: c.warning, marginTop: space(1) }}>📡 {t('gpsWeak')}</Txt> : null}
      </View>

      <View style={[s.side, { bottom: insets.bottom + 150, [row === 'row' ? 'right' : 'left']: space(4) }]}>
        <RoundButton icon={muted ? '🔇' : '🔊'} label={muted ? t('voiceOff') : t('voiceOn')} onPress={onToggleMute} style={{ marginBottom: space(3) }} />
        <RoundButton icon="⚠️" label={t('report')} onPress={onReport} color={c.warning} />
      </View>

      <Card style={[s.bottom, { paddingBottom: insets.bottom + space(3), flexDirection: row }]}>
        <View style={{ flex: 1 }}>
          <Txt size={26} weight="800" style={{ color: c.success }}>{fmtDuration(nav.remainingDuration, t)}</Txt>
          <Txt muted>
            {fmtDistance(nav.remainingDistance, t)} · {fmtClock(eta, effectiveLang)}
          </Txt>
        </View>
        <Btn title={t('endNav')} variant="danger" onPress={onEnd} style={{ minWidth: 110 }} />
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: space(3), right: space(3) },
  banner: { borderRadius: radius.lg, padding: space(3), alignItems: 'center', minHeight: 96 },
  glyphBox: { width: 84, alignItems: 'center' },
  then: { marginTop: space(1.5), borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  side: { position: 'absolute' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, alignItems: 'center' },
});
