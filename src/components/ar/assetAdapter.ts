/**
 * The asset adapter.
 *
 * Nagimals ships with procedural low-poly models built from Three.js
 * primitives, so the proof of concept runs with no downloaded assets at all.
 * If a production GLB is dropped into `/public/models/<species>.glb`, this
 * adapter finds it and the renderer uses it instead — without any change to
 * the state system that decides what the model should be doing.
 */

import { logger } from '../../lib/logger';
import type { Species } from '../../domain';

export type AssetKind = 'procedural' | 'glb';

export interface AssetDescriptor {
  species: Species;
  kind: AssetKind;
  /** Present only when `kind` is 'glb'. */
  url: string | null;
  /** Quick Look source for the iOS AR pathway, when present. */
  usdzUrl: string | null;
}

const GLB_PATHS: Record<Species, string> = {
  dog: 'models/dog.glb',
  cat: 'models/cat.glb',
  plant: 'models/fern.glb',
};

const USDZ_PATHS: Record<Species, string> = {
  dog: 'models/dog.usdz',
  cat: 'models/cat.usdz',
  plant: 'models/fern.usdz',
};

function resolve(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${path}`;
}

/** HEAD the file; a 404 simply means "use the procedural model". */
async function exists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return false;
    // A SPA fallback can answer 200 with index.html; check the type.
    const type = response.headers.get('content-type') ?? '';
    return !type.includes('text/html');
  } catch {
    return false;
  }
}

const cache = new Map<Species, AssetDescriptor>();

export async function resolveAsset(species: Species): Promise<AssetDescriptor> {
  const cached = cache.get(species);
  if (cached) return cached;

  const glbUrl = resolve(GLB_PATHS[species]);
  const usdzUrl = resolve(USDZ_PATHS[species]);
  const [hasGlb, hasUsdz] = await Promise.all([exists(glbUrl), exists(usdzUrl)]);

  const descriptor: AssetDescriptor = {
    species,
    kind: hasGlb ? 'glb' : 'procedural',
    url: hasGlb ? glbUrl : null,
    usdzUrl: hasUsdz ? usdzUrl : null,
  };

  cache.set(species, descriptor);
  logger.debug('app.init', `Resolved the ${species} asset`, {
    species,
    kind: descriptor.kind,
    hasUsdz,
  });
  return descriptor;
}

export function resetAssetCache(): void {
  cache.clear();
}
