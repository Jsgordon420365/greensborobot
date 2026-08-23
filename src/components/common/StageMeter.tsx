import type { Stage } from '../../domain';

export const STAGE_LABELS: Record<Stage, string> = {
  0: 'Calm',
  1: 'Noticing',
  2: 'Asking',
  3: 'Insisting',
  4: 'Urgent',
};

const STAGE_ICONS: Record<Stage, string> = {
  0: '○',
  1: '◔',
  2: '◑',
  3: '◕',
  4: '●',
};

/**
 * Stage is shown three ways at once — a filled meter, a word and a glyph — so
 * it never depends on colour perception alone.
 */
export function StageMeter({ stage, label = true }: { stage: Stage; label?: boolean }) {
  return (
    <span className="row" style={{ gap: '0.4rem' }}>
      <span
        className="stage-meter"
        role="img"
        aria-label={`Stage ${stage} of 4: ${STAGE_LABELS[stage]}`}
      >
        {([0, 1, 2, 3, 4] as const).map((i) => (
          <span key={i} data-on={i <= stage} data-stage={stage} />
        ))}
      </span>
      {label && (
        <span className="stage-pill" data-stage={stage} aria-hidden="true">
          {STAGE_ICONS[stage]} {STAGE_LABELS[stage]}
        </span>
      )}
    </span>
  );
}
