import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, PresentationControls } from '@react-three/drei';
import { DOG_CANDIDATES, type CommunicationStyle } from '../../domain';
import { useAppStore } from '../../app/store';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { DogModel } from '../ar/models/DogModel';
import { Banner } from '../common/Banner';

const STYLE_LABELS: Record<CommunicationStyle, string> = {
  calm: 'Calm — states the facts quietly',
  encouraging: 'Encouraging — frames things as still achievable',
  direct: 'Direct — plain and unsoftened',
};

/**
 * The virtual shelter.
 *
 * Three visibly distinct dogs, each with an idle animation and a preview. The
 * selection stores a *communication preference* only — Nagimals never infers a
 * psychological trait or diagnosis from which animal someone likes.
 */
export function Shelter({ onAdopted }: { onAdopted: () => void }) {
  const adopt = useAppStore((s) => s.adopt);
  const busy = useAppStore((s) => s.busy);
  const reducedMotion = useReducedMotion();

  const [selected, setSelected] = useState(DOG_CANDIDATES[0].variant);
  const [name, setName] = useState(DOG_CANDIDATES[0].defaultName);
  const [style, setStyle] = useState<CommunicationStyle>(DOG_CANDIDATES[0].communicationStyle);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const candidate = DOG_CANDIDATES.find((c) => c.variant === selected) ?? DOG_CANDIDATES[0];

  function choose(variant: string) {
    const next = DOG_CANDIDATES.find((c) => c.variant === variant) ?? DOG_CANDIDATES[0];
    setSelected(next.variant);
    setName(next.defaultName);
    setStyle(next.communicationStyle);
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    await adopt({ dogVariant: selected, dogName: name, communicationStyle: style });
    onAdopted();
  }

  return (
    <section className="stack" aria-labelledby="shelter-heading">
      <h1 id="shelter-heading">The Shelter</h1>
      <p className="muted">
        Choose one dog to guard your deadlines. Juniper the calico and Frondly the fern are
        already at home and will join whichever dog you pick.
      </p>

      <div className="candidate-grid" role="group" aria-label="Dogs available for adoption">
        {DOG_CANDIDATES.map((c) => {
          const isSelected = c.variant === selected;
          return (
            <div key={c.variant} className="stack" style={{ gap: '0.5rem' }}>
              <button
                type="button"
                className="candidate"
                aria-pressed={isSelected}
                onClick={() => choose(c.variant)}
              >
                <h3>{c.defaultName}</h3>
                <p className="faint" style={{ margin: '0 0 0.4rem' }}>
                  {STYLE_LABELS[c.communicationStyle].split(' — ')[0]} ·{' '}
                  {c.build} build · {c.marking} coat
                </p>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>{c.description}</p>
              </button>

              <div className="viewer" style={{ aspectRatio: '1 / 1', minHeight: 180 }}>
                <Canvas
                  dpr={[1, 2]}
                  camera={{ position: [1.15, 0.75, 2.1], fov: 34 }}
                  shadows
                >
                  <Suspense fallback={null}>
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[2, 4, 2]} intensity={1.4} castShadow />
                    <PresentationControls
                      global
                      snap
                      rotation={[0, -0.4, 0]}
                      polar={[-0.1, 0.4]}
                      azimuth={[-0.7, 0.7]}
                    >
                      <group position={[0, -0.3, 0]}>
                        {/* Stage 1 gives every candidate a friendly idle. */}
                        <DogModel
                          variant={c.variant}
                          stage={previewing === c.variant ? 3 : 1}
                          movement={previewing === c.variant ? 'approach' : 'sway'}
                          reducedMotion={reducedMotion}
                        />
                      </group>
                    </PresentationControls>
                    <ContactShadows position={[0, -0.35, 0]} opacity={0.4} scale={4} blur={2} />
                  </Suspense>
                </Canvas>
              </div>

              <button
                type="button"
                className="btn btn--small"
                onClick={() =>
                  setPreviewing((current) => (current === c.variant ? null : c.variant))
                }
                aria-pressed={previewing === c.variant}
              >
                {previewing === c.variant
                  ? `Stop previewing ${c.defaultName}`
                  : `Preview how ${c.defaultName} asks`}
              </button>
            </div>
          );
        })}
      </div>

      <form className="card stack" onSubmit={confirm}>
        <h2>Adopt {candidate.defaultName}</h2>

        <div className="field">
          <label htmlFor="dog-name">Name</label>
          <input
            id="dog-name"
            type="text"
            value={name}
            maxLength={40}
            required
            onChange={(e) => setName(e.target.value)}
          />
          <span className="hint">You can call them anything. The name is permanent-ish: you can change it later.</span>
        </div>

        <fieldset>
          <legend>How should they talk to you?</legend>
          <div className="radio-row">
            {(Object.keys(STYLE_LABELS) as CommunicationStyle[]).map((key) => (
              <label key={key}>
                <input
                  type="radio"
                  name="communication-style"
                  value={key}
                  checked={style === key}
                  onChange={() => setStyle(key)}
                />
                {STYLE_LABELS[key]}
              </label>
            ))}
          </div>
          <p className="hint" style={{ marginTop: '0.5rem' }}>
            This is a preference about wording only. It is not a personality assessment and
            Nagimals draws no conclusions about you from it.
          </p>
        </fieldset>

        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Bringing them home…' : `Bring ${name || candidate.defaultName} home`}
          </button>
        </div>
      </form>

      <Banner>
        <span>
          Adopting seeds the demonstration scenario, <strong>The Fern, the Cat and the
          Deadline</strong>: a Project three days out, a weekly review, and a set of prototype
          notes that have already gone six days without attention.
        </span>
      </Banner>
    </section>
  );
}
