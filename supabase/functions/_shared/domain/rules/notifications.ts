// GENERATED FILE — do not edit.
// Copied verbatim from src/domain by scripts/sync-edge-domain.mjs.
// Edit the original and run `npm run sync:edge`.
/**
 * Notification payload construction.
 *
 * Lives in the rules package because the wording is deterministic: the body is
 * a reason the engine already produced, chosen by an explicit priority, never
 * a sentence generated at send time. Client preview and server delivery build
 * the identical payload from the identical inputs.
 */

import type { NagimalState, NagimalsPushPayload, Stage } from '../models/types.ts';

export interface PushPayloadInput {
  nagimalName: string;
  nagimalId: string;
  responsibilityId: string | null;
  responsibilityTitle: string | null;
  stage: Stage;
  state: NagimalState;
  reasons: string[];
  soundKey: string | null;
  interveningForName?: string | null;
  appUrl?: string;
}

/**
 * Reason priority, most explanatory first.
 *
 * The cause comes before the aggravating factor: somebody woken at stage four
 * needs to know the deadline is twenty minutes away before they need to know
 * they have snoozed it three times.
 */
const REASON_PRIORITY: readonly RegExp[] = [
  /intervening because/i,
  /deadline (passed|is)/i,
  /no attention for|expected interval|last attended/i,
  /snoozed \d+ time/i,
];

export function selectNotificationReason(
  reasons: string[],
  fallback: string,
): string {
  for (const pattern of REASON_PRIORITY) {
    const match = reasons.find((reason) => pattern.test(reason));
    if (match) return match;
  }
  return reasons[0] ?? fallback;
}

export function buildPushPayload(input: PushPayloadInput): NagimalsPushPayload {
  const base = (input.appUrl ?? '').replace(/\/$/, '');
  const deepLink = input.responsibilityId
    ? `${base}/#/household?responsibility=${input.responsibilityId}`
    : `${base}/#/household`;

  return {
    title: input.interveningForName
      ? `${input.nagimalName} has started making a scene`
      : `${input.nagimalName} needs you now`,
    body: selectNotificationReason(
      input.reasons,
      `"${input.responsibilityTitle ?? 'A responsibility'}" has reached stage ${input.stage}.`,
    ),
    icon: `${base}/icons/icon-192.png`,
    badge: `${base}/icons/badge-72.png`,
    nagimalId: input.nagimalId,
    responsibilityId: input.responsibilityId,
    stage: input.stage,
    state: input.state,
    deepLink,
    soundKey: input.soundKey,
    eventId: `${input.nagimalId}:${input.responsibilityId ?? 'none'}:${input.stage}`,
  };
}
