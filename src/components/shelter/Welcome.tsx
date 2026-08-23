import { useAppStore } from '../../app/store';
import { missingConnectedModeVars } from '../../lib/env';
import { Banner } from '../common/Banner';

export function Welcome({ onVisitShelter, onOpenDemo }: {
  onVisitShelter: () => void;
  onOpenDemo: () => void;
}) {
  const mode = useAppStore((s) => s.mode);
  const busy = useAppStore((s) => s.busy);
  const missing = missingConnectedModeVars();

  return (
    <section className="stack" aria-labelledby="welcome-heading">
      <h1 id="welcome-heading">Nagimals</h1>

      <p>
        You start something that matters while it is still fresh enough to remember. Then newer
        obligations take your attention, and by the time you find the idea again it looks like a
        shipwreck on the seabed: recognisable, once valuable, and much harder to raise than it
        would have been.
      </p>
      <p>
        Nagimals gives a small number of responsibilities a persistent representative. A patient
        dog guards a deadline. A calico cat watches an ongoing area and speaks up for whoever
        cannot. A fern stands for the long, quiet obligation nobody is chasing. They know about
        one another, and they escalate by rules you can read.
      </p>
      <p>
        A household stays deliberately small — at most two dogs, three cats and nine plants — so
        that the animals mean something. This proof of concept keeps one of each.
      </p>

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={onVisitShelter} disabled={busy}>
          Visit the Shelter
        </button>
        <button type="button" className="btn" onClick={onOpenDemo} disabled={busy}>
          Open Demo Household
        </button>
      </div>

      {mode === 'local' && (
        <Banner>
          <span>
            <strong>Local Demonstration Mode.</strong> Everything runs in this browser and
            persists across reloads. Set {missing.map((v) => <code key={v} className="mono">{v} </code>)}
            to switch to Connected Mode, where the server is authoritative and state follows you
            between devices.
          </span>
        </Banner>
      )}

      <p className="disclaimer">
        A prototype, not a safety net. Do not rely on Nagimals as the only alert for medical,
        legal, financial or emergency obligations. Nothing here diagnoses you or judges your
        character: the tone you pick is a communication preference, nothing more. No animal in
        this household can die.
      </p>
    </section>
  );
}
