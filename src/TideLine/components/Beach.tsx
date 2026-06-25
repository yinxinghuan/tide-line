import { useEffect, useRef, useState } from 'react';
import type { CreatureKind, LitterKind, Shore } from '../types';
import { LITTER_TRAP } from '../data/biomes';
import { drawEnvironment, placeCreatures, drawCreature, drawPaperGrain } from '../utils/scene';
import { shoreStyle, litterSpots, LITTER_KINDS } from '../utils/style';
import { mulberry32, clamp, lerp } from '../utils/rng';
import { playClear, playBloom, playRelease, unlockAudio, startAmbience } from '../utils/sounds';
import { t } from '../i18n';
import StampFrame from './StampFrame';
import { IconHand, IconArrowRight } from './icons';

interface Props {
  shore: Shore;
  /** Ambient sea life to add on restore (dolphin sometimes, whale if the
   *  community milestone is unlocked). Decided by the parent. */
  ambient?: CreatureKind[];
  onDone: (litter: number, rescued: CreatureKind[]) => void;
}

interface Litter {
  nx: number;
  ny: number;
  kind: LitterKind;
  rot: number;
  scl: number;
  hp: number; // wipes left
  buried: boolean; // needs uncovering first
  trapped?: CreatureKind; // animal freed when cleared
  cleared: boolean;
  hit: number; // wiggle frames after a wipe
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; r: number; col: string;
}
interface Freed {
  kind: CreatureKind; x: number; y: number; s: number; born: number; phase: number;
}

export default function Beach({ shore, ambient = [], onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cleared, setCleared] = useState(0);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<'cleaning' | 'restored'>('cleaning');
  const [hint, setHint] = useState(true);
  const [rescuedList, setRescuedList] = useState<CreatureKind[]>([]);

  const litterRef = useRef<Litter[]>([]);
  const partsRef = useRef<Particle[]>([]);
  const freedRef = useRef<Freed[]>([]);
  const ringsRef = useRef<{ x: number; y: number; born: number }[]>([]);
  const floatersRef = useRef<{ text: string; x: number; y: number; born: number; big: boolean }[]>([]);
  const rescuedRef = useRef<CreatureKind[]>([]);
  const rescueComboRef = useRef(0);
  const lastRescueRef = useRef(0);
  const cleanRef = useRef(0);
  const arriveRef = useRef(0);
  const flashRef = useRef(0);
  const comboRef = useRef(0);
  const lastClearRef = useRef(0);
  const phaseRef = useRef<'cleaning' | 'restored'>('cleaning');
  const timeRef = useRef(0);
  const wRef = useRef(0);
  const hRef = useRef(0);

  // build litter once from the seed — each piece may trap an animal, be stubborn
  // (multi-wipe) or be buried (uncover first)
  useEffect(() => {
    const rand = mulberry32(shore.seed ^ 0x1234abcd);
    const style = shoreStyle(shore);
    const n = 8 + Math.floor(rand() * 7); // 8..14
    const spots = litterSpots(rand, n, style.litterLayout);
    const arr: Litter[] = spots.map(spot => {
      const kind = LITTER_KINDS[Math.floor(rand() * LITTER_KINDS.length)];
      const trapped = LITTER_TRAP[kind];
      return {
        nx: spot.nx,
        ny: spot.ny,
        kind,
        rot: (rand() - 0.5) * 1.4,
        scl: 0.85 + rand() * 0.5,
        hp: kind === 'tire' ? 3 : trapped ? 2 : 1, // heavy/entangling trash is stubborn
        buried: rand() < 0.28,
        trapped,
        cleared: false,
        hit: 0,
      };
    });
    litterRef.current = arr;
    partsRef.current = [];
    freedRef.current = [];
    ringsRef.current = [];
    floatersRef.current = [];
    rescuedRef.current = [];
    rescueComboRef.current = 0;
    lastRescueRef.current = 0;
    setRescuedList([]);
    setTotal(n);
    setCleared(0);
    cleanRef.current = 0;
    arriveRef.current = 0;
    phaseRef.current = 'cleaning';
    setPhase('cleaning');
    setHint(true);
  }, [shore.id, shore.seed]);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let start = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = wrap.getBoundingClientRect();
      wRef.current = Math.max(1, r.width);
      hRef.current = Math.max(1, r.height);
      canvas.width = Math.round(wRef.current * dpr);
      canvas.height = Math.round(hRef.current * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const loop = (ts: number) => {
      if (!start) start = ts;
      const time = (ts - start) / 1000;
      timeRef.current = time;
      const w = wRef.current;
      const h = hRef.current;

      const list = litterRef.current;
      const done = list.filter(l => l.cleared).length;
      const target = list.length ? done / list.length : 0;
      cleanRef.current = lerp(cleanRef.current, target, 0.12);
      if (phaseRef.current === 'restored') arriveRef.current = clamp(arriveRef.current + 0.02, 0, 1);
      flashRef.current = Math.max(0, flashRef.current - 0.018);

      drawEnvironment(ctx, w, h, shore, { cleanliness: cleanRef.current, time });

      if (phaseRef.current === 'restored') {
        // composed bold layout of everything rescued (+ ambient)
        const all = [...rescuedRef.current, ...ambient].map(k => ({ kind: k }));
        const placed = placeCreatures(w, h, shore, all);
        for (const p of placed) drawCreature(ctx, p, time, arriveRef.current);
      } else {
        // creatures freed so far pop in place where they were rescued
        for (const f of freedRef.current) {
          const a = clamp((time - f.born) / 0.4, 0, 1);
          const jump = Math.sin(clamp((time - f.born) * 6, 0, Math.PI)) * f.s * 0.5;
          drawCreature(ctx, { kind: f.kind, x: f.x, y: f.y - jump, s: f.s, phase: f.phase }, time, a);
        }
      }

      // litter still on the sand (trapped animal peeks + struggles underneath)
      for (const l of list) {
        if (l.cleared) continue;
        const depth = clamp((l.ny - 0.64) / 0.32, 0, 1);
        const s = (0.05 + depth * 0.045) * h * l.scl;
        const lx = l.nx * w;
        const ly = l.ny * h;
        if (l.buried) {
          drawMound(ctx, lx, ly, s);
          continue;
        }
        if (l.trapped) {
          const struggle = Math.sin(time * 9 + l.nx * 12) * 0.05;
          drawCreature(
            ctx,
            { kind: l.trapped, x: lx, y: ly + s * 0.25, s: s * 0.62, phase: struggle },
            time, 0.9, false,
          );
        }
        if (l.hit > 0) l.hit -= 1;
        const wob = l.hit > 0 ? Math.sin(l.hit * 1.6) * 0.22 : 0;
        drawLitter(ctx, l.kind, lx, ly, s, l.rot + wob, time);
      }

      // particles
      const ps = partsRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= 1;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.x += p.vx; p.y += p.vy; p.vy += 0.12;
        const a = p.life / p.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // rescue light-ring bursts
      const rings = ringsRef.current;
      for (let i = rings.length - 1; i >= 0; i--) {
        const age = time - rings[i].born;
        const dur = 0.6;
        if (age > dur) { rings.splice(i, 1); continue; }
        const k = age / dur;
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(rings[i].x, rings[i].y, k * h * 0.13, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // floating rescue labels
      const floats = floatersRef.current;
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        const age = time - f.born;
        const dur = 1.1;
        if (age > dur) { floats.splice(i, 1); continue; }
        const k = age / dur;
        const fy = f.y - k * h * 0.06;
        const fs = (f.big ? 19 : 15) * (1 + (1 - Math.min(1, age * 6)) * 0.4);
        ctx.globalAlpha = clamp(1 - k, 0, 1);
        ctx.font = `800 ${fs}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(4,16,22,0.6)';
        ctx.strokeText(f.text, f.x, fy);
        ctx.fillStyle = f.big ? '#ffd24a' : '#bdfff2';
        ctx.fillText(f.text, f.x, fy);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';

      if (flashRef.current > 0) {
        const g = ctx.createRadialGradient(w / 2, h * 0.6, 10, w / 2, h * 0.6, h * 0.8);
        g.addColorStop(0, `rgba(255,255,255,${flashRef.current * 0.7})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      drawPaperGrain(ctx, w, h);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [shore.id, shore.seed, ambient]);

  const spawnPoof = (x: number, y: number, cols: string[], n = 9) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      partsRef.current.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        life: 26 + Math.random() * 16, max: 42, r: 2 + Math.random() * 3,
        col: cols[Math.floor(Math.random() * cols.length)],
      });
    }
  };

  const tryClearAt = (px: number, py: number) => {
    if (phaseRef.current !== 'cleaning') return;
    const w = wRef.current;
    const h = hRef.current;
    const list = litterRef.current;
    let changed = false;
    for (const l of list) {
      if (l.cleared) continue;
      const depth = clamp((l.ny - 0.64) / 0.32, 0, 1);
      const s = (0.05 + depth * 0.045) * h * l.scl;
      const lx = l.nx * w;
      const ly = l.ny * h;
      if (Math.hypot(px - lx, py - ly) > s * 0.9 + 22) continue;

      if (l.buried) {
        l.buried = false;
        l.hit = 8;
        spawnPoof(lx, ly + s * 0.4, ['#d9c79e', '#c9b687', '#efe2bf'], 7);
        setHint(false);
        changed = true;
        continue; // uncovering doesn't clear
      }
      l.hp -= 1;
      l.hit = 8;
      changed = true;
      if (l.hp > 0) {
        spawnPoof(lx, ly, ['#ffffff', '#cfe9ff'], 4);
        continue; // stubborn — needs another wipe
      }
      // cleared!
      l.cleared = true;
      setHint(false);
      const now = performance.now();
      comboRef.current = now - lastClearRef.current < 600 ? comboRef.current + 1 : 0;
      lastClearRef.current = now;
      if (l.trapped) {
        // free the trapped animal — it pops out and joins the shore
        rescuedRef.current.push(l.trapped);
        freedRef.current.push({
          kind: l.trapped, x: lx, y: ly, s: s * 0.95,
          born: timeRef.current, phase: l.nx * 7,
        });
        // rescue combo: chained frees within ~1.5s escalate
        const rnow = performance.now();
        rescueComboRef.current = rnow - lastRescueRef.current < 1500 ? rescueComboRef.current + 1 : 1;
        lastRescueRef.current = rnow;
        const combo = rescueComboRef.current;
        ringsRef.current.push({ x: lx, y: ly, born: timeRef.current });
        floatersRef.current.push({
          text: combo >= 2 ? `${t(l.trapped)}  ×${combo}` : t('freed'),
          x: lx, y: ly - s * 0.9, born: timeRef.current, big: combo >= 2,
        });
        spawnPoof(lx, ly, ['#ffe9a8', '#bfe6d4', '#ffffff', '#9fe0ff'], 14 + combo * 3);
        playRelease();
      } else {
        spawnPoof(lx, ly, ['#ffffff', '#cfe9ff', '#bfe6d4'], 9);
        playClear(comboRef.current);
      }
    }
    if (changed) {
      const done = list.filter(l => l.cleared).length;
      setCleared(done);
      if (done >= list.length && phaseRef.current === 'cleaning') {
        phaseRef.current = 'restored';
        flashRef.current = 1;
        playBloom();
        setRescuedList([...rescuedRef.current]);
        setTimeout(() => setPhase('restored'), 650);
      }
    }
  };

  const dragging = useRef(false);
  const ptFromEvent = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // what to show on the restored stamp = rescued + ambient
  const restoredCreatures = [...rescuedList, ...ambient];

  return (
    <div className="tl-beach">
      <div ref={wrapRef} className="tl-beach__canvas">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          onPointerDown={e => {
            unlockAudio();
            startAmbience();
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            const p = ptFromEvent(e);
            tryClearAt(p.x, p.y);
          }}
          onPointerMove={e => {
            if (!dragging.current) return;
            const p = ptFromEvent(e);
            tryClearAt(p.x, p.y);
          }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}
        />
      </div>

      {/* progress */}
      <div className="tl-beach__top">
        <div className="tl-beach__bar">
          <div className="tl-beach__fill" style={{ width: `${total ? (cleared / total) * 100 : 0}%` }} />
        </div>
        <div className="tl-beach__count">{cleared}/{total}</div>
      </div>

      {/* swipe hint */}
      {hint && phase === 'cleaning' && (
        <div className="tl-hint">
          <div className="tl-hint__hand"><IconHand size={42} /></div>
          <div className="tl-hint__trail" />
          <div className="tl-hint__label">{t('swipeHint')}</div>
        </div>
      )}

      {/* restored card — the finished shore issued as a collectible stamp */}
      {phase === 'restored' && (
        <div className="tl-restored">
          <div className="tl-restored__card">
            <div className="tl-restored__eyebrow">{t('restored')}</div>
            <div className="tl-restored__stamp">
              <StampFrame
                cs={{
                  shore: { ...shore, litter: total, rescued: restoredCreatures },
                  authorId: 'me',
                  releases: [],
                }}
                slam
              />
            </div>
            <p className="tl-restored__big">
              {rescuedList.length > 0
                ? t('rescuedN', { n: rescuedList.length })
                : t('piecesCleared', { n: total })}
            </p>
            <p className="tl-restored__sub">{t('wildlifeBack')}</p>
            <button
              className="tl-btn tl-btn--primary"
              onPointerDown={() => onDone(total, restoredCreatures)}
            >
              {t('seeCoast')} <IconArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── litter (play-only flat cut-paper shapes) ─────────────────────────────

/** A buried-trash mound: a low sand hump with a corner of trash poking out. */
function drawMound(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(150,128,92,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 1.05, s * 0.5, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(120,100,70,0.5)';
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.2);
  ctx.lineTo(s * 0.05, -s * 0.05);
  ctx.lineTo(s * 0.22, s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLitter(
  ctx: CanvasRenderingContext2D,
  kind: LitterKind,
  x: number,
  y: number,
  s: number,
  rot: number,
  time: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.scale(1, 0.3);
  ctx.beginPath();
  ctx.arc(0, s * 0.9, s * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.restore();
  ctx.rotate(rot + Math.sin(time * 1.5 + x) * 0.02);

  switch (kind) {
    case 'bottle': {
      ctx.fillStyle = '#7ec6c4';
      roundRect(ctx, -s * 0.32, -s * 0.7, s * 0.64, s * 1.4, s * 0.24);
      ctx.fill();
      ctx.fillStyle = '#e07a52';
      roundRect(ctx, -s * 0.16, -s * 0.92, s * 0.32, s * 0.26, s * 0.06);
      ctx.fill();
      break;
    }
    case 'bag': {
      ctx.fillStyle = '#e7ecef';
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.2);
      ctx.quadraticCurveTo(-s * 0.4, -s * 0.85, 0, -s * 0.5);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.9, s * 0.7, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.4, s * 0.7, 0, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.5, s * 0.7, -s * 0.7, -s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'can': {
      ctx.fillStyle = '#d6483a';
      roundRect(ctx, -s * 0.34, -s * 0.6, s * 0.68, s * 1.2, s * 0.14);
      ctx.fill();
      ctx.fillStyle = '#bfc6cc';
      roundRect(ctx, -s * 0.34, -s * 0.62, s * 0.68, s * 0.16, s * 0.06);
      ctx.fill();
      break;
    }
    case 'cup': {
      ctx.fillStyle = '#f0e7d8';
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.55);
      ctx.lineTo(s * 0.3, -s * 0.55);
      ctx.lineTo(s * 0.42, s * 0.6);
      ctx.lineTo(-s * 0.42, s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#cf5b3e';
      roundRect(ctx, -s * 0.42, -s * 0.7, s * 0.84, s * 0.2, s * 0.07);
      ctx.fill();
      break;
    }
    case 'net': {
      ctx.fillStyle = '#5a7064';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.72, 0, Math.PI * 2);
      ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.fillStyle = '#5a7064';
      for (let i = -1; i <= 1; i++) {
        roundRect(ctx, i * s * 0.34 - s * 0.05, -s * 0.62, s * 0.1, s * 1.24, s * 0.05);
        ctx.fill();
        roundRect(ctx, -s * 0.62, i * s * 0.34 - s * 0.05, s * 1.24, s * 0.1, s * 0.05);
        ctx.fill();
      }
      break;
    }
    case 'ring': {
      // six-pack ring — two rows of holes
      ctx.fillStyle = '#d8d2bf';
      roundRect(ctx, -s * 0.7, -s * 0.42, s * 1.4, s * 0.84, s * 0.16);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (const ry of [-0.18, 0.18]) {
        for (const rx of [-0.42, 0, 0.42]) {
          ctx.beginPath();
          ctx.arc(rx * s, ry * s, s * 0.17, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      break;
    }
    case 'straw': {
      ctx.fillStyle = '#e2483f';
      ctx.save();
      ctx.rotate(-0.6);
      roundRect(ctx, -s * 0.1, -s * 0.78, s * 0.2, s * 1.56, s * 0.1);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'tire': {
      // heavy rubber tyre — dark donut with tread
      ctx.fillStyle = '#2c2f33';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.82, 0, Math.PI * 2);
      ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#16181b';
      ctx.lineWidth = s * 0.09;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5);
        ctx.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8);
        ctx.stroke();
      }
      break;
    }
    case 'mask': {
      // surgical mask — pale pleated rectangle with ear loops
      ctx.strokeStyle = '#c2ccd2';
      ctx.lineWidth = s * 0.06;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sgn * s * 0.58, 0, s * 0.3, -Math.PI * 0.5, Math.PI * 0.5, sgn < 0);
        ctx.stroke();
      }
      ctx.fillStyle = '#eef4f7';
      roundRect(ctx, -s * 0.6, -s * 0.34, s * 1.2, s * 0.68, s * 0.14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,180,190,0.55)';
      ctx.lineWidth = s * 0.05;
      for (const yy of [-0.12, 0.04, 0.2]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.54, yy * s);
        ctx.lineTo(s * 0.54, yy * s);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
