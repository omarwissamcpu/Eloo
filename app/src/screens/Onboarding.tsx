// First launch: language → welcome → (phone → code) or guest → avatar.
// Also reused from Settings for "Add phone number" and "Edit profile".
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { LANGS, LANG_NAMES, type Lang } from '../i18n/strings';
import { AVATARS } from '../catalog';
import { errorKey } from '../errors';
import { Avatar, Btn, Txt } from '../components/ui';
import { radius, space } from '../theme';

type Stage = 'lang' | 'welcome' | 'phone' | 'code' | 'profile';

export function Onboarding({ start = 'lang', onDone, onCancel }: { start?: Stage; onDone: () => void; onCancel?: () => void }) {
  const { c, t, update, effectiveLang, row } = useSettings();
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>(start);
  const [phone, setPhone] = useState('');
  const [normalized, setNormalized] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [gender, setGender] = useState<'male' | 'female'>(session.user?.avatar?.startsWith('f') ? 'female' : 'male');
  const [avatar, setAvatar] = useState<string | null>(session.user?.avatar ?? null);
  const [name, setName] = useState(session.user?.name ?? '');

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((x) => x - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const p = await session.requestOtp(phone);
      setNormalized(p);
      setCode('');
      setCooldown(30);
      setStage('code');
    });

  const verify = (value: string) =>
    run(async () => {
      await session.verifyOtp(normalized, value, effectiveLang);
      setStage('profile');
    });

  const input = [s.input, { backgroundColor: c.cardAlt, color: c.text, borderColor: c.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.wrap, { paddingTop: insets.top + space(8), paddingBottom: insets.bottom + space(6) }]} keyboardShouldPersistTaps="handled">
        {(stage !== 'profile' || start === 'profile') && (stage !== start || onCancel) ? (
          <Pressable
            onPress={() => {
              if (stage === start) return onCancel?.();
              setStage(stage === 'code' ? 'phone' : stage === 'phone' ? 'welcome' : 'lang');
            }}
            style={{ alignSelf: row === 'row' ? 'flex-start' : 'flex-end', marginBottom: space(4) }}
          >
            <Txt style={{ color: c.primary }} weight="600">{t('back')}</Txt>
          </Pressable>
        ) : null}

        {stage === 'lang' && (
          <View>
            <Txt size={44} weight="800" center style={{ color: c.primary, marginBottom: space(2) }}>eloo</Txt>
            <Txt size={20} weight="700" center style={{ marginBottom: space(8) }}>{t('chooseLanguage')}</Txt>
            {LANGS.map((l: Lang) => (
              <Btn
                key={l}
                title={LANG_NAMES[l]}
                variant={l === effectiveLang ? 'primary' : 'secondary'}
                style={{ marginBottom: space(3) }}
                onPress={() => {
                  update({ lang: l });
                  setStage('welcome');
                }}
              />
            ))}
          </View>
        )}

        {stage === 'welcome' && (
          <View>
            <Txt size={44} weight="800" center style={{ color: c.primary }}>eloo</Txt>
            <Txt size={28} weight="800" center style={{ marginTop: space(6) }}>{t('welcomeTitle')}</Txt>
            <Txt size={17} muted center style={{ marginTop: space(3), marginBottom: space(10) }}>{t('welcomeBody')}</Txt>
            <Btn title={t('continuePhone')} icon="📱" onPress={() => setStage('phone')} style={{ marginBottom: space(3) }} />
            <Btn
              title={t('continueGuest')}
              variant="secondary"
              loading={busy}
              onPress={() => run(async () => {
                await session.signInGuest(effectiveLang);
                setStage('profile');
              })}
            />
          </View>
        )}

        {stage === 'phone' && (
          <View>
            <Txt size={26} weight="800">{t('phoneTitle')}</Txt>
            <Txt muted style={{ marginTop: space(2), marginBottom: space(6) }}>{t('phoneHint')}</Txt>
            <View style={[s.phoneRow, { flexDirection: 'row' /* phone numbers are always LTR */ }]}>
              <View style={[s.prefix, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
                <Txt weight="700">🇮🇶 +964</Txt>
              </View>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="770 123 4567"
                placeholderTextColor={c.muted}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                autoFocus
                style={[...input, { flex: 1, textAlign: 'left', writingDirection: 'ltr' }]}
              />
            </View>
            <Btn title={t('sendCode')} onPress={sendCode} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} style={{ marginTop: space(6) }} />
          </View>
        )}

        {stage === 'code' && (
          <View>
            <Txt size={26} weight="800">{t('codeTitle')}</Txt>
            <Txt muted style={{ marginTop: space(2), marginBottom: space(6) }}>{t('codeSentTo', { phone: '⁦' + normalized + '⁩' })}</Txt>
            <TextInput
              value={code}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                if (digits.length === 6) verify(digits);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={c.muted}
              style={[...input, { fontSize: 30, letterSpacing: 12, textAlign: 'center' }]}
            />
            <Btn title={t('verify')} onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} style={{ marginTop: space(6) }} />
            <Btn
              title={cooldown > 0 ? t('resendIn', { s: cooldown }) : t('resend')}
              variant="ghost"
              disabled={cooldown > 0 || busy}
              onPress={sendCode}
              style={{ marginTop: space(2) }}
            />
          </View>
        )}

        {stage === 'profile' && (
          <View>
            <Txt size={26} weight="800" center>{t('profileTitle')}</Txt>
            <View style={{ alignItems: 'center', marginVertical: space(6) }}>
              <Avatar id={avatar} size={96} />
            </View>
            <View style={{ flexDirection: row, justifyContent: 'center', marginBottom: space(4) }}>
              {(['male', 'female'] as const).map((g) => (
                <Btn key={g} small title={t(g)} variant={gender === g ? 'primary' : 'secondary'} onPress={() => setGender(g)} style={{ marginHorizontal: space(1.5), minWidth: 110 }} />
              ))}
            </View>
            <View style={{ flexDirection: row, justifyContent: 'center', flexWrap: 'wrap' }}>
              {AVATARS[gender].map((a) => (
                <Pressable key={a.id} onPress={() => setAvatar(a.id)} style={[s.avatarPick, { borderColor: avatar === a.id ? c.primary : 'transparent' }]}>
                  <Avatar id={a.id} size={64} />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('yourName')}
              placeholderTextColor={c.muted}
              maxLength={40}
              style={[...input, { marginTop: space(6), textAlign: row === 'row' ? 'left' : 'right' }]}
            />
            <Btn
              title={t('done')}
              loading={busy}
              style={{ marginTop: space(6) }}
              onPress={() => run(async () => {
                await session.updateProfile({ name: name.trim() || null, avatar: avatar ?? undefined, lang: effectiveLang });
                onDone();
              })}
            />
          </View>
        )}

        {error ? <Txt center style={{ color: c.danger, marginTop: space(4) }} weight="600">{error}</Txt> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: space(6), flexGrow: 1 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space(4), minHeight: 56, fontSize: 18 },
  phoneRow: { alignItems: 'center' },
  prefix: { borderWidth: 1, borderRadius: radius.md, minHeight: 56, paddingHorizontal: space(3), justifyContent: 'center', marginRight: space(2) },
  avatarPick: { borderWidth: 3, borderRadius: 40, padding: 3, margin: space(1.5) },
});
