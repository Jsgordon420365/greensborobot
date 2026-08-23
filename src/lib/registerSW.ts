/**
 * Service Worker registration and update handling.
 *
 * The worker gives Nagimals an offline shell and the push entry point. We do
 * not force-reload on update: a silent refresh under someone's fingers is a
 * dark pattern. The new version activates on the next visit.
 */

import { describeError, logger } from './logger';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    logger.info('sw.register', 'Service Workers are not supported here', {});
    return null;
  }
  if (import.meta.env.DEV) {
    logger.debug('sw.register', 'Skipping registration in development', {});
    return null;
  }

  try {
    const base = import.meta.env.BASE_URL || '/';
    const url = `${base.replace(/\/$/, '')}/sw.js`;
    const registration = await navigator.serviceWorker.register(url, { scope: base });

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          logger.info('sw.register', 'A new version is ready and will apply on next visit', {});
          window.dispatchEvent(new CustomEvent('nagimals:update-available'));
        }
      });
    });

    logger.info('sw.register', 'Registered the Service Worker', { scope: registration.scope });
    return registration;
  } catch (error) {
    logger.error('sw.register', 'Service Worker registration failed', describeError(error));
    return null;
  }
}
