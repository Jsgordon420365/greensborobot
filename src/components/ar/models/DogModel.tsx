/**
 * Procedural low-poly dog.
 *
 * Body shape, coat and markings come from the shelter candidate, so Bear,
 * Sunny and Pepper are visibly different animals. Posture and motion come from
 * the escalation stage: asleep, head up, approaching, nudging, barking.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import { findDogCandidate } from '../../../domain';
import type { MovementBehavior } from '../../../domain';

export interface ModelProps {
  variant: string;
  stage: number;
  movement: MovementBehavior;
  /** Set from prefers-reduced-motion; freezes all non-essential motion. */
  reducedMotion?: boolean;
  /** Accessory keys earned by this Nagimal. */
  accessories?: string[];
}

const BUILD_SCALE: Record<'large' | 'medium' | 'compact', [number, number, number]> = {
  large: [1.15, 1.1, 1.2],
  medium: [1.0, 1.0, 1.0],
  compact: [0.85, 0.86, 0.85],
};

export function DogModel({
  variant,
  stage,
  movement,
  reducedMotion = false,
  accessories = [],
}: ModelProps) {
  const candidate = useMemo(() => findDogCandidate(variant), [variant]);
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const jaw = useRef<Mesh>(null);
  const body = useRef<Group>(null);

  const scale = BUILD_SCALE[candidate.build];
  const coat = candidate.coat;
  const accent = candidate.accent;

  // Speckles and patches are baked once per variant, never per frame.
  const markings = useMemo(() => {
    if (candidate.marking === 'solid') return [];
    const rng = mulberry32(hash(candidate.variant));
    const count = candidate.marking === 'speckled' ? 9 : 3;
    return Array.from({ length: count }, () => ({
      // Kept close to the torso surface so a marking reads as a marking and
      // not as a ball floating beside the dog.
      position: [
        (rng() - 0.5) * 0.34,
        0.3 + rng() * 0.14,
        (rng() - 0.5) * 0.56,
      ] as [number, number, number],
      size: candidate.marking === 'speckled' ? 0.045 + rng() * 0.03 : 0.09 + rng() * 0.04,
    }));
  }, [candidate.marking, candidate.variant]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const still = reducedMotion;

    // Posture: asleep at stage 0, progressively more upright and forward.
    // Lying down is a *lowered* body, not a pitched one — tipping the torso
    // forward buried the head in the floor and read as a plank.
    const lie = stage === 0 ? 1 : 0;
    const targetY = -0.13 * lie;
    const targetPitch = 0;
    const approach = movement === 'approach' || movement === 'frantic' ? 0.22 : 0;

    if (body.current) {
      body.current.position.y = THREE.MathUtils.lerp(body.current.position.y, targetY, 0.1);
      body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, targetPitch, 0.1);
      // A slow breath, so a sleeping dog is not a still object.
      if (!still) {
        body.current.scale.y = 1 + Math.sin(t * (stage === 0 ? 1.1 : 2.2)) * 0.012;
      }
    }

    if (root.current) {
      root.current.position.z = THREE.MathUtils.lerp(root.current.position.z, approach, 0.06);
      if (movement === 'frantic' && !still) {
        root.current.position.y = Math.abs(Math.sin(t * 9)) * 0.06;
      } else {
        root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, 0, 0.1);
      }
      root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, 0, 0.08);
    }

    if (head.current) {
      // Head lifts as the stage rises; bobs when nudging or barking.
      const lift = stage === 0 ? -0.34 : stage === 1 ? 0.02 : 0.1;
      head.current.position.y = THREE.MathUtils.lerp(head.current.position.y, 0.52 + lift, 0.1);
      if (!still && stage >= 3) head.current.rotation.x = Math.sin(t * 7) * 0.12;
      else if (!still && stage === 2) head.current.rotation.x = Math.sin(t * 2.2) * 0.05;
      else head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, 0, 0.1);
    }

    if (tail.current && !still) {
      // Wag speed tracks the stage. Asleep the tail is nearly motionless.
      const speed = [0.7, 3, 5, 7, 10][Math.min(stage, 4)];
      const amplitude = [0.06, 0.25, 0.4, 0.5, 0.6][Math.min(stage, 4)];
      tail.current.rotation.y = Math.sin(t * speed) * amplitude;
    }

    if (jaw.current) {
      // The jaw only opens for an actual bark.
      const open = stage === 4 && !still ? Math.max(0, Math.sin(t * 12)) * 0.18 : 0;
      jaw.current.position.y = -0.06 - open;
      jaw.current.rotation.x = open * 1.6;
    }
  });

  return (
    <group ref={root} scale={scale} name="dog">
      <group ref={body}>
        <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 0.34, 0.72]} />
          <meshStandardMaterial color={coat} roughness={0.85} />
        </mesh>

        {markings.map((m, i) => (
          <mesh key={i} position={m.position}>
            <sphereGeometry args={[m.size, 8, 6]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
        ))}

        {(
          [
            [-0.14, 0.11, 0.26],
            [0.14, 0.11, 0.26],
            [-0.14, 0.11, -0.24],
            [0.14, 0.11, -0.24],
          ] as [number, number, number][]
        ).map((p, i) => (
          <mesh key={i} position={p} castShadow>
            <boxGeometry args={[0.11, 0.24, 0.12]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
        ))}

        <group ref={tail} position={[0, 0.44, -0.36]}>
          <mesh position={[0, 0.05, -0.12]} rotation={[0.6, 0, 0]} castShadow>
            <capsuleGeometry args={[0.045, 0.24, 3, 6]} />
            <meshStandardMaterial color={coat} roughness={0.85} />
          </mesh>
        </group>

        <group ref={head} position={[0, 0.52, 0.38]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.28, 0.3]} />
            <meshStandardMaterial color={coat} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.02, 0.2]} castShadow>
            <boxGeometry args={[0.16, 0.13, 0.16]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          <mesh ref={jaw} position={[0, -0.06, 0.2]}>
            <boxGeometry args={[0.15, 0.05, 0.15]} />
            <meshStandardMaterial color="#5b3730" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.02, 0.29]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color="#241a17" roughness={0.5} />
          </mesh>
          {([-0.08, 0.08] as const).map((x) => (
            <mesh key={x} position={[x, 0.07, 0.15]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial color="#20160f" roughness={0.3} />
            </mesh>
          ))}
          {([-0.12, 0.12] as const).map((x) => (
            <mesh
              key={x}
              position={[x, 0.16, -0.02]}
              rotation={[stage === 0 ? 0.9 : 0.15, 0, x < 0 ? -0.2 : 0.2]}
              castShadow
            >
              <boxGeometry args={[0.08, 0.14, 0.04]} />
              <meshStandardMaterial color={accent} roughness={0.9} />
            </mesh>
          ))}
        </group>

        {candidate.accessory === 'bandana' && (
          <mesh position={[0, 0.44, 0.26]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.32, 0.12, 0.04]} />
            <meshStandardMaterial color="#c0453c" roughness={0.8} />
          </mesh>
        )}
        {candidate.accessory === 'collar_tag' && (
          <>
            <mesh position={[0, 0.45, 0.26]}>
              <torusGeometry args={[0.15, 0.02, 6, 16]} />
              <meshStandardMaterial color="#8a2f2f" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.34, 0.3]}>
              <cylinderGeometry args={[0.035, 0.035, 0.012, 10]} />
              <meshStandardMaterial color="#d9b64a" metalness={0.6} roughness={0.35} />
            </mesh>
          </>
        )}

        {/* Earned keepsakes: small, permanent, never a species change. */}
        {accessories.includes('gold_star_pin') && (
          <mesh position={[0.13, 0.46, 0.28]} rotation={[0, 0, 0.4]}>
            <cylinderGeometry args={[0.05, 0.05, 0.015, 5]} />
            <meshStandardMaterial color="#f0c64a" metalness={0.7} roughness={0.25} />
          </mesh>
        )}
        {accessories.includes('blue_bandana') && (
          <mesh position={[0, 0.42, 0.24]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.34, 0.13, 0.04]} />
            <meshStandardMaterial color="#3f6fae" roughness={0.8} />
          </mesh>
        )}
        {accessories.includes('brass_collar_charm') && (
          <mesh position={[0, 0.33, 0.31]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color="#c9922f" metalness={0.75} roughness={0.3} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
