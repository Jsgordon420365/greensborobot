/**
 * The lighting rig.
 *
 * Shared by the room and by an AR session, because a creature lit one way in
 * the shelter and another way on your floor stops reading as the same animal.
 *
 * Three lights, in the order they matter:
 *
 *   key   warm, high and to one side. Does the modelling and casts the shadow.
 *   fill  cool, opposite, no shadow. Keeps the dark side from going to mud.
 *   rim   behind and above. Draws a bright edge along the top of the silhouette
 *         so the creature separates from whatever is behind it.
 *
 * The rim is the one that does the disproportionate work. Without it a form
 * sits *on* a background; with it, it sits *in* a space.
 *
 * Deliberately no `<Environment>`: drei fetches an HDR from a CDN, and when
 * that fetch failed it took the entire scene down with it. Nothing here
 * touches the network.
 */

import { detectRenderProfile } from '../../services/renderTier';

export interface LightingProps {
  /** An AR session composites over the camera feed, so no ambient wash. */
  inSession?: boolean;
}

export function Lighting({ inSession = false }: LightingProps) {
  const profile = detectRenderProfile();

  // A tight shadow frustum is worth more than a large shadow map: the same
  // texels spread over less world space give a noticeably cleaner edge.
  const shadowExtent = 3.2;
  const mapSize = profile.softShadows ? 2048 : 1024;

  if (inSession) {
    return (
      <>
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[1.6, 3.4, 1.8]}
          intensity={1.5}
          castShadow={profile.shadows}
          shadow-mapSize={[mapSize, mapSize]}
          shadow-bias={-0.0012}
        />
        <directionalLight position={[-1.8, 1.6, -1.2]} intensity={0.4} color="#cfe0ff" />
        {profile.rimLight && (
          <directionalLight position={[-0.6, 2.4, -2.6]} intensity={1.1} color="#fff3dc" />
        )}
      </>
    );
  }

  return (
    <>
      <ambientLight intensity={0.34} />
      <hemisphereLight args={['#ffeacb', '#433426', 0.62]} />

      {/* Key */}
      <directionalLight
        position={[2.6, 4.2, 2.4]}
        intensity={1.45}
        color="#fff1d8"
        castShadow={profile.shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
      />

      {/* Fill */}
      <directionalLight position={[-2.8, 1.8, 1.2]} intensity={0.42} color="#bfd4ff" />

      {/* Rim */}
      {profile.rimLight && (
        <directionalLight position={[-1.2, 3.2, -3.4]} intensity={1.25} color="#ffe6b8" />
      )}
    </>
  );
}
