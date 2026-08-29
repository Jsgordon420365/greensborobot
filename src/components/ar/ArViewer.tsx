/**
 * "See in my room" — the augmented reality view.
 *
 * One component covers all four pathways. Which one runs is decided once by
 * `detectArCapability`, so the AR control is never shown when it would not
 * work. Every action available here is also available on the dashboard, so
 * nobody is required to use a camera.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import type { HouseholdSnapshot, Nagimal, Species } from '../../domain';
import { describeAnimation } from '../../domain';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { describeError, logger } from '../../lib/logger';
import { detectArCapability, type ArCapability } from '../../services/arCapability';
import { resolveAsset, type AssetDescriptor } from './assetAdapter';
import { NagimalModel } from './models/NagimalModel';
import { startArSession, type XrSessionHandle } from './webxr';
import { StageMeter } from '../common/StageMeter';

const SPECIES_LABEL: Record<Species, string> = {
  dog: 'Dog',
  cat: 'Cat',
  plant: 'Fern',
};

interface ViewerProps {
  snapshot: HouseholdSnapshot;
}

export function ArViewer({ snapshot }: ViewerProps) {
  const [capability, setCapability] = useState<ArCapability | null>(null);
  const [assets, setAssets] = useState<Record<Species, AssetDescriptor | null>>({
    dog: null,
    cat: null,
    plant: null,
  });
  const [focusId, setFocusId] = useState<string>(snapshot.nagimals[0]?.id ?? '');
  const [inSession, setInSession] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    void detectArCapability().then((c) => {
      if (!cancelled) setCapability(c);
    });
    void Promise.all(
      (['dog', 'cat', 'plant'] as Species[]).map(async (s) => [s, await resolveAsset(s)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setAssets(Object.fromEntries(entries) as Record<Species, AssetDescriptor | null>);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived rather than stored, so a household member disappearing cannot
  // leave a dangling selection behind.
  const focus = snapshot.nagimals.find((n) => n.id === focusId) ?? snapshot.nagimals[0];
  const focusEval = snapshot.evaluations.find((e) => e.nagimalId === focus?.id);

  const accessoriesFor = useCallback(
    (nagimalId: string) =>
      snapshot.accessories.filter((a) => a.nagimalId === nagimalId).map((a) => a.accessoryKey),
    [snapshot.accessories],
  );

  if (!capability) {
    return (
      <div className="viewer" aria-busy="true">
        <div className="state-card">
          <p className="muted">Checking what this device can display…</p>
        </div>
      </div>
    );
  }

  // Pathway 4: no WebGL at all. A polished state card, never a broken canvas.
  if (capability.pathway === 'card') {
    return <StateCardFallback snapshot={snapshot} explanation={capability.explanation} />;
  }

  const canEnterAr = capability.pathway === 'webxr';

  return (
    <div className="stack">
      <div className="viewer">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 1.15, 3.3], fov: 42 }}
          gl={{ antialias: true, alpha: capability.pathway === 'webxr' }}
          onCreated={({ gl }) => {
            gl.xr.enabled = true;
          }}
        >
          <Suspense fallback={null}>
            <Scene
              snapshot={snapshot}
              assets={assets}
              reducedMotion={reducedMotion}
              inSession={inSession}
              focusId={focus?.id ?? ''}
              placed={placed}
              onPlaced={() => setPlaced(true)}
              accessoriesFor={accessoriesFor}
              orbit={!inSession}
            />
          </Suspense>
        </Canvas>

        {focus && focusEval && (
          <p className="viewer__caption" aria-live="polite">
            {focus.name}: {focusEval.state.replace(/_/g, ' ')} —{' '}
            {describeAnimation(focus.species, focusEval.state, focusEval.stage).soundCaption ??
              'no sound'}
          </p>
        )}

        <div className="viewer__overlay" ref={overlayRef}>
          {inSession && (
            <button type="button" className="btn btn--small" onClick={() => void endSession()}>
              Exit AR
            </button>
          )}
        </div>
      </div>

      <div className="row" role="group" aria-label="Choose which household member to show">
        {snapshot.nagimals.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`btn btn--small${n.id === focus?.id ? ' btn--primary' : ''}`}
            aria-pressed={n.id === focus?.id}
            onClick={() => setFocusId(n.id)}
          >
            {n.name} <span className="visually-hidden">({SPECIES_LABEL[n.species]})</span>
          </button>
        ))}
      </div>

      <p className="faint">{capability.explanation}</p>

      <div className="btn-row">
        {canEnterAr && !inSession && (
          <button type="button" className="btn btn--primary" onClick={() => void beginSession()}>
            Start the camera
          </button>
        )}
        {inSession && (
          <button type="button" className="btn" onClick={() => setPlaced(false)}>
            Reset placement
          </button>
        )}
        {capability.pathway === 'model-viewer' && assets.dog?.usdzUrl && (
          <a
            className="btn"
            href={assets[focus?.species ?? 'dog']?.usdzUrl ?? '#'}
            rel="ar"
          >
            View {focus?.name} in AR (Quick Look)
          </a>
        )}
      </div>

      {sessionError && (
        <p className="mode-banner mode-banner--error" role="alert">
          {sessionError}
        </p>
      )}

      <p className="faint">
        Camera frames stay on this device. Nagimals never reads, records, uploads or stores
        them, and asks for the camera only when you choose to enter AR. Placement is for this
        session only — the household does not map or remember your room.
      </p>
    </div>
  );

  async function beginSession() {
    setSessionError(null);
    try {
      if (!rendererRef) throw new Error('The 3D canvas is not ready yet.');
      const handle = await startArSession({ overlayRoot: overlayRef.current });
      sessionRef = handle;
      await rendererRef.xr.setSession(handle.session);
      setInSession(true);
      setPlaced(false);
      handle.session.addEventListener('end', () => {
        setInSession(false);
        sessionRef = null;
      });
    } catch (error) {
      logger.error('ar.session.start', 'Could not start the AR session', describeError(error));
      setSessionError(
        error instanceof Error
          ? `AR could not start: ${error.message}. The 3D view below still works.`
          : 'AR could not start. The 3D view below still works.',
      );
    }
  }

  async function endSession() {
    await sessionRef?.end();
    sessionRef = null;
    setInSession(false);
  }
}

// The renderer and session live outside React state: they are imperative
// resources, and re-rendering must never recreate them.
let rendererRef: THREE.WebGLRenderer | null = null;
let sessionRef: XrSessionHandle | null = null;

interface SceneProps {
  snapshot: HouseholdSnapshot;
  assets: Record<Species, AssetDescriptor | null>;
  reducedMotion: boolean;
  inSession: boolean;
  focusId: string;
  placed: boolean;
  onPlaced: () => void;
  accessoriesFor: (id: string) => string[];
  orbit: boolean;
}

function Scene(props: SceneProps) {
  const { gl } = useThree();
  useEffect(() => {
    rendererRef = gl;
    return () => {
      if (rendererRef === gl) rendererRef = null;
    };
  }, [gl]);

  return props.inSession ? <ArScene {...props} /> : <RoomScene {...props} />;
}

/** The non-AR view: the three of them together in a small lit room. */
function RoomScene({ snapshot, assets, reducedMotion, accessoriesFor, orbit }: SceneProps) {
  const positions = useMemo(() => layoutHousehold(snapshot.nagimals), [snapshot.nagimals]);

  return (
    <>
      {/*
        Lit with plain lights rather than drei's <Environment>, which downloads
        an HDR from a CDN. Nagimals must render with no network at all, and a
        failed fetch there took the whole scene down.
      */}
      {/* A warm interior rather than an empty black void behind the household. */}
      <color attach="background" args={['#2a211a']} />
      <fog attach="fog" args={['#2a211a', 4, 11]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#ffe9c8', '#4a3b2c', 0.7]} />
      <directionalLight position={[3, 5, 2]} intensity={1.4} castShadow />
      <directionalLight position={[-2, 2, -1]} intensity={0.35} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#6b5644" roughness={1} />
      </mesh>
      <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={8} blur={2.2} far={3} />

      {snapshot.nagimals.map((nagimal) => {
        const evaluation = snapshot.evaluations.find((e) => e.nagimalId === nagimal.id);
        return (
          <group key={nagimal.id} position={positions[nagimal.id] ?? [0, 0, 0]}>
            <NagimalModel
              species={nagimal.species}
              variant={nagimal.appearanceVariant}
              state={evaluation?.state ?? nagimal.baseState}
              stage={evaluation?.stage ?? 0}
              asset={assets[nagimal.species]}
              reducedMotion={reducedMotion}
              accessories={accessoriesFor(nagimal.id)}
            />
          </group>
        );
      })}

      {orbit && (
        <OrbitControls
          enablePan={false}
          minDistance={1.6}
          maxDistance={7}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0.4, 0]}
          makeDefault
        />
      )}
    </>
  );
}

/**
 * The AR view: a reticle over detected surfaces, and one tap to place the
 * focused household member. We do not attempt persistent room mapping.
 */
function ArScene({
  snapshot,
  assets,
  reducedMotion,
  focusId,
  placed,
  onPlaced,
  accessoriesFor,
}: SceneProps) {
  const reticle = useRef<Mesh>(null);
  const anchor = useRef<Group>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const { gl } = useThree();

  const nagimal: Nagimal | undefined =
    snapshot.nagimals.find((n) => n.id === focusId) ?? snapshot.nagimals[0];
  const evaluation = snapshot.evaluations.find((e) => e.nagimalId === nagimal?.id);

  // A tap anywhere in the session places the model at the reticle.
  useEffect(() => {
    const session = gl.xr.getSession();
    if (!session) return;
    const onSelect = () => {
      if (!reticle.current?.visible || !anchor.current) return;
      anchor.current.position.setFromMatrixPosition(reticle.current.matrix);
      anchor.current.visible = true;
      onPlaced();
      logger.info('ar.placement', 'Placed a household member on a detected surface', {
        nagimalId: nagimal?.id,
        species: nagimal?.species,
      });
    };
    session.addEventListener('select', onSelect);
    return () => session.removeEventListener('select', onSelect);
  }, [gl, nagimal?.id, nagimal?.species, onPlaced]);

  // R3F hands the live XRFrame to useFrame, which is all hit testing needs.
  useFrame((_state, _delta, frame) => {
    const handle = sessionRef;
    if (!frame || !handle?.hitTestSource || !reticle.current) return;

    const results = frame.getHitTestResults(handle.hitTestSource);
    if (results.length === 0) {
      reticle.current.visible = false;
      return;
    }
    const pose = results[0].getPose(handle.localSpace);
    if (!pose) {
      reticle.current.visible = false;
      return;
    }
    reticle.current.visible = !placed;
    matrix.fromArray(pose.transform.matrix);
    reticle.current.matrix.copy(matrix);
    reticle.current.matrixAutoUpdate = false;
    reticle.current.updateMatrixWorld(true);
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[1, 4, 2]} intensity={1.2} />

      <mesh ref={reticle} visible={false}>
        <ringGeometry args={[0.09, 0.11, 24]} />
        <meshBasicMaterial color="#f4b95d" side={THREE.DoubleSide} />
      </mesh>

      <group ref={anchor} visible={false}>
        {nagimal && (
          <NagimalModel
            species={nagimal.species}
            variant={nagimal.appearanceVariant}
            state={evaluation?.state ?? nagimal.baseState}
            stage={evaluation?.stage ?? 0}
            asset={assets[nagimal.species]}
            reducedMotion={reducedMotion}
            accessories={accessoriesFor(nagimal.id)}
          />
        )}
      </group>
    </>
  );
}

/** Even three household members need a sensible arrangement. */
function layoutHousehold(nagimals: Nagimal[]): Record<string, [number, number, number]> {
  const slots: Record<Species, [number, number, number]> = {
    dog: [-0.75, 0, 0.1],
    cat: [0.65, 0, 0.35],
    plant: [0.05, 0, -0.6],
  };
  const used = new Set<Species>();
  const out: Record<string, [number, number, number]> = {};
  nagimals.forEach((n, i) => {
    if (!used.has(n.species)) {
      out[n.id] = slots[n.species];
      used.add(n.species);
    } else {
      out[n.id] = [(i - 1) * 0.9, 0, -1.2];
    }
  });
  return out;
}

/** Pathway 4: no WebGL. Every meaningful action still lives on the dashboard. */
function StateCardFallback({
  snapshot,
  explanation,
}: {
  snapshot: HouseholdSnapshot;
  explanation: string;
}) {
  return (
    <div className="stack">
      <div className="viewer">
        <div className="state-card">
          {snapshot.nagimals.map((n) => {
            const e = snapshot.evaluations.find((x) => x.nagimalId === n.id);
            return (
              <div key={n.id} className="row" style={{ justifyContent: 'center' }}>
                <strong>{n.name}</strong>
                <StageMeter stage={e?.stage ?? 0} />
                <span className="muted">{(e?.state ?? n.baseState).replace(/_/g, ' ')}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="faint">{explanation}</p>
    </div>
  );
}
