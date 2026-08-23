/**
 * The single application store.
 *
 * It holds the identity, the canonical household snapshot and the simulated
 * time offset. Every mutation goes through the repository, so Local
 * Demonstration Mode and Connected Mode follow identical code paths here.
 */

import { create } from 'zustand';
import type { HouseholdSnapshot, Responsibility } from '../domain';
import type { ActionKind } from '../domain';
import { resolveMode, type AppMode } from '../lib/env';
import { describeError, logger } from '../lib/logger';
import { getRepository } from '../services';
import type { NagimalsIdentity } from '../services';
import { effectiveNow, readOffset, writeOffset } from '../services/timeSimulation';

export interface AppState {
  mode: AppMode;
  identity: NagimalsIdentity | null;
  snapshot: HouseholdSnapshot | null;
  /** True until the first identity/household resolution finishes. */
  booting: boolean;
  busy: boolean;
  error: string | null;
  timeOffsetMs: number;
  /** Set when a magic link has been sent and we are waiting for the redirect. */
  magicLinkSentTo: string | null;

  boot: () => Promise<void>;
  signInLocal: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  adopt: (input: {
    dogVariant: string;
    dogName: string;
    communicationStyle: 'calm' | 'encouraging' | 'direct';
  }) => Promise<void>;
  refresh: () => Promise<void>;
  act: (input: {
    responsibilityId: string;
    kind: ActionKind;
    nextCommitmentAt?: string | null;
    note?: string | null;
  }) => Promise<void>;
  saveResponsibility: (responsibility: Responsibility) => Promise<void>;
  setTimeOffset: (offsetMs: number, reason: string) => Promise<void>;
  resetHousehold: () => Promise<void>;
  clearError: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: resolveMode(),
  identity: null,
  snapshot: null,
  booting: true,
  busy: false,
  error: null,
  timeOffsetMs: 0,
  magicLinkSentTo: null,

  async boot() {
    const repository = getRepository();
    const offset = readOffset();
    set({ booting: true, timeOffsetMs: offset, mode: repository.mode });
    logger.info('app.init', 'Booting Nagimals', { mode: repository.mode, offsetMs: offset });

    try {
      const identity = await repository.getIdentity();
      set({ identity });
      if (identity) {
        const source = await repository.load(identity.id);
        if (source) {
          const snapshot = await repository.evaluate({
            ownerId: identity.id,
            now: effectiveNow(offset),
          });
          set({ snapshot });
        }
      }
    } catch (error) {
      logger.error('app.init', 'Boot failed', describeError(error));
      set({ error: message(error) });
    } finally {
      set({ booting: false });
    }
  },

  async signInLocal() {
    const repository = getRepository();
    set({ busy: true, error: null });
    try {
      const identity = await repository.signIn();
      set({ identity });
      if (identity) {
        const source = await repository.load(identity.id);
        if (source) await get().refresh();
      }
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async signInWithEmail(email: string) {
    const repository = getRepository();
    set({ busy: true, error: null });
    try {
      const identity = await repository.signIn(email);
      if (identity) {
        set({ identity });
        await get().refresh();
      } else {
        set({ magicLinkSentTo: email });
      }
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async signOut() {
    await getRepository().signOut();
    set({ identity: null, snapshot: null, magicLinkSentTo: null });
  },

  async adopt(input) {
    const repository = getRepository();
    set({ busy: true, error: null });
    try {
      let identity = get().identity;
      identity ??= await repository.signIn();
      if (!identity) throw new Error('Sign in before adopting a household member.');
      set({ identity });

      await repository.createHousehold({
        ownerId: identity.id,
        dogVariant: input.dogVariant,
        dogName: input.dogName.trim() || 'Bear',
        communicationStyle: input.communicationStyle,
      });
      logger.info('household.seed', 'Seeded the demonstration household', {
        ownerId: identity.id,
        dogVariant: input.dogVariant,
      });
      await get().refresh();
    } catch (error) {
      logger.error('household.create', 'Adoption failed', describeError(error));
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async refresh() {
    const { identity, timeOffsetMs } = get();
    if (!identity) return;
    try {
      const snapshot = await getRepository().evaluate({
        ownerId: identity.id,
        now: effectiveNow(timeOffsetMs),
      });
      set({ snapshot, error: null });
    } catch (error) {
      // "No household to evaluate" is the normal pre-adoption state, not a bug.
      if (/No household/i.test(message(error))) {
        set({ snapshot: null });
        return;
      }
      logger.error('rules.evaluate', 'Evaluation failed', describeError(error));
      set({ error: message(error) });
    }
  },

  async act(input) {
    const { identity, timeOffsetMs } = get();
    if (!identity) return;
    set({ busy: true, error: null });
    try {
      const snapshot = await getRepository().recordAction({
        ownerId: identity.id,
        responsibilityId: input.responsibilityId,
        kind: input.kind,
        now: effectiveNow(timeOffsetMs),
        nextCommitmentAt: input.nextCommitmentAt,
        note: input.note,
      });
      set({ snapshot });
    } catch (error) {
      logger.error('action.record', 'Action failed', describeError(error));
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async saveResponsibility(responsibility) {
    set({ busy: true, error: null });
    try {
      await getRepository().saveResponsibility(responsibility);
      await get().refresh();
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async setTimeOffset(offsetMs, reason) {
    writeOffset(offsetMs, reason);
    set({ timeOffsetMs: offsetMs });
    await get().refresh();
  },

  async resetHousehold() {
    const { identity } = get();
    if (!identity) return;
    set({ busy: true });
    try {
      await getRepository().reset(identity.id);
      writeOffset(0, 'Reset the simulation along with the household');
      set({ snapshot: null, timeOffsetMs: 0 });
    } finally {
      set({ busy: false });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

/** The effective time the UI should render against. */
export function useEffectiveNow(): number {
  return useAppStore((s) => effectiveNow(s.timeOffsetMs));
}
