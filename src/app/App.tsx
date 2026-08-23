import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Banner } from '../components/common/Banner';
import { SceneBoundary } from '../components/common/SceneBoundary';
import { Dashboard } from '../components/household/Dashboard';
import { NotificationPanel } from '../components/household/NotificationPanel';
import { Welcome } from '../components/shelter/Welcome';

/**
 * Three.js is around a megabyte, and the dashboard — where people spend their
 * time — does not need a single byte of it. The two views that render 3D load
 * it on demand instead.
 */
const Shelter = lazy(() =>
  import('../components/shelter/Shelter').then((m) => ({ default: m.Shelter })),
);
const ArViewer = lazy(() =>
  import('../components/ar/ArViewer').then((m) => ({ default: m.ArViewer })),
);
import { useHouseholdSync } from '../hooks/useHouseholdSync';
import { useLiveClock } from '../hooks/useLiveClock';
import { missingConnectedModeVars } from '../lib/env';
import { logger } from '../lib/logger';
import { isMuted, setMuted, unlockAudio } from '../services/audio';
import { describeOffset } from '../services/timeSimulation';
import { useAppStore } from './store';

type Route = 'welcome' | 'shelter' | 'household' | 'ar' | 'notifications';

function routeFromHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (raw === 'shelter' || raw === 'household' || raw === 'ar' || raw === 'notifications') {
    return raw;
  }
  return 'welcome';
}

export function App() {
  const boot = useAppStore((s) => s.boot);
  const snapshot = useAppStore((s) => s.snapshot);
  const booting = useAppStore((s) => s.booting);
  const mode = useAppStore((s) => s.mode);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const offset = useAppStore((s) => s.timeOffsetMs);
  const signInLocal = useAppStore((s) => s.signInLocal);
  const adopt = useAppStore((s) => s.adopt);
  const identity = useAppStore((s) => s.identity);

  const [route, setRoute] = useState<Route>(routeFromHash);
  const [muted, setMutedState] = useState(isMuted());

  useHouseholdSync();
  useLiveClock();

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The URL is the single source of truth for the route: `go` updates it and
  // the hashchange listener above brings React state along. Keeping both in
  // one place avoids the two drifting apart.
  const go = useCallback((next: Route) => {
    if (routeFromHash() === next) {
      setRoute(next);
      return;
    }
    window.location.hash = `#/${next}`;
  }, []);

  /**
   * A returning visitor with a household should land on it rather than on the
   * introduction — but only when they arrived at the bare URL. Once they have
   * navigated anywhere on purpose, including back to About, that choice wins.
   * This runs at most once, and updates the URL rather than React state.
   */
  const hasLanded = useRef(false);
  useEffect(() => {
    if (hasLanded.current || booting || !snapshot) return;
    hasLanded.current = true;
    if (!window.location.hash) window.location.hash = '#/household';
  }, [booting, snapshot]);

  const openDemo = useCallback(async () => {
    await signInLocal();
    if (!useAppStore.getState().snapshot) {
      await adopt({ dogVariant: 'bear', dogName: 'Bear', communicationStyle: 'calm' });
    }
    go('household');
  }, [signInLocal, adopt, go]);

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) await unlockAudio();
    logger.info('app.init', next ? 'Sound muted' : 'Sound unmuted', { muted: next });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to the household
      </a>

      <header>
        <nav className="tabs" aria-label="Sections">
          <button
            type="button"
            onClick={() => go('welcome')}
            aria-current={route === 'welcome' ? 'page' : undefined}
          >
            About
          </button>
          <button
            type="button"
            onClick={() => go('shelter')}
            aria-current={route === 'shelter' ? 'page' : undefined}
          >
            Shelter
          </button>
          <button
            type="button"
            onClick={() => go('household')}
            disabled={!snapshot}
            aria-current={route === 'household' ? 'page' : undefined}
          >
            Household
          </button>
          <button
            type="button"
            onClick={() => go('ar')}
            disabled={!snapshot}
            aria-current={route === 'ar' ? 'page' : undefined}
          >
            Place my Nagimals
          </button>
          <button
            type="button"
            onClick={() => go('notifications')}
            disabled={!snapshot}
            aria-current={route === 'notifications' ? 'page' : undefined}
          >
            Notifications
          </button>
          <button type="button" onClick={() => void toggleMute()} aria-pressed={!muted}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
        </nav>
      </header>

      {mode === 'local' && (
        <Banner>
          <span>
            <strong>Local Demonstration Mode</strong> — data lives in this browser only. Set{' '}
            {missingConnectedModeVars().map((v) => (
              <code key={v} className="mono">
                {v}{' '}
              </code>
            ))}
            for Connected Mode.
          </span>
        </Banner>
      )}

      {offset !== 0 && (
        <Banner variant="sim">
          <span>
            <strong>Simulated time is active</strong> — the household is being evaluated{' '}
            {describeOffset(offset)}. Your device clock is untouched.
          </span>
        </Banner>
      )}

      {error && (
        <Banner variant="error">
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="btn btn--small" onClick={clearError}>
            Dismiss
          </button>
        </Banner>
      )}

      <main id="main">
        {booting && <p className="muted">Waking the household…</p>}

        {!booting && route === 'welcome' && (
          <Welcome onVisitShelter={() => go('shelter')} onOpenDemo={() => void openDemo()} />
        )}

        {!booting && route === 'shelter' && (
          <SceneBoundary
            fallback={
              <Banner variant="error">
                <span>
                  The shelter previews could not be drawn on this device. Reload to try again,
                  or open the demo household to meet Bear, Juniper and Frondly directly.
                </span>
              </Banner>
            }
          >
            <Suspense fallback={<p className="muted">Opening the shelter…</p>}>
              <Shelter onAdopted={() => go('household')} />
            </Suspense>
          </SceneBoundary>
        )}

        {!booting && route === 'household' &&
          (snapshot ? (
            <Dashboard snapshot={snapshot} />
          ) : (
            <EmptyHousehold onVisitShelter={() => go('shelter')} />
          ))}

        {!booting && route === 'ar' && snapshot && (
          <section className="stack" aria-labelledby="ar-heading">
            <h1 id="ar-heading">Place my Nagimals</h1>
            <SceneBoundary
              fallback={
                <Banner variant="error">
                  <span>
                    The 3D view could not start on this device. Every action is still available
                    on the household dashboard.
                  </span>
                </Banner>
              }
            >
              <Suspense fallback={<p className="muted">Loading the 3D view…</p>}>
                <ArViewer snapshot={snapshot} />
              </Suspense>
            </SceneBoundary>
          </section>
        )}

        {!booting && route === 'notifications' && snapshot && (
          <NotificationPanel snapshot={snapshot} />
        )}
      </main>

      <footer className="disclaimer">
        <p>
          Nagimals — a proof of concept.{' '}
          {identity && (
            <span className="faint">
              Signed in as {identity.isLocalDemo ? 'a local demo resident' : identity.label}.
            </span>
          )}
        </p>
      </footer>
    </div>
  );
}

function EmptyHousehold({ onVisitShelter }: { onVisitShelter: () => void }) {
  return (
    <section className="stack">
      <h1>No household yet</h1>
      <p className="muted">
        Visit the shelter to choose a dog. Juniper and Frondly are waiting there already.
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={onVisitShelter}>
          Visit the Shelter
        </button>
      </div>
    </section>
  );
}
