// Language, theme and voice settings, plus helpers every screen uses:
// t() for text, `rtl` / `row` for right-to-left layout, `c` for colours.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getLocales } from 'expo-localization';
import { strings, isRTLLang, LANGS, type Lang, type StringKey } from '../i18n/strings';
import { palettes, type Palette } from '../theme';
import { load, store } from './storage';

export type ThemeMode = 'auto' | 'light' | 'dark';

type Settings = {
  lang: Lang | null; // null until the user picks one on first launch
  theme: ThemeMode;
  voiceOn: boolean;
  voiceId: string | null;
  map3d: boolean;
};

const DEFAULTS: Settings = { lang: null, theme: 'auto', voiceOn: true, voiceId: null, map3d: true };

type Ctx = Settings & {
  ready: boolean;
  effectiveLang: Lang;
  update: (patch: Partial<Settings>) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  rtl: boolean;
  row: 'row' | 'row-reverse';
  align: 'left' | 'right';
  scheme: 'light' | 'dark';
  c: Palette;
};

const SettingsContext = createContext<Ctx | null>(null);

function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode || 'ar';
  if (code === 'ckb' || code === 'ku') return 'ckb';
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : 'ar';
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const system = useColorScheme();

  useEffect(() => {
    load('settings', DEFAULTS).then((v) => {
      setS(v);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      store('settings', next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => {
    const effectiveLang = s.lang || deviceLang();
    const dict = strings[effectiveLang];
    const rtl = isRTLLang(effectiveLang);
    const scheme = s.theme === 'auto' ? (system === 'dark' ? 'dark' : 'light') : s.theme;
    return {
      ...s,
      ready,
      effectiveLang,
      update,
      t: (key, vars) => {
        let out = dict[key] ?? strings.en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
        return out;
      },
      rtl,
      row: rtl ? 'row-reverse' : 'row',
      align: rtl ? 'right' : 'left',
      scheme,
      c: palettes[scheme],
    };
  }, [s, ready, update, system]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
