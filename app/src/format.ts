import type { Lang, StringKey } from './i18n/strings';

type T = (k: StringKey, v?: Record<string, string | number>) => string;

const locales: Record<Lang, string> = { ar: 'ar-IQ', ckb: 'ckb-IQ', en: 'en-GB' };

export function fmtDistance(m: number, t: T) {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} ${t('m')}`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ${t('km')}`;
}

export function fmtDuration(sec: number, t: T) {
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins < 60) return `${mins} ${t('min')}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ${t('hr')} ${m} ${t('min')}` : `${h} ${t('hr')}`;
}

export function fmtClock(date: Date, lang: Lang) {
  try {
    return date.toLocaleTimeString(locales[lang], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

export function fmtAgo(ms: number, t: T) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return t('justNow');
  return t('ago', { t: fmtDuration(mins * 60, t) });
}
