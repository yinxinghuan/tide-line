import { useEffect, useRef } from 'react';
import type { CreatureKind } from '../types';
import { drawCreature, drawPaperGrain } from '../utils/scene';
import { t } from '../i18n';

interface Props {
  kind: CreatureKind;
  count?: number;
  /** Square label-less thumbnail (for the milestone banner). */
  mini?: boolean;
}

// where to anchor each creature so the face reads inside a tall portrait crop
const ANCHOR: Partial<Record<CreatureKind, { y: number; s: number }>> = {
  whale: { y: 0.58, s: 0.3 },
  orca: { y: 0.58, s: 0.3 },
  ray: { y: 0.55, s: 0.4 },
  dolphin: { y: 0.6, s: 0.42 },
  jellyfish: { y: 0.5, s: 0.46 },
  otter: { y: 0.62, s: 0.34 },
  gull: { y: 0.66, s: 0.46 },
  octopus: { y: 0.62, s: 0.46 },
  seahorse: { y: 0.66, s: 0.5 },
};

/** A big, partially-cropped close-up of one returned creature — a "specimen
 *  portrait". The animal is drawn larger than the tile so it spills off the
 *  edges (overflow:hidden on the tile clips it) for a dramatic close-up. */
export default function CreaturePortrait({ kind, count = 1, mini = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = mini ? 180 : 220;
    const H = mini ? 180 : 260;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // deep-ocean gradient ground
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d5560');
    g.addColorStop(1, '#08202c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.34, 6, W / 2, H * 0.34, H * 0.7);
    glow.addColorStop(0, 'rgba(80,220,200,0.28)');
    glow.addColorStop(1, 'rgba(80,220,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // the creature — big, cropped by the tile edges
    const a = ANCHOR[kind] ?? { y: 0.62, s: 0.44 };
    const cy = mini ? 0.56 : a.y;
    drawCreature(ctx, { kind, x: W / 2, y: H * cy, s: H * a.s, phase: 0 }, 0.5, 1, false);

    drawPaperGrain(ctx, W, H);
  }, [kind, mini]);

  if (mini) {
    return (
      <div className="tl-portrait tl-portrait--mini">
        <canvas ref={ref} className="tl-portrait__cv" />
      </div>
    );
  }

  return (
    <div className="tl-portrait">
      <canvas ref={ref} className="tl-portrait__cv" />
      {count > 1 && <span className="tl-portrait__count">×{count}</span>}
      <span className="tl-portrait__name">{t(kind)}</span>
    </div>
  );
}
