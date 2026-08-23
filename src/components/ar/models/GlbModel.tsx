/**
 * GLB rendering path.
 *
 * Only used when a real model has been dropped into `/public/models`. The
 * animation lookup is deliberately forgiving: an exact clip name wins, then a
 * fuzzy match, then the first clip in the file, and if the file has no clips at
 * all we simply render the static mesh. A missing animation never throws.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import type { Group } from 'three';
import { logger } from '../../../lib/logger';

export interface GlbModelProps {
  url: string;
  /** Animation key from the state mapping, e.g. 'dog_bark'. */
  animation: string;
  loop: 'once' | 'loop' | 'loop-limited';
  reducedMotion?: boolean;
}

/** Exact name, then a fuzzy contains-match, then whatever is available. */
export function pickClipName(
  available: readonly string[],
  requested: string,
): string | null {
  if (available.length === 0) return null;
  const exact = available.find((name) => name === requested);
  if (exact) return exact;

  const lower = requested.toLowerCase();
  const parts = lower.split('_').filter(Boolean);
  const fuzzy = available.find((name) => {
    const candidate = name.toLowerCase();
    return parts.some((part) => part.length > 2 && candidate.includes(part));
  });
  if (fuzzy) return fuzzy;

  return available[0];
}

export function GlbModel({ url, animation, loop, reducedMotion = false }: GlbModelProps) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions, mixer } = useAnimations(animations, group);

  const clipNames = useMemo(() => animations.map((a) => a.name), [animations]);

  useEffect(() => {
    if (reducedMotion) {
      mixer.stopAllAction();
      return;
    }
    const name = pickClipName(clipNames, animation);
    if (!name) return;
    const action = actions[name];
    if (!action) {
      logger.warn('ar.placement', 'A requested animation clip was missing', {
        requested: animation,
        available: clipNames,
      });
      return;
    }

    // Crossfade from whatever is currently playing.
    const running = Object.values(actions).filter((a) => a && a !== action && a.isRunning());
    action.reset().fadeIn(0.35).play();
    action.setLoop(loop === 'once' ? 2200 : 2201, loop === 'loop' ? Infinity : 3);
    for (const other of running) other?.fadeOut(0.35);

    return () => {
      action.fadeOut(0.25);
    };
  }, [actions, animation, clipNames, loop, mixer, reducedMotion]);

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}
