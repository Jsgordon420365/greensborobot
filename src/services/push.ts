/**
 * Web Push, and the honest fallback when push is unavailable.
 *
 * Permission is requested only after an explicit user action. We never prompt
 * on load and never re-prompt after a refusal. When push cannot work — no
 * VAPID key, no Service Worker, iOS Safari outside a Home Screen install —
 * the interface offers an in-app notification preview instead, and says why.
 */

import { readEnv } from '../lib/env';
import { detectIos } from './arCapability';
import { describeError, logger } from '../lib/logger';
import { getSupabaseClient } from '../lib/supabase/client';

export type PushAvailability =
  | 'available'
  | 'needs-permission'
  | 'denied'
  | 'unsupported'
  | 'ios-needs-home-screen'
  | 'no-vapid-key';

export interface PushStatus {
  availability: PushAvailability;
  subscribed: boolean;
  explanation: string;
  /** Environment variables the operator must still supply. */
  missingVars: string[];
}

/** True when an iOS browser is running as an installed Home Screen app. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    iosStandalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  const env = readEnv();
  const missingVars: string[] = [];
  if (!env.vapidPublicKey) missingVars.push('VITE_VAPID_PUBLIC_KEY');

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  if (!supported) {
    if (detectIos() && !isStandaloneDisplay()) {
      return {
        availability: 'ios-needs-home-screen',
        subscribed: false,
        missingVars,
        explanation:
          'On iPhone and iPad, web push only works once the app has been added to the Home Screen. Use Share, then "Add to Home Screen", then open Nagimals from that icon.',
      };
    }
    return {
      availability: 'unsupported',
      subscribed: false,
      missingVars,
      explanation:
        'This browser does not support web push. You can still preview exactly what a notification would say.',
    };
  }

  if (detectIos() && !isStandaloneDisplay()) {
    return {
      availability: 'ios-needs-home-screen',
      subscribed: false,
      missingVars,
      explanation:
        'On iPhone and iPad, web push only works once the app has been added to the Home Screen. Use Share, then "Add to Home Screen", then open Nagimals from that icon.',
    };
  }

  if (!env.vapidPublicKey) {
    return {
      availability: 'no-vapid-key',
      subscribed: false,
      missingVars,
      explanation:
        'Server push needs a VAPID key pair. Without VITE_VAPID_PUBLIC_KEY the app shows an in-app notification preview instead.',
    };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const existing = await registration?.pushManager.getSubscription();

  if (Notification.permission === 'denied') {
    return {
      availability: 'denied',
      subscribed: false,
      missingVars,
      explanation:
        'Notifications are blocked for this site. You can re-enable them in your browser settings; until then, use the preview.',
    };
  }

  if (Notification.permission === 'granted') {
    return {
      availability: 'available',
      subscribed: Boolean(existing),
      missingVars,
      explanation: existing
        ? 'This device is subscribed. A stage-four escalation can reach you here.'
        : 'Notifications are permitted. Subscribe to let a stage-four escalation reach this device.',
    };
  }

  return {
    availability: 'needs-permission',
    subscribed: false,
    missingVars,
    explanation:
      'Nagimals will ask for notification permission only when you choose to subscribe.',
  };
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Subscribe this device. Called only from an explicit user action.
 * Returns the resulting status rather than throwing on refusal.
 */
export async function subscribeToPush(): Promise<PushStatus> {
  const env = readEnv();
  if (!env.vapidPublicKey) return getPushStatus();

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    logger.info('push.subscribe', 'The user declined notification permission', { permission });
    return getPushStatus();
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  const client = getSupabaseClient();
  if (client) {
    const { error } = await client.functions.invoke('subscribe-push', {
      body: {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        userAgent: navigator.userAgent,
      },
    });
    if (error) {
      logger.error('push.subscribe', 'Could not store the subscription', describeError(error));
    }
  }

  // The endpoint is a credential: log only that one exists, never its value.
  logger.info('push.subscribe', 'Subscribed this device to web push', {
    hasEndpoint: Boolean(json.endpoint),
    stored: Boolean(client),
  });

  return getPushStatus();
}

export async function unsubscribeFromPush(): Promise<PushStatus> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    logger.info('push.unsubscribe', 'Removed this device from web push', {});
  }
  return getPushStatus();
}

/**
 * The payload a stage-four escalation would send. Re-exported from the rules
 * package so the in-app preview and the server send are byte-identical.
 */
export { buildPushPayload } from '../domain';
