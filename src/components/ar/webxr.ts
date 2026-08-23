/**
 * Native WebXR session management for the immersive-ar pathway.
 *
 * Camera frames are consumed by the compositor and never read, copied,
 * uploaded or retained by Nagimals. We request camera access only when the
 * user chooses to enter AR, and the session ends the moment they leave.
 */

import { describeError, logger } from '../../lib/logger';

export interface StartSessionOptions {
  /** Element used for the in-AR overlay controls, when dom-overlay is supported. */
  overlayRoot?: HTMLElement | null;
}

export interface XrSessionHandle {
  session: XRSession;
  /** Reference space the hit-test results are expressed in. */
  localSpace: XRReferenceSpace;
  hitTestSource: XRHitTestSource | null;
  end: () => Promise<void>;
}

/**
 * Request an immersive-ar session with hit testing.
 *
 * Throws when the user declines camera permission or the device cannot serve
 * the session; callers surface that as a message, never a crash.
 */
export async function startArSession(
  options: StartSessionOptions = {},
): Promise<XrSessionHandle> {
  const xr = navigator.xr;
  if (!xr) throw new Error('This browser does not expose the WebXR Device API.');

  const init: XRSessionInit = {
    requiredFeatures: ['hit-test', 'local-floor'],
    optionalFeatures: options.overlayRoot ? ['dom-overlay'] : [],
  };
  if (options.overlayRoot) {
    (init as XRSessionInit & { domOverlay?: { root: HTMLElement } }).domOverlay = {
      root: options.overlayRoot,
    };
  }

  let session: XRSession;
  try {
    session = await xr.requestSession('immersive-ar', init);
  } catch (error) {
    // 'local-floor' is not universally available; retry with the bare minimum.
    logger.warn('ar.session.start', 'Retrying without local-floor', describeError(error));
    session = await xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      ...(options.overlayRoot
        ? { optionalFeatures: ['dom-overlay'], domOverlay: { root: options.overlayRoot } }
        : {}),
    } as XRSessionInit);
  }

  const localSpace = await session.requestReferenceSpace('local');

  let hitTestSource: XRHitTestSource | null = null;
  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;
  } catch (error) {
    logger.warn('ar.session.start', 'Hit testing is unavailable in this session', {
      ...describeError(error),
    });
  }

  logger.info('ar.session.start', 'Started an immersive AR session', {
    hasHitTest: Boolean(hitTestSource),
    hasOverlay: Boolean(options.overlayRoot),
  });

  return {
    session,
    localSpace,
    hitTestSource,
    end: async () => {
      hitTestSource?.cancel?.();
      await session.end().catch(() => undefined);
      logger.info('ar.session.end', 'Ended the AR session', {});
    },
  };
}
