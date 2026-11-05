'use client';

import React from 'react';
import { ArrowLeft, Check } from 'lucide-react';

export type TripStep = 'review' | 'claiming' | 'settlement';

const STEPS: { id: TripStep; label: string }[] = [
  { id: 'review', label: 'Check items' },
  { id: 'claiming', label: 'Claim' },
  { id: 'settlement', label: 'Balances' },
];

interface TripStepsProps {
  current: TripStep;
  /** Steps that can be opened from here. A run still being checked can't skip ahead to claiming. */
  onOpen?: Partial<Record<TripStep, () => void>>;
}

/** Shows where a run is, Check items → Claim → Balances, and opens the steps it can reach. */
export function TripSteps({ current, onOpen = {} }: TripStepsProps) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);
  return (
    <nav aria-label="Trip steps">
      <ol className="trip-steps">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const isCurrent = step.id === current;
          const open = isCurrent ? undefined : onOpen[step.id];
          // The spoken name is "Step 1: Check items", which contains the visible label for voice control.
          const content = (
            <>
              <span className="sr-only">Step {index + 1}: </span>
              <span className="trip-step-dot" aria-hidden="true">
                {done ? <Check /> : index + 1}
              </span>
              <span>{step.label}</span>
            </>
          );
          return (
            <li key={step.id}>
              {open ? (
                <button type="button" onClick={open} className={`trip-step${done ? ' is-done' : ''}`}>
                  {content}
                </button>
              ) : (
                <span className={`trip-step${done ? ' is-done' : ''}`} aria-current={isCurrent ? 'step' : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Above History and Settle up: the way back to the run still in progress, which has no tab of its own. */
export function BackToTrip({ trip }: { trip?: { name: string; onOpen: () => void } }) {
  if (!trip) return null;
  return (
    <button type="button" onClick={trip.onOpen} className="back-link">
      <ArrowLeft aria-hidden="true" />
      Back to {trip.name}
    </button>
  );
}

/** A bar fixed to the foot of the screen that holds the screen's forward action. */
export function ActionBar({ children, label = 'Next step' }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="action-bar" role="region" aria-label={label}>
      <div className="action-bar-inner">{children}</div>
    </div>
  );
}
