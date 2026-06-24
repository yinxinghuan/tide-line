import { useEffect, useRef } from 'react';
import type { CreatureKind } from '../types';
import { drawCreature } from '../utils/scene';

interface Props {
  kind: CreatureKind;
  size?: number;
}

/** A single on-brand vector creature rendered to a small canvas — the UI's
 *  replacement for emoji. Static (drawn once); cheap enough for button rows. */
export default function CreatureIcon({ kind, size = 30 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const s = size * 0.27;
    drawCreature(
      ctx,
      { kind, x: size / 2, y: size * 0.52, s, phase: 0 },
      0.4,
      1,
      false,
    );
  }, [kind, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
