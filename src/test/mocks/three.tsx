/**
 * Stand-ins for the react-three-fiber layer under jsdom, which has no WebGL.
 *
 * Imported for its side effects: the `vi.mock` calls are hoisted, so importing
 * this module before the components under test is what puts them in place.
 *
 * The 3D scene is not what the component tests are about — they cover the
 * decisions around it: which pathway was chosen, which controls appear, what
 * the accessible names are. The renderers themselves are covered by the
 * production build and by the real browser tests.
 */

import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: () => undefined,
  useThree: () => ({
    gl: { xr: { enabled: false, setSession: vi.fn(), getSession: () => null } },
  }),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  PresentationControls: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ContactShadows: () => null,
  Environment: () => null,
  useGLTF: () => ({ scene: {}, animations: [] }),
  useAnimations: () => ({ actions: {}, mixer: { stopAllAction: vi.fn() } }),
}));
