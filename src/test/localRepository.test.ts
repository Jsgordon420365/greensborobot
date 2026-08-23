/**
 * Local Demonstration Mode persistence.
 *
 * These tests are what back the claim "close the tab and the household is
 * still there": each one goes through a *fresh* repository instance, so it
 * exercises real reads from storage rather than in-memory state.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../domain';
import { LocalRepository } from '../services/localRepository';

const OWNER = 'local-test-owner';

async function fresh() {
  const repository = new LocalRepository();
  await repository.reset(OWNER);
  return repository;
}

describe('LocalRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a demo identity once and reuses it', async () => {
    const repository = new LocalRepository();
    const first = await repository.signIn();
    const second = await repository.signIn();
    expect(first.id).toBe(second.id);
    expect(first.isLocalDemo).toBe(true);
  });

  it('returns null before a household exists', async () => {
    const repository = await fresh();
    expect(await repository.load(OWNER)).toBeNull();
  });

  it('seeds a household with one dog, one cat and one fern', async () => {
    const repository = await fresh();
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'pepper',
      dogName: 'Pepper',
    });
    expect(source.nagimals.map((n) => n.species).sort()).toEqual(['cat', 'dog', 'plant']);
    expect(source.nagimals.find((n) => n.species === 'dog')?.name).toBe('Pepper');
    expect(source.responsibilities).toHaveLength(3);
  });

  it('survives a new repository instance, which is what a reload does', async () => {
    const repository = await fresh();
    await repository.createHousehold({ ownerId: OWNER, dogVariant: 'sunny', dogName: 'Sunny' });

    // A different instance reads from storage, exactly as a fresh page load would.
    const reloaded = new LocalRepository();
    const source = await reloaded.load(OWNER);
    expect(source).not.toBeNull();
    expect(source!.nagimals.find((n) => n.species === 'dog')?.name).toBe('Sunny');
    expect(source!.household.name).toBe('The Household');
  });

  it('evaluates with the same engine the server uses', async () => {
    const repository = await fresh();
    await repository.createHousehold({ ownerId: OWNER, dogVariant: 'bear', dogName: 'Bear' });

    const calm = await repository.evaluate({ ownerId: OWNER, now: Date.now(), localHour: 12 });
    expect(calm.source).toBe('local');
    expect(calm.evaluations.every((e) => e.stage === 0)).toBe(true);

    // Ten days on, the fern is wilted and Juniper has stepped in.
    const later = await repository.evaluate({
      ownerId: OWNER,
      now: Date.now() + 10 * DAY,
      localHour: 12,
    });
    const fern = later.evaluations.find((e) =>
      later.nagimals.find((n) => n.id === e.nagimalId)?.species === 'plant',
    );
    const cat = later.evaluations.find((e) =>
      later.nagimals.find((n) => n.id === e.nagimalId)?.species === 'cat',
    );
    expect(fern!.stage).toBeGreaterThanOrEqual(3);
    expect(cat!.state).toBe('intervening_for_plant');
  });

  it('persists an action across instances', async () => {
    const repository = await fresh();
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    const project = source.responsibilities.find((r) => r.paraClass === 'project')!;

    await repository.recordAction({
      ownerId: OWNER,
      responsibilityId: project.id,
      kind: 'snoozed',
      now: Date.now(),
      nextCommitmentAt: new Date(Date.now() + DAY).toISOString(),
    });

    const reloaded = new LocalRepository();
    const after = await reloaded.load(OWNER);
    const stored = after!.responsibilities.find((r) => r.id === project.id)!;
    expect(stored.snoozeCount).toBe(1);
    expect(stored.status).toBe('snoozed');
    expect(stored.nextCommitmentAt).not.toBeNull();
  });

  it('records an accessory exactly once, however often a thing is completed', async () => {
    const repository = await fresh();
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    const project = source.responsibilities.find((r) => r.paraClass === 'project')!;

    await repository.recordAction({
      ownerId: OWNER,
      responsibilityId: project.id,
      kind: 'completed',
      now: Date.now(),
    });
    await repository.recordAction({
      ownerId: OWNER,
      responsibilityId: project.id,
      kind: 'reactivated',
      now: Date.now(),
    });
    const snapshot = await repository.recordAction({
      ownerId: OWNER,
      responsibilityId: project.id,
      kind: 'completed',
      now: Date.now() + HOUR,
    });

    expect(snapshot.accessories).toHaveLength(1);
  });

  it('writes an event for every meaningful action', async () => {
    const repository = await fresh();
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    const project = source.responsibilities.find((r) => r.paraClass === 'project')!;
    await repository.recordAction({
      ownerId: OWNER,
      responsibilityId: project.id,
      kind: 'attended',
      now: Date.now(),
    });

    const events = await repository.listEvents(OWNER);
    expect(events[0].eventType).toBe('attended');
    expect(events.some((e) => e.eventType === 'household_created')).toBe(true);
    expect(events.filter((e) => e.eventType === 'nagimal_adopted')).toHaveLength(3);
  });

  it('saves a new responsibility and evaluates it', async () => {
    const repository = await fresh();
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    const dog = source.nagimals.find((n) => n.species === 'dog')!;

    const { makeResponsibility } = await import('../domain');
    const extra = makeResponsibility({
      householdId: source.household.id,
      ownerId: OWNER,
      nagimalId: dog.id,
      title: 'A second, overdue Project',
      paraClass: 'project',
      deadlineAt: new Date(Date.now() - HOUR).toISOString(),
      lastAttentionAt: new Date(Date.now() - 10 * DAY).toISOString(),
    });
    await repository.saveResponsibility(extra);

    const snapshot = await repository.evaluate({
      ownerId: OWNER,
      now: Date.now(),
      localHour: 12,
    });
    const dogEval = snapshot.evaluations.find((e) => e.nagimalId === dog.id)!;
    expect(dogEval.stage).toBe(4);
    expect(dogEval.perResponsibility).toHaveLength(2);
  });

  it('honours the notification cooldown it recorded', async () => {
    const repository = await fresh();
    const source = await repository.createHousehold({
      ownerId: OWNER,
      dogVariant: 'bear',
      dogName: 'Bear',
    });
    const project = source.responsibilities.find((r) => r.paraClass === 'project')!;
    const overdue = Date.parse(project.deadlineAt!) + HOUR;

    const before = await repository.evaluate({ ownerId: OWNER, now: overdue, localHour: 12 });
    expect(before.evaluations.some((e) => e.shouldNotify)).toBe(true);

    await repository.recordNotification(OWNER, project.id, overdue);

    const after = await repository.evaluate({ ownerId: OWNER, now: overdue, localHour: 12 });
    const dogEval = after.evaluations.find((e) => e.responsibilityId === project.id)!;
    expect(dogEval.stage).toBe(4);
    expect(dogEval.shouldNotify).toBe(false);
  });

  it('reset clears everything for that owner', async () => {
    const repository = await fresh();
    await repository.createHousehold({ ownerId: OWNER, dogVariant: 'bear', dogName: 'Bear' });
    await repository.reset(OWNER);
    expect(await repository.load(OWNER)).toBeNull();
  });
});
