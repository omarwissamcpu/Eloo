// Turn-by-turn instructions in Arabic, Kurdish (Sorani) and English, built from the
// route's maneuvers (not the routing engine's English text), so every phrase is ours
// and can later be replaced by recorded voice-over clips.
import type { Step } from '../api';
import type { Lang } from '../i18n/strings';

type Phrases = {
  turn: Record<string, string>;
  keep: { left: string; right: string };
  onto: string;
  departNamed: string;
  depart: string;
  arrive: string;
  roundabout: string;
  ordinals: string[];
  inDistance: string;
  thenPrefix: string;
  meters: string;
  kilometers: string;
};

const P: Record<Lang, Phrases> = {
  en: {
    turn: {
      left: 'Turn left', right: 'Turn right',
      'slight left': 'Bear left', 'slight right': 'Bear right',
      'sharp left': 'Turn sharp left', 'sharp right': 'Turn sharp right',
      straight: 'Continue straight', uturn: 'Make a U-turn',
    },
    keep: { left: 'Keep left', right: 'Keep right' },
    onto: '{a} onto {name}',
    departNamed: 'Head out on {name}',
    depart: 'Start driving',
    arrive: "You've arrived at your destination",
    roundabout: 'At the roundabout, take the {nth} exit',
    ordinals: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'],
    inDistance: 'In {d}, {a}',
    thenPrefix: 'then',
    meters: 'meters',
    kilometers: 'kilometers',
  },
  ar: {
    turn: {
      left: 'انعطف يساراً', right: 'انعطف يميناً',
      'slight left': 'انحرف قليلاً إلى اليسار', 'slight right': 'انحرف قليلاً إلى اليمين',
      'sharp left': 'انعطف بحدّة إلى اليسار', 'sharp right': 'انعطف بحدّة إلى اليمين',
      straight: 'استمر مباشرة', uturn: 'استدر للخلف',
    },
    keep: { left: 'الزم اليسار', right: 'الزم اليمين' },
    onto: '{a} إلى {name}',
    departNamed: 'انطلق على {name}',
    depart: 'ابدأ القيادة',
    arrive: 'لقد وصلت إلى وجهتك',
    roundabout: 'في الفلكة، اسلك المخرج {nth}',
    ordinals: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'],
    inDistance: 'بعد {d}، {a}',
    thenPrefix: 'ثم',
    meters: 'متر',
    kilometers: 'كيلومتر',
  },
  ckb: {
    turn: {
      left: 'بپێچەوە بۆ چەپ', right: 'بپێچەوە بۆ ڕاست',
      'slight left': 'کەمێک بەلای چەپدا بڕۆ', 'slight right': 'کەمێک بەلای ڕاستدا بڕۆ',
      'sharp left': 'بە توندی بپێچەوە بۆ چەپ', 'sharp right': 'بە توندی بپێچەوە بۆ ڕاست',
      straight: 'ڕاستەوخۆ بڕۆ', uturn: 'یوتێرن بکە',
    },
    keep: { left: 'بەلای چەپدا بمێنەوە', right: 'بەلای ڕاستدا بمێنەوە' },
    onto: '{a} بۆ سەر {name}',
    departNamed: 'لەسەر {name} دەست پێبکە',
    depart: 'دەست بە لێخوڕین بکە',
    arrive: 'گەیشتیت بە شوێنی مەبەست',
    roundabout: 'لە فلکەکە، دەرچووی {nth} بگرە',
    ordinals: ['یەکەم', 'دووەم', 'سێیەم', 'چوارەم', 'پێنجەم', 'شەشەم', 'حەوتەم', 'هەشتەم'],
    inDistance: 'دوای {d}، {a}',
    thenPrefix: 'پاشان',
    meters: 'مەتر',
    kilometers: 'کیلۆمەتر',
  },
};

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/** Steps that don't need the driver to do anything (road just changes name). */
export function isSilent(step: Step) {
  return ['new name', 'continue', 'notification', 'use lane'].includes(step.type) && (!step.modifier || step.modifier === 'straight');
}

export function instruction(step: Step, lang: Lang): string {
  const p = P[lang];
  const name = step.name || step.ref || '';
  const side = step.modifier?.includes('left') ? 'left' : 'right';
  let a: string;
  switch (step.type) {
    case 'depart':
      return name ? fill(p.departNamed, { name }) : p.depart;
    case 'arrive':
      return p.arrive;
    case 'roundabout':
    case 'rotary':
    case 'exit roundabout':
    case 'exit rotary':
      if (step.exit) return fill(p.roundabout, { nth: p.ordinals[Math.min(step.exit, 8) - 1] });
      a = p.turn[step.modifier || 'straight'] || p.turn.straight;
      break;
    case 'fork':
    case 'merge':
    case 'on ramp':
    case 'off ramp':
      a = step.modifier === 'straight' ? p.turn.straight : p.keep[side];
      break;
    default:
      a = p.turn[step.modifier || 'straight'] || p.turn.straight;
  }
  return name ? fill(p.onto, { a, name }) : a;
}

export function spokenDistance(m: number, lang: Lang) {
  const p = P[lang];
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    return `${km % 1 === 0 ? km.toFixed(0) : km} ${p.kilometers}`;
  }
  const rounded = m > 300 ? Math.round(m / 100) * 100 : Math.round(m / 50) * 50;
  return `${Math.max(50, rounded)} ${p.meters}`;
}

export function withDistance(text: string, meters: number, lang: Lang) {
  const a = lang === 'en' ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  return fill(P[lang].inDistance, { d: spokenDistance(meters, lang), a });
}

export function thenText(text: string, lang: Lang) {
  const a = lang === 'en' ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  return `${P[lang].thenPrefix} ${a}`;
}

export function glyph(step: Step | null) {
  if (!step) return '↑';
  if (step.type === 'arrive') return '⚑';
  if (step.type.includes('roundabout') || step.type.includes('rotary')) return '⟳';
  switch (step.modifier) {
    case 'left':
    case 'sharp left':
      return '↰';
    case 'right':
    case 'sharp right':
      return '↱';
    case 'slight left':
      return '↖';
    case 'slight right':
      return '↗';
    case 'uturn':
      return '↶';
    default:
      return '↑';
  }
}
