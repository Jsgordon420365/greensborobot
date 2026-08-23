import { useState } from 'react';
import {
  ACCESSORY_LABELS,
  describeAnimation,
  type EarnedAccessory,
  type Nagimal,
  type NagimalEvaluation,
  type Responsibility,
} from '../../domain';
import { RelativeTime } from '../common/RelativeTime';
import { StageMeter } from '../common/StageMeter';
import { ActionBar, recommendedAction } from './ActionBar';

const SPECIES_GLYPH: Record<Nagimal['species'], string> = {
  dog: '🐕',
  cat: '🐈',
  plant: '🌿',
};

export interface NagimalCardProps {
  nagimal: Nagimal;
  evaluation: NagimalEvaluation | undefined;
  responsibility: Responsibility | undefined;
  accessories: EarnedAccessory[];
  now: number;
  interveningForName: string | null;
  onEdit: (responsibility: Responsibility) => void;
}

/**
 * One household member: its state, the responsibility it watches, when it was
 * last genuinely attended, why it feels the way it does, and the single next
 * action most likely to help.
 */
export function NagimalCard({
  nagimal,
  evaluation,
  responsibility,
  accessories,
  now,
  interveningForName,
  onEdit,
}: NagimalCardProps) {
  const [showReasons, setShowReasons] = useState(false);
  const stage = evaluation?.stage ?? 0;
  const state = evaluation?.state ?? nagimal.baseState;
  const descriptor = describeAnimation(nagimal.species, state, stage);
  const recommendation = recommendedAction(responsibility, stage);

  return (
    <article
      className="card nagimal-card"
      data-species={nagimal.species}
      data-stage={stage}
      data-state={state}
      aria-labelledby={`nagimal-${nagimal.id}`}
    >
      <div className="nagimal-card__head">
        <span className="avatar" aria-hidden="true">
          {SPECIES_GLYPH[nagimal.species]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="spread">
            <h3 className="nagimal-card__name" id={`nagimal-${nagimal.id}`}>
              {nagimal.name}
            </h3>
            <StageMeter stage={stage} />
          </div>
          <p className="nagimal-card__role">
            {nagimal.role}
            {' · '}
            <span>{state.replace(/_/g, ' ')}</span>
          </p>
        </div>
      </div>

      <p className="nagimal-card__message">{evaluation?.message ?? 'At home and untroubled.'}</p>

      {interveningForName && (
        <p className="faint">
          Acting on behalf of <strong>{interveningForName}</strong>.
        </p>
      )}

      {descriptor.soundCaption && (
        <p className="faint">
          <span aria-hidden="true">🔊 </span>
          Sound: {descriptor.soundCaption}
        </p>
      )}

      {responsibility ? (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.15rem 0.7rem',
            margin: '0.6rem 0 0',
            fontSize: '0.87rem',
          }}
        >
          <dt className="muted">Watching</dt>
          <dd style={{ margin: 0 }}>
            <strong>{responsibility.title}</strong>{' '}
            <span className="faint">({responsibility.paraClass})</span>
          </dd>

          {responsibility.deadlineAt && (
            <>
              <dt className="muted">Deadline</dt>
              <dd style={{ margin: 0 }}>
                <RelativeTime iso={responsibility.deadlineAt} now={now} />
              </dd>
            </>
          )}

          {responsibility.expectedAttentionIntervalMinutes && (
            <>
              <dt className="muted">Expects attention</dt>
              <dd style={{ margin: 0 }}>
                every{' '}
                {formatInterval(responsibility.expectedAttentionIntervalMinutes)}
              </dd>
            </>
          )}

          <dt className="muted">Last attended</dt>
          <dd style={{ margin: 0 }}>
            <RelativeTime iso={responsibility.lastAttentionAt} now={now} />
          </dd>

          {responsibility.snoozeCount > 0 && (
            <>
              <dt className="muted">Snoozed</dt>
              <dd style={{ margin: 0 }}>
                {responsibility.snoozeCount} time{responsibility.snoozeCount === 1 ? '' : 's'}
              </dd>
            </>
          )}

          <dt className="muted">Status</dt>
          <dd style={{ margin: 0 }}>{responsibility.status}</dd>
        </dl>
      ) : (
        <p className="faint">Nothing assigned yet.</p>
      )}

      {accessories.length > 0 && (
        <p className="row" style={{ marginTop: '0.6rem' }}>
          {accessories.map((a) => (
            <span key={a.id} className="accessory-chip" title={a.earnedReason}>
              <span aria-hidden="true">★</span> {ACCESSORY_LABELS[a.accessoryKey] ?? a.accessoryKey}
            </span>
          ))}
        </p>
      )}

      {recommendation && (
        <p style={{ marginTop: '0.7rem', marginBottom: '0.4rem' }}>
          <span className="muted">Recommended next: </span>
          <strong>{recommendation.label}</strong>
        </p>
      )}

      {responsibility && (
        <ActionBar responsibility={responsibility} stage={stage} onEdit={() => onEdit(responsibility)} />
      )}

      {evaluation && evaluation.reasons.length > 0 && (
        <>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            style={{ marginTop: '0.6rem' }}
            aria-expanded={showReasons}
            onClick={() => setShowReasons((v) => !v)}
          >
            {showReasons ? 'Hide why' : `Why is ${nagimal.name} like this?`}
          </button>
          {showReasons && (
            <ul className="reasons">
              {evaluation.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
              {evaluation.nextEvaluationAt && (
                <li>
                  Next threshold:{' '}
                  <RelativeTime iso={evaluation.nextEvaluationAt} now={now} />.
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </article>
  );
}

export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  if (hours < 48) return `${round(hours)} hour${round(hours) === 1 ? '' : 's'}`;
  const days = hours / 24;
  return `${round(days)} day${round(days) === 1 ? '' : 's'}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
