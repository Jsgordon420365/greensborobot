/**
 * Procedural Boston fern.
 *
 * The fern is the quietest member of the household: it cannot bark or notify.
 * Its entire vocabulary is posture and colour, so both are driven continuously
 * from the stage rather than snapped between poses.
 *
 * Stage 4 is severely wilted but never dead. There is no dead state to reach.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group } from 'three';
import type { ModelProps } from './DogModel';

const HEALTHY = new THREE.Color('#4f9c56');
const DULL = new THREE.Color('#7d9a45');
const WILTED = new THREE.Color('#8a7434');
const SEVERE = new THREE.Color('#7a5c33');

const FROND_COUNT = 9;
const LEAVES_PER_FROND = 7;

/** Interpolate the frond colour across the five stages. */
function colorForStage(stage: number): THREE.Color {
  const c = new THREE.Color();
  if (stage <= 1) return c.copy(HEALTHY).lerp(DULL, stage);
  if (stage <= 3) return c.copy(DULL).lerp(WILTED, (stage - 1) / 2);
  return c.copy(WILTED).lerp(SEVERE, Math.min(1, stage - 3));
}

export function FernModel({ stage, reducedMotion = false, accessories = [] }: ModelProps) {
  const root = useRef<Group>(null);
  const fronds = useRef<Group[]>([]);

  const layout = useMemo(
    () =>
      Array.from({ length: FROND_COUNT }, (_, i) => {
        const angle = (i / FROND_COUNT) * Math.PI * 2;
        return {
          angle,
          /*
           * Measured from horizontal: a healthy Boston fern throws its fronds
           * up and out, so they start steep. Drooping *reduces* this angle,
           * which is the opposite of what it first looked like.
           */
          tilt: 1.15 + ((i * 37) % 11) / 40,
          length: 0.9 + ((i * 53) % 7) / 24,
        };
      }),
    [],
  );

  const leafColor = useMemo(() => colorForStage(stage), [stage]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Droop grows with the stage: upright at 0, collapsed at 4.
    const droop = Math.min(1, stage / 4);

    fronds.current.forEach((frond, i) => {
      if (!frond) return;
      const base = layout[i]?.tilt ?? 1.2;
      // Upright when healthy, past horizontal and hanging when badly wilted.
      const target = base - droop * 1.75;
      frond.rotation.z = THREE.MathUtils.lerp(frond.rotation.z, target, 0.08);
      if (!reducedMotion) {
        // Healthy fronds sway; wilted ones barely move.
        const sway = (1 - droop) * 0.05;
        frond.rotation.x = Math.sin(t * 0.9 + i) * sway;
      }
    });

    if (root.current) {
      const slump = droop * 0.06;
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, -slump, 0.08);
    }
  });

  return (
    <group name="fern">
      {/* pot */}
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.13, 0.22, 12]} />
        <meshStandardMaterial color="#a4644a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.225, 0]}>
        <cylinderGeometry args={[0.175, 0.175, 0.03, 12]} />
        <meshStandardMaterial color="#8d5340" roughness={0.9} />
      </mesh>
      {/* soil */}
      <mesh position={[0, 0.23, 0]}>
        <cylinderGeometry args={[0.155, 0.155, 0.02, 12]} />
        <meshStandardMaterial color="#3b2c22" roughness={1} />
      </mesh>

      <group ref={root} position={[0, 0.24, 0]}>
        {layout.map((frond, i) => (
          <group key={i} rotation={[0, frond.angle, 0]}>
            <group
              ref={(el) => {
                if (el) fronds.current[i] = el;
              }}
              rotation={[0, 0, frond.tilt]}
            >
              {/* stem */}
              <mesh position={[frond.length * 0.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.008, 0.012, frond.length * 0.45, 5]} />
                <meshStandardMaterial color={leafColor} roughness={0.85} />
              </mesh>
              {/* leaflets, arching further out and drooping at the tip */}
              {Array.from({ length: LEAVES_PER_FROND }, (_, j) => {
                const along = (j + 1) / LEAVES_PER_FROND;
                const x = along * frond.length * 0.45;
                const curl = along * along * (0.3 + stage * 0.22);
                const size = 0.075 * (1 - along * 0.45);
                return (
                  <group key={j} position={[x, -curl * 0.18, 0]} rotation={[0, 0, -curl]}>
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} position={[0, 0, side * 0.045]} rotation={[0, 0, 0]}>
                        <boxGeometry args={[size * 1.6, 0.012, size]} />
                        <meshStandardMaterial color={leafColor} roughness={0.88} />
                      </mesh>
                    ))}
                  </group>
                );
              })}
            </group>
          </group>
        ))}

        {/* Fallen leaves appear from stage 3, on the soil, still recoverable. */}
        {stage >= 3 &&
          Array.from({ length: stage === 4 ? 6 : 3 }, (_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.cos(angle) * 0.13, -0.005, Math.sin(angle) * 0.13]}
                rotation={[Math.PI / 2, 0, angle]}
              >
                <boxGeometry args={[0.07, 0.008, 0.035]} />
                <meshStandardMaterial color={SEVERE} roughness={0.95} />
              </mesh>
            );
          })}
      </group>

      {accessories.includes('green_ribbon') && (
        <mesh position={[0, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.17, 0.014, 6, 16]} />
          <meshStandardMaterial color="#4f9c62" roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}
