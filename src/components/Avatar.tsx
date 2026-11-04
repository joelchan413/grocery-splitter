import type { CSSProperties } from 'react';
import type { Participant } from '@/types';
import { personColor, personInitial } from '@/lib/person';

type AvatarSize = 'sm' | 'md' | 'lg';

/** A roommate's initial on a pale tint of their theme colour, with the dark of that hue as ink. */
export function Avatar({ participant, size = 'md', className = '' }: {
  participant: Pick<Participant, 'id' | 'name' | 'color'>;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      className={`avatar avatar-${size} ${className}`}
      style={{ '--person': personColor(participant) } as CSSProperties}
      aria-hidden="true"
    >
      {personInitial(participant.name)}
    </span>
  );
}

/** Inline style that gives any element the roommate's tint variables (--tint-bg, --tint-ink). */
export function personStyle(participant: Pick<Participant, 'id' | 'color'>): CSSProperties {
  return { '--person': personColor(participant) } as CSSProperties;
}
