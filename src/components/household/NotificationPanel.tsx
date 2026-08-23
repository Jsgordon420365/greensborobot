import { useEffect, useState } from 'react';
import type { HouseholdSnapshot, NagimalsPushPayload } from '../../domain';
import { useAppStore } from '../../app/store';
import { missingPushVars } from '../../lib/env';
import { logger } from '../../lib/logger';
import {
  buildPushPayload,
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from '../../services/push';
import { SOUND_CAPTIONS, playSound, type SoundKey } from '../../services/audio';
import { Banner } from '../common/Banner';

/**
 * Notifications, and an honest account of when they cannot work.
 *
 * Permission is requested only from the Subscribe button. There is no nagging
 * to install and no repeat prompting after a refusal — the preview below shows
 * exactly what would have been delivered either way.
 */
export function NotificationPanel({ snapshot }: { snapshot: HouseholdSnapshot }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [working, setWorking] = useState(false);
  const identity = useAppStore((s) => s.identity);

  useEffect(() => {
    void getPushStatus().then(setStatus);
  }, []);

  const eligible = snapshot.evaluations.filter((e) => e.stage >= 4);
  const previews: NagimalsPushPayload[] = eligible.map((evaluation) => {
    const nagimal = snapshot.nagimals.find((n) => n.id === evaluation.nagimalId);
    const responsibility = snapshot.responsibilities.find(
      (r) => r.id === evaluation.responsibilityId,
    );
    const interveningFor = evaluation.interveningFor
      ? (snapshot.nagimals.find((n) => n.id === evaluation.interveningFor)?.name ?? null)
      : null;
    return buildPushPayload({
      nagimalName: nagimal?.name ?? 'A household member',
      nagimalId: evaluation.nagimalId,
      responsibilityId: evaluation.responsibilityId,
      responsibilityTitle: responsibility?.title ?? null,
      stage: evaluation.stage,
      state: evaluation.state,
      reasons: evaluation.reasons,
      soundKey: evaluation.sound,
      interveningForName: interveningFor,
    });
  });

  // The cat also speaks for the fern, which never notifies on its own account.
  const interventions = snapshot.evaluations.filter(
    (e) => e.interveningFor && e.stage >= 3 && e.stage < 4,
  );

  return (
    <section className="stack" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">Notifications</h2>

      {status && (
        <>
          <Banner variant={status.availability === 'available' ? 'info' : 'sim'}>
            <span>{status.explanation}</span>
          </Banner>

          {status.missingVars.length > 0 && (
            <p className="faint">
              Still needed for server push:{' '}
              {missingPushVars().map((v) => (
                <code key={v} className="mono">
                  {v}{' '}
                </code>
              ))}
            </p>
          )}

          <div className="btn-row">
            {status.availability === 'available' && !status.subscribed && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  setStatus(await subscribeToPush());
                  setWorking(false);
                }}
              >
                Subscribe this device
              </button>
            )}
            {status.availability === 'needs-permission' && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  setStatus(await subscribeToPush());
                  setWorking(false);
                }}
              >
                Allow notifications and subscribe
              </button>
            )}
            {status.subscribed && (
              <button
                type="button"
                className="btn"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  setStatus(await unsubscribeFromPush());
                  setWorking(false);
                }}
              >
                Unsubscribe this device
              </button>
            )}
          </div>
        </>
      )}

      <h3>What would be delivered right now</h3>

      {previews.length === 0 && interventions.length === 0 && (
        <p className="muted">
          Nothing is at stage four, so nothing would be sent. Only stage four raises a
          notification, and never more than once per hour for the same responsibility.
        </p>
      )}

      {previews.map((payload) => (
        <PreviewCard
          key={payload.eventId}
          payload={payload}
          onSimulate={() => {
            playSound(payload.soundKey as SoundKey | null);
            logger.info('push.preview', 'Previewed a stage-four notification', {
              nagimalId: payload.nagimalId,
              responsibilityId: payload.responsibilityId,
              stage: payload.stage,
              ownerId: identity?.id,
            });
          }}
        />
      ))}

      {interventions.length > 0 && (
        <p className="faint">
          {interventions.length} household member
          {interventions.length === 1 ? ' is' : 's are'} intervening on behalf of somebody else,
          which is visible in the app but does not by itself send a notification.
        </p>
      )}

      <p className="faint">
        A note on sound: no web browser lets a site choose the audio an operating system plays
        for a push notification. The sound named below is what Nagimals plays <em>inside</em> the
        app once you open it, and every sound has a written caption.
      </p>
    </section>
  );
}

function PreviewCard({
  payload,
  onSimulate,
}: {
  payload: NagimalsPushPayload;
  onSimulate: () => void;
}) {
  return (
    <div className="notification-preview">
      <span className="avatar" aria-hidden="true">
        🔔
      </span>
      <div className="notification-preview__body">
        <p className="notification-preview__title">{payload.title}</p>
        <p className="notification-preview__text">{payload.body}</p>
        <p className="faint mono" style={{ marginTop: '0.35rem' }}>
          stage {payload.stage} · {payload.state.replace(/_/g, ' ')}
          {payload.soundKey && ` · ${SOUND_CAPTIONS[payload.soundKey as SoundKey] ?? payload.soundKey}`}
        </p>
        <button type="button" className="btn btn--small" onClick={onSimulate}>
          Play the in-app sound
        </button>
      </div>
    </div>
  );
}
