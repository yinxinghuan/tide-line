// Per-shore STYLE — the diversity engine. Everything here is derived purely and
// deterministically from a shore's seed, so the same shore renders identically
// on every device (thumbnail, detail, live play) while *different* shores look
// genuinely different. This is what stops the coast from reading as 30 copies of
// the same beach.
//
// Diversity axes (all seed-driven, on top of the 4 biomes):
//   • time of day   — dawn / morning / midday / golden / dusk / night
//   • tide level    — where the waterline sits
//   • sea state     — glassy / calm / choppy (shimmer + foam amplitude)
//   • headland      — round / twin / mesa / arch / open, either side
//   • sky features  — clouds by day, stars + moon by night
//   • beach props   — palms / dune grass / rocks / driftwood, biome-appropriate
//   • litter layout — scatter / tideline band / clustered piles
//   • grain         — fine / coarse / rippled sand

import type { Biome, LitterKind, Shore } from '../types';
import { biomeFor, type Palette } from '../data/biomes';
import { mulberry32, mixHex, clamp } from './rng';

export type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'golden' | 'dusk' | 'night';
export type SeaState = 'glassy' | 'calm' | 'choppy';
export type HeadlandShape = 'round' | 'twin' | 'mesa' | 'arch' | 'open';
export type GrainKind = 'fine' | 'coarse' | 'ripple';
export type LitterLayout = 'scatter' | 'tideline' | 'cluster';
export type PropKind = 'palm' | 'grass' | 'rock' | 'driftwood';

interface TodDef {
  label: string;
  tint: string; // color the whole palette grades toward
  amt: number; // 0..1 grade strength
  val: number; // brightness multiplier (<1 darker, >1 lighter)
  sun: string; // sun/moon disc color
  sunScale: number; // disc size multiplier
  sunY: number; // extra vertical offset added to biome sunY (lower sun = warmer)
  sky?: [string, string]; // strong sky override [top, bottom]
  night?: boolean;
}

export const TOD: Record<TimeOfDay, TodDef> = {
  dawn: {
    label: 'DAWN', tint: '#ff9c7d', amt: 0.32, val: 0.86, sun: '#ffe0b8',
    sunScale: 1.2, sunY: 0.4, sky: ['#3b3b74', '#ffc69a'],
  },
  morning: {
    label: 'MORNING', tint: '#dbefff', amt: 0.12, val: 1.04, sun: '#fff7d6',
    sunScale: 0.9, sunY: -0.1,
  },
  midday: {
    label: 'MIDDAY', tint: '#ffffff', amt: 0.05, val: 1.12, sun: '#fffef0',
    sunScale: 0.78, sunY: -0.25,
  },
  golden: {
    label: 'GOLDEN HOUR', tint: '#ffac46', amt: 0.36, val: 0.98, sun: '#ffd98a',
    sunScale: 1.28, sunY: 0.5,
  },
  dusk: {
    label: 'DUSK', tint: '#6a4f9c', amt: 0.32, val: 0.8, sun: '#ffc59c',
    sunScale: 1.22, sunY: 0.55, sky: ['#3a2f63', '#ff9e6f'],
  },
  night: {
    label: 'MOONLIT', tint: '#16263f', amt: 0.6, val: 0.5, sun: '#e6edff',
    sunScale: 0.55, sunY: -0.2, sky: ['#0a1430', '#1d3358'], night: true,
  },
};

const TOD_ORDER: TimeOfDay[] = ['dawn', 'morning', 'midday', 'golden', 'dusk', 'night'];
const SEA_ORDER: SeaState[] = ['glassy', 'calm', 'calm', 'choppy'];
const HEAD_ORDER: HeadlandShape[] = ['round', 'twin', 'mesa', 'arch', 'round', 'open'];
const GRAIN_ORDER: GrainKind[] = ['fine', 'coarse', 'ripple'];
const LAYOUT_ORDER: LitterLayout[] = ['scatter', 'scatter', 'tideline', 'cluster'];

// props that fit each biome's character
const PROP_POOL: Record<Biome, PropKind[]> = {
  tropical: ['palm', 'rock', 'driftwood', 'palm'],
  cove: ['rock', 'driftwood', 'grass', 'rock'],
  temperate: ['grass', 'rock', 'driftwood', 'grass'],
  dusk: ['palm', 'grass', 'rock', 'driftwood'],
};

export interface Cloud {
  x: number; // 0..1
  y: number; // 0..1 of sky band
  s: number; // scale 0..1
  sp: number; // drift speed px/s
}
export interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
}
export interface Prop {
  kind: PropKind;
  x: number; // 0..1 across width
  base: number; // 0..1 of (wet..bottom) sand band where it stands
  s: number; // size factor
  flip: boolean;
}

export interface ShoreStyle {
  tod: TimeOfDay;
  todLabel: string;
  seaState: SeaState;
  headland: HeadlandShape;
  headlandSide: 'left' | 'right';
  headlandScale: number;
  grain: GrainKind;
  litterLayout: LitterLayout;
  /** waterline fraction of height (sea/sand boundary). */
  foam: number;
  /** wet/dry sand boundary fraction. */
  wet: number;
  /** sun horizontal/vertical (already including tod + jitter). */
  sunX: number;
  sunY: number;
  clouds: Cloud[];
  stars: Star[];
  props: Prop[];
}

const HORIZON = 0.42;

/** Derive the full visual style of a shore from its seed. Cheap + deterministic;
 *  safe to call from multiple renderers — they all agree. */
export function shoreStyle(shore: Shore): ShoreStyle {
  const def = biomeFor(shore.biome);
  const r = mulberry32((shore.seed ^ 0x5bd1e995) >>> 0);

  const tod = TOD_ORDER[Math.floor(r() * TOD_ORDER.length)];
  const todDef = TOD[tod];
  const seaState = SEA_ORDER[Math.floor(r() * SEA_ORDER.length)];
  const headland = HEAD_ORDER[Math.floor(r() * HEAD_ORDER.length)];
  const headlandSide: 'left' | 'right' = r() < 0.5 ? 'left' : 'right';
  const headlandScale = 0.82 + r() * 0.5;
  const grain = GRAIN_ORDER[Math.floor(r() * GRAIN_ORDER.length)];
  const litterLayout = LAYOUT_ORDER[Math.floor(r() * LAYOUT_ORDER.length)];

  const tide = r(); // 0 low .. 1 high
  const foam = clamp(0.555 + (tide - 0.5) * 0.06, 0.53, 0.6);
  const wet = foam + 0.07 + r() * 0.02;

  const sunX = clamp(def.sunX + (r() - 0.5) * 0.28, 0.12, 0.88);
  const sunY = clamp(def.sunY + todDef.sunY * 0.18 + (r() - 0.5) * 0.06, 0.1, 0.7);

  // clouds — day skies get a few, night gets none (stars instead)
  const clouds: Cloud[] = [];
  if (!todDef.night) {
    const n = Math.floor(r() * 4); // 0..3
    for (let i = 0; i < n; i++) {
      clouds.push({ x: r(), y: 0.1 + r() * 0.6, s: 0.5 + r() * 0.8, sp: 3 + r() * 6 });
    }
  }

  // stars — night only, deterministic field
  const stars: Star[] = [];
  if (todDef.night) {
    const n = 34 + Math.floor(r() * 24);
    for (let i = 0; i < n; i++) {
      stars.push({ x: r(), y: r() * 0.92, r: 0.5 + r() * 1.3, ph: r() * Math.PI * 2 });
    }
  }

  // beach props — kept to the sides so the centre stays clear for litter/wildlife
  const props: Prop[] = [];
  const pn = 1 + Math.floor(r() * 3); // 1..3
  const pool = PROP_POOL[shore.biome] ?? PROP_POOL.tropical;
  for (let i = 0; i < pn; i++) {
    const kind = pool[Math.floor(r() * pool.length)];
    const side = i % 2 === 0 ? r() * 0.22 : 1 - r() * 0.22; // hug edges
    props.push({
      kind,
      x: clamp(side, 0.04, 0.96),
      base: 0.12 + r() * 0.5,
      s: 0.8 + r() * 0.6,
      flip: r() < 0.5,
    });
  }

  return {
    tod,
    todLabel: todDef.label,
    seaState,
    headland,
    headlandSide,
    headlandScale,
    grain,
    litterLayout,
    foam,
    wet,
    sunX,
    sunY,
    clouds,
    stars,
    props,
  };
}

/** Brightness scale toward black/white via existing mixHex. */
function vscale(hex: string, v: number): string {
  if (v < 1) return mixHex(hex, '#000000', clamp(1 - v, 0, 1) * 0.85);
  if (v > 1) return mixHex(hex, '#ffffff', clamp(v - 1, 0, 1) * 0.6);
  return hex;
}

const PAL_KEYS: (keyof Palette)[] = [
  'skyTop', 'skyBot', 'sun', 'seaFar', 'seaNear',
  'foam', 'wetSand', 'sandTop', 'sandBot', 'headland', 'headlandShade',
];

/** Grade a (already cleanliness-lerped) palette through the time of day. */
export function gradePalette(pal: Palette, style: ShoreStyle): Palette {
  const tod = TOD[style.tod];
  const out = {} as Palette;
  for (const k of PAL_KEYS) out[k] = vscale(mixHex(pal[k], tod.tint, tod.amt), tod.val);
  if (tod.sky) {
    out.skyTop = mixHex(out.skyTop, tod.sky[0], 0.85);
    out.skyBot = mixHex(out.skyBot, tod.sky[1], 0.85);
  }
  return out;
}

export { HORIZON };

/** A permanent catalog id for a shore (specimen-plate caption). */
export function specimenNo(seed: number): string {
  const n = (seed % 900) + 1;
  return '№' + String(n).padStart(3, '0');
}

/** Litter spawn positions for a layout (normalised nx, ny). */
export function litterSpots(
  rand: () => number,
  n: number,
  layout: LitterLayout,
): { nx: number; ny: number }[] {
  const out: { nx: number; ny: number }[] = [];
  if (layout === 'tideline') {
    // hugs the waterline in a loose band
    for (let i = 0; i < n; i++) {
      out.push({ nx: 0.08 + rand() * 0.84, ny: 0.63 + rand() * 0.12 });
    }
  } else if (layout === 'cluster') {
    // 1–2 piles
    const piles = 1 + (rand() < 0.5 ? 0 : 1);
    const centers = Array.from({ length: piles }, () => ({
      cx: 0.22 + rand() * 0.56,
      cy: 0.7 + rand() * 0.2,
    }));
    for (let i = 0; i < n; i++) {
      const c = centers[i % centers.length];
      out.push({
        nx: clamp(c.cx + (rand() - 0.5) * 0.26, 0.06, 0.94),
        ny: clamp(c.cy + (rand() - 0.5) * 0.2, 0.62, 0.96),
      });
    }
  } else {
    for (let i = 0; i < n; i++) {
      out.push({ nx: 0.08 + rand() * 0.84, ny: 0.64 + rand() * 0.32 });
    }
  }
  return out;
}

export const LITTER_KINDS: LitterKind[] = [
  'bottle', 'bag', 'can', 'cup', 'net', 'straw', 'ring', 'tire', 'mask',
];
