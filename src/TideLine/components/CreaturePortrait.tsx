import { useEffect, useRef } from 'react';
import type { CreatureKind } from '../types';
import { drawCreature, drawPaperGrain } from '../utils/scene';
import { t } from '../i18n';

interface Props {
  kind: CreatureKind;
  count?: number;
  /** Milestone thumbnail: a folder card the creature pokes its head out of. */
  mini?: boolean;
}

// per-creature scale so the close-up reads well inside a tight crop
const SCALE: Partial<Record<CreatureKind, number>> = {
  whale: 0.32, orca: 0.32, ray: 0.42, dolphin: 0.44, jellyfish: 0.48,
  otter: 0.36, gull: 0.48, octopus: 0.48, seahorse: 0.52,
};

export default function CreaturePortrait({ kind, count = 1, mini = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s0 = SCALE[kind] ?? 0.46;

    if (mini) {
      // transparent canvas — creature sits INSIDE the folder card (drawn over the
      // lower ~2/3) with only the top poking above the card edge. A resting pose
      // (time 0, phase -π/2 → leap/breach ≈ 0) keeps sea creatures from floating.
      const W = 80, H = 98;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawCreature(ctx, { kind, x: W / 2, y: H * 0.6, s: H * (s0 + 0.08), phase: -Math.PI / 2 }, 0, 1, false);
      return;
    }

    // circular medallion (the wildlife codex)
    const W = 200, H = 200;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 6, W / 2, H * 0.55, H * 0.7);
    g.addColorStop(0, '#236571');
    g.addColorStop(1, '#08202c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawCreature(ctx, { kind, x: W / 2, y: H * 0.58, s: H * (s0 + 0.02), phase: 0 }, 0.5, 1, false);
    drawPaperGrain(ctx, W, H);
  }, [kind, mini]);

  if (mini) {
    return (
      <div className="tl-thumb">
        <div className="tl-thumb__card" />
        <canvas ref={ref} className="tl-thumb__cv" />
      </div>
    );
  }

  return (
    <div className="tl-medallion">
      <div className="tl-medallion__disc">
        <canvas ref={ref} className="tl-medallion__cv" />
      </div>
      {count > 1 && <span className="tl-medallion__count">×{count}</span>}
      <span className="tl-medallion__name">{t(kind)}</span>
    </div>
  );
}
