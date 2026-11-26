export type Palette = {
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  warning: string;
  success: string;
  routeMain: string;
  routeAlt: string;
  routeCasing: string;
  overlay: string;
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#F4F6F8',
    card: '#FFFFFF',
    cardAlt: '#EEF1F4',
    text: '#11181C',
    muted: '#66717A',
    border: '#E0E5EA',
    primary: '#1463FF',
    primaryText: '#FFFFFF',
    danger: '#E5303A',
    warning: '#F59E0B',
    success: '#13A35A',
    routeMain: '#1463FF',
    routeAlt: '#9AA8B6',
    routeCasing: '#0B3FAD',
    overlay: 'rgba(0,0,0,0.35)',
  },
  dark: {
    bg: '#0B0F14',
    card: '#151B22',
    cardAlt: '#1E2630',
    text: '#EEF2F6',
    muted: '#93A0AD',
    border: '#26303B',
    primary: '#4D8DFF',
    primaryText: '#FFFFFF',
    danger: '#FF4D57',
    warning: '#FBBF24',
    success: '#2BD07A',
    routeMain: '#4D8DFF',
    routeAlt: '#5B6977',
    routeCasing: '#1F4FB8',
    overlay: 'rgba(0,0,0,0.55)',
  },
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = (n: number) => n * 4;
