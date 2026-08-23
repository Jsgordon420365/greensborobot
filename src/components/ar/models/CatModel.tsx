/**
 * Procedural low-poly calico cat.
 *
 * Juniper's motion is the household's escalation ladder made visible: loafing,
 * a slow blink, a prolonged stare, pawing at something, and finally shouldering
 * an object off a shelf.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import type { ModelProps } from './DogModel';

const CALICO_WHITE = '#f0e9df';
const CALICO_ORANGE = '#d98b4a';
const CALICO_BLACK = '#332c2a';

export function CatModel({
  stage,
  movement,
  reducedMotion = false,
  accessories = [],
}: ModelProps) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const paw = useRef<Group>(null);
  const eyelids = useRef<Group>(null);
  const knocked = useRef<Mesh>(null);

  // Calico patches are deterministic per render, not random per frame.
  const patches = useMemo(
    () =>
      [
        { p: [0.1, 0.3, 0.12], s: 0.13, c: CALICO_ORANGE },
        { p: [-0.12, 0.33, -0.08], s: 0.11, c: CALICO_BLACK },
        { p: [0.06, 0.38, -0.2], s: 0.1, c: CALICO_ORANGE },
        { p: [-0.08, 0.28, 0.2], s: 0.09, c: CALICO_BLACK },
      ] as Array<{ p: [number, number, number]; s: number; c: string }>,
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const still = reducedMotion;

    if (root.current) {
      if (movement === 'circle' && !still) {
        // Pacing around whatever it is pawing at.
        root.current.position.x = Math.sin(t * 1.4) * 0.18;
        root.current.rotation.y = Math.sin(t * 1.4) * 0.35;
      } else if (movement === 'frantic' && !still) {
        root.current.position.x = Math.sin(t * 11) * 0.05;
        root.current.rotation.z = Math.sin(t * 9) * 0.06;
      } else {
        root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, 0, 0.08);
        root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, 0, 0.08);
        root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, 0, 0.08);
      }
    }

    if (head.current) {
      // From stage 2 the cat locks on and does not look away.
      const locked = stage >= 2;
      head.current.rotation.y = locked
        ? THREE.MathUtils.lerp(head.current.rotation.y, 0, 0.15)
        : Math.sin(t * 0.6) * 0.2;
      head.current.rotation.x = still ? 0 : Math.sin(t * 1.1) * 0.03;
    }

    if (eyelids.current) {
      // A slow blink is the stage-1 signal; a stare never blinks.
      const blink =
        stage === 1 && !still ? (Math.sin(t * 1.2) > 0.93 ? 1 : 0) : stage >= 2 ? 0 : still ? 0 : Math.sin(t * 3) > 0.97 ? 1 : 0;
      eyelids.current.scale.y = THREE.MathUtils.lerp(eyelids.current.scale.y, blink, 0.4);
    }

    if (tail.current && !still) {
      // A flicking tail is how a cat shows it is losing patience.
      const speed = [0.8, 1.6, 3.4, 5.5, 9][Math.min(stage, 4)];
      const amp = [0.12, 0.2, 0.45, 0.6, 0.8][Math.min(stage, 4)];
      tail.current.rotation.z = Math.sin(t * speed) * amp;
      tail.current.rotation.x = Math.sin(t * speed * 0.6) * amp * 0.4;
    }

    if (paw.current) {
      // The paw swipe belongs to stage 3 and up.
      const swipe = stage >= 3 && !still ? Math.max(0, Math.sin(t * 5)) : 0;
      paw.current.rotation.x = -swipe * 1.1;
      paw.current.position.z = 0.24 + swipe * 0.12;
    }

    if (knocked.current) {
      // Stage 4: the object goes over the edge and rolls.
      const active = stage >= 4;
      const fall = active ? Math.min(1, ((t * 0.6) % 3) / 1) : 0;
      knocked.current.visible = active;
      knocked.current.position.set(0.34, 0.42 - fall * 0.36, 0.1 + fall * 0.2);
      knocked.current.rotation.z = fall * 6;
    }
  });

  return (
    <group ref={root} name="cat" scale={0.82}>
      {/* loaf body */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.19, 0.3, 4, 10]} />
        <meshStandardMaterial color={CALICO_WHITE} roughness={0.9} />
      </mesh>

      {patches.map((patch, i) => (
        <mesh key={i} position={patch.p}>
          <sphereGeometry args={[patch.s, 8, 6]} />
          <meshStandardMaterial color={patch.c} roughness={0.92} />
        </mesh>
      ))}

      {/* front paws */}
      <group ref={paw} position={[0, 0.14, 0.24]}>
        {([-0.08, 0.08] as const).map((x) => (
          <mesh key={x} position={[x, 0, 0]} castShadow>
            <capsuleGeometry args={[0.045, 0.08, 3, 6]} />
            <meshStandardMaterial color={CALICO_WHITE} roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* back paws */}
      {([-0.1, 0.1] as const).map((x) => (
        <mesh key={x} position={[x, 0.11, -0.16]} castShadow>
          <capsuleGeometry args={[0.05, 0.06, 3, 6]} />
          <meshStandardMaterial color={CALICO_WHITE} roughness={0.9} />
        </mesh>
      ))}

      {/* tail */}
      <group ref={tail} position={[0, 0.32, -0.26]}>
        <mesh position={[0, 0.1, -0.1]} rotation={[0.8, 0, 0]} castShadow>
          <capsuleGeometry args={[0.032, 0.34, 3, 6]} />
          <meshStandardMaterial color={CALICO_ORANGE} roughness={0.9} />
        </mesh>
      </group>

      {/* head */}
      <group ref={head} position={[0, 0.5, 0.16]}>
        <mesh castShadow>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial color={CALICO_WHITE} roughness={0.9} />
        </mesh>
        {/* orange mask over one side, the calico signature */}
        <mesh position={[0.07, 0.03, 0.03]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color={CALICO_ORANGE} roughness={0.92} transparent opacity={0.85} />
        </mesh>
        <mesh position={[-0.08, 0.06, -0.02]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial color={CALICO_BLACK} roughness={0.92} transparent opacity={0.8} />
        </mesh>

        {/* ears */}
        {([-0.09, 0.09] as const).map((x) => (
          <mesh key={x} position={[x, 0.15, 0]} rotation={[0, 0, x < 0 ? 0.2 : -0.2]} castShadow>
            <coneGeometry args={[0.055, 0.11, 4]} />
            <meshStandardMaterial color={x < 0 ? CALICO_BLACK : CALICO_ORANGE} roughness={0.9} />
          </mesh>
        ))}

        {/* eyes, unmistakably green */}
        {([-0.06, 0.06] as const).map((x) => (
          <mesh key={x} position={[x, 0.02, 0.14]}>
            <sphereGeometry args={[0.032, 8, 6]} />
            <meshStandardMaterial color="#7dbb52" emissive="#2f5a1e" roughness={0.3} />
          </mesh>
        ))}
        {/* eyelids, used for the slow blink */}
        <group ref={eyelids} position={[0, 0.03, 0.15]} scale={[1, 0, 1]}>
          {([-0.06, 0.06] as const).map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.07, 0.07, 0.02]} />
              <meshStandardMaterial color={CALICO_WHITE} roughness={0.9} />
            </mesh>
          ))}
        </group>

        <mesh position={[0, -0.03, 0.16]}>
          <coneGeometry args={[0.022, 0.03, 4]} />
          <meshStandardMaterial color="#e0a0a8" roughness={0.6} />
        </mesh>
      </group>

      {/* the object the cat knocks over at stage 4 */}
      <mesh ref={knocked} visible={false}>
        <cylinderGeometry args={[0.05, 0.05, 0.11, 10]} />
        <meshStandardMaterial color="#8fb8cc" roughness={0.4} />
      </mesh>

      {accessories.includes('green_ribbon') && (
        <mesh position={[0, 0.38, 0.18]} rotation={[0.3, 0, 0]}>
          <torusGeometry args={[0.13, 0.014, 6, 14]} />
          <meshStandardMaterial color="#4f9c62" roughness={0.7} />
        </mesh>
      )}
      {accessories.includes('gold_star_pin') && (
        <mesh position={[0.1, 0.38, 0.2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.012, 5]} />
          <meshStandardMaterial color="#f0c64a" metalness={0.7} roughness={0.25} />
        </mesh>
      )}
    </group>
  );
}
