import ShoreCanvas from './ShoreCanvas';
import type { CoastShore, CreatureKind } from '../types';
import { specimenNo, shoreStyle, TOD } from '../utils/style';
import { fallbackCreatures } from '../data/habitats';
import { t } from '../i18n';

interface Props {
  cs: CoastShore;
  /** Animate the scene (detail hero). Thumbnails stay single-frame. */
  animated?: boolean;
  /** Tighter caption for the coast grid. */
  compact?: boolean;
  /** Slam-down entrance (restored card). */
  slam?: boolean;
  /** Extra (optimistic) creatures to show on the scene. */
  extra?: CreatureKind[];
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function fmtDate(ts: number): { mon: string; day: string; year: string } {
  const d = new Date(ts || Date.now());
  return {
    mon: MONTHS[d.getMonth()],
    day: String(d.getDate()).padStart(2, '0'),
    year: "'" + String(d.getFullYear()).slice(2),
  };
}

/** Postmark cancellation — a big complete ring, stamped across the corner so
 *  part of it spills off the stamp (overflows the frame). */
function Postmark({ mon, day }: { mon: string; day: string }) {
  return (
    <svg className="tl-stamp__mark" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <path id="tl-arc-top" d="M 14 50 A 36 36 0 0 1 86 50" fill="none" />
        <path id="tl-arc-bot" d="M 86 50 A 36 36 0 0 1 14 50" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="46" fill="none" strokeWidth="3.2" />
      <text className="tl-stamp__mark-arc">
        <textPath href="#tl-arc-top" startOffset="50%" textAnchor="middle">
          · TIDE LINE ·
        </textPath>
      </text>
      <text className="tl-stamp__mark-arc">
        <textPath href="#tl-arc-bot" startOffset="50%" textAnchor="middle">
          COASTAL TRUST
        </textPath>
      </text>
      <text x="50" y="52" textAnchor="middle" className="tl-stamp__mark-day">{day}</text>
      <text x="50" y="66" textAnchor="middle" className="tl-stamp__mark-mon">{mon}</text>
    </svg>
  );
}

/** A restored shore presented as a collectible postage stamp / specimen plate. */
export default function StampFrame({ cs, animated, compact, slam, extra = [] }: Props) {
  const { shore } = cs;
  const style = shoreStyle(shore);
  const date = fmtDate(shore.createdAt);
  // caption: habitat name, with the ocean's sub-biome flavour appended
  const place = shore.habitat === 'ocean' ? t('bio_' + shore.biome) : t('hab_' + shore.habitat);
  const tod = TOD[style.tod].label;

  // returning wildlife = what the player rescued this clean (old shores without
  // a rescued list fall back to the habitat's set)
  const base = shore.rescued && shore.rescued.length
    ? shore.rescued
    : fallbackCreatures(shore.habitat, shore.seed);
  const creatures = [...base, ...extra].slice(0, 9);

  return (
    <div className={'tl-stamp' + (compact ? ' tl-stamp--compact' : '') + (slam ? ' tl-stamp--slam' : '')}>
      {/* the perforated stamp itself — holes bite into the scene (skeuomorphic-frames).
          The postmark lives INSIDE so the part that spills past the edge is clipped. */}
      <div className="tl-stamp__paper">
        <ShoreCanvas shore={shore} creatures={creatures} animated={animated} />
        <span className="tl-stamp__issue">TIDE LINE</span>
        <Postmark mon={date.mon} day={date.day} />
      </div>

      {/* album annotation, printed below on the dark substrate (specimen catalog) */}
      <div className="tl-stamp__cap">
        <span className="tl-stamp__id">{specimenNo(shore.seed)}</span>
        <span className="tl-stamp__place">
          {place}
          {!compact && <span className="tl-stamp__tod"> · {tod}</span>}
        </span>
        <span className="tl-stamp__date">{date.mon} {date.day} {date.year}</span>
      </div>
    </div>
  );
}
