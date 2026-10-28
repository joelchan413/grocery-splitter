import type { Participant } from '@/types';

// Fallback hues for roommates saved without a valid hex colour, spaced at least 60 degrees apart.
const FALLBACK_COLORS = ['#2563EB', '#059669', '#D97706', '#DB2777', '#0D9488', '#65A30D'];
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The roommate's saved theme colour, or a stable fallback derived from their id. */
export function personColor(participant: Pick<Participant, 'id' | 'color'>): string {
  if (participant.color && HEX_COLOR.test(participant.color)) return participant.color;
  let hash = 0;
  for (const char of participant.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** One or two letters that identify a roommate in an avatar. */
export function personInitial(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}
