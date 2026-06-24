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
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
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

export function drawEnvironment(
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
      // near = BIG, far = tiny. Spread up the beach: far ones sit near the
      // waterline, the big hero sits lower but is lifted by its own size so it
      // isn't jammed against the bottom edge.
      s = lerp(0.045, 0.36, depth) * h; // hero can reach ~36% of height
      const top = wet - (h - wet) * 0.08; // far/small up near the foam line
      const bot = h - (h - wet) * 0.02;
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

  switch (p.kind) {
    case 'turtle': turtle(ctx, p.s, time, p.phase); break;
    case 'crab': crab(ctx, p.s, time, p.phase); break;
    case 'gull': gull(ctx, p.s, time, p.phase); break;
    case 'starfish': starfish(ctx, p.s); break;
    case 'dolphin': dolphin(ctx, p.s, time, p.phase); break;
    case 'seal': seal(ctx, p.s, time, p.phase); break;
    case 'shell': shell(ctx, p.s); break;
    case 'whale': whale(ctx, p.s, time, p.phase); break;
    case 'ray': ray(ctx, p.s, time, p.phase); break;
    case 'octopus': octopus(ctx, p.s, time, p.phase); break;
    case 'pufferfish': pufferfish(ctx, p.s, time, p.phase); break;
    case 'jellyfish': jellyfish(ctx, p.s, time, p.phase); break;
    case 'seahorse': seahorse(ctx, p.s, time, p.phase); break;
    case 'otter': otter(ctx, p.s, time, p.phase); break;
    case 'orca': orca(ctx, p.s, time, p.phase); break;
  }
  ctx.restore();
}

/** A simple cut-paper eye: dark dot + tiny catch-light. */
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  circle(ctx, x, y, r, '#1d2a28');
  circle(ctx, x + r * 0.32, y - r * 0.32, r * 0.34, 'rgba(255,255,255,0.9)');
}

const TURTLE = { shell: '#3f9e6e', plate: '#2f7d57', skin: '#57b486' };
const CRAB = { body: '#e8513f', claw: '#d23b2a' };
const GULL = { body: '#eef2f4', wing: '#c6d1d8', beak: '#f5a23c' };
const SEAL = { body: '#8f8a7e', light: '#aaa498' };
const DOLPHIN = { body: '#4a86b4', belly: '#dbe8f0' };

function turtle(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const paddle = Math.sin(time * 3 + ph) * 0.25;
  // flippers (flat)
  ctx.fillStyle = TURTLE.skin;
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.translate(sgn * s * 0.72, -s * 0.12);
    ctx.rotate(sgn * (0.5 + paddle));
    ellipse(ctx, 0, 0, s * 0.5, s * 0.24, TURTLE.skin);
    ctx.restore();
    ellipse(ctx, sgn * s * 0.5, s * 0.6, s * 0.28, s * 0.16, TURTLE.skin);
  }
  // head
  circle(ctx, 0, -s * 0.86, s * 0.28, TURTLE.skin);
  // shell
  ellipse(ctx, 0, 0, s * 0.74, s * 0.6, TURTLE.shell);
  // flat hex plates
  ctx.fillStyle = TURTLE.plate;
  circle(ctx, 0, -s * 0.05, s * 0.2, TURTLE.plate);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
    circle(ctx, Math.cos(ang) * s * 0.42, Math.sin(ang) * s * 0.34 - s * 0.05, s * 0.12, TURTLE.plate);
  }
  eye(ctx, -s * 0.1, -s * 0.9, s * 0.06);
  eye(ctx, s * 0.1, -s * 0.9, s * 0.06);
}

function crab(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const wv = Math.sin(time * 5 + ph) * 0.3;
  // legs (flat thick)
  ctx.fillStyle = CRAB.claw;
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const ly = -s * 0.02 + i * s * 0.26;
      ctx.save();
      ctx.translate(sgn * s * 0.55, ly);
      ctx.rotate(sgn * (0.2 + i * 0.18));
      roundBar(ctx, 0, -s * 0.05, s * 0.5, s * 0.12);
      ctx.restore();
    }
  }
  // claws
  for (const sgn of [-1, 1]) {
    ctx.save();
    ctx.translate(sgn * s * 0.72, -s * 0.46);
    ctx.rotate(sgn * wv * 0.4);
    ellipse(ctx, 0, 0, s * 0.32, s * 0.24, CRAB.claw);
    ctx.restore();
  }
  // body
  ellipse(ctx, 0, 0, s * 0.72, s * 0.5, CRAB.body);
  // eye stalks
  ctx.strokeStyle = CRAB.body;
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * s * 0.22, -s * 0.28);
    ctx.lineTo(sgn * s * 0.28, -s * 0.6);
    ctx.stroke();
    eye(ctx, sgn * s * 0.28, -s * 0.64, s * 0.1);
  }
}

function gull(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const tt = Math.sin(time * 3 + ph);
  // body
  ellipse(ctx, 0, s * 0.05, s * 0.5, s * 0.62, GULL.body);
  // wing (flat)
  ctx.save();
  ctx.rotate(tt * 0.08);
  ellipse(ctx, s * 0.18, 0, s * 0.32, s * 0.46, GULL.wing);
  ctx.restore();
  // head
  circle(ctx, -s * 0.05, -s * 0.66, s * 0.3, GULL.body);
  // beak
  ctx.fillStyle = GULL.beak;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.7);
  ctx.lineTo(-s * 0.66, -s * 0.62);
  ctx.lineTo(-s * 0.3, -s * 0.54);
  ctx.closePath();
  ctx.fill();
  // legs
  ctx.strokeStyle = GULL.beak;
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * s * 0.13, s * 0.6);
    ctx.lineTo(sgn * s * 0.13, s * 0.9);
    ctx.stroke();
  }
  eye(ctx, -s * 0.12, -s * 0.7, s * 0.06);
}

function starfish(ctx: CanvasRenderingContext2D, s: number) {
  ctx.fillStyle = '#f0913b';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? s * 0.9 : s * 0.4;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // flat dots
  ctx.fillStyle = '#ffd9a0';
  circle(ctx, 0, 0, s * 0.12, '#ffd9a0');
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
    circle(ctx, Math.cos(ang) * s * 0.44, Math.sin(ang) * s * 0.44, s * 0.07, '#ffd9a0');
  }
}

function dolphin(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const leap = (Math.sin(time * 1.3 + ph) + 1) / 2;
  ctx.save();
  ctx.translate(0, -leap * s * 1.2);
  ctx.rotate(-0.5 + leap * 1.0);
  // body (flat curved cutout)
  ctx.fillStyle = DOLPHIN.body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.95, s * 0.22);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, s * 0.95, -s * 0.2);
  ctx.quadraticCurveTo(s * 0.3, s * 0.12, -s * 0.95, s * 0.22);
  ctx.closePath();
  ctx.fill();
  // belly
  ctx.fillStyle = DOLPHIN.belly;
  ctx.beginPath();
  ctx.moveTo(-s * 0.6, s * 0.2);
  ctx.quadraticCurveTo(s * 0.12, -s * 0.08, s * 0.72, -s * 0.16);
  ctx.quadraticCurveTo(s * 0.1, s * 0.14, -s * 0.6, s * 0.2);
  ctx.closePath();
  ctx.fill();
  // dorsal fin
  ctx.fillStyle = DOLPHIN.body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.48);
  ctx.lineTo(s * 0.28, -s * 0.9);
  ctx.lineTo(s * 0.32, -s * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function seal(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const tt = Math.sin(time * 2.5 + ph);
  // body (flat blob)
  ellipse(ctx, 0, s * 0.05, s * 0.88, s * 0.56, SEAL.body);
  // tail flipper
  ctx.save();
  ctx.translate(s * 0.74, -s * 0.12);
  ctx.rotate(tt * 0.2);
  ellipse(ctx, 0, 0, s * 0.3, s * 0.17, SEAL.body);
  ctx.restore();
  // head
  circle(ctx, -s * 0.58, -s * 0.46, s * 0.34, SEAL.light);
  // snout
  ellipse(ctx, -s * 0.72, -s * 0.34, s * 0.12, s * 0.09, SEAL.body);
  eye(ctx, -s * 0.7, -s * 0.52, s * 0.07);
  eye(ctx, -s * 0.46, -s * 0.5, s * 0.07);
}

function shell(ctx: CanvasRenderingContext2D, s: number) {
  // flat fan with cut wedges
  const base = '#f4cdb4';
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.5);
  ctx.arc(0, s * 0.5, s * 0.78, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // flat ridge wedges
  ctx.fillStyle = '#e6a886';
  for (let i = 0; i < 4; i++) {
    const a0 = Math.PI + (i / 4 + 0.06) * Math.PI;
    const a1 = Math.PI + ((i + 0.45) / 4 + 0.06) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.5);
    ctx.lineTo(Math.cos(a0) * s * 0.74, s * 0.5 + Math.sin(a0) * s * 0.74);
    ctx.lineTo(Math.cos(a1) * s * 0.74, s * 0.5 + Math.sin(a1) * s * 0.74);
    ctx.closePath();
    ctx.fill();
  }
  // hinge
  circle(ctx, 0, s * 0.5, s * 0.1, '#e6a886');
}

function whale(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  // gentle breach through the waterline (flat cut-paper)
  const breach = (Math.sin(time * 0.8 + ph) + 1) / 2; // 0..1
  ctx.save();
  ctx.translate(0, -breach * s * 0.5);
  ctx.rotate(-0.25 + breach * 0.35);
  const body = '#4a6f95';
  const belly = '#cdd9e4';
  // body
  ctx.beginPath();
  ctx.moveTo(-s * 1.4, s * 0.1);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.95, s * 1.0, -s * 0.35);
  ctx.quadraticCurveTo(s * 1.5, -s * 0.2, s * 1.35, s * 0.05);
  ctx.quadraticCurveTo(s * 0.4, s * 0.2, -s * 1.4, s * 0.1);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  // tail fluke
  ctx.beginPath();
  ctx.moveTo(-s * 1.2, s * 0.05);
  ctx.lineTo(-s * 1.6, -s * 0.45);
  ctx.lineTo(-s * 1.15, -s * 0.2);
  ctx.lineTo(-s * 1.5, s * 0.35);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  // belly
  ctx.beginPath();
  ctx.moveTo(-s * 0.9, s * 0.12);
  ctx.quadraticCurveTo(s * 0.2, s * 0.02, s * 1.1, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.2, s * 0.22, -s * 0.9, s * 0.12);
  ctx.closePath();
  ctx.fillStyle = belly;
  ctx.fill();
  // spout
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = s * 0.08;
  ctx.lineCap = 'round';
  for (const dx of [-0.06, 0.06]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.7, -s * 0.4);
    ctx.quadraticCurveTo(s * (0.7 + dx), -s * 0.8, s * (0.7 + dx * 3), -s * 0.95);
    ctx.stroke();
  }
  // eye
  circle(ctx, s * 0.7, -s * 0.18, s * 0.05, '#15202a');
  ctx.restore();
}

function ray(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  // manta ray gliding — flapping flat wings (cut-paper diamond)
  const flap = Math.sin(time * 2 + ph) * 0.22;
  const body = '#5a6f8c';
  const belly = '#cdd6e0';
  ctx.save();
  ctx.scale(1, 1 + flap * 0.3);
  // wings (one diamond shape, swept)
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.quadraticCurveTo(s * 1.5, -s * 0.4 - flap * s, s * 1.25, s * 0.3);
  ctx.quadraticCurveTo(s * 0.5, s * 0.1, 0, s * 0.4);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.1, -s * 1.25, s * 0.3);
  ctx.quadraticCurveTo(-s * 1.5, -s * 0.4 - flap * s, 0, -s * 0.55);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  // belly highlight
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.4);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.1, 0, s * 0.25);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.1, 0, -s * 0.4);
  ctx.closePath();
  ctx.fillStyle = belly;
  ctx.fill();
  // cephalic fins + tail
  ctx.strokeStyle = body;
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.lineTo(0, s * 1.3);
  ctx.stroke();
  // eyes
  circle(ctx, -s * 0.34, -s * 0.34, s * 0.05, '#15202a');
  circle(ctx, s * 0.34, -s * 0.34, s * 0.05, '#15202a');
  ctx.restore();
}

function octopus(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const body = '#c2588f';
  const arm = '#a8447a';
  // 8 waving arms fanning from the lower body
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
  // mantle / head
  ellipse(ctx, 0, -s * 0.05, s * 0.72, s * 0.82, body);
  eye(ctx, -s * 0.26, -s * 0.12, s * 0.13);
  eye(ctx, s * 0.26, -s * 0.12, s * 0.13);
}

function pufferfish(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const puff = 1 + 0.06 * Math.sin(time * 3 + ph);
  const body = '#e0a23c';
  const spike = '#c8862a';
  const r = s * 0.7 * puff;
  // spikes
  ctx.fillStyle = spike;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.13) * r, Math.sin(a - 0.13) * r);
    ctx.lineTo(Math.cos(a) * r * 1.34, Math.sin(a) * r * 1.34);
    ctx.lineTo(Math.cos(a + 0.13) * r, Math.sin(a + 0.13) * r);
    ctx.closePath();
    ctx.fill();
  }
  circle(ctx, 0, 0, r, body);
  ellipse(ctx, 0, s * 0.22, s * 0.46, s * 0.28, '#f0c267'); // belly
  eye(ctx, -s * 0.22, -s * 0.12, s * 0.12);
  eye(ctx, s * 0.22, -s * 0.12, s * 0.12);
  ellipse(ctx, 0, s * 0.22, s * 0.1, s * 0.07, '#9c6620'); // mouth
}

function jellyfish(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const pulse = 1 + 0.08 * Math.sin(time * 2 + ph);
  // tentacles
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
  // bell
  ctx.fillStyle = 'rgba(186,156,232,0.72)';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7 * pulse, s * 0.56 * pulse, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, 0, -s * 0.08, s * 0.4, s * 0.28, 'rgba(224,206,255,0.5)');
  eye(ctx, -s * 0.16, -s * 0.05, s * 0.07);
  eye(ctx, s * 0.16, -s * 0.05, s * 0.07);
}

function seahorse(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const sway = Math.sin(time * 2.5 + ph) * 0.08;
  const body = '#e8a23a';
  const fin = '#f0c267';
  ctx.save();
  ctx.rotate(sway);
  // curved S body + curled tail
  ctx.strokeStyle = body;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.46;
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, -s * 0.7);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.3, s * 0.1, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.35, s * 0.6, s * 0.05, s * 0.95);
  ctx.stroke();
  // head + snout
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(-s * 0.05, -s * 0.78, s * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, -s * 0.86);
  ctx.lineTo(-s * 0.62, -s * 0.78);
  ctx.lineTo(-s * 0.26, -s * 0.66);
  ctx.closePath();
  ctx.fill();
  // dorsal fin
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.ellipse(s * 0.32, -s * 0.15, s * 0.1, s * 0.28, 0.5, 0, Math.PI * 2);
  ctx.fill();
  eye(ctx, -s * 0.02, -s * 0.82, s * 0.07);
  ctx.restore();
}

function otter(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  // floating on its back, holding a shell on its belly
  const bob = Math.sin(time * 2 + ph) * 0.04;
  const body = '#8a6a4a';
  const light = '#a98a68';
  ctx.save();
  ctx.rotate(bob);
  // body (horizontal)
  ellipse(ctx, 0, 0, s * 1.05, s * 0.5, body);
  ellipse(ctx, 0, s * 0.04, s * 0.78, s * 0.34, light); // belly
  // head at left
  circle(ctx, -s * 0.95, -s * 0.12, s * 0.34, body);
  circle(ctx, -s * 1.12, -s * 0.32, s * 0.1, body); // ear
  circle(ctx, -s * 0.78, -s * 0.32, s * 0.1, body);
  // little paws holding a shell
  ctx.fillStyle = body;
  circle(ctx, s * 0.05, -s * 0.18, s * 0.12, body);
  circle(ctx, s * 0.32, -s * 0.18, s * 0.12, body);
  ctx.fillStyle = '#f4cdb4';
  ctx.beginPath();
  ctx.arc(s * 0.18, -s * 0.28, s * 0.2, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // feet up at right
  circle(ctx, s * 0.95, -s * 0.22, s * 0.14, body);
  eye(ctx, -s * 1.02, -s * 0.16, s * 0.06);
  eye(ctx, -s * 0.86, -s * 0.16, s * 0.06);
  circle(ctx, -s * 1.18, -s * 0.06, s * 0.05, '#3a2a1c'); // nose
  ctx.restore();
}

function orca(ctx: CanvasRenderingContext2D, s: number, time: number, ph: number) {
  const breach = (Math.sin(time * 0.9 + ph) + 1) / 2;
  const dark = '#1c2630';
  const white = '#eef4f7';
  ctx.save();
  ctx.translate(0, -breach * s * 0.6);
  ctx.rotate(-0.3 + breach * 0.5);
  // body
  ctx.beginPath();
  ctx.moveTo(-s * 1.3, s * 0.18);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, s * 1.05, -s * 0.28);
  ctx.quadraticCurveTo(s * 1.5, -s * 0.12, s * 1.32, s * 0.08);
  ctx.quadraticCurveTo(s * 0.3, s * 0.25, -s * 1.3, s * 0.18);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  // tail fluke
  ctx.beginPath();
  ctx.moveTo(-s * 1.1, s * 0.1);
  ctx.lineTo(-s * 1.55, -s * 0.4);
  ctx.lineTo(-s * 1.1, -s * 0.18);
  ctx.lineTo(-s * 1.45, s * 0.4);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  // white belly + flank patch
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s * 0.16);
  ctx.quadraticCurveTo(s * 0.4, s * 0.06, s * 1.0, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.3, s * 0.24, -s * 0.5, s * 0.16);
  ctx.closePath();
  ctx.fill();
  // dorsal fin (tall)
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, -s * 0.5);
  ctx.lineTo(s * 0.35, -s * 1.05);
  ctx.lineTo(s * 0.42, -s * 0.45);
  ctx.closePath();
  ctx.fill();
  // white eye patch + eye
  ellipse(ctx, s * 0.7, -s * 0.28, s * 0.16, s * 0.09, white);
  circle(ctx, s * 0.72, -s * 0.28, s * 0.05, '#0c1218');
  ctx.restore();
}
