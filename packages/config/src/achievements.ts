/**
 * Official achievement templates (handover §9.4). These are the awards a verified organizer can issue
 * for a tournament/division. Community claims are free-text (§9.4) and are NOT in this list. Skill
 * tags (§9.5) are a separate community-endorsement catalog seeded in the DB (migration 0013).
 */

export const OFFICIAL_ACHIEVEMENTS = [
  { key: 'champion', title: 'Champion', placement: '1st', podium: true },
  { key: 'runner_up', title: 'Runner-up', placement: '2nd', podium: true },
  { key: 'bronze', title: 'Bronze', placement: '3rd', podium: true },
  { key: 'mvp', title: 'MVP', placement: null, podium: false },
  { key: 'sportsmanship', title: 'Sportsmanship', placement: null, podium: false },
  { key: 'participant', title: 'Tournament Participant', placement: null, podium: false },
] as const;

export type OfficialAchievementKey = (typeof OFFICIAL_ACHIEVEMENTS)[number]['key'];

export function officialAchievement(key: string) {
  return OFFICIAL_ACHIEVEMENTS.find((a) => a.key === key);
}
