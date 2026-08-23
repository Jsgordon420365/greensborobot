/**
 * Chooses a rendering path for one household member.
 *
 * The state system decides *what* the Nagimal is doing; this component only
 * decides *how* to draw it. Swapping in production GLBs later touches nothing
 * outside `assetAdapter`.
 */

import { Suspense } from 'react';
import type { Species } from '../../../domain';
import { describeAnimation } from '../../../domain';
import type { NagimalState, Stage } from '../../../domain';
import type { AssetDescriptor } from '../assetAdapter';
import { CatModel } from './CatModel';
import { DogModel } from './DogModel';
import { FernModel } from './FernModel';
import { GlbModel } from './GlbModel';

export interface NagimalModelProps {
  species: Species;
  variant: string;
  state: NagimalState;
  stage: Stage;
  asset: AssetDescriptor | null;
  reducedMotion?: boolean;
  accessories?: string[];
}

function Procedural({
  species,
  variant,
  stage,
  movement,
  reducedMotion,
  accessories,
}: {
  species: Species;
  variant: string;
  stage: number;
  movement: ReturnType<typeof describeAnimation>['movement'];
  reducedMotion: boolean;
  accessories: string[];
}) {
  const props = { variant, stage, movement, reducedMotion, accessories };
  if (species === 'dog') return <DogModel {...props} />;
  if (species === 'cat') return <CatModel {...props} />;
  return <FernModel {...props} />;
}

export function NagimalModel({
  species,
  variant,
  state,
  stage,
  asset,
  reducedMotion = false,
  accessories = [],
}: NagimalModelProps) {
  const descriptor = describeAnimation(species, state, stage);

  if (asset?.kind === 'glb' && asset.url) {
    return (
      <Suspense
        fallback={
          <Procedural
            species={species}
            variant={variant}
            stage={stage}
            movement={descriptor.movement}
            reducedMotion={reducedMotion}
            accessories={accessories}
          />
        }
      >
        <GlbModel
          url={asset.url}
          animation={descriptor.animation}
          loop={descriptor.loop}
          reducedMotion={reducedMotion}
        />
      </Suspense>
    );
  }

  return (
    <Procedural
      species={species}
      variant={variant}
      stage={stage}
      movement={descriptor.movement}
      reducedMotion={reducedMotion}
      accessories={accessories}
    />
  );
}
