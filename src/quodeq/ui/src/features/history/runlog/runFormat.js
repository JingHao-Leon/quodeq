import { LOCALE } from '../../../strings/index.js';

export const DASH = '—';

export const dayLabel = (iso) => new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
export const timeLabel = (iso) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
export const scoreText = (s) => (Number.isFinite(s) ? s.toFixed(1) : DASH);
export const numberText = (n) => Number(n || 0).toLocaleString(LOCALE);
export const PLUS = '+';
export const MINUS = '−';
