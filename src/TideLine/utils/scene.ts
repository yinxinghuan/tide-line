// Canvas2D FLAT CUT-PAPER beach renderer (Matisse / mid-century). One source of
// truth for how a shore looks — live play canvas, coast thumbnails, detail view.
//
// Art direction (chosen 2026-06-25): bold flat colour shapes, NO gradients, NO
// outlines, NO grain — cut-paper layers with a scalloped waterline. Three axes:
// LAYERS (sky→sun/moon→clouds/stars→headland→sea→waves→foam scallop→sand→props→
// creatures), per-shore STRUCTURAL variation (4 biomes × seed-driven time-of-day
// / tide / sea-state / headland / props — see style.ts), and bounded DYNAMICS
// (foam breathes, clouds drift, creatures bob — flat shapes, gently moving).

import type { CreatureKind, Shore } from '../types';
import { biomeFor, POLLUTED, type Palette } from '../data/biomes';
import { mulberry32, mixHex, rgba, clamp, lerp } from './rng';
import { shoreStyle, gradePalette, HORIZON, type ShoreStyle } from './style';
import { HABITATS } from '../data/habitats';

const PAL_KEYS: (keyof Palette)[] = [
  'skyTop', 'skyBot', 'sun', 'seaFar', 'seaNear',
  'foam', 'wetSand', 'sandTop', 'sandBot', 'headland', 'headlandShade',
];

/** Blend the murky polluted palette toward the biome's clean palette. */
function lerpPalette(clean: Palette, t: number): Palette {
  const out = {} as Palette;
  for (const k of PAL_KEYS) out[k] = mixHex(POLLUTED[k], clean[k], t);
  return out;
}

export interface SceneOpts {
  cleanliness: number; // 0..1
  time: number; // seconds
  creatures?: { kind: CreatureKind; ts?: number }[];
  arrive?: number;
}

// ── flat drawing primitives ────────────────────────────────────────────────

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A flat band whose TOP edge is a row of cut-paper scallops (rounded bumps). */
function scallopBand(
  ctx: CanvasRenderingContext2D,
  w: number,
  top: number,
  bottom: number,
  bumps: number,
  amp: number,
  phase: number,
  fill: string,
) {
  const step = w / bumps;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  ctx.lineTo(0, top);
  for (let i = 0; i < bumps; i++) {
    const x0 = i * step;
    const cx = x0 + step / 2;
    const lift = top - amp * (0.7 + 0.3 * Math.sin(phase + i));
    ctx.quadraticCurveTo(cx, lift, x0 + step, top);
  }
  ctx.lineTo(w, bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// ── paper grain overlay (printed-on-paper feel for the cut-paper art) ──
let _paperTile: HTMLCanvasElement | null = null;
function paperTile(): HTMLCanvasElement | null {
  if (_paperTile) return _paperTile;
  if (typeof document === 'undefined') return null;
  const size = 300;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d');
  if (!c) return null;
  // neutral mid-grey base (soft-light no-op), then fine fibre noise around it
  const img = c.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 128 + (Math.random() * 2 - 1) * 24;
    d[i] = d[i + 1] = d[i + 2] = n;
    d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  // sparse dry-brush "飞白" streaks
  for (let k = 0; k < 46; k++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 16 + Math.random() * 130;
    const light = Math.random() < 0.5;
    c.strokeStyle = light ? 'rgba(255,255,255,0.45)' : 'rgba(40,40,40,0.4)';
    c.lineWidth = 0.3 + Math.random() * 1.1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y + (Math.random() * 2 - 1) * 4);
    c.stroke();
  }
  _paperTile = cv;
  return cv;
}

/** Lay a subtle paper-fibre + dry-brush grain over the whole frame. Call LAST,
 *  after creatures/props, so the entire image reads as printed on paper. */
export function drawPaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const tile = paperTile();
  if (!tile) return;
  const pat = ctx.createPattern(tile, 'repeat');
  if (!pat) return;
  ctx.save();
  // 'overlay' reads on every tone (incl. saturated creatures), not just the
  // big flat sky/sand areas the way 'soft-light' did.
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Dispatch the scene by habitat (Wild Line 2.0). */
export function drawEnvironment(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shore: Shore,
  opts: SceneOpts,
): void {
  if (shore.habitat === 'forest') drawForestScene(ctx, w, h, shore, opts);
  else drawOceanScene(ctx, w, h, shore, opts);
}

function drawOceanScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shore: Shore,
  opts: SceneOpts,
): void {
  const def = biomeFor(shore.biome);
  const style = shoreStyle(shore);
  const t = clamp(opts.cleanliness, 0, 1);
  const pal = gradePalette(lerpPalette(def.clean, t), style);
  const time = opts.time;
  const night = style.tod === 'night';

  const horizon = h * HORIZON;
  const foam = h * style.foam;
  const wet = h * style.wet;

  // ── Sky — two flat paper bands ──
  rect(ctx, 0, 0, w, horizon + 1, pal.skyTop);
  rect(ctx, 0, horizon * 0.62, w, horizon - horizon * 0.62 + 1, pal.skyBot);

  // ── Stars (night) ── flat 4-point sparks
  if (night) {
    ctx.fillStyle = '#f3f7ff';
    for (const s of style.stars) {
      const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.ph);
      ctx.globalAlpha = (0.4 + 0.6 * tw) * (0.4 + 0.6 * t);
      circle(ctx, s.x * w, s.y * horizon, s.r * 0.9, '#f3f7ff');
    }
    ctx.globalAlpha = 1;
  }

  // ── Sun / Moon — flat disc ──
  const sx = w * style.sunX;
  const sy = horizon * style.sunY * 2;
  const discR = h * 0.06 * sunScale(style);
  circle(ctx, sx, sy, discR, pal.sun);
  if (night) {
    // crescent: knock a bite out with the sky colour
    circle(ctx, sx + discR * 0.42, sy - discR * 0.15, discR * 0.85, pal.skyTop);
  }

  // ── Clouds (day) — flat lozenge stacks ──
  if (!night) {
    for (const c of style.clouds) {
      const cx = ((c.x * w + time * c.sp) % (w + 180)) - 90;
      const cy = horizon * (0.12 + c.y * 0.55);
      drawCloud(ctx, cx, cy, c.s * h * 0.05, rgba(pal.foam, 0.92));
    }
  }

  // ── Headland — two flat hill layers ──
  drawHeadland(ctx, w, h, horizon, pal, style, mulberry32(shore.seed ^ 0x51));

  // ── Sea — flat band ──
  rect(ctx, 0, horizon, w, foam - horizon + 1, pal.seaNear);

  // flat cut-paper wave dashes (a few rounded bars in the lighter sea colour)
  const rr = mulberry32(shore.seed ^ 0x7);
  const waveRows = style.seaState === 'choppy' ? 5 : style.seaState === 'glassy' ? 2 : 3;
  ctx.fillStyle = rgba(pal.seaFar, 0.9);
  for (let i = 0; i < waveRows; i++) {
    const yy = horizon + ((i + 1) / (waveRows + 1)) * (foam - horizon);
    const drift = (time * (6 + i * 4)) % (w * 0.5);
    for (let k = -1; k < 3; k++) {
      const bx = ((k * w * 0.5 + drift) % (w + w * 0.5)) - w * 0.25 + rr() * 20;
      const bw = w * (0.12 + 0.08 * ((i + k + 3) % 3));
      roundBar(ctx, bx, yy, bw, Math.max(2, h * 0.008));
    }
  }

  // ── Sun glitter on the water — flat dashes under the sun ──
  ctx.fillStyle = rgba(pal.sun, night ? 0.5 : 0.7);
  for (let i = 0; i < 4; i++) {
    const yy = horizon + ((i + 1) / 5) * (foam - horizon);
    const bw = (1 - i / 6) * w * 0.16;
    roundBar(ctx, sx - bw / 2, yy, bw, Math.max(2, h * 0.009));
  }

  // ── Foam — cut-paper scalloped band at the waterline ──
  const amp = h * (style.seaState === 'choppy' ? 0.042 : 0.032);
  const swash = Math.sin(time * 1.1) * h * 0.006;
  scallopBand(ctx, w, foam + swash, foam + h * 0.06, 6, amp, time * 1.4, pal.foam);

  // ── Wet sand + dry sand — flat bands ──
  rect(ctx, 0, foam + h * 0.045, w, wet - foam, pal.wetSand);
  rect(ctx, 0, wet, w, h - wet + 1, pal.sandTop);
  // a flat back-sand wedge for depth
  ctx.fillStyle = pal.sandBot;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h - (h - wet) * 0.34);
  ctx.lineTo(w, h - (h - wet) * 0.5);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // ── Beach props (bolder: size grows with how near they sit) ──
  for (const p of style.props) {
    const px = p.x * w;
    const py = wet + (h - wet) * p.base;
    const ps = lerp(0.06, 0.13, clamp(p.base, 0, 1)) * p.s * h;
    drawProp(ctx, p.kind, px, py, ps, pal, time, p.flip, t);
  }
}

function sunScale(style: ShoreStyle): number {
  switch (style.tod) {
    case 'golden': return 1.25;
    case 'dusk': return 1.2;
    case 'dawn': return 1.18;
    case 'morning': return 0.92;
    case 'midday': return 0.8;
    case 'night': return 0.62;
    default: return 1;
  }
}

function roundBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string) {
  ctx.fillStyle = fill;
  for (const [dx, dy, r] of [
    [-s * 1.1, s * 0.15, s * 0.7], [-s * 0.2, -s * 0.3, s * 0.95],
    [s, 0, s * 0.65], [0, s * 0.2, s * 1.15],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadland(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  pal: Palette,
  style: ShoreStyle,
  rand: () => number,
) {
  if (style.headland === 'open') return;
  const left = style.headlandSide === 'left';
  const hw = w * (0.32 + rand() * 0.1) * style.headlandScale;
  const peakH = h * (0.08 + rand() * 0.05) * style.headlandScale;
  ctx.save();
  if (!left) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  // back hill (shade colour), then front hill — two flat cut-paper layers
  const drawHill = (scaleW: number, scaleH: number, fill: string) => {
    const hwL = hw * scaleW;
    const pk = horizon - peakH * scaleH;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    switch (style.headland) {
      case 'twin':
        ctx.lineTo(0, pk + peakH * 0.4);
        ctx.quadraticCurveTo(hwL * 0.2, pk, hwL * 0.36, horizon - h * 0.004);
        ctx.quadraticCurveTo(hwL * 0.52, pk + peakH * 0.35, hwL * 0.68, pk + peakH * 0.1);
        ctx.quadraticCurveTo(hwL * 0.84, pk + peakH * 0.55, hwL, horizon);
        break;
      case 'mesa':
        ctx.lineTo(0, pk + peakH * 0.3);
        ctx.lineTo(hwL * 0.16, pk);
        ctx.lineTo(hwL * 0.72, pk);
        ctx.lineTo(hwL * 0.92, pk + peakH * 0.5);
        ctx.lineTo(hwL, horizon);
        break;
      case 'arch':
        ctx.lineTo(0, pk + peakH * 0.4);
        ctx.quadraticCurveTo(hwL * 0.4, pk, hwL * 0.8, horizon - h * 0.004);
        ctx.lineTo(hwL, horizon);
        break;
      default:
        ctx.lineTo(0, pk + peakH * 0.4);
        ctx.quadraticCurveTo(hwL * 0.42, pk, hwL * 0.72, horizon - h * 0.004);
        ctx.lineTo(hwL, horizon);
    }
    ctx.closePath();
    ctx.fill();
  };

  drawHill(1.0, 1.0, pal.headlandShade);
  drawHill(0.66, 0.7, pal.headland);

  if (style.headland === 'arch') {
    // punch a flat sea-arch hole (sky shows through)
    ctx.fillStyle = pal.seaNear;
    ctx.beginPath();
    ctx.ellipse(hw * 0.34, horizon - peakH * 0.14, hw * 0.1, peakH * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Beach props (flat) ─────────────────────────────────────────────────────

function softShadow(ctx: CanvasRenderingContext2D, s: number, ry = 0.28) {
  ctx.save();
  ctx.scale(1, ry);
  circle(ctx, 0, s * 0.6 / ry, s * 0.75, 'rgba(0,0,0,0.12)');
  ctx.restore();
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  kind: ShoreStyle['props'][number]['kind'],
  x: number,
  y: number,
  s: number,
  pal: Palette,
  time: number,
  flip: boolean,
  t: number,
) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  softShadow(ctx, s);
  const sway = Math.sin(time * 1.2 + x) * 0.05;

  switch (kind) {
    case 'palm': {
      ctx.save();
      ctx.rotate(sway * 0.5);
      ctx.strokeStyle = '#7c5a3a';
      ctx.lineWidth = s * 0.18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 0.22, -s * 1.3, s * 0.04, -s * 2.4);
      ctx.stroke();
      const green = mixHex(pal.headland, '#3f9460', 0.4 + 0.4 * t);
      ctx.translate(s * 0.04, -s * 2.4);
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9 + sway;
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 0.75, -s * 0.2, s * 1.35, s * 0.08);
        ctx.quadraticCurveTo(s * 0.7, s * 0.06, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      break;
    }
    case 'grass': {
      const green = mixHex(pal.headland, '#7fae5a', 0.45 + 0.3 * t);
      ctx.fillStyle = green;
      for (let i = -3; i <= 3; i++) {
        ctx.save();
        ctx.translate(i * s * 0.12, 0);
        ctx.rotate(i * 0.12 + sway);
        ctx.beginPath();
        ctx.moveTo(-s * 0.05, 0);
        ctx.quadraticCurveTo(-s * 0.02, -s * 0.7, s * 0.02, -s * 1.05);
        ctx.quadraticCurveTo(s * 0.06, -s * 0.7, s * 0.05, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'rock': {
      ctx.fillStyle = pal.headlandShade;
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, 0);
      ctx.lineTo(-s * 0.3, -s * 0.56);
      ctx.lineTo(s * 0.12, -s * 0.72);
      ctx.lineTo(s * 0.56, -s * 0.34);
      ctx.lineTo(s * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      // flat top-light facet
      ctx.fillStyle = mixHex(pal.headlandShade, '#ffffff', 0.18);
      ctx.beginPath();
      ctx.moveTo(s * 0.12, -s * 0.72);
      ctx.lineTo(s * 0.56, -s * 0.34);
      ctx.lineTo(s * 0.2, -s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'driftwood': {
      ctx.fillStyle = '#b39c7d';
      roundBar(ctx, -s * 0.75, -s * 0.16, s * 1.5, s * 0.26);
      ctx.fillStyle = mixHex('#b39c7d', '#7a6448', 0.5);
      roundBar(ctx, -s * 0.55, -s * 0.05, s * 1.0, s * 0.07);
      break;
    }
  }
  ctx.restore();
}

// ─── Forest scene (Wild Line 2.0) — Palette keys reinterpreted for woodland ──
// skyTop/skyBot=sky, sun=sun, seaFar/seaNear=far/near treeline, foam=haze,
// wetSand/sandTop/sandBot=floor bands, headland/headlandShade=canopy/trunk.
const FOREST_CLEAN: Palette = {
  skyTop: '#cfe0c0', skyBot: '#e8efd2', sun: '#f6e7a8',
  seaFar: '#5a7d4a', seaNear: '#3f6238', foam: '#eef2d8',
  wetSand: '#8a7a50', sandTop: '#7a6a44', sandBot: '#665a38',
  headland: '#3f6238', headlandShade: '#5a3f28',
};
const FOREST_POLLUTED: Palette = {
  skyTop: '#b8b6a0', skyBot: '#cac8b4', sun: '#cfc8ad',
  seaFar: '#6a6a52', seaNear: '#55553f', foam: '#cac8b4',
  wetSand: '#7a6e54', sandTop: '#6e6248', sandBot: '#5a523c',
  headland: '#55553f', headlandShade: '#4a3a28',
};
function lerpPal(a: Palette, b: Palette, t: number): Palette {
  const out = {} as Palette;
  for (const k of PAL_KEYS) out[k] = mixHex(a[k], b[k], t);
  return out;
}

function drawForestScene(
  ctx: CanvasRenderingContext2D, w: number, h: number, shore: Shore, opts: SceneOpts,
): void {
  const style = shoreStyle(shore);
  const t = clamp(opts.cleanliness, 0, 1);
  const pal = gradePalette(lerpPal(FOREST_POLLUTED, FOREST_CLEAN, t), style);
  const time = opts.time;
  const night = style.tod === 'night';

  // sky
  rect(ctx, 0, 0, w, h * 0.5, pal.skyTop);
  rect(ctx, 0, h * 0.32, w, h * 0.18, pal.skyBot);
  if (night) {
    ctx.fillStyle = '#f3f7ff';
    for (const s of style.stars) {
      const tw = 0.5 + 0.5 * Math.sin(time * 2 + s.ph);
      ctx.globalAlpha = (0.4 + 0.6 * tw) * (0.4 + 0.6 * t);
      circle(ctx, s.x * w, s.y * h * 0.4, s.r * 0.9, '#f3f7ff');
    }
    ctx.globalAlpha = 1;
  }
  // sun / moon
  const sx = w * style.sunX, sy = h * 0.18;
  circle(ctx, sx, sy, h * 0.06 * (night ? 0.6 : 1), pal.sun);
  if (night) circle(ctx, sx + h * 0.03, sy - h * 0.012, h * 0.05, pal.skyTop);
  // clouds
  if (!night) for (const c of style.clouds) {
    const cx = ((c.x * w + time * c.sp) % (w + 180)) - 90;
    drawCloud(ctx, cx, h * 0.16 * (0.6 + c.y), c.s * h * 0.045, rgba(pal.foam, 0.9));
  }
  // treelines (two rough rows)
  const tre = (baseY: number, hh: number, fill: string, salt: number) => {
    const r = mulberry32((shore.seed ^ salt) >>> 0);
    let x = -30;
    while (x < w + 30) {
      const tw = w * (0.05 + r() * 0.07);
      rough(ctx, x, baseY, tw * 0.6, hh * (0.7 + r() * 0.7), { n: 14, macro: 0.12, roughFn: a => up(a) * 0.2 + 0.02 }, r, fill);
      x += tw * 0.9;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(0, baseY, w, h * 0.55 - baseY);
  };
  tre(h * 0.44, h * 0.12, pal.seaFar, 0x51);
  tre(h * 0.5, h * 0.16, pal.seaNear, 0x71);
  // floor
  rect(ctx, 0, h * 0.58, w, h * 0.42, pal.sandTop);
  ctx.fillStyle = pal.sandBot;
  ctx.beginPath();
  ctx.moveTo(0, h); ctx.lineTo(0, h * 0.84); ctx.lineTo(w, h * 0.88); ctx.lineTo(w, h); ctx.closePath();
  ctx.fill();
  // foreground trees framing the sides
  const drawTree = (x: number, salt: number) => {
    const r = mulberry32((shore.seed ^ salt) >>> 0);
    ctx.strokeStyle = pal.headlandShade;
    ctx.lineWidth = h * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, h * 0.66);
    ctx.quadraticCurveTo(x + 12, h * 0.3, x - 6, -20);
    ctx.stroke();
    rough(ctx, x - 6, -10, h * 0.2, h * 0.2, { n: 20, macro: 0.16, rough: 0.1 }, r, pal.headland);
    rough(ctx, x + h * 0.08, h * 0.12, h * 0.14, h * 0.14, { n: 16, macro: 0.18, rough: 0.1 }, r, mixHex(pal.headland, '#000000', 0.08));
  };
  drawTree(w * 0.08, 0x9a);
  drawTree(w * 0.93, 0xb2);
}

// ─── Creature placement (deterministic per shore) ─────────────────────────

export interface Placed {
  kind: CreatureKind;
  x: number;
  y: number;
  s: number;
  phase: number;
}

const SEA_KINDS: CreatureKind[] = ['dolphin', 'whale', 'ray', 'jellyfish', 'otter', 'orca'];

export function placeCreatures(
  w: number,
  h: number,
  shore: Shore,
  creatures: { kind: CreatureKind }[],
): Placed[] {
  const style = shoreStyle(shore);
  const rand = mulberry32(shore.seed ^ 0x9e3779b9);
  const foam = h * style.foam;
  const wet = h * style.wet;
  const out: Placed[] = [];
  const list = creatures.slice(0, 9);
  const n = list.length;
  const heroSide = rand() < 0.5 ? 0.24 : 0.76; // hero hugs one third, frames the scene

  list.forEach((c, i) => {
    const sea = SEA_KINDS.includes(c.kind);
    // BOLD depth: index 0 = hero (very near, very big), one tiny far one,
    // the rest spread between. Never a uniform row.
    let d: number; // 0 far .. 1 near
    if (i === 0) d = 0.92 + rand() * 0.08;
    else if (i === 1 && n >= 3) d = rand() * 0.13;
    else d = 0.26 + rand() * 0.56;
    const depth = Math.pow(d, 1.3);

    let x: number, y: number, s: number;
    if (sea) {
      x = clamp(0.2 + rand() * 0.6, 0.1, 0.9) * w;
      y = h * HORIZON + (foam - h * HORIZON) * (0.3 + rand() * 0.45);
      s = (c.kind === 'whale' || c.kind === 'orca' ? 0.11 : c.kind === 'ray' ? 0.08 : 0.05 + rand() * 0.02) * h;
    } else {
      // ONE big focal animal (the hero) + a clearly smaller supporting cast —
      // exaggerated size gap so the composition has a subject, not a uniform row.
      s = (i === 0 ? lerp(0.38, 0.46, rand()) : lerp(0.05, 0.16, depth)) * h;
      const hd = HABITATS[shore.habitat];
      const top = shore.habitat === 'ocean' ? wet - (h - wet) * 0.08 : h * hd.groundTop;
      const bot = shore.habitat === 'ocean' ? h - (h - wet) * 0.02 : h * hd.groundBot;
      y = top + (bot - top) * depth - s * 0.24;
      x = i === 0
        ? (heroSide + (rand() - 0.5) * 0.1) * w
        : clamp(0.1 + rand() * 0.8, 0.06, 0.94) * w;
    }
    out.push({ kind: c.kind, x, y, s, phase: rand() * Math.PI * 2 });
  });
  // far (small/high) drawn first, near (big/low) painted on top
  return out.sort((a, b) => a.y - b.y);
}

// ─── Vector creatures (FLAT cut-paper) ──────────────────────────────────────

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  p: Placed,
  time: number,
  arrive = 1,
  shadow = true,
): void {
  const a = clamp(arrive, 0, 1);
  if (a <= 0) return;
  const bob = Math.sin(time * 2 + p.phase) * p.s * 0.06;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.scale(a, a);

  if (shadow && !SEA_KINDS.includes(p.kind)) softShadow(ctx, p.s * 1.1, 0.3);

  // stable per-creature rng (seeded from phase) so the hand-drawn irregularity is
  // fixed — recomputed identically every frame, never shimmers
  const rng = mulberry32((Math.floor(p.phase * 100000) >>> 0) ^ 0x9e3779b9);
  const t = time;
  const ph = p.phase;
  switch (p.kind) {
    case 'turtle': turtle(ctx, p.s, t, ph, rng); break;
    case 'crab': crab(ctx, p.s, t, ph, rng); break;
    case 'gull': gull(ctx, p.s, t, ph, rng); break;
    case 'starfish': starfish(ctx, p.s, rng); break;
    case 'dolphin': dolphin(ctx, p.s, t, ph, rng); break;
    case 'seal': seal(ctx, p.s, t, ph, rng); break;
    case 'shell': shell(ctx, p.s, rng); break;
    case 'whale': whale(ctx, p.s, t, ph, rng); break;
    case 'ray': ray(ctx, p.s, t, ph, rng); break;
    case 'octopus': octopus(ctx, p.s, t, ph, rng); break;
    case 'pufferfish': pufferfish(ctx, p.s, t, ph, rng); break;
    case 'jellyfish': jellyfish(ctx, p.s, t, ph, rng); break;
    case 'seahorse': seahorse(ctx, p.s, t, ph, rng); break;
    case 'otter': otter(ctx, p.s, t, ph, rng); break;
    case 'orca': orca(ctx, p.s, t, ph, rng); break;
    case 'fox': fox(ctx, p.s, t, ph, rng); break;
    case 'deer': deer(ctx, p.s, t, ph, rng); break;
    case 'owl': owl(ctx, p.s, t, ph, rng); break;
    case 'hedgehog': hedgehog(ctx, p.s, t, ph, rng); break;
  }
  ctx.restore();
}

// ─── hand-drawn helpers ─────────────────────────────────────────────────────

type RoughOpts = { n?: number; macro?: number; rot?: number; rough?: number; roughFn?: (a: number) => number };

/** Hand-drawn rough silhouette. macro = wonky lobes, roughFn(angle) = per-region
 *  brushy edge so roughness follows the animal's features, not evenly all around. */
function rough(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number,
  o: RoughOpts, rng: () => number, fill: string,
) {
  const N = o.n ?? 32, macro = o.macro ?? 0.07, rot = o.rot ?? 0;
  const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
  const k1 = 2 + ((rng() * 2) | 0), k2 = 3 + ((rng() * 3) | 0);
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rot;
    const m = 1 + macro * Math.sin(a * k1 + p1) + macro * 0.55 * Math.sin(a * k2 + p2);
    const rr = o.roughFn ? o.roughFn(a) : (o.rough ?? 0.04);
    const r = m * (1 + (rng() * 2 - 1) * rr);
    const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
const dn = (a: number) => Math.max(0, Math.sin(a)); // 1 at bottom, 0 at top
const up = (a: number) => Math.max(0, -Math.sin(a)); // 1 at top, 0 at bottom

/** Rough tapered limb (flipper / leg) with a hand-drawn wobble. */
function rlimb(
  ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number,
  w: number, rng: () => number, fill: string,
) {
  const mx = (x1 + x2) / 2 + (rng() * 2 - 1) * w * 1.1;
  const my = (y1 + y2) / 2 + (rng() * 2 - 1) * w * 1.1;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w, y1 + ny * w);
  ctx.quadraticCurveTo(mx + nx * w * 0.85, my + ny * w * 0.85, x2 + nx * w * 0.4, y2 + ny * w * 0.4);
  ctx.lineTo(x2 - nx * w * 0.4, y2 - ny * w * 0.4);
  ctx.quadraticCurveTo(mx - nx * w * 0.85, my - ny * w * 0.85, x1 - nx * w, y1 - ny * w);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// ─── eyes: A plain dot · B white patch + pupil · C dot + hand-cut fleck.
//     mixed across the roster so the cast feels varied, not stamped. ───
const INK = '#1d2620';
const EYE: Record<CreatureKind, 'A' | 'B' | 'C'> = {
  turtle: 'C', crab: 'A', gull: 'B', starfish: 'A', dolphin: 'C', seal: 'B', shell: 'A',
  whale: 'C', ray: 'A', octopus: 'B', pufferfish: 'B', jellyfish: 'C', seahorse: 'A', otter: 'B', orca: 'C',
  fox: 'C', deer: 'A', owl: 'B', hedgehog: 'A',
};
function eye(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  kind: CreatureKind, rng: () => number, gx = 0, gy = 0,
) {
  const st = EYE[kind];
  if (st === 'B') {
    rough(ctx, x, y, r * 1.55, r * 1.5, { n: 11, macro: 0.18, rough: 0.14 }, rng, '#f5f3ea');
    circle(ctx, x + gx, y + gy, r * 0.78, INK);
  } else if (st === 'C') {
    circle(ctx, x, y, r, INK);
    const fr = r * (0.34 + rng() * 0.12), fa = -2.2 + rng() * 0.7;
    ctx.save();
    ctx.translate(x + Math.cos(fa) * r * 0.4, y + Math.sin(fa) * r * 0.4);
    ctx.rotate(rng() * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(-fr, 0);
    ctx.lineTo(fr * 0.4, -fr * 0.8);
    ctx.lineTo(fr, fr * 0.3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.restore();
  } else {
    circle(ctx, x, y, r, INK);
  }
}

const TURTLE = { shell: '#3a9e6a', plate: '#2c7d54', skin: '#56b487' };
const CRAB = { body: '#e2503a', claw: '#cf3f2b' };
const GULL = { body: '#f1f4f6', wing: '#c6d1d8', beak: '#f5a23c' };
const SEAL = { body: '#a59c89', light: '#b3aa95' };
const DOLPHIN = { body: '#4a86b4', belly: '#dbe8f0' };

function turtle(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const paddle = Math.sin(time * 3 + ph) * 0.2;
  // flippers — uneven, fronts paddle
  rlimb(ctx, -s * 0.55, -s * 0.05, -s * 1.02, -s * 0.3 + paddle * s * 0.4, s * 0.2, rng, TURTLE.skin);
  rlimb(ctx, s * 0.56, -s * 0.1, s * 1.0, -s * 0.12 - paddle * s * 0.4, s * 0.19, rng, TURTLE.skin);
  rlimb(ctx, -s * 0.5, s * 0.5, -s * 0.84, s * 0.76, s * 0.16, rng, TURTLE.skin);
  rlimb(ctx, s * 0.5, s * 0.52, s * 0.92, s * 0.66, s * 0.17, rng, TURTLE.skin);
  rough(ctx, s * 0.03, -s * 0.84, s * 0.3, s * 0.32, { n: 20, macro: 0.1, roughFn: a => 0.02 + 0.05 * dn(a) }, rng, TURTLE.skin);
  rough(ctx, 0, 0, s * 0.82, s * 0.66, { n: 36, macro: 0.06, roughFn: a => 0.015 + 0.075 * dn(a) }, rng, TURTLE.shell);
  rough(ctx, -s * 0.02, -s * 0.05, s * 0.22, s * 0.2, { n: 12, macro: 0.16, rough: 0.1 }, rng, TURTLE.plate);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - 1 + rng() * 0.25;
    rough(ctx, Math.cos(a) * s * 0.44, Math.sin(a) * s * 0.36 - s * 0.05, s * 0.12, s * 0.12, { n: 9, macro: 0.2, rough: 0.12 }, rng, TURTLE.plate);
  }
  eye(ctx, -s * 0.09, -s * 0.88, s * 0.075, 'turtle', rng);
  eye(ctx, s * 0.12, -s * 0.85, s * 0.07, 'turtle', rng);
}

function crab(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const wv = Math.sin(time * 5 + ph) * 0.25;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ly = -s * 0.05 + i * s * 0.28;
      rlimb(ctx, sgn * s * 0.5, ly, sgn * (s * 0.95 + rng() * s * 0.12), ly + s * 0.2 - i * s * 0.05, s * 0.075, rng, CRAB.claw);
    }
  }
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.translate(sgn * s * 0.72, -s * 0.45);
    ctx.rotate(sgn * wv * 0.3);
    rough(ctx, 0, 0, s * 0.3, s * 0.26, { n: 11, macro: 0.16, rough: 0.1 }, rng, CRAB.claw);
    ctx.restore();
  }
  rough(ctx, 0, 0, s * 0.74, s * 0.52, { n: 30, macro: 0.08, roughFn: a => 0.02 + 0.06 * dn(a) }, rng, CRAB.body);
  for (const sgn of [-1, 1]) {
    ctx.strokeStyle = CRAB.body;
    ctx.lineWidth = s * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sgn * s * 0.22, -s * 0.28);
    ctx.lineTo(sgn * s * 0.28, -s * 0.62);
    ctx.stroke();
    eye(ctx, sgn * s * 0.28, -s * 0.66, s * 0.1, 'crab', rng);
  }
}

function gull(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const tt = Math.sin(time * 3 + ph);
  rough(ctx, 0, s * 0.05, s * 0.5, s * 0.62, { n: 32, macro: 0.06, roughFn: a => 0.012 + 0.05 * dn(a) }, rng, GULL.body);
  ctx.save();
  ctx.rotate(tt * 0.06);
  rough(ctx, s * 0.18, 0, s * 0.34, s * 0.46, { n: 20, macro: 0.1, rough: 0.06 }, rng, GULL.wing);
  ctx.restore();
  rough(ctx, -s * 0.05, -s * 0.66, s * 0.31, s * 0.32, { n: 18, macro: 0.08, rough: 0.05 }, rng, GULL.body);
  ctx.fillStyle = GULL.beak;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.68);
  ctx.lineTo(-s * 0.66, -s * 0.58);
  ctx.lineTo(-s * 0.28, -s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GULL.beak;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * s * 0.13, s * 0.6);
    ctx.lineTo(sgn * s * 0.13, s * 0.9);
    ctx.stroke();
  }
  eye(ctx, -s * 0.12, -s * 0.67, s * 0.07, 'gull', rng, 1, 1);
}

function starfish(ctx: CanvasRenderingContext2D, s: number, rng: () => number) {
  ctx.fillStyle = '#f0913b';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const base = i % 2 === 0 ? 0.92 : 0.42;
    const r = s * base * (1 + (rng() * 2 - 1) * 0.08);
    const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  circle(ctx, 0, 0, s * 0.12, '#ffd9a0');
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
    circle(ctx, Math.cos(ang) * s * 0.44, Math.sin(ang) * s * 0.44, s * 0.06 + rng() * s * 0.02, '#ffd9a0');
  }
}

function dolphin(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const leap = (Math.sin(time * 1.3 + ph) + 1) / 2;
  ctx.save();
  ctx.translate(0, -leap * s * 1.2);
  ctx.rotate(-0.5 + leap * 1.0);
  ctx.fillStyle = DOLPHIN.body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.95, s * 0.22);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, s * 0.95, -s * 0.2);
  ctx.quadraticCurveTo(s * 0.3, s * 0.12, -s * 0.95, s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = DOLPHIN.belly;
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, s * 0.2);
  ctx.quadraticCurveTo(s * 0.12, -s * 0.08, s * 0.72, -s * 0.16);
  ctx.quadraticCurveTo(s * 0.1, s * 0.14, -s * 0.6, s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = DOLPHIN.body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.48);
  ctx.lineTo(s * 0.28, -s * 0.9);
  ctx.lineTo(s * 0.32, -s * 0.42);
  ctx.closePath();
  ctx.fill();
  eye(ctx, s * 0.6, -s * 0.12, s * 0.07, 'dolphin', rng);
  ctx.restore();
}

function seal(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const tt = Math.sin(time * 2.5 + ph);
  ctx.save();
  ctx.translate(s * 0.72, -s * 0.08);
  ctx.rotate(tt * 0.15);
  rlimb(ctx, 0, 0, s * 0.42, -s * 0.22, s * 0.2, rng, SEAL.body);
  ctx.restore();
  rough(ctx, 0, s * 0.06, s * 0.95, s * 0.6, { n: 36, macro: 0.08, roughFn: a => 0.012 + 0.06 * dn(a) }, rng, SEAL.body);
  rough(ctx, -s * 0.6, -s * 0.42, s * 0.44, s * 0.44, { n: 22, macro: 0.09, roughFn: a => 0.015 + 0.045 * dn(a) }, rng, SEAL.light);
  rlimb(ctx, -s * 0.1, s * 0.45, s * 0.05, s * 0.72, s * 0.14, rng, SEAL.body);
  eye(ctx, -s * 0.72, -s * 0.5, s * 0.075, 'seal', rng, 1, 1);
  eye(ctx, -s * 0.48, -s * 0.47, s * 0.07, 'seal', rng, 1, 1);
  circle(ctx, -s * 0.82, -s * 0.33, s * 0.06, '#3a3329');
}

function shell(ctx: CanvasRenderingContext2D, s: number, rng: () => number) {
  ctx.fillStyle = '#f4cdb4';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.5);
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI + (i / N) * Math.PI;
    const rr = s * 0.78 * (1 + (rng() * 2 - 1) * 0.05);
    ctx.lineTo(Math.cos(a) * rr, s * 0.5 + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e6a886';
  for (let i = 0; i < 4; i++) {
    const a0 = Math.PI + (i / 4 + 0.06) * Math.PI;
    const a1 = Math.PI + ((i + 0.45) / 4 + 0.06) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.lineTo(Math.cos(a0) * s * 0.72, s * 0.5 + Math.sin(a0) * s * 0.72);
    ctx.lineTo(Math.cos(a1) * s * 0.72, s * 0.5 + Math.sin(a1) * s * 0.72);
    ctx.closePath();
    ctx.fill();
  }
  circle(ctx, 0, s * 0.5, s * 0.1, '#e6a886');
}

function whale(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const breach = (Math.sin(time * 0.8 + ph) + 1) / 2;
  ctx.save();
  ctx.translate(0, -breach * s * 0.5);
  ctx.rotate(-0.25 + breach * 0.35);
  const body = '#4a6f95', belly = '#cdd9e4';
  ctx.beginPath();
  ctx.moveTo(-s * 1.4, s * 0.1);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.95, s * 1.0, -s * 0.35);
  ctx.quadraticCurveTo(s * 1.5, -s * 0.2, s * 1.35, s * 0.05);
  ctx.quadraticCurveTo(s * 0.4, s * 0.2, -s * 1.4, s * 0.1);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 1.2, s * 0.05);
  ctx.lineTo(-s * 1.6, -s * 0.45);
  ctx.lineTo(-s * 1.15, -s * 0.2);
  ctx.lineTo(-s * 1.5, s * 0.35);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, s * 0.12);
  ctx.quadraticCurveTo(s * 0.2, s * 0.02, s * 1.1, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.2, s * 0.22, -s * 0.9, s * 0.12);
  ctx.closePath();
  ctx.fillStyle = belly;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  for (const dx of [-0.06, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.7, -s * 0.4);
    ctx.quadraticCurveTo(s * (0.7 + dx), -s * 0.8, s * (0.7 + dx * 3), -s * 0.95);
    ctx.stroke();
  }
  eye(ctx, s * 0.7, -s * 0.18, s * 0.06, 'whale', rng);
  ctx.restore();
}

function ray(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const flap = Math.sin(time * 2 + ph) * 0.22;
  const body = '#5a6f8c', belly = '#cdd6e0';
  ctx.save();
  ctx.scale(1, 1 + flap * 0.3);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.quadraticCurveTo(s * 1.5, -s * 0.4 - flap * s, s * 1.25, s * 0.3);
  ctx.quadraticCurveTo(s * 0.5, s * 0.1, 0, s * 0.4);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.1, -s * 1.25, s * 0.3);
  ctx.quadraticCurveTo(-s * 1.5, -s * 0.4 - flap * s, 0, -s * 0.55);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.4);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.1, 0, s * 0.25);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.1, 0, -s * 0.4);
  ctx.closePath();
  ctx.fillStyle = belly;
  ctx.fill();
  ctx.strokeStyle = body;
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.lineTo(0, s * 1.3);
  ctx.stroke();
  eye(ctx, -s * 0.34, -s * 0.34, s * 0.05, 'ray', rng);
  eye(ctx, s * 0.34, -s * 0.34, s * 0.05, 'ray', rng);
  ctx.restore();
}

function octopus(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const body = '#c2588f', arm = '#a8447a';
  ctx.strokeStyle = arm;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const tt = (i / 7 - 0.5) * 1.9;
    ctx.lineWidth = s * 0.17;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.2);
    const ex = tt * s * 0.75;
    const ey = s * 0.95 + Math.sin(time * 4 + i + ph) * s * 0.12;
    ctx.quadraticCurveTo(tt * s * 0.55, s * 0.62, ex, ey);
    ctx.stroke();
  }
  rough(ctx, 0, -s * 0.05, s * 0.72, s * 0.82, { n: 26, macro: 0.08, roughFn: a => 0.015 + 0.05 * dn(a) }, rng, body);
  eye(ctx, -s * 0.26, -s * 0.12, s * 0.13, 'octopus', rng, 2, 1);
  eye(ctx, s * 0.26, -s * 0.12, s * 0.13, 'octopus', rng, 2, 1);
}

function pufferfish(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const puff = 1 + 0.05 * Math.sin(time * 3 + ph);
  const body = '#e0a23c', spike = '#c8862a', r = s * 0.7 * puff;
  ctx.fillStyle = spike;
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const rr = r * (1 + (rng() * 2 - 1) * 0.05);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.12) * rr, Math.sin(a - 0.12) * rr);
    ctx.lineTo(Math.cos(a) * rr * 1.32, Math.sin(a) * rr * 1.32);
    ctx.lineTo(Math.cos(a + 0.12) * rr, Math.sin(a + 0.12) * rr);
    ctx.closePath();
    ctx.fill();
  }
  rough(ctx, 0, 0, r, r, { n: 28, macro: 0.05, rough: 0.04 }, rng, body);
  rough(ctx, 0, s * 0.22, s * 0.46, s * 0.28, { n: 14, macro: 0.1, rough: 0.06 }, rng, '#f0c267');
  eye(ctx, -s * 0.22, -s * 0.12, s * 0.12, 'pufferfish', rng, 1, 1);
  eye(ctx, s * 0.22, -s * 0.12, s * 0.12, 'pufferfish', rng, 1, 1);
  circle(ctx, 0, s * 0.24, s * 0.05, '#9c6620');
}

function jellyfish(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const pulse = 1 + 0.08 * Math.sin(time * 2 + ph);
  ctx.strokeStyle = 'rgba(184,156,230,0.55)';
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s * 0.18, 0);
    ctx.quadraticCurveTo(
      i * s * 0.18 + Math.sin(time * 3 + i) * s * 0.12, s * 0.6,
      i * s * 0.18 + Math.sin(time * 3 + i + 1) * s * 0.16, s * 1.15,
    );
    ctx.stroke();
  }
  rough(ctx, 0, s * 0.02, s * 0.7 * pulse, s * 0.6 * pulse, { n: 26, macro: 0.06, roughFn: a => 0.01 + 0.05 * dn(a) }, rng, 'rgba(186,156,232,0.74)');
  rough(ctx, 0, -s * 0.08, s * 0.4, s * 0.28, { n: 14, macro: 0.1, rough: 0.05 }, rng, 'rgba(224,206,255,0.5)');
  eye(ctx, -s * 0.16, -s * 0.05, s * 0.07, 'jellyfish', rng);
  eye(ctx, s * 0.16, -s * 0.05, s * 0.07, 'jellyfish', rng);
}

function seahorse(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const sway = Math.sin(time * 2.5 + ph) * 0.08;
  const body = '#e8a23a', fin = '#f0c267';
  ctx.save();
  ctx.rotate(sway);
  ctx.strokeStyle = body;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.46;
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, -s * 0.7);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.3, s * 0.1, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.35, s * 0.6, s * 0.05, s * 0.95);
  ctx.stroke();
  rough(ctx, -s * 0.05, -s * 0.78, s * 0.27, s * 0.28, { n: 16, macro: 0.12, rough: 0.08 }, rng, body);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, -s * 0.86);
  ctx.lineTo(-s * 0.62, -s * 0.78);
  ctx.lineTo(-s * 0.26, -s * 0.66);
  ctx.closePath();
  ctx.fill();
  rough(ctx, s * 0.32, -s * 0.15, s * 0.1, s * 0.28, { n: 12, macro: 0.18, rough: 0.1, rot: 0.5 }, rng, fin);
  eye(ctx, -s * 0.02, -s * 0.82, s * 0.06, 'seahorse', rng);
  ctx.restore();
}

function otter(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const bob = Math.sin(time * 2 + ph) * 0.04;
  const body = '#8a6a4a', light = '#a98a68';
  ctx.save();
  ctx.rotate(bob);
  rough(ctx, 0, 0, s * 1.05, s * 0.5, { n: 34, macro: 0.08, rough: 0.05 }, rng, body);
  rough(ctx, 0, s * 0.04, s * 0.78, s * 0.34, { n: 24, macro: 0.08, rough: 0.05 }, rng, light);
  rough(ctx, -s * 0.95, -s * 0.12, s * 0.34, s * 0.34, { n: 18, macro: 0.1, rough: 0.06 }, rng, body);
  circle(ctx, -s * 1.12, -s * 0.32, s * 0.1, body);
  circle(ctx, -s * 0.78, -s * 0.32, s * 0.1, body);
  circle(ctx, s * 0.05, -s * 0.18, s * 0.12, body);
  circle(ctx, s * 0.32, -s * 0.18, s * 0.12, body);
  ctx.fillStyle = '#f4cdb4';
  ctx.beginPath();
  ctx.arc(s * 0.18, -s * 0.28, s * 0.2, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  rough(ctx, s * 0.95, -s * 0.22, s * 0.16, s * 0.16, { n: 10, macro: 0.12, rough: 0.1 }, rng, body);
  eye(ctx, -s * 1.02, -s * 0.16, s * 0.06, 'otter', rng);
  eye(ctx, -s * 0.86, -s * 0.16, s * 0.06, 'otter', rng);
  circle(ctx, -s * 1.18, -s * 0.06, s * 0.05, '#3a2a1c');
  ctx.restore();
}

function orca(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number, rng: () => number) {
  const breach = (Math.sin(time * 0.9 + ph) + 1) / 2;
  const dark = '#1c2630', white = '#eef4f7';
  ctx.save();
  ctx.translate(0, -breach * s * 0.6);
  ctx.rotate(-0.3 + breach * 0.5);
  ctx.beginPath();
  ctx.moveTo(-s * 1.3, s * 0.18);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, s * 1.05, -s * 0.28);
  ctx.quadraticCurveTo(s * 1.5, -s * 0.12, s * 1.32, s * 0.08);
  ctx.quadraticCurveTo(s * 0.3, s * 0.25, -s * 1.3, s * 0.18);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 1.1, s * 0.1);
  ctx.lineTo(-s * 1.55, -s * 0.4);
  ctx.lineTo(-s * 1.1, -s * 0.18);
  ctx.lineTo(-s * 1.45, s * 0.4);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s * 0.16);
  ctx.quadraticCurveTo(s * 0.4, s * 0.06, s * 1.0, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.3, s * 0.24, -s * 0.5, s * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, -s * 0.5);
  ctx.lineTo(s * 0.35, -s * 1.05);
  ctx.lineTo(s * 0.42, -s * 0.45);
  ctx.closePath();
  ctx.fill();
  rough(ctx, s * 0.7, -s * 0.28, s * 0.18, s * 0.1, { n: 10, macro: 0.14, rough: 0.1 }, rng, white);
  circle(ctx, s * 0.72, -s * 0.28, s * 0.05, '#0c1218');
  ctx.restore();
}

// ─── forest creatures (Wild Line 2.0) — drawn around origin, hand-drawn ──────
function fox(ctx: CanvasRenderingContext2D, s: number, _t: number, _ph: number, rng: () => number) {
  const o = '#e07a3a', d = '#c75f28', w = '#f3ece0';
  rlimb(ctx, -s * 0.4, s * 0.3, -s * 0.45, s * 0.95, s * 0.12, rng, d);
  rlimb(ctx, s * 0.4, s * 0.3, s * 0.45, s * 0.95, s * 0.12, rng, d);
  rough(ctx, -s * 0.95, s * 0.1, s * 0.5, s * 0.34, { n: 18, macro: 0.2, rough: 0.12 }, rng, o); // tail
  rough(ctx, -s * 1.2, s * 0.05, s * 0.2, s * 0.2, { n: 12, macro: 0.2, rough: 0.12 }, rng, w);
  rough(ctx, 0, s * 0.1, s * 0.62, s * 0.56, { n: 30, macro: 0.1, roughFn: a => 0.02 + 0.05 * dn(a) }, rng, o); // body
  rough(ctx, s * 0.1, -s * 0.55, s * 0.46, s * 0.44, { n: 22, macro: 0.12, rough: 0.07 }, rng, o); // head
  ctx.fillStyle = o;
  ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(-s * 0.22, -s * 1.35); ctx.lineTo(-s * 0.32, -s * 0.78); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.85); ctx.lineTo(s * 0.5, -s * 1.3); ctx.lineTo(s * 0.56, -s * 0.7); ctx.closePath(); ctx.fill();
  rough(ctx, s * 0.25, -s * 0.4, s * 0.26, s * 0.24, { n: 14, macro: 0.14, rough: 0.08 }, rng, w); // snout
  circle(ctx, s * 0.46, -s * 0.4, s * 0.06, '#2a1d16'); // nose
  eye(ctx, 0, -s * 0.55, s * 0.07, 'fox', rng);
  eye(ctx, s * 0.28, -s * 0.52, s * 0.065, 'fox', rng);
}

function deer(ctx: CanvasRenderingContext2D, s: number, _t: number, _ph: number, rng: () => number) {
  const b = '#b07a4a', l = '#caa276';
  rlimb(ctx, -s * 0.4, s * 0.2, -s * 0.5, s * 1.05, s * 0.1, rng, b);
  rlimb(ctx, -s * 0.05, s * 0.25, -s * 0.05, s * 1.1, s * 0.1, rng, b);
  rlimb(ctx, s * 0.4, s * 0.2, s * 0.52, s * 1.05, s * 0.1, rng, b);
  rlimb(ctx, s * 0.1, s * 0.25, s * 0.12, s * 1.1, s * 0.1, rng, b);
  rough(ctx, 0, 0, s * 0.66, s * 0.46, { n: 28, macro: 0.1, roughFn: a => 0.02 + 0.05 * dn(a) }, rng, b); // body
  rlimb(ctx, s * 0.4, -s * 0.1, s * 0.7, -s * 0.7, s * 0.16, rng, b); // neck
  rough(ctx, s * 0.78, -s * 0.85, s * 0.28, s * 0.34, { n: 18, macro: 0.12, rough: 0.07 }, rng, l); // head
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.moveTo(s * 0.66, -s * 1.05); ctx.lineTo(s * 0.6, -s * 1.45); ctx.lineTo(s * 0.78, -s * 1.12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.95, -s * 1.05); ctx.lineTo(s * 1.05, -s * 1.4); ctx.lineTo(s * 0.9, -s * 1.12); ctx.closePath(); ctx.fill();
  rough(ctx, s * 0.62, -s * 0.82, s * 0.1, s * 0.18, { n: 10, macro: 0.2, rough: 0.1, rot: -0.4 }, rng, l);
  rough(ctx, s * 0.98, -s * 0.8, s * 0.1, s * 0.18, { n: 10, macro: 0.2, rough: 0.1, rot: 0.4 }, rng, l);
  circle(ctx, s * 1.02, -s * 0.78, s * 0.05, '#2a1d16');
  eye(ctx, s * 0.84, -s * 0.86, s * 0.06, 'deer', rng);
}

function owl(ctx: CanvasRenderingContext2D, s: number, _t: number, _ph: number, rng: () => number) {
  const b = '#8a6e52', l = '#b39a78';
  rough(ctx, 0, 0, s * 0.6, s * 0.74, { n: 26, macro: 0.08, roughFn: a => 0.02 + 0.05 * dn(a) }, rng, b); // body
  rough(ctx, 0, s * 0.1, s * 0.42, s * 0.5, { n: 20, macro: 0.1, rough: 0.06 }, rng, l); // belly
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.6); ctx.lineTo(-s * 0.5, -s * 1.0); ctx.lineTo(-s * 0.12, -s * 0.66); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.6); ctx.lineTo(s * 0.5, -s * 1.0); ctx.lineTo(s * 0.12, -s * 0.66); ctx.closePath(); ctx.fill();
  eye(ctx, -s * 0.24, -s * 0.3, s * 0.16, 'owl', rng);
  eye(ctx, s * 0.24, -s * 0.3, s * 0.16, 'owl', rng);
  ctx.fillStyle = '#f5a23c';
  ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.12); ctx.lineTo(s * 0.08, -s * 0.12); ctx.lineTo(0, s * 0.06); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#f5a23c'; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sg * s * 0.16, s * 0.66); ctx.lineTo(sg * s * 0.16, s * 0.84); ctx.stroke(); }
}

function hedgehog(ctx: CanvasRenderingContext2D, s: number, _t: number, _ph: number, rng: () => number) {
  const sp = '#6a4f36', f = '#caa276';
  ctx.fillStyle = sp;
  for (let i = 0; i < 22; i++) {
    const a = Math.PI + (i / 21) * Math.PI, rr = s * 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.06) * rr * 0.85, Math.sin(a - 0.06) * rr * 0.85);
    ctx.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 1.25);
    ctx.lineTo(Math.cos(a + 0.06) * rr * 0.85, Math.sin(a + 0.06) * rr * 0.85);
    ctx.closePath(); ctx.fill();
  }
  rough(ctx, 0, 0, s * 0.68, s * 0.56, { n: 24, macro: 0.08, roughFn: a => up(a) * 0.08 + 0.02 }, rng, sp);
  rough(ctx, s * 0.5, s * 0.12, s * 0.3, s * 0.26, { n: 14, macro: 0.12, rough: 0.07 }, rng, f); // face
  circle(ctx, s * 0.78, s * 0.12, s * 0.06, '#2a1d16'); // nose
  eye(ctx, s * 0.5, s * 0.02, s * 0.06, 'hedgehog', rng);
  for (const dx of [-0.3, 0.1]) rough(ctx, s * dx, s * 0.5, s * 0.1, s * 0.07, { n: 8, rough: 0.1 }, rng, f);
}
