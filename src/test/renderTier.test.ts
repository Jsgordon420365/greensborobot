/**
 * Render tier selection.
 *
 * The decision is pure, so it can be exercised without a browser. What matters
 * is that a thin channel is *chosen*, never stumbled into: a device that cannot
 * draw richly should land on a lower tier deliberately rather than attempt the
 * full one and stutter.
 */

import { describe, expect, it } from 'vitest';
import { tierFromProbe } from '../services/renderTier';

type Probe = Parameters<typeof tierFromProbe>[0];

function probe(overrides: Partial<Probe> = {}): Probe {
  return {
    webgl: 'webgl2',
    software: false,
    cores: 8,
    memoryGb: 8,
    saveData: false,
    slowNetwork: false,
    ...overrides,
  };
}

describe('tierFromProbe', () => {
  it('draws at full detail on a capable device', () => {
    const profile = tierFromProbe(probe());
    expect(profile.tier).toBe('full');
    expect(profile.softShadows).toBe(true);
    expect(profile.roundedForms).toBe(true);
    expect(profile.rimLight).toBe(true);
  });

  it('falls to the avatar tier when there is no WebGL at all', () => {
    const profile = tierFromProbe(probe({ webgl: 'none' }));
    expect(profile.tier).toBe('avatar');
    expect(profile.shadows).toBe(false);
  });

  it('treats a software rasteriser as reduced however healthy its limits look', () => {
    // SwiftShader and llvmpipe report generous capabilities and then run at a
    // few frames per second. Believing the limits is the trap.
    const profile = tierFromProbe(probe({ software: true, cores: 16, memoryGb: 32 }));
    expect(profile.tier).toBe('reduced');
    expect(profile.shadows).toBe(false);
  });

  it('honours data saving over raw capability', () => {
    expect(tierFromProbe(probe({ saveData: true })).tier).toBe('reduced');
    expect(tierFromProbe(probe({ slowNetwork: true })).tier).toBe('reduced');
  });

  it('steps down to standard on WebGL 1', () => {
    expect(tierFromProbe(probe({ webgl: 'webgl1' })).tier).toBe('standard');
  });

  it('needs both weak signals together before reducing', () => {
    // Either alone is unreliable, so either alone only costs the full tier.
    expect(tierFromProbe(probe({ cores: 4 })).tier).toBe('standard');
    expect(tierFromProbe(probe({ memoryGb: 4 })).tier).toBe('standard');
    expect(tierFromProbe(probe({ cores: 4, memoryGb: 4 })).tier).toBe('reduced');
  });

  it('does not read a withheld value as a weak one', () => {
    // Most browsers refuse deviceMemory. Absence must not be read as scarcity,
    // or every privacy-conscious browser gets the thin channel.
    const profile = tierFromProbe(probe({ memoryGb: null, cores: null }));
    expect(profile.tier).toBe('full');
  });

  it('always explains the tier in plain language', () => {
    for (const p of [
      probe(),
      probe({ webgl: 'none' }),
      probe({ software: true }),
      probe({ saveData: true }),
      probe({ cores: 2, memoryGb: 2 }),
    ]) {
      const { reason } = tierFromProbe(p);
      expect(reason.length).toBeGreaterThan(20);
      expect(reason).toMatch(/[.!]$/);
    }
  });

  it('never lets a lower tier cost more than a higher one', () => {
    const order = ['full', 'standard', 'reduced', 'avatar'] as const;
    const profiles = [
      tierFromProbe(probe()),
      tierFromProbe(probe({ webgl: 'webgl1' })),
      tierFromProbe(probe({ software: true })),
      tierFromProbe(probe({ webgl: 'none' })),
    ];
    expect(profiles.map((p) => p.tier)).toEqual([...order]);

    for (let i = 1; i < profiles.length; i += 1) {
      expect(profiles[i].dpr[1]).toBeLessThanOrEqual(profiles[i - 1].dpr[1]);
      expect(profiles[i].segments).toBeLessThanOrEqual(profiles[i - 1].segments);
    }
  });
});
