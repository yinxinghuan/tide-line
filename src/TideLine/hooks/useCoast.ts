// Cross-user coast aggregation. Reads every recent player's saved Tide Line
// blob, flattens ALL their restored shores + ALL release records (creatures
// dropped on other shores), aggregates releases onto shores by target, derives
// the collective counters + a beachcomber leaderboard, pulls guestbook notes
// from the same fetch, and resolves author/releaser/note-author profiles.
//
// Same best-effort window as every social wall here: get/data/list returns the
// most recent ~6 users' latest blobs. Reliable cross-user signal is the notify
// ping; the wall is a best-effort view.

import { useCallback, useEffect, useState } from 'react';
import { callAigramAPI, isInAigram, type AigramResponse } from '@shared/runtime';
import { getGameUuid } from '@shared/runtime/game-id';
import { messagesByTarget, type GuestMessage } from '@shared/social/guestbook';
import type {
  Beachcomber,
  CoastShore,
  CoastStats,
  Release,
  ResolvedRelease,
  Shore,
  TideSave,
} from '../types';

interface SaveRow {
  user_id: string;
  time: string;
  resource_data: string;
}
interface Profile {
  name?: string;
  head_url?: string;
}

export interface UseCoast {
  shores: CoastShore[];
  stats: CoastStats;
  leaderboard: Beachcomber[];
  messagesByTarget: Map<string, GuestMessage[]>;
  rows: SaveRow[];
  loaded: boolean;
  refresh: () => void;
}

const EMPTY_STATS: CoastStats = { totalLitter: 0, beachcombers: 0, stretches: 0 };

export function useCoast(): UseCoast {
  const [shores, setShores] = useState<CoastShore[]>([]);
  const [stats, setStats] = useState<CoastStats>(EMPTY_STATS);
  const [leaderboard, setLeaderboard] = useState<Beachcomber[]>([]);
  const [messages, setMessages] = useState<Map<string, GuestMessage[]>>(new Map());
  const [rows, setRows] = useState<SaveRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const sessionId = getGameUuid();
    if (!isInAigram || !sessionId) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const res = await callAigramAPI<AigramResponse<SaveRow[]>>(
          `/note/aigram/ai/game/get/data/list?session_id=${encodeURIComponent(sessionId)}`,
          'GET',
        );
        const raw = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setRows(raw);

        // 1. flatten shores + releases across every blob
        const shoreMap = new Map<string, { shore: Shore; authorId: string }>();
        const relByTarget = new Map<string, { rel: Release; userId: string }[]>();
        const litterByAuthor = new Map<string, { litter: number; stretches: number }>();
        for (const row of raw) {
          if (!row.user_id || !row.resource_data) continue;
          let save: TideSave;
          try {
            save = JSON.parse(row.resource_data) as TideSave;
          } catch {
            continue;
          }
          for (const s of save.shores || []) {
            if (s && s.id && !shoreMap.has(s.id)) {
              shoreMap.set(s.id, { shore: s, authorId: row.user_id });
              const a = litterByAuthor.get(row.user_id) || { litter: 0, stretches: 0 };
              a.litter += s.litter || 0;
              a.stretches += 1;
              litterByAuthor.set(row.user_id, a);
            }
          }
          for (const r of save.releases || []) {
            if (!r || !r.target || !r.creature) continue;
            const list = relByTarget.get(r.target) || [];
            list.push({ rel: r, userId: row.user_id });
            relByTarget.set(r.target, list);
          }
        }

        // 2. collective counters
        let totalLitter = 0;
        for (const v of litterByAuthor.values()) totalLitter += v.litter;
        const coastStats: CoastStats = {
          totalLitter,
          beachcombers: litterByAuthor.size,
          stretches: shoreMap.size,
        };

        // 3. newest first + display cap
        const ordered = Array.from(shoreMap.values()).sort(
          (a, b) => (b.shore.createdAt ?? 0) - (a.shore.createdAt ?? 0),
        );
        const limited = ordered.slice(0, 40);

        // 4. guestbook notes from the same fetch
        const msgs = messagesByTarget(raw);

        // 5. resolve profiles for authors + releasers + note authors + top combers
        const ids = new Set<string>();
        for (const e of limited) ids.add(e.authorId);
        for (const list of relByTarget.values()) for (const r of list) ids.add(r.userId);
        for (const list of msgs.values()) for (const m of list) if (m.fromUserId) ids.add(m.fromUserId);
        for (const id of litterByAuthor.keys()) ids.add(id);

        const profEntries = await Promise.all(
          Array.from(ids).map(async uid => {
            try {
              const r = await callAigramAPI<AigramResponse<Profile>>(
                `/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(uid)}`,
                'GET',
              );
              return [uid, r?.data ?? null] as const;
            } catch {
              return [uid, null] as const;
            }
          }),
        );
        const profMap = new Map(profEntries);

        // 6. assemble resolved shores
        const resolved: CoastShore[] = limited.map(e => {
          const ap = profMap.get(e.authorId);
          const rels = (relByTarget.get(e.shore.id) || [])
            .map(({ rel, userId }): ResolvedRelease => {
              const pr = profMap.get(userId);
              return { creature: rel.creature, userId, name: pr?.name, avatar: pr?.head_url, ts: rel.ts };
            })
            .sort((a, b) => b.ts - a.ts);
          return {
            shore: e.shore,
            authorId: e.authorId,
            authorName: ap?.name,
            authorAvatar: ap?.head_url,
            releases: rels,
          };
        });

        // 7. leaderboard
        const board: Beachcomber[] = Array.from(litterByAuthor.entries())
          .map(([userId, v]) => {
            const pr = profMap.get(userId);
            return { userId, name: pr?.name, avatar: pr?.head_url, litter: v.litter, stretches: v.stretches };
          })
          .sort((a, b) => b.litter - a.litter)
          .slice(0, 10);

        // stamp notes with author profiles
        const msgsResolved = new Map<string, GuestMessage[]>();
        for (const [target, list] of msgs) {
          msgsResolved.set(
            target,
            list.map(m => {
              const pr = m.fromUserId ? profMap.get(m.fromUserId) : null;
              return { ...m, userName: pr?.name, userAvatarUrl: pr?.head_url };
            }),
          );
        }

        if (!cancelled) {
          setShores(resolved);
          setStats(coastStats);
          setLeaderboard(board);
          setMessages(msgsResolved);
        }
      } catch {
        if (!cancelled) {
          setShores([]);
          setStats(EMPTY_STATS);
          setLeaderboard([]);
          setMessages(new Map());
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { shores, stats, leaderboard, messagesByTarget: messages, rows, loaded, refresh };
}
