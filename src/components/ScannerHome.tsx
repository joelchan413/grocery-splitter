// The new-run screen. Art direction: Taste Skill v2.1.5 app-screen run, pastel-consumer (seed 694281605).
// Its one question: who paid for this run, and where is the receipt? See docs/design.md.
import { useMemo, type ReactNode } from 'react';
import { calculateTripSettlement } from '@/lib/calculations';
import { sortTripHistory } from '@/lib/trip-history';
import type { Household, Trip } from '@/types';
import { Avatar } from './Avatar';

export interface ScannerParts {
  payer: ReactNode;
  upload: ReactNode;
  samples: ReactNode;
  error: ReactNode;
  household: Household;
  history?: Trip[];
  onOpenTrip?: (trip: Trip) => void;
  onOpenHistory?: () => void;
}

const money = (value: number) => `$${value.toFixed(2)}`;
export const TRIP_STATUS_LABEL: Record<Trip['status'], string> = {
  review: 'Checking items',
  claiming: 'Claiming',
  settled: 'Settled',
};

export function formatRunDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ScannerHome({ payer, upload, samples, error, household, history = [], onOpenTrip, onOpenHistory }: ScannerParts) {
  const runs = useMemo(() => sortTripHistory(history), [history]);
  const lastRun = runs[0];
  const openRuns = runs.filter(trip => trip.status !== 'settled').length;

  const split = useMemo(() => {
    if (!lastRun) return null;
    const summary = calculateTripSettlement(lastRun, household);
    const owing = summary.participants.filter(person => !person.isPayer);
    // The payer's figure is summed from the rounded amounts shown in the rows beneath it.
    const reimbursed = Math.round(owing.reduce((sum, person) => sum + person.netOwed, 0) * 100) / 100;
    const largest = Math.max(0, ...owing.map(person => person.netOwed));
    // Only a single largest share is set in ink; a tie stays grey so equal shares read as equal.
    const leaders = owing.filter(person => person.netOwed === largest && largest > 0).length;
    return { summary, owing, reimbursed, largest, leaders };
  }, [lastRun, household]);

  const finding = !runs.length
    ? 'Choose who paid, then add the receipt photos.'
    : openRuns
      ? `${openRuns} earlier ${openRuns === 1 ? 'run is' : 'runs are'} still open for claims.`
      : 'Every earlier run is settled.';

  return (
    <div className="scanner">
      <header className="scanner-title">
        <h1>New grocery run</h1>
        <p>{finding}</p>
      </header>

      <div className="scanner-grid">
        <section className="scanner-card scanner-new-run" aria-label="New grocery run">
          <div>{payer}</div>
          <div className="scanner-upload">{upload}{error}</div>
        </section>

        <div className="scanner-side">
          <section className="scanner-card" aria-labelledby="scanner-last-run-title">
            <div className="scanner-card-head">
              <h2 id="scanner-last-run-title" className="scan-section-title">Last run</h2>
              {runs.length > 0 && onOpenHistory && <button type="button" className="scanner-text-action" onClick={onOpenHistory}>All runs</button>}
            </div>
            {lastRun && split ? <>
              <button type="button" className="scanner-run" onClick={() => onOpenTrip?.(lastRun)}>
                <span className="scanner-run-name">{lastRun.storeName || 'Grocery store'}<small>{formatRunDate(lastRun.date)} · {split.summary.payer.name} paid</small></span>
                <span className="scanner-run-total num">{money(split.summary.totalBill)}<small className={`status-pill status-pill-${lastRun.status}`}>{TRIP_STATUS_LABEL[lastRun.status]}</small></span>
              </button>
              <ul className="scanner-owes">
                <li>
                  <Avatar participant={split.summary.payer} />
                  <span className="scanner-owes-name">{split.summary.payer.name}<small>Gets back</small></span>
                  <span className="scanner-owes-amount scanner-positive num">+{money(split.reimbursed)}</span>
                </li>
                {split.owing.map(person => <li key={person.participantId}>
                  <Avatar participant={person.participant} />
                  <span className="scanner-owes-name">{person.participant.name}<small>{lastRun.readyParticipantIds?.includes(person.participantId) ? 'Done claiming' : 'Owes so far'}</small>
                    <span className={`scanner-owes-bar${person.netOwed === split.largest && split.leaders === 1 ? ' is-top' : ''}`} style={{ width: `${split.largest > 0 ? (person.netOwed / split.largest) * 100 : 0}%` }} aria-hidden="true" />
                  </span>
                  <span className="scanner-owes-amount num">{money(person.netOwed)}</span>
                </li>)}
              </ul>
            </> : <>
              <p className="scanner-empty">No runs yet. After your first scan, each roommate’s share shows here.</p>
              <ul className="scanner-owes">
                {household.participants.map(person => <li key={person.id}>
                  <Avatar participant={person} />
                  <span className="scanner-owes-name">{person.name}<small>{person.venmoHandle || 'No Venmo handle'}</small></span>
                  <span className="scanner-owes-amount scanner-dash" aria-label="No amount yet">–</span>
                </li>)}
              </ul>
            </>}
          </section>

          <section className="scanner-card scanner-samples">{samples}</section>
        </div>
      </div>
    </div>
  );
}
