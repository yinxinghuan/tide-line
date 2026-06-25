import type { Biome, CreatureKind, LitterKind } from '../types';

export interface Palette {
  skyTop: string;
  skyBot: string;
  sun: string;
  seaFar: string;
  seaNear: string;
  foam: string;
  wetSand: string;
  sandTop: string;
  sandBot: string;
  headland: string;
  headlandShade: string;
}

export interface BiomeDef {
  key: Biome;
  /** Sun horizontal position 0..1 across the sky. */
  sunX: number;
  /** Sun vertical position 0..1 (smaller = higher). */
  sunY: number;
  clean: Palette;
  /** Creatures that can arrive once the stretch is restored. */
  creatures: CreatureKind[];
  /** Headland on the left or right horizon. */
  headlandSide: 'left' | 'right';
}

// Flat cut-paper palette (Matisse / mid-century). No gradients downstream — each
// key is a single bold flat fill. skyTop/skyBot = two flat sky bands (paper
// layers), sandTop/sandBot = dry/back sand, headland/headlandShade = two hill
// layers. Slightly muted saturation so it reads calm/eco, not neon.

/** The murky "before" look every biome heals away from as it's cleaned. */
export const POLLUTED: Palette = {
  skyTop: '#9aa39a',
  skyBot: '#aeb3a6',
  sun: '#c2bda8',
  seaFar: '#6f7d76',
  seaNear: '#62716a',
  foam: '#c2c5b8',
  wetSand: '#8c8270',
  sandTop: '#a4977e',
  sandBot: '#928568',
  headland: '#6b6f63',
  headlandShade: '#5b5f54',
};

export const BIOMES: BiomeDef[] = [
  {
    key: 'tropical',
    sunX: 0.74,
    sunY: 0.22,
    headlandSide: 'left',
    creatures: ['turtle', 'crab', 'starfish', 'dolphin', 'shell', 'gull'],
    clean: {
      skyTop: '#1fb2ee',
      skyBot: '#74d3f2',
      sun: '#ffc01f',
      seaFar: '#0a8aa8',
      seaNear: '#13c2a4',
      foam: '#f6efe0',
      wetSand: '#e2bf63',
      sandTop: '#f4d579',
      sandBot: '#ecc75f',
      headland: '#2fa257',
      headlandShade: '#1f8043',
    },
  },
  {
    key: 'cove',
    sunX: 0.28,
    sunY: 0.26,
    headlandSide: 'right',
    creatures: ['crab', 'seal', 'starfish', 'gull', 'shell', 'turtle'],
    clean: {
      skyTop: '#4798d8',
      skyBot: '#8fc2e8',
      sun: '#fbe289',
      seaFar: '#12688f',
      seaNear: '#1f8ea8',
      foam: '#f1f1e2',
      wetSand: '#c4a866',
      sandTop: '#e0c585',
      sandBot: '#ceb06f',
      headland: '#43763f',
      headlandShade: '#305631',
    },
  },
  {
    key: 'temperate',
    sunX: 0.6,
    sunY: 0.3,
    headlandSide: 'left',
    creatures: ['gull', 'crab', 'seal', 'shell', 'starfish', 'dolphin'],
    clean: {
      skyTop: '#64a8d2',
      skyBot: '#a3cfe4',
      sun: '#f4e3a6',
      seaFar: '#27647f',
      seaNear: '#3f8c9e',
      foam: '#f0f3e8',
      wetSand: '#b4a577',
      sandTop: '#d6c692',
      sandBot: '#c1b07a',
      headland: '#52814a',
      headlandShade: '#3a5e33',
    },
  },
  {
    key: 'dusk',
    sunX: 0.5,
    sunY: 0.34,
    headlandSide: 'right',
    creatures: ['dolphin', 'gull', 'turtle', 'shell', 'crab', 'starfish'],
    clean: {
      skyTop: '#523f93',
      skyBot: '#f5794a',
      sun: '#ffc02e',
      seaFar: '#473b8c',
      seaNear: '#8a4f9b',
      foam: '#f6d6ba',
      wetSand: '#a87a5c',
      sandTop: '#e6b67f',
      sandBot: '#d29869',
      headland: '#3c3057',
      headlandShade: '#281f3e',
    },
  },
];

export function biomeFor(key: Biome): BiomeDef {
  return BIOMES.find(b => b.key === key) ?? BIOMES[0];
}

/** Wildlife that returns naturally to a restored shore (deterministic from
 *  seed). Released creatures from other players stack on top of these. */
export function baseCreatures(seed: number, biome: Biome): CreatureKind[] {
  const def = biomeFor(biome);
  const n = 3 + (seed % 3); // 3..5
  const start = seed % def.creatures.length;
  const out: CreatureKind[] = [];
  for (let i = 0; i < n; i++) out.push(def.creatures[(start + i) % def.creatures.length]);
  return out;
}

/** Pick a biome deterministically from a seed. */
export function biomeFromSeed(seed: number): Biome {
  return BIOMES[seed % BIOMES.length].key;
}

export const CREATURE_LABEL: Record<CreatureKind, string> = {
  turtle: 'sea turtle',
  crab: 'crab',
  gull: 'gull',
  starfish: 'starfish',
  dolphin: 'dolphin',
  seal: 'seal',
  shell: 'shell',
  whale: 'whale',
  ray: 'manta ray',
  octopus: 'octopus',
  pufferfish: 'pufferfish',
  jellyfish: 'jellyfish',
  seahorse: 'seahorse',
  otter: 'sea otter',
  orca: 'orca',
  fox: 'fox',
  deer: 'deer',
  owl: 'owl',
  hedgehog: 'hedgehog',
};

// Which sea creature is trapped in which piece of trash. Wipe the trash → free
// the animal. The freed set IS the shore's returning wildlife. `can` and `straw`
// trap nothing (pure litter) — variety so not every wipe is a rescue.
export const LITTER_TRAP: Partial<Record<LitterKind, CreatureKind>> = {
  net: 'turtle',
  ring: 'seal',
  bag: 'gull',
  cup: 'crab',
  bottle: 'starfish',
  can: 'octopus', // octopuses really do hide inside cans
  mask: 'pufferfish',
  straw: 'seahorse', // seahorses cling to drifting straws
};

// Community goals: rare sea life only returns once the WHOLE platform has
// cleared enough litter together. Tiered so the collective counter has rhythm.
export interface Milestone {
  litter: number;
  species: CreatureKind;
}
export const MILESTONES: Milestone[] = [
  { litter: 600, species: 'dolphin' },
  { litter: 2000, species: 'whale' },
  { litter: 5000, species: 'ray' },
  { litter: 10000, species: 'orca' },
];

/** Rare species the community has already brought back. */
export function unlockedRares(totalLitter: number): CreatureKind[] {
  return MILESTONES.filter(m => totalLitter >= m.litter).map(m => m.species);
}

/** The next milestone still to reach (null once all are unlocked). */
export function nextMilestone(totalLitter: number): Milestone | null {
  return MILESTONES.find(m => totalLitter < m.litter) ?? null;
}
