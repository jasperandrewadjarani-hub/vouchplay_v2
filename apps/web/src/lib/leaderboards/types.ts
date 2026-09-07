import type { LeaderboardCategory } from '@vouchplay/core';

export type LeaderboardScope = 'global' | 'city' | 'region';
export type LeaderboardPeriod = 'month' | 'season' | 'all_time';

export interface LeaderboardEntryDTO {
  subjectType: 'player' | 'club';
  subjectId: string;
  rank: number;
  score: number;
  components: Record<string, number>;
  explanation: string;
  displayName: string;
  slug: string;
  imagePath: string | null;
  city: string | null;
  region: string | null;
}

export interface LeaderboardDTO {
  category: LeaderboardCategory;
  scopeType: LeaderboardScope;
  scopeValue: string | null;
  period: LeaderboardPeriod;
  scoringVersion: string;
  publishedAt: string;
  staleAfter: string | null;
  stale: boolean;
  entries: LeaderboardEntryDTO[];
}

export interface MomentumDTO {
  category: 'players' | 'community';
  privateRank: number | null;
  previousRank: number | null;
  score: number;
  eligiblePublic: boolean;
  exclusionCode: string | null;
  components: Record<string, number>;
  ctaKey: string | null;
  updatedAt: string;
}
