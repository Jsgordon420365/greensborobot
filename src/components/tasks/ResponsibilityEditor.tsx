import { useState } from 'react';
import {
  DEFAULT_QUIET_HOURS,
  makeResponsibility,
  type Importance,
  type Nagimal,
  type ParaClass,
  type ReminderIntensity,
  type Responsibility,
  type ResponsibilityStatus,
} from '../../domain';
import { useAppStore } from '../../app/store';
import { effectiveNow } from '../../services/timeSimulation';

const CLASS_HELP: Record<ParaClass, string> = {
  project: 'A defined outcome, usually with a deadline. This is what a dog guards.',
  area: 'An ongoing responsibility with no finish line, measured by how often you attend it.',
  resource: 'Still valuable, but it should never nag you.',
  archive: 'Kept and retrievable, and it never raises an alert.',
};

const IMPORTANCE: Importance[] = ['low', 'normal', 'high', 'critical'];
const INTENSITY: ReminderIntensity[] = ['gentle', 'standard', 'firm'];
const STATUSES: ResponsibilityStatus[] = ['active', 'snoozed', 'completed', 'dormant', 'archived'];

export interface EditorProps {
  /** Null creates a new responsibility. */
  existing: Responsibility | null;
  nagimals: Nagimal[];
  householdId: string;
  ownerId: string;
  onDone: () => void;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ResponsibilityEditor({
  existing,
  nagimals,
  householdId,
  ownerId,
  onDone,
}: EditorProps) {
  const save = useAppStore((s) => s.saveResponsibility);
  const busy = useAppStore((s) => s.busy);
  const offset = useAppStore((s) => s.timeOffsetMs);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [paraClass, setParaClass] = useState<ParaClass>(existing?.paraClass ?? 'project');
  const [nagimalId, setNagimalId] = useState(existing?.nagimalId ?? nagimals[0]?.id ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(existing?.deadlineAt ?? null));
  const [intervalDays, setIntervalDays] = useState(
    existing?.expectedAttentionIntervalMinutes
      ? String(existing.expectedAttentionIntervalMinutes / (24 * 60))
      : '7',
  );
  const [importance, setImportance] = useState<Importance>(existing?.importance ?? 'normal');
  const [intensity, setIntensity] = useState<ReminderIntensity>(
    existing?.reminderIntensity ?? 'standard',
  );
  const [status, setStatus] = useState<ResponsibilityStatus>(existing?.status ?? 'active');
  const [quietEnabled, setQuietEnabled] = useState(
    existing?.quietHours?.enabled ?? DEFAULT_QUIET_HOURS.enabled,
  );
  const [quietStart, setQuietStart] = useState(
    String(existing?.quietHours?.startHour ?? DEFAULT_QUIET_HOURS.startHour),
  );
  const [quietEnd, setQuietEnd] = useState(
    String(existing?.quietHours?.endHour ?? DEFAULT_QUIET_HOURS.endHour),
  );

  const assigned = nagimals.find((n) => n.id === nagimalId);

  /**
   * A plant signals only through its condition, so it can never guard a
   * deadline. Coercing here — on the change, not in an effect — keeps the
   * form from rendering an impossible combination even for one frame.
   */
  function assignTo(nextId: string) {
    setNagimalId(nextId);
    const next = nagimals.find((n) => n.id === nextId);
    if (next?.species === 'plant' && paraClass === 'project') setParaClass('area');
  }

  const needsDeadline = paraClass === 'project';
  const needsInterval = paraClass === 'area';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const now = effectiveNow(offset);

    const base =
      existing ??
      makeResponsibility({ householdId, ownerId, title, now });

    const next: Responsibility = {
      ...base,
      title: title.trim(),
      description: description.trim() || null,
      paraClass,
      nagimalId: nagimalId || null,
      status,
      importance,
      reminderIntensity: intensity,
      deadlineAt: needsDeadline && deadline ? new Date(deadline).toISOString() : null,
      expectedAttentionIntervalMinutes:
        needsInterval && intervalDays ? Math.round(Number(intervalDays) * 24 * 60) : null,
      quietHours: {
        enabled: quietEnabled,
        startHour: Number(quietStart),
        endHour: Number(quietEnd),
      },
      updatedAt: new Date(now).toISOString(),
    };

    await save(next);
    onDone();
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="editor-heading">
      <h2 id="editor-heading">{existing ? 'Edit responsibility' : 'New responsibility'}</h2>

      <div className="field">
        <label htmlFor="r-title">Title</label>
        <input
          id="r-title"
          type="text"
          required
          maxLength={140}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="r-description">Description (optional)</label>
        <textarea
          id="r-description"
          value={description}
          maxLength={800}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset>
        <legend>Class</legend>
        <div className="radio-row">
          {(Object.keys(CLASS_HELP) as ParaClass[]).map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="para-class"
                value={key}
                checked={paraClass === key}
                onChange={() => setParaClass(key)}
              />
              {key}
            </label>
          ))}
        </div>
        <p className="hint" style={{ marginTop: '0.5rem' }}>{CLASS_HELP[paraClass]}</p>
      </fieldset>

      <div className="field">
        <label htmlFor="r-nagimal">Assigned to</label>
        <select id="r-nagimal" value={nagimalId} onChange={(e) => assignTo(e.target.value)}>
          <option value="">Nobody yet</option>
          {nagimals.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} — {n.role}
            </option>
          ))}
        </select>
        {assigned?.species === 'plant' && (
          <span className="hint">
            A plant signals only through its condition, so this becomes an interval-based Area.
          </span>
        )}
      </div>

      {needsDeadline && (
        <div className="field">
          <label htmlFor="r-deadline">Deadline</label>
          <input
            id="r-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <span className="hint">
            Without a deadline a Project cannot escalate on time alone.
          </span>
        </div>
      )}

      {needsInterval && (
        <div className="field">
          <label htmlFor="r-interval">Expected attention interval (days)</label>
          <input
            id="r-interval"
            type="number"
            min="0.05"
            step="0.5"
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
          />
          <span className="hint">
            Drooping begins at 1.5× this interval, wilting at 2×, and severe wilting at 3×.
          </span>
        </div>
      )}

      <fieldset>
        <legend>Importance</legend>
        <div className="radio-row">
          {IMPORTANCE.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="importance"
                value={key}
                checked={importance === key}
                onChange={() => setImportance(key)}
              />
              {key}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Reminder intensity</legend>
        <div className="radio-row">
          {INTENSITY.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="intensity"
                value={key}
                checked={intensity === key}
                onChange={() => setIntensity(key)}
              />
              {key}
            </label>
          ))}
        </div>
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          Gentle holds escalation one stage lower; firm raises it one stage. Neither changes the
          facts, only how loudly they are put to you.
        </p>
      </fieldset>

      <fieldset>
        <legend>Quiet hours</legend>
        <label className="row" style={{ marginBottom: '0.5rem' }}>
          <input
            type="checkbox"
            checked={quietEnabled}
            onChange={(e) => setQuietEnabled(e.target.checked)}
          />
          Suppress notifications overnight
        </label>
        {quietEnabled && (
          <div className="row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="quiet-start">From (hour)</label>
              <input
                id="quiet-start"
                type="number"
                min="0"
                max="23"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="quiet-end">To (hour)</label>
              <input
                id="quiet-end"
                type="number"
                min="0"
                max="23"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
              />
            </div>
          </div>
        )}
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          Quiet hours suppress the notification, not the visible state. The household still
          shows how it feels; it simply does not wake you.
        </p>
      </fieldset>

      <div className="field">
        <label htmlFor="r-status">Status</label>
        <select
          id="r-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ResponsibilityStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={busy || !title.trim()}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create responsibility'}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
