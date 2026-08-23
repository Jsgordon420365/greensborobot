import { useMemo, useState } from 'react';
import type { HouseholdSnapshot, Responsibility } from '../../domain';
import { useAppStore } from '../../app/store';
import { effectiveNow } from '../../services/timeSimulation';
import { ResponsibilityEditor } from '../tasks/ResponsibilityEditor';
import { NagimalCard } from './NagimalCard';
import { TimePanel } from './TimePanel';

const SPECIES_ORDER: Record<string, number> = { dog: 0, cat: 1, plant: 2 };

/**
 * The household at a glance.
 *
 * The hierarchy is deliberate: three cards, one screen, no infinite list. A
 * household that scrolls is a household whose members have stopped meaning
 * anything.
 */
export function Dashboard({ snapshot }: { snapshot: HouseholdSnapshot }) {
  const offset = useAppStore((s) => s.timeOffsetMs);
  const identity = useAppStore((s) => s.identity);
  const now = effectiveNow(offset);

  const [editing, setEditing] = useState<Responsibility | null>(null);
  const [creating, setCreating] = useState(false);

  const ordered = useMemo(
    () =>
      [...snapshot.nagimals].sort(
        (a, b) => (SPECIES_ORDER[a.species] ?? 9) - (SPECIES_ORDER[b.species] ?? 9),
      ),
    [snapshot.nagimals],
  );

  const nameFor = (id: string | null) =>
    id ? (snapshot.nagimals.find((n) => n.id === id)?.name ?? null) : null;

  const unassigned = snapshot.responsibilities.filter((r) => !r.nagimalId);

  return (
    <section className="stack" aria-labelledby="household-heading">
      <div className="spread">
        <h1 id="household-heading" style={{ margin: 0 }}>
          {snapshot.household.name}
        </h1>
        <span className="faint">
          {snapshot.source === 'server' ? 'Server-evaluated' : 'Evaluated in this browser'}
        </span>
      </div>

      <TimePanel />

      <div className="stack">
        {ordered.map((nagimal) => {
          const evaluation = snapshot.evaluations.find((e) => e.nagimalId === nagimal.id);
          const responsibility = snapshot.responsibilities.find(
            (r) => r.id === evaluation?.responsibilityId,
          );
          return (
            <NagimalCard
              key={nagimal.id}
              nagimal={nagimal}
              evaluation={evaluation}
              responsibility={responsibility}
              accessories={snapshot.accessories.filter((a) => a.nagimalId === nagimal.id)}
              now={now}
              interveningForName={nameFor(evaluation?.interveningFor ?? null)}
              onEdit={(r) => {
                setCreating(false);
                setEditing(r);
              }}
            />
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="card">
          <h2>Not yet assigned</h2>
          <p className="faint">
            Nobody is watching these, so nothing will escalate until you give them to a household
            member.
          </p>
          <ul>
            {unassigned.map((r) => (
              <li key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  {r.title} <span className="faint">({r.paraClass})</span>
                </span>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => {
                    setCreating(false);
                    setEditing(r);
                  }}
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(editing || creating) && identity && (
        <ResponsibilityEditor
          existing={editing}
          nagimals={snapshot.nagimals}
          householdId={snapshot.household.id}
          ownerId={identity.id}
          onDone={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      {!editing && !creating && (
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            Add a responsibility
          </button>
        </div>
      )}

      <p className="disclaimer">
        Nagimals is a prototype. Do not use it as the only alert for anything medical, legal,
        financial, safety-critical or urgent. The household can express concern and recoverable
        neglect — no animal here can die, and none of this is a judgement about you.
      </p>
    </section>
  );
}
