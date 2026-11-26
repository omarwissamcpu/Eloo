import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type * as Speech from 'expo-speech';
import { useSettings, type ThemeMode } from '../state/settings';
import { useSession } from '../state/session';
import { LANGS, LANG_NAMES, type Lang } from '../i18n/strings';
import { say, speechLang, voices, voicesFor } from '../nav/voice';
import { instruction, withDistance } from '../nav/instructions';
import { Avatar, Btn, Card, Chip, Txt } from '../components/ui';
import { Onboarding } from './Onboarding';
import { space } from '../theme';

export function Settings({ onClose, onSetPlace }: { onClose: () => void; onSetPlace: (kind: 'home' | 'work') => void }) {
  const st = useSettings();
  const { c, t, row, rtl, effectiveLang } = st;
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState<null | 'phone' | 'profile'>(null);
  const [list, setList] = useState<Speech.Voice[]>([]);
  const [spokenLang, setSpokenLang] = useState<Lang>(effectiveLang);

  useEffect(() => {
    (async () => {
      const sl = await speechLang(effectiveLang);
      setSpokenLang(sl);
      setList(voicesFor(await voices(), sl).slice(0, 12));
    })();
  }, [effectiveLang]);

  if (sub) return <Onboarding start={sub} onDone={() => setSub(null)} onCancel={() => setSub(null)} />;

  const u = session.user;
  const home = session.places.find((p) => p.kind === 'home');
  const work = session.places.find((p) => p.kind === 'work');
  const favorites = session.places.filter((p) => p.kind === 'favorite');

  const testVoice = () =>
    say(
      withDistance(instruction({ type: 'turn', modifier: 'right', exit: null, location: [0, 0], name: null, ref: null, distance: 0, duration: 0 }, spokenLang), 200, spokenLang),
      spokenLang,
      st.voiceId,
    );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: space(6) }}>
      <Txt weight="700" muted size={13} style={{ marginBottom: space(2) }}>{title}</Txt>
      <Card>{children}</Card>
    </View>
  );

  const placeRow = (label: string, icon: string, address: string | null, onSet: () => void, onRemove?: () => void) => (
    <View style={[s.placeRow, { flexDirection: row, borderColor: c.border }]}>
      <Txt size={20}>{icon}</Txt>
      <Pressable onPress={onSet} style={{ flex: 1, marginHorizontal: space(3) }}>
        <Txt weight="600">{label}</Txt>
        <Txt size={13} muted numberOfLines={1}>{address || t('notSet')}</Txt>
      </Pressable>
      {onRemove ? <Pressable onPress={onRemove} hitSlop={10}><Txt style={{ color: c.danger }} weight="600">{t('remove')}</Txt></Pressable> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[s.header, { paddingTop: insets.top + space(2), flexDirection: row }]}>
        <Pressable onPress={onClose} hitSlop={12}><Txt size={24}>{rtl ? '→' : '←'}</Txt></Pressable>
        <Txt size={22} weight="800" style={{ marginHorizontal: space(3) }}>{t('settings')}</Txt>
      </View>
      <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: insets.bottom + space(10) }}>
        <Card style={{ flexDirection: row, alignItems: 'center' }}>
          <Avatar id={u?.avatar} size={60} />
          <View style={{ flex: 1, marginHorizontal: space(3) }}>
            <Txt size={19} weight="800">{u?.name || (u?.isGuest ? t('continueGuest') : u?.phone) || 'eloo'}</Txt>
            <Txt muted size={14}>{u?.phone ? '⁦' + u.phone + '⁩' : ''}{u?.phone ? ' · ' : ''}{t('points', { n: u?.points ?? 0 })}</Txt>
          </View>
          <Btn small variant="secondary" title={t('editProfile')} onPress={() => setSub('profile')} />
        </Card>

        {u?.isGuest ? (
          <Card style={{ marginTop: space(3) }}>
            <Txt muted>{t('guestNote')}</Txt>
            <Btn title={t('addPhone')} icon="📱" onPress={() => setSub('phone')} style={{ marginTop: space(3) }} />
          </Card>
        ) : null}

        <Section title={t('language')}>
          <View style={{ flexDirection: row, flexWrap: 'wrap' }}>
            {LANGS.map((l) => (
              <Chip key={l} label={LANG_NAMES[l]} active={effectiveLang === l} onPress={() => { st.update({ lang: l, voiceId: null }); session.updateProfile({ lang: l }).catch(() => {}); }} />
            ))}
          </View>
        </Section>

        <Section title={t('appearance')}>
          <View style={{ flexDirection: row, flexWrap: 'wrap' }}>
            {(['auto', 'light', 'dark'] as ThemeMode[]).map((m) => (
              <Chip key={m} label={t(m === 'auto' ? 'themeAuto' : m === 'light' ? 'themeLight' : 'themeDark')} active={st.theme === m} onPress={() => st.update({ theme: m })} />
            ))}
          </View>
          <Txt weight="600" style={{ marginTop: space(3), marginBottom: space(2) }}>{t('map3d')}</Txt>
          <View style={{ flexDirection: row }}>
            <Chip label={t('voiceOn')} active={st.map3d} onPress={() => st.update({ map3d: true })} />
            <Chip label={t('voiceOff')} active={!st.map3d} onPress={() => st.update({ map3d: false })} />
          </View>
        </Section>

        <Section title={t('voice')}>
          <View style={{ flexDirection: row }}>
            <Chip label={t('voiceOn')} active={st.voiceOn} onPress={() => st.update({ voiceOn: true })} />
            <Chip label={t('voiceOff')} active={!st.voiceOn} onPress={() => st.update({ voiceOn: false })} />
          </View>
          {spokenLang !== effectiveLang ? (
            <Txt size={13} style={{ color: c.warning, marginVertical: space(2) }}>
              {t('voiceMissing', { lang: LANG_NAMES[effectiveLang], fallback: LANG_NAMES[spokenLang] })}
            </Txt>
          ) : null}
          {st.voiceOn ? (
            <>
              <Txt weight="600" style={{ marginTop: space(3), marginBottom: space(2) }}>{t('voicePick')}</Txt>
              <View style={{ flexDirection: row, flexWrap: 'wrap' }}>
                <Chip label={t('voiceDefault')} active={!st.voiceId} onPress={() => st.update({ voiceId: null })} />
                {list.map((v) => (
                  <Chip key={v.identifier} label={v.name} active={st.voiceId === v.identifier} onPress={() => st.update({ voiceId: v.identifier })} />
                ))}
              </View>
              <Btn small variant="secondary" icon="🔊" title={t('voiceTest')} onPress={testVoice} style={{ marginTop: space(2), alignSelf: rtl ? 'flex-end' : 'flex-start' }} />
            </>
          ) : null}
        </Section>

        <Section title={t('favorites')}>
          {placeRow(t('home'), '🏠', home?.address || home?.label || null, () => onSetPlace('home'), home ? () => session.removePlace(home.id) : undefined)}
          {placeRow(t('work'), '💼', work?.address || work?.label || null, () => onSetPlace('work'), work ? () => session.removePlace(work.id) : undefined)}
          {favorites.map((p) => (
            <View key={p.id}>{placeRow(p.label || '', '⭐', p.address, () => {}, () => session.removePlace(p.id))}</View>
          ))}
        </Section>

        <Section title={t('account')}>
          <Btn title={t('signOut')} variant="secondary" onPress={() => { session.signOut(); onClose(); }} />
          <Btn
            title={t('deleteAccount')}
            variant="ghost"
            style={{ marginTop: space(2) }}
            onPress={() =>
              Alert.alert(t('deleteAccount'), t('deleteConfirm'), [
                { text: t('cancel'), style: 'cancel' },
                { text: t('deleteAccount'), style: 'destructive', onPress: () => session.deleteAccount().then(onClose).catch(() => {}) },
              ])
            }
          />
        </Section>

        <Txt size={12} muted center style={{ marginTop: space(8) }}>{t('osmCredit')}</Txt>
        <Txt size={12} muted center>eloo 1.0.0</Txt>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: space(4), paddingBottom: space(2), alignItems: 'center' },
  placeRow: { alignItems: 'center', paddingVertical: space(3), borderBottomWidth: StyleSheet.hairlineWidth },
});
