import { useEffect, useRef } from 'react';
import type { CreatureKind, Shore } from '../types';
import { drawEnvironment, placeCreatures, drawCreature, drawPaperGrain } from '../utils/scene';

interface Props {
  shore: Shore;
  creatures?: CreatureKind[];
  cleanliness?: number;
  animated?: boolean;
  className?: string;
}

/** Renders a restored (or partially clean) shore. Animated for hero/detail,
 *  single-frame for thumbnails (cheap on a grid of many). */
export default function ShoreCanvas({
  shore,
  creatures = [],
  cleanliness = 1,
  animated = false,
  className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let start = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = wrap.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const placed = () =>
      placeCreatures(w, h, shore, creatures.map(k => ({ kind: k })));

    const drawFrame = (time: number) => {
      drawEnvironment(ctx, w, h, shore, { cleanliness, time, creatures: creatures.map(k => ({ kind: k })) });
      for (const p of placed()) drawCreature(ctx, p, time, 1);
      drawPaperGrain(ctx, w, h);
    };

    resize();

    if (animated) {
      const loop = (ts: number) => {
        if (!start) start = ts;
        drawFrame((ts - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      drawFrame(shore.seed % 7); // deterministic still frame
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (!animated) drawFrame(shore.seed % 7);
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shore.id, shore.seed, creatures.join(','), cleanliness, animated]);

  return (
    <div ref={wrapRef} className={className} style={{ width: '100%', height: '100%' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
