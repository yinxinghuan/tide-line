// Wild Line 2.0 — habitat registry. Each habitat = its own threats (the human
// hazard the player clears), the animal each threat frees, a fallback animal set,
// and the ground band where rescued animals stand. The scene art + creature
// drawing live in scene.ts (dispatched by habitat); this file is the data.

import type { CreatureKind, Habitat, LitterKind } from '../types';
import { mulberry32 } from '../utils/rng';

export interface ThreatDef {
  kind: LitterKind;
  /** Animal freed when this threat is cleared (undefined = pure junk, no rescue). */
  traps?: CreatureKind;
}

export interface HabitatDef {
  /** i18n key for the habitat name (hab_<key>). */
  key: Habitat;
  threats: ThreatDef[];
  /** Returning set when a shore has no explicit rescued list (old/empty). */
  fallback: CreatureKind[];
  /** Vertical band (fraction of height) where ground animals stand. */
  groundTop: number;
  groundBot: number;
}

export const HABITATS: Record<Habitat, HabitatDef> = {
  ocean: {
    key: 'ocean',
    threats: [
      { kind: 'net', traps: 'turtle' },
      { kind: 'ring', traps: 'seal' },
      { kind: 'bag', traps: 'gull' },
      { kind: 'cup', traps: 'crab' },
      { kind: 'bottle', traps: 'starfish' },
      { kind: 'can', traps: 'octopus' },
      { kind: 'mask', traps: 'pufferfish' },
      { kind: 'straw', traps: 'seahorse' },
      { kind: 'tire' }, // heavy junk, no animal
    ],
    fallback: ['turtle', 'crab', 'gull', 'starfish', 'seal'],
    groundTop: 0.6,
    groundBot: 0.98,
  },
  forest: {
    key: 'forest',
    threats: [
      { kind: 'log', traps: 'deer' },
      { kind: 'snare', traps: 'fox' },
      { kind: 'net', traps: 'owl' },
      { kind: 'tire', traps: 'hedgehog' },
      { kind: 'bag' }, // dumped litter, no animal
      { kind: 'bottle' },
    ],
    fallback: ['fox', 'deer', 'owl', 'hedgehog'],
    groundTop: 0.62,
    groundBot: 0.97,
  },
};

export const ALL_HABITATS: Habitat[] = Object.keys(HABITATS) as Habitat[];

/** Pick a habitat for a fresh shore. */
export function randomHabitat(): Habitat {
  return ALL_HABITATS[Math.floor(Math.random() * ALL_HABITATS.length)];
}

/** Resolve a habitat, defaulting to ocean (old shores predate the field). */
function defOf(habitat: Habitat | undefined): HabitatDef {
  return (habitat && HABITATS[habitat]) || HABITATS.ocean;
}

/** Threat → trapped-creature lookup for a habitat (used when building a clean). */
export function trapFor(habitat: Habitat | undefined, kind: LitterKind): CreatureKind | undefined {
  return defOf(habitat).threats.find(t => t.kind === kind)?.traps;
}

/** The threat kinds that can appear in a habitat. */
export function threatKinds(habitat: Habitat | undefined): LitterKind[] {
  return defOf(habitat).threats.map(t => t.kind);
}

/** Returning wildlife when a shore has no rescued list. */
export function fallbackCreatures(habitat: Habitat | undefined, seed: number): CreatureKind[] {
  const def = defOf(habitat);
  const r = mulberry32(seed ^ 0x1f1f);
  const n = 3 + Math.floor(r() * 3);
  const out: CreatureKind[] = [];
  for (let i = 0; i < n; i++) out.push(def.fallback[Math.floor(r() * def.fallback.length)]);
  return out;
}
