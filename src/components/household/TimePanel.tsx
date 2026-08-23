import { useMemo } from 'react';
import { useAppStore } from '../../app/store';
import {
  TIME_PRESETS,
  describeOffset,
  offsetForPreset,
} from '../../services/timeSimulation';

/**
 * Proof-of-Concept Time Controls.
 *
 * The system clock is never touched. The offset is stored separately from the
 * household, and a banner stays visible for as long as it is non-zero.
 */
export function TimePanel() {
  const snapshot = useAppStore((s) => s.snapshot);
  const offset = useAppStore((s) => s.timeOffsetMs);
  const setTimeOffset = useAppStore((s) => s.setTimeOffset);
  const busy = useAppStore((s) => s.busy);

  // Deadline-relative presets need the soonest live deadline in the household.
  const soonestDeadline = useMemo(() => {
    const deadlines = (snapshot?.responsibilities ?? [])
      .filter((r) => r.deadlineAt && r.status !== 'completed' && r.status !== 'archived')
      .map((r) => Date.parse(r.deadlineAt!))
      .filter((v) => !Number.isNaN(v))
      .sort((a, b) => a - b);
    return deadlines[0] ?? null;
  }, [snapshot?.responsibilities]);

  return (
    <details className="card time-panel">
      <summary>
        Proof-of-Concept Time Controls
        {offset !== 0 && <span className="stage-pill" data-stage="2" style={{ marginLeft: '0.6rem' }}>
          simulating
        </span>}
      </summary>

      <p className="faint" style={{ marginTop: '0.5rem' }}>
        These jump the <em>effective</em> time the rules are evaluated against. Your device clock
        is untouched, the offset is stored separately from the household, and Reset puts
        everything back.
      </p>

      <div className="time-grid">
        {TIME_PRESETS.map((preset) => {
          const disabled =
            busy || (preset.offsetMs === null && soonestDeadline === null);
          return (
            <button
              key={preset.id}
              type="button"
              className="btn btn--small"
              disabled={disabled}
              title={
                disabled && preset.offsetMs === null
                  ? 'No active deadline to jump relative to'
                  : preset.description
              }
              onClick={() =>
                void setTimeOffset(
                  offsetForPreset(preset, soonestDeadline),
                  `Simulated: ${preset.label}`,
                )
              }
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          className="btn btn--small btn--danger"
          disabled={busy || offset === 0}
          onClick={() => void setTimeOffset(0, 'Reset the time simulation')}
        >
          Reset simulation
        </button>
      </div>

      <p className="mono" style={{ marginTop: '0.7rem' }}>
        Effective now:{' '}
        {snapshot ? new Date(snapshot.evaluatedAt).toLocaleString() : 'not yet evaluated'} (
        {describeOffset(offset)})
      </p>
    </details>
  );
}
