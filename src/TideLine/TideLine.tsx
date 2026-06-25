import { useEffect, useMemo, useRef, useState } from 'react';
import './TideLine.less';
import Beach from './components/Beach';
import Coast from './components/Coast';
import Detail from './components/Detail';
import { useCoast } from './hooks/useCoast';
import { useGameSave } from '@shared/save';
import { useGameEvent } from '@shared/runtime';
import { useGuestbook } from '@shared/social/useGuestbook';
import { threadFor } from '@shared/social/guestbook';
import { telegramId, isInAigram } from '@shared/runtime';
import { biomeFromSeed, unlockedRares } from './data/biomes';
import { randomHabitat } from './data/habitats';
import type { CoastShore, CreatureKind, Shore, TideSave } from './types';
import { EMPTY_SAVE } from './types';
import { playTap, unlockAudio, startAmbience, stopAmbience, setMuted } from './utils/sounds';
import { t } from './i18n';
import { IconSoundOn, IconSoundOff, IconArrowRight } from './components/icons';

type Screen = 'beach' | 'coast' | 'detail';

function randSeed(): number {
  return Math.floor((Date.now() ^ (Math.random() * 1e9)) >>> 0);
}
function freshShore(): Shore {
  const seed = randSeed();
  return {
    id: (() => {
      try {
        return crypto.randomUUID();
      } catch {
        return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      }
    })(),
    seed,
    habitat: randomHabitat(),
    biome: biomeFromSeed(seed),
    litter: 0,
    createdAt: Date.now(),
  };
}

function mergeShores(cloud: CoastShore[], local: CoastShore[]): CoastShore[] {
  const map = new Map<string, CoastShore>();
  for (const c of cloud) map.set(c.shore.id, c);
  for (const l of local) if (!map.has(l.shore.id)) map.set(l.shore.id, l);
  return Array.from(map.values()).sort(
    (a, b) => (b.shore.createdAt ?? 0) - (a.shore.createdAt ?? 0),
  );
}

export default function TideLine() {
  const myUserId = telegramId;
  // Identity used for "is this mine?" display. Falls back to a stable local id
  // so a player's own shores read as "You" even in the out-of-Aigram demo.
  const selfId = myUserId ?? 'me';
  const { savedData, persist } = useGameSave<TideSave>('tide-line');
  const coast = useCoast();
  const { trigger } = useGameEvent();

  // local save mirror — seeded ONCE from cloud, treated as source of truth
  // (useGameSave.savedData never echoes writes back; see useGameSave-mirror).
  const [mirror, setMirror] = useState<TideSave | undefined>(undefined);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (savedData !== undefined) {
      setMirror(savedData ?? { ...EMPTY_SAVE });
      seededRef.current = true;
    }
  }, [savedData]);

  const [screen, setScreen] = useState<Screen>('beach');
  const [shore, setShore] = useState<Shore>(() => freshShore());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [ambient, setAmbient] = useState<CreatureKind[]>([]);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    return () => stopAmbience();
  }, []);

  // guestbook (reuse the coast's already-fetched rows — no extra network call)
  const guestbook = useGuestbook<TideSave>({
    setMirror,
    persist,
    empty: { ...EMPTY_SAVE },
    trigger,
    myUserId,
    rows: coast.rows,
    event: 'shore_note',
    template: '{sender_name} left a note on your shore',
  });

  // merge cloud coast + my local shores (instant before cloud read catches up)
  const localShores: CoastShore[] = useMemo(
    () =>
      (mirror?.shores ?? []).map(s => ({
        shore: s,
        authorId: selfId,
        releases: [],
      })),
    [mirror?.shores, selfId],
  );
  const shores = useMemo(
    () => mergeShores(coast.shores, localShores),
    [coast.shores, localShores],
  );

  // collective counters derived from the merged set (never stale-zero post-publish)
  const stats = useMemo(() => {
    const authors = new Set<string>();
    let litter = 0;
    for (const cs of shores) {
      authors.add(cs.authorId);
      litter += cs.shore.litter || 0;
    }
    return { totalLitter: litter, beachcombers: authors.size, stretches: shores.length };
  }, [shores]);

  // ── actions ──

  const startClean = () => {
    playTap();
    unlockAudio();
    startAmbience();
    const sh = freshShore();
    // ambient is ocean-only sea life (dolphin/whale/ray/jellyfish/otter); other
    // habitats get no ambient extras (their cast comes from rescues)
    const amb: CreatureKind[] = [];
    if (sh.habitat === 'ocean') {
      const rares = unlockedRares(stats.totalLitter);
      for (const sp of rares) if (Math.random() < 0.6) amb.push(sp);
      if (amb.length === 0 && rares.includes('dolphin') && Math.random() < 0.5) amb.push('dolphin');
      if (Math.random() < 0.35) amb.push('jellyfish');
      if (Math.random() < 0.25) amb.push('otter');
    }
    setAmbient(amb);
    setShore(sh);
    setScreen('beach');
  };

  const onBeachDone = (litter: number, rescued: CreatureKind[]) => {
    const finished: Shore = { ...shore, litter, rescued, createdAt: Date.now() };
    setMirror(prev => {
      const base = prev ?? { ...EMPTY_SAVE };
      const next: TideSave = {
        ...base,
        shores: [finished, ...base.shores].slice(0, 40),
        totalCleared: (base.totalCleared || 0) + litter,
      };
      persist(next);
      return next;
    });
    coast.refresh();
    setScreen('coast');
  };

  const openDetail = (cs: CoastShore) => {
    playTap();
    setDetailId(cs.shore.id);
    setScreen('detail');
  };

  const toggleMute = () => {
    const m = !muted;
    setMutedState(m);
    setMuted(m);
  };

  // ── render ──

  const detailShore = useMemo(
    () => shores.find(s => s.shore.id === detailId) ?? null,
    [shores, detailId],
  );
  const notes = useMemo(
    () =>
      detailId
        ? threadFor(detailId, guestbook.byTarget, mirror?.messages, selfId)
        : [],
    [detailId, guestbook.byTarget, mirror?.messages, selfId],
  );

  return (
    <div className="tl-root">
      <button className="tl-mute" onClick={toggleMute} aria-label={muted ? 'unmute' : 'mute'}>
        {muted ? <IconSoundOff size={19} /> : <IconSoundOn size={19} />}
      </button>

      {screen === 'beach' && <Beach shore={shore} ambient={ambient} onDone={onBeachDone} />}

      {screen === 'coast' && (
        <Coast
          shores={shores}
          stats={stats}
          leaderboard={coast.leaderboard}
          myUserId={selfId}
          loaded={coast.loaded || !isInAigram}
          onClean={startClean}
          onOpen={openDetail}
        />
      )}

      {screen === 'detail' && detailShore && (
        <Detail
          cs={detailShore}
          myUserId={selfId}
          notes={notes}
          onBack={() => {
            playTap();
            setScreen('coast');
          }}
          onSendNote={text =>
            guestbook.send(detailShore.shore.id, detailShore.authorId, text)
          }
        />
      )}

      {/* tiny coast shortcut while on the beach */}
      {screen === 'beach' && (shores.length > 0) && (
        <button className="tl-tocoast" onPointerDown={() => { playTap(); setScreen('coast'); }}>
          {t('coastTitle')} <IconArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
