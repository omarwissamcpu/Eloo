// Voice guidance through the phone's text-to-speech voices.
// Many phones have no Kurdish (Sorani) voice; until eloo ships recorded Kurdish
// voice-over clips, Kurdish users hear English and Settings tells them so.
import * as Speech from 'expo-speech';
import type { Lang } from '../i18n/strings';

const PREFIX: Record<Lang, string[]> = { ar: ['ar'], ckb: ['ckb', 'ku'], en: ['en'] };
const FALLBACK: Record<Lang, Lang | null> = { ckb: 'en', ar: 'en', en: null };
const TTS_LANG: Record<Lang, string> = { ar: 'ar-SA', ckb: 'ckb', en: 'en-US' };

let cache: Speech.Voice[] | null = null;

export async function voices(): Promise<Speech.Voice[]> {
  if (cache && cache.length) return cache;
  try {
    cache = await Speech.getAvailableVoicesAsync();
  } catch {
    cache = [];
  }
  return cache;
}

export const voicesFor = (all: Speech.Voice[], lang: Lang) =>
  all.filter((v) => PREFIX[lang].some((p) => v.language?.toLowerCase().startsWith(p)));

/** The language guidance will actually be spoken in on this phone. */
export async function speechLang(appLang: Lang): Promise<Lang> {
  const all = await voices();
  // An empty list usually means the platform can't enumerate voices: trust the system.
  if (all.length === 0 || voicesFor(all, appLang).length > 0) return appLang;
  const fb = FALLBACK[appLang];
  return fb && voicesFor(all, fb).length > 0 ? fb : appLang;
}

export function say(text: string, lang: Lang, voiceId?: string | null) {
  Speech.stop();
  Speech.speak(text, { language: TTS_LANG[lang], voice: voiceId || undefined, rate: lang === 'en' ? 1.0 : 0.95 });
}

export const stopSpeaking = () => Speech.stop();
