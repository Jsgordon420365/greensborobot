/**
 * Component behaviour.
 *
 * These drive the interface the way an evaluator would: pick a dog, name it,
 * adopt, read the state, act on it, and simulate time. The 3D canvas is mocked
 * because jsdom has no WebGL; everything around it is real.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Imported for side effects: it installs the hoisted react-three-fiber mocks.
import './mocks/three';

const { DAY, HOUR } = await import('../domain');
const { useAppStore } = await import('../app/store');
const { LocalRepository } = await import('../services/localRepository');
const { setRepository } = await import('../services');
const { Shelter } = await import('../components/shelter/Shelter');
const { Welcome } = await import('../components/shelter/Welcome');
const { Dashboard } = await import('../components/household/Dashboard');
const { NagimalCard } = await import('../components/household/NagimalCard');
const { ResponsibilityEditor } = await import('../components/tasks/ResponsibilityEditor');
const { TimePanel } = await import('../components/household/TimePanel');
const { seedDemoHousehold, evaluateHousehold } = await import('../domain');

const OWNER = 'component-test-owner';

function resetStore() {
  useAppStore.setState({
    identity: null,
    snapshot: null,
    booting: false,
    busy: false,
    error: null,
    timeOffsetMs: 0,
    magicLinkSentTo: null,
  });
}

async function seededSnapshot(offsetMs = 0) {
  const now = Date.now() + offsetMs;
  const seed = seedDemoHousehold(OWNER, { now: Date.now() });
  return {
    household: seed.household,
    nagimals: seed.nagimals,
    responsibilities: seed.responsibilities,
    evaluations: evaluateHousehold(
      { household: seed.household, nagimals: seed.nagimals, responsibilities: seed.responsibilities },
      { now, localHour: 12 },
    ),
    accessories: [],
    evaluatedAt: new Date(now).toISOString(),
    source: 'local' as const,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
  setRepository(new LocalRepository());
});

// ---------------------------------------------------------------- welcome --

describe('Welcome', () => {
  it('explains Nagimals and offers both entry points', () => {
    render(<Welcome onVisitShelter={vi.fn()} onOpenDemo={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Nagimals' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visit the Shelter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Demo Household' })).toBeInTheDocument();
  });

  it('carries the prototype disclaimer, including that nothing dies', () => {
    render(<Welcome onVisitShelter={vi.fn()} onOpenDemo={vi.fn()} />);
    expect(screen.getByText(/No animal in this household can die/i)).toBeInTheDocument();
    expect(screen.getByText(/the only alert for medical/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- shelter --

describe('Shelter', () => {
  it('offers three visibly distinct dogs', () => {
    render(<Shelter onAdopted={vi.fn()} />);
    const group = screen.getByRole('group', { name: /Dogs available for adoption/i });
    for (const name of ['Bear', 'Sunny', 'Pepper']) {
      expect(within(group).getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(within(group).getByText(/large build/i)).toBeInTheDocument();
    expect(within(group).getByText(/compact build/i)).toBeInTheDocument();
  });

  it('selecting a dog updates the name and the adoption heading', async () => {
    const user = userEvent.setup();
    render(<Shelter onAdopted={vi.fn()} />);

    const group = screen.getByRole('group', { name: /Dogs available for adoption/i });
    await user.click(
      within(group)
        .getByRole('heading', { name: 'Pepper' })
        .closest('button')!,
    );

    expect(screen.getByRole('heading', { name: 'Adopt Pepper' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Pepper');
  });

  it('lets a dog be renamed before adoption', async () => {
    const user = userEvent.setup();
    render(<Shelter onAdopted={vi.fn()} />);

    const nameField = screen.getByLabelText('Name');
    await user.clear(nameField);
    await user.type(nameField, 'Marmalade');
    expect(screen.getByRole('button', { name: /Bring Marmalade home/ })).toBeInTheDocument();
  });

  it('offers a preview of how each dog asks', async () => {
    const user = userEvent.setup();
    render(<Shelter onAdopted={vi.fn()} />);
    const preview = screen.getByRole('button', { name: /Preview how Bear asks/ });
    await user.click(preview);
    expect(screen.getByRole('button', { name: /Stop previewing Bear/ })).toBeInTheDocument();
  });

  it('frames the tone choice as a preference, not a personality verdict', () => {
    render(<Shelter onAdopted={vi.fn()} />);
    expect(screen.getByText(/not a personality assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/draws no conclusions about you/i)).toBeInTheDocument();
  });

  it('adopting creates the household and calls back', async () => {
    const user = userEvent.setup();
    const onAdopted = vi.fn();
    render(<Shelter onAdopted={onAdopted} />);

    await user.click(screen.getByRole('button', { name: /Bring Bear home/ }));

    await waitFor(() => expect(onAdopted).toHaveBeenCalled());
    const snapshot = useAppStore.getState().snapshot;
    expect(snapshot).not.toBeNull();
    expect(snapshot!.nagimals.map((n) => n.species).sort()).toEqual(['cat', 'dog', 'plant']);
  });
});

// -------------------------------------------------------------- dashboard --

describe('Dashboard', () => {
  it('shows all three household members with their state and stage', async () => {
    const snapshot = await seededSnapshot();
    useAppStore.setState({ snapshot, identity: { id: OWNER, label: 'x', isLocalDemo: true } });
    render(<Dashboard snapshot={snapshot} />);

    expect(screen.getByRole('heading', { name: 'Bear' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Juniper' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Frondly' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Stage 0 of 4: Calm/)).toHaveLength(3);
  });

  it('shows the responsibility each member watches', async () => {
    const snapshot = await seededSnapshot();
    render(<Dashboard snapshot={snapshot} />);
    expect(screen.getByText('Submit the Nagimals proof-of-concept')).toBeInTheDocument();
    expect(screen.getByText('Revisit the neglected prototype notes')).toBeInTheDocument();
  });

  it('renders the fern as wilted and the cat as intervening after neglect', async () => {
    const snapshot = await seededSnapshot(10 * DAY);
    render(<Dashboard snapshot={snapshot} />);

    const fernCard = screen.getByRole('article', { name: 'Frondly' });
    expect(within(fernCard).getByText(/wilted/)).toBeInTheDocument();

    const catCard = screen.getByRole('article', { name: 'Juniper' });
    expect(within(catCard).getByText(/intervening for plant/)).toBeInTheDocument();
    expect(within(catCard).getByText(/Acting on behalf of/)).toBeInTheDocument();
  });

  it('carries the prototype disclaimer', async () => {
    const snapshot = await seededSnapshot();
    render(<Dashboard snapshot={snapshot} />);
    expect(screen.getByText(/no animal here can die/i)).toBeInTheDocument();
  });
});

// ------------------------------------------------------------ nagimal card --

describe('NagimalCard', () => {
  async function renderCard(offsetMs: number, species: 'dog' | 'cat' | 'plant') {
    const snapshot = await seededSnapshot(offsetMs);
    const nagimal = snapshot.nagimals.find((n) => n.species === species)!;
    const evaluation = snapshot.evaluations.find((e) => e.nagimalId === nagimal.id)!;
    const responsibility = snapshot.responsibilities.find(
      (r) => r.id === evaluation.responsibilityId,
    );
    render(
      <NagimalCard
        nagimal={nagimal}
        evaluation={evaluation}
        responsibility={responsibility}
        accessories={[]}
        now={Date.now() + offsetMs}
        interveningForName={null}
        onEdit={vi.fn()}
      />,
    );
    return { nagimal, evaluation };
  }

  it('reveals the deterministic reasons on request', async () => {
    const user = userEvent.setup();
    await renderCard(3 * DAY - 2 * HOUR, 'dog');

    const toggle = screen.getByRole('button', { name: /Why is Bear like this/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/The deadline is 2 hours away/)).toBeInTheDocument();
  });

  it('captions every sound in text', async () => {
    await renderCard(3 * DAY - 10 * 60 * 1000, 'dog');
    expect(screen.getByText(/Sound: An urgent bark/)).toBeInTheDocument();
  });

  it('describes stage without relying on colour', async () => {
    await renderCard(3 * DAY - 10 * 60 * 1000, 'dog');
    expect(screen.getByLabelText('Stage 4 of 4: Urgent')).toBeInTheDocument();
  });

  it('recommends one next action', async () => {
    await renderCard(3 * DAY - 10 * 60 * 1000, 'dog');
    expect(screen.getByText(/Recommended next:/)).toBeInTheDocument();
    expect(screen.getByText(/Finish it, or set a real new commitment/)).toBeInTheDocument();
  });

  it('offers every meaningful action, with the destructive ones tucked away', async () => {
    const user = userEvent.setup();
    await renderCard(0, 'dog');

    expect(screen.getByRole('button', { name: 'Mark attended' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Snooze' })).toBeInTheDocument();

    // The irreversible-looking actions live behind a disclosure, closed by default.
    const summary = screen.getByText('Other ways to resolve this');
    const disclosure = summary.closest('details')!;
    expect(disclosure.open).toBe(false);

    await user.click(summary);
    expect(disclosure.open).toBe(true);
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convert to Resource' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to dormant' })).toBeInTheDocument();
  });

  it('a snooze demands an explicit new commitment', async () => {
    const user = userEvent.setup();
    await renderCard(0, 'dog');

    await user.click(screen.getByRole('button', { name: 'Snooze' }));
    expect(
      screen.getByLabelText(/When will you actually come back to this/),
    ).toBeInTheDocument();
    expect(screen.getByText(/A snooze is a deferral, not progress/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit to that time' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------- action wiring --

describe('meaningful actions', () => {
  it('marking attended calms the fern and stops the intervention', async () => {
    const user = userEvent.setup();
    const repository = new LocalRepository();
    setRepository(repository);

    await repository.reset(OWNER);
    await repository.createHousehold({ ownerId: OWNER, dogVariant: 'bear', dogName: 'Bear' });
    useAppStore.setState({ identity: { id: OWNER, label: 'x', isLocalDemo: true } });

    // Ten days on, the fern is wilted and Juniper is making a scene.
    await act(async () => {
      await useAppStore.getState().setTimeOffset(10 * DAY, 'test');
    });

    let snapshot = useAppStore.getState().snapshot!;
    const fern = snapshot.nagimals.find((n) => n.species === 'plant')!;
    const cat = snapshot.nagimals.find((n) => n.species === 'cat')!;
    expect(snapshot.evaluations.find((e) => e.nagimalId === cat.id)!.state).toBe(
      'intervening_for_plant',
    );

    const { rerender } = render(<Dashboard snapshot={snapshot} />);
    const fernCard = screen.getByRole('article', { name: 'Frondly' });
    await user.click(within(fernCard).getByRole('button', { name: 'Mark attended' }));

    await waitFor(() => {
      const after = useAppStore.getState().snapshot!;
      expect(after.evaluations.find((e) => e.nagimalId === fern.id)!.stage).toBe(0);
      expect(after.evaluations.find((e) => e.nagimalId === cat.id)!.state).not.toBe(
        'intervening_for_plant',
      );
    });

    snapshot = useAppStore.getState().snapshot!;
    rerender(<Dashboard snapshot={snapshot} />);
    expect(within(screen.getByRole('article', { name: 'Frondly' })).getByText(/healthy/)).toBeInTheDocument();
  });

  it('completing a Project settles the dog and earns a keepsake', async () => {
    const user = userEvent.setup();
    const repository = new LocalRepository();
    setRepository(repository);
    await repository.reset(OWNER);
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    useAppStore.setState({ identity: { id: OWNER, label: 'x', isLocalDemo: true } });

    const project = source.responsibilities.find((r) => r.paraClass === 'project')!;
    const toDeadline = Date.parse(project.deadlineAt!) - Date.now() - 15 * 60 * 1000;
    await act(async () => {
      await useAppStore.getState().setTimeOffset(toDeadline, 'test');
    });

    let snapshot = useAppStore.getState().snapshot!;
    const dog = snapshot.nagimals.find((n) => n.species === 'dog')!;
    expect(snapshot.evaluations.find((e) => e.nagimalId === dog.id)!.stage).toBe(4);

    const { rerender } = render(<Dashboard snapshot={snapshot} />);
    const dogCard = screen.getByRole('article', { name: 'Bear' });
    await user.click(within(dogCard).getByRole('button', { name: 'Complete' }));

    await waitFor(() => {
      const after = useAppStore.getState().snapshot!;
      expect(after.evaluations.find((e) => e.nagimalId === dog.id)!.stage).toBe(0);
      expect(after.accessories).toHaveLength(1);
    });

    snapshot = useAppStore.getState().snapshot!;
    rerender(<Dashboard snapshot={snapshot} />);
    expect(screen.getByTitle(/Finished without a single snooze/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------- time controls --

describe('TimePanel', () => {
  it('offers every required preset plus a reset', async () => {
    const snapshot = await seededSnapshot();
    useAppStore.setState({ snapshot });
    render(<TimePanel />);

    for (const label of [
      'Now',
      'Six hours later',
      'One day later',
      'Three days later',
      'One hour before deadline',
      'Fifteen minutes before deadline',
      'Past deadline',
      'Reset simulation',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('says plainly that the device clock is untouched', async () => {
    const snapshot = await seededSnapshot();
    useAppStore.setState({ snapshot });
    render(<TimePanel />);
    expect(screen.getByText(/Your device clock is untouched/)).toBeInTheDocument();
  });

  it('applying a preset stores an offset and re-evaluates', async () => {
    const user = userEvent.setup();
    const repository = new LocalRepository();
    setRepository(repository);
    await repository.reset(OWNER);
    await repository.createHousehold({ ownerId: OWNER, dogVariant: 'bear', dogName: 'Bear' });
    useAppStore.setState({ identity: { id: OWNER, label: 'x', isLocalDemo: true } });
    await act(async () => {
      await useAppStore.getState().refresh();
    });

    render(<TimePanel />);
    await user.click(screen.getByRole('button', { name: 'Three days later' }));

    await waitFor(() => {
      expect(useAppStore.getState().timeOffsetMs).toBe(3 * DAY);
    });
    // The offset lives apart from the household, in its own key.
    expect(localStorage.getItem('nagimals.timeOffsetMs')).toBe(String(3 * DAY));
  });

  it('disables deadline-relative presets when nothing has a deadline', async () => {
    const snapshot = await seededSnapshot();
    useAppStore.setState({
      snapshot: { ...snapshot, responsibilities: snapshot.responsibilities.map((r) => ({ ...r, deadlineAt: null })) },
    });
    render(<TimePanel />);
    expect(screen.getByRole('button', { name: 'Past deadline' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Three days later' })).toBeEnabled();
  });
});

// ------------------------------------------------------ responsibility form --

describe('ResponsibilityEditor', () => {
  it('creates a Project with a deadline', async () => {
    const user = userEvent.setup();
    const repository = new LocalRepository();
    setRepository(repository);
    await repository.reset(OWNER);
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    useAppStore.setState({ identity: { id: OWNER, label: 'x', isLocalDemo: true } });

    const onDone = vi.fn();
    render(
      <ResponsibilityEditor
        existing={null}
        nagimals={source.nagimals}
        householdId={source.household.id}
        ownerId={OWNER}
        onDone={onDone}
      />,
    );

    await user.type(screen.getByLabelText('Title'), 'File the quarterly return');
    await user.type(screen.getByLabelText('Deadline'), '2026-12-24T09:00');
    await user.click(screen.getByRole('button', { name: 'Create responsibility' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const stored = await repository.load(OWNER);
    const created = stored!.responsibilities.find((r) => r.title === 'File the quarterly return');
    expect(created).toBeDefined();
    expect(created!.paraClass).toBe('project');
    expect(created!.deadlineAt).not.toBeNull();
  });

  it('swaps the deadline field for an interval when the class is an Area', async () => {
    const user = userEvent.setup();
    const source = seedDemoHousehold(OWNER);
    render(
      <ResponsibilityEditor
        existing={null}
        nagimals={source.nagimals}
        householdId={source.household.id}
        ownerId={OWNER}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Deadline')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'area' }));

    expect(screen.queryByLabelText('Deadline')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Expected attention interval/)).toBeInTheDocument();
  });

  it('explains that Resources and Archives stay quiet', async () => {
    const user = userEvent.setup();
    const source = seedDemoHousehold(OWNER);
    render(
      <ResponsibilityEditor
        existing={null}
        nagimals={source.nagimals}
        householdId={source.household.id}
        ownerId={OWNER}
        onDone={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'resource' }));
    expect(screen.getByText(/should never nag you/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'archive' }));
    expect(screen.getByText(/never raises an alert/)).toBeInTheDocument();
  });

  it('says quiet hours hide the notification, not the state', async () => {
    const source = seedDemoHousehold(OWNER);
    render(
      <ResponsibilityEditor
        existing={null}
        nagimals={source.nagimals}
        householdId={source.household.id}
        ownerId={OWNER}
        onDone={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Quiet hours suppress the notification, not the visible state/),
    ).toBeInTheDocument();
  });
});
