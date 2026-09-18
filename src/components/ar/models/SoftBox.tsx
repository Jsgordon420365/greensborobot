/**
 * A box with its edges taken off.
 *
 * Every creature here is assembled from primitives, and a hard-edged cube is
 * what makes an assembly read as an assembly. Rounding the corners is the
 * cheapest single change that makes a form read as *drawn* rather than built
 * out of blocks — the difference between a stack of cubes and something a
 * person would want to keep.
 *
 * Falls back to a plain box below the tier that can afford the extra geometry,
 * since a simply-drawn creature is still the creature.
 */

import { forwardRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { Mesh } from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { detectRenderProfile } from '../../../services/renderTier';

type MeshProps = Omit<ThreeElements['mesh'], 'ref' | 'args'>;

export interface SoftBoxProps extends MeshProps {
  /** Width, height and depth, exactly as `boxGeometry` takes them. */
  args: [number, number, number];
  /**
   * How hard the corners stay, 0 to 1. Snouts and ears want a softer read than
   * a torso, which needs to keep its bulk.
   */
  softness?: number;
}

/**
 * The radius has to clear half of the smallest dimension or the bevel eats the
 * whole form and the geometry degenerates. Several parts here are only 4cm
 * deep, so this clamp is load-bearing rather than defensive.
 */
function cornerRadius(args: [number, number, number], softness: number): number {
  const smallest = Math.min(...args);
  return Math.min(smallest * 0.45, smallest * softness);
}

export const SoftBox = forwardRef<Mesh, SoftBoxProps>(function SoftBox(
  { args, softness = 0.34, children, ...rest },
  ref,
) {
  const profile = detectRenderProfile();

  if (!profile.roundedForms) {
    return (
      <mesh ref={ref} {...rest}>
        <boxGeometry args={args} />
        {children}
      </mesh>
    );
  }

  return (
    <RoundedBox
      ref={ref}
      args={args}
      radius={cornerRadius(args, softness)}
      smoothness={profile.segments >= 32 ? 4 : 2}
      creaseAngle={0.5}
      {...rest}
    >
      {children}
    </RoundedBox>
  );
});
