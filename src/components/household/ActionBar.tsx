import { useState } from 'react';
import { ACTION_LABELS, HOUR, type ActionKind, type Responsibility, type Stage } from '../../domain';
import { useAppStore } from '../../app/store';
import { effectiveNow } from '../../services/timeSimulation';

/**
 * The meaningful actions.
 *
 * "Mark attended" is a deliberate click that records an event; it is never
 * implied by opening the app or looking at a card. A snooze demands an explicit
 * new commitment time, because a deferral without a plan is how the shipwreck
 * happens in the first place.
 */
export function ActionBar({
  responsibility,
  stage,
  onEdit,
}: {
  responsibility: Responsibility;
  stage: Stage;
  onEdit: () => void;
}) {
  const act = useAppStore((s) => s.act);
  const busy = useAppStore((s) => s.busy);
  const offset = useAppStore((s) => s.timeOffsetMs);
  const [snoozing, setSnoozing] = useState(false);
  const [commitment, setCommitment] = useState(() => defaultCommitment(offset));

  const isFinished = responsibility.status === 'completed' || responsibility.status === 'archived';

  async function run(kind: ActionKind, nextCommitmentAt?: string) {
    await act({ responsibilityId: responsibility.id, kind, nextCommitmentAt });
    setSnoozing(false);
  }

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div className="btn-row">
        {!isFinished && (
          <>
            <button
              type="button"
              className={`btn btn--small${stage >= 3 ? ' btn--primary' : ''}`}
              disabled={busy}
              onClick={() => void run('attended')}
            >
              {ACTION_LABELS.attended}
            </button>
            <button
              type="button"
              className="btn btn--small"
              disabled={busy}
              onClick={() => void run('completed')}
            >
              {ACTION_LABELS.completed}
            </button>
            <button
              type="button"
              className="btn btn--small"
              disabled={busy}
              aria-expanded={snoozing}
              onClick={() => setSnoozing((v) => !v)}
            >
              {ACTION_LABELS.snoozed}
            </button>
          </>
        )}
        {isFinished && (
          <button
            type="button"
            className="btn btn--small btn--primary"
            disabled={busy}
            onClick={() => void run('reactivated')}
          >
            {ACTION_LABELS.reactivated}
          </button>
        )}
        <button type="button" className="btn btn--small btn--ghost" onClick={onEdit}>
          Edit
        </button>
      </div>

      {snoozing && (
        <div className="card" style={{ padding: '0.7rem' }}>
          <div className="field" style={{ marginBottom: '0.5rem' }}>
            <label htmlFor={`commit-${responsibility.id}`}>
              When will you actually come back to this?
            </label>
            <input
              id={`commit-${responsibility.id}`}
              type="datetime-local"
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
            />
            <span className="hint">
              A snooze is a deferral, not progress. It raises the snooze count, and after three
              snoozes the household holds this at stage 3 regardless of the deadline.
            </span>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--small btn--primary"
              disabled={busy || !commitment}
              onClick={() => void run('snoozed', new Date(commitment).toISOString())}
            >
              Commit to that time
            </button>
            <button type="button" className="btn btn--small" onClick={() => setSnoozing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isFinished && (
        <details>
          <summary className="faint" style={{ cursor: 'pointer', minHeight: 32 }}>
            Other ways to resolve this
          </summary>
          <div className="btn-row" style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn--small"
              disabled={busy}
              onClick={() => void run('dormant')}
            >
              {ACTION_LABELS.dormant}
            </button>
            <button
              type="button"
              className="btn btn--small"
              disabled={busy}
              onClick={() => void run('converted_to_resource')}
            >
              {ACTION_LABELS.converted_to_resource}
            </button>
            <button
              type="button"
              className="btn btn--small btn--danger"
              disabled={busy}
              onClick={() => void run('archived')}
            >
              {ACTION_LABELS.archived}
            </button>
          </div>
          <p className="hint" style={{ marginTop: '0.4rem' }}>
            Dormant stays quiet until you reactivate it. A Resource keeps its value without
            nagging. An Archive stays retrievable and never raises an alert. Nothing is deleted.
          </p>
        </details>
      )}
    </div>
  );
}

/** The single action most likely to help, given the current stage. */
export function recommendedAction(
  responsibility: Responsibility | undefined,
  stage: Stage,
): { kind: ActionKind; label: string } | null {
  if (!responsibility) return null;
  if (responsibility.status === 'completed') {
    return { kind: 'reactivated', label: 'Nothing — this is done' };
  }
  if (responsibility.status === 'archived') {
    return { kind: 'reactivated', label: 'Nothing — this is archived' };
  }
  if (responsibility.paraClass === 'resource') {
    return { kind: 'attended', label: 'Nothing — Resources do not nag' };
  }
  if (stage >= 4) {
    return responsibility.paraClass === 'project'
      ? { kind: 'completed', label: 'Finish it, or set a real new commitment' }
      : { kind: 'attended', label: 'Give it a genuine look now' };
  }
  if (stage === 3) return { kind: 'attended', label: 'Mark attended after a real check-in' };
  if (stage === 2) return { kind: 'attended', label: 'A short check-in would settle this' };
  if (stage === 1) return { kind: 'attended', label: 'Worth a glance soon' };
  return null;
}

function defaultCommitment(offsetMs: number): string {
  const target = new Date(effectiveNow(offsetMs) + 24 * HOUR);
  // datetime-local wants a local-time string with no timezone suffix.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}
