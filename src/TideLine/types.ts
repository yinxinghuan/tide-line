import type { GuestMessage, WithMessages } from '@shared/social/guestbook';

export type Biome = 'tropical' | 'cove' | 'temperate' | 'dusk';

export type CreatureKind =
  | 'turtle'
  | 'crab'
  | 'gull'
  | 'starfish'
  | 'dolphin'
  | 'seal'
  | 'shell'
  | 'whale'
  | 'ray'
  | 'octopus'
  | 'pufferfish'
  | 'jellyfish'
  | 'seahorse'
  | 'otter'
  | 'orca';

export type LitterKind =
  | 'bottle' | 'bag' | 'can' | 'cup' | 'net' | 'straw' | 'ring' | 'tire' | 'mask';

/** One restored stretch of coastline, authored by one player. */
export interface Shore {
  id: string;
  /** Deterministic seed driving palette / layout / creature placement. */
  seed: number;
  biome: Biome;
  /** Pieces of litter that were cleared off it. */
  litter: number;
  /** Wildlife freed during the clean (rescued from trash) + ambient sea life.
   *  This is what returns to the shore — derived from how the player played,
   *  not from the seed. Old shores without it fall back to baseCreatures(seed). */
  rescued?: CreatureKind[];
  createdAt: number;
}

/** A creature one player released onto another player's shore. */
export interface Release {
  id: string;
  /** Shore id this was released onto. */
  target: string;
  /** Shore author — who gets notified. */
  toUserId?: string;
  creature: CreatureKind;
  ts: number;
}

export interface TideSave extends WithMessages {
  shores: Shore[];
  releases: Release[];
  /** Lifetime pieces of litter this player has cleared. */
  totalCleared: number;
  messages?: GuestMessage[];
  _lastActive?: number;
}

export const EMPTY_SAVE: TideSave = {
  shores: [],
  releases: [],
  totalCleared: 0,
  messages: [],
};

// ─── Wall-resolved (cross-user) shapes ────────────────────────────────────

export interface ResolvedRelease {
  creature: CreatureKind;
  userId: string;
  name?: string;
  avatar?: string;
  ts: number;
}

export interface CoastShore {
  shore: Shore;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  /** Creatures others released here, newest-first. */
  releases: ResolvedRelease[];
}

export interface CoastStats {
  /** Sum of litter cleared across every readable shore. */
  totalLitter: number;
  /** Distinct shore authors. */
  beachcombers: number;
  /** Number of restored stretches. */
  stretches: number;
}

export interface Beachcomber {
  userId: string;
  name?: string;
  avatar?: string;
  litter: number;
  stretches: number;
}
