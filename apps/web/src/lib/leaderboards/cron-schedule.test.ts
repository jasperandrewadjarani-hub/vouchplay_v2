import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_CRON_PATH,
  LEADERBOARD_CRON_UTC_HOUR,
  LEADERBOARD_CRON_UTC_MINUTE,
  describeOutcome,
  nextCronRunAfter,
  nextPublishingRunAfter,
  predictNextRun,
} from './cron-schedule';

const guards = {
  cadenceHours: 24,
  enabled: true,
  allCategoriesPaused: false,
};

describe('the schedule matches the platform', () => {
  // The Admin panel tells an operator when the next run fires. If these constants drifted from
  // vercel.json the panel would confidently advertise a time Vercel is not using.
  it('agrees with the crons entry in the repo-root vercel.json', () => {
    const path = fileURLToPath(new URL('../../../../../vercel.json', import.meta.url));
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      crons?: { path: string; schedule: string }[];
    };
    const entry = (config.crons ?? []).find((c) => c.path === LEADERBOARD_CRON_PATH);
    expect(entry, 'no crons entry for the leaderboard rebuild').toBeDefined();
    const [minute, hour, dom, month, dow] = String(entry?.schedule).split(' ');
    expect(Number(minute)).toBe(LEADERBOARD_CRON_UTC_MINUTE);
    expect(Number(hour)).toBe(LEADERBOARD_CRON_UTC_HOUR);
    expect([dom, month, dow]).toEqual(['*', '*', '*']);
  });
});

describe('nextCronRunAfter', () => {
  it('returns today when the scheduled time is still ahead', () => {
    expect(nextCronRunAfter(new Date('2026-09-09T00:00:00Z')).toISOString()).toBe(
      '2026-09-09T01:17:00.000Z',
    );
  });

  it('rolls to tomorrow once the scheduled time has passed', () => {
    expect(nextCronRunAfter(new Date('2026-09-09T17:42:00Z')).toISOString()).toBe(
      '2026-09-10T01:17:00.000Z',
    );
  });

  it('rolls forward when called exactly on the scheduled instant', () => {
    expect(nextCronRunAfter(new Date('2026-09-09T01:17:00Z')).toISOString()).toBe(
      '2026-09-10T01:17:00.000Z',
    );
  });
});

describe('predictNextRun mirrors the route guards', () => {
  // The live case that made the cron look broken: the schedule fired 3h06m after an Admin rebuild.
  it('skips when the last publish is inside the cadence window', () => {
    const outlook = predictNextRun({
      ...guards,
      nextRunAt: new Date('2026-09-08T01:17:00Z'),
      lastPublishedAt: new Date('2026-09-07T22:10:41Z'),
    });
    expect(outlook.code).toBe('CADENCE_NOT_DUE');
    expect(outlook.willPublish).toBe(false);
    expect(outlook.hoursSinceLastPublishAtNextRun).toBeCloseTo(3.1, 1);
  });

  it('publishes once the cadence window has elapsed', () => {
    const outlook = predictNextRun({
      ...guards,
      nextRunAt: new Date('2026-09-10T01:17:00Z'),
      lastPublishedAt: new Date('2026-09-08T17:42:00Z'),
    });
    expect(outlook.code).toBe('WILL_PUBLISH');
    expect(outlook.willPublish).toBe(true);
  });

  it('publishes when nothing has ever been published', () => {
    expect(
      predictNextRun({
        ...guards,
        nextRunAt: new Date('2026-09-10T01:17:00Z'),
        lastPublishedAt: null,
      }).code,
    ).toBe('WILL_PUBLISH');
  });

  it('reports disabled ahead of cadence, in the route order', () => {
    expect(
      predictNextRun({
        ...guards,
        enabled: false,
        nextRunAt: new Date('2026-09-09T01:17:00Z'),
        lastPublishedAt: new Date('2026-09-08T17:42:00Z'),
      }).code,
    ).toBe('DISABLED');
  });

  it('reports every category paused', () => {
    expect(
      predictNextRun({
        ...guards,
        allCategoriesPaused: true,
        nextRunAt: new Date('2026-09-10T01:17:00Z'),
        lastPublishedAt: null,
      }).code,
    ).toBe('ALL_CATEGORIES_PAUSED');
  });
});

describe('nextPublishingRunAfter', () => {
  it('skips tonight and lands the following night after a late manual rebuild', () => {
    // Publish at 2026-09-08 17:42Z: the 09-09 01:17Z run is only 7h35m later, the 09-10 one is 31h35m.
    expect(
      nextPublishingRunAfter({
        ...guards,
        now: new Date('2026-09-08T18:15:00Z'),
        lastPublishedAt: new Date('2026-09-08T17:42:00Z'),
      })?.toISOString(),
    ).toBe('2026-09-10T01:17:00.000Z');
  });

  it('returns null when leaderboards are switched off', () => {
    expect(
      nextPublishingRunAfter({
        ...guards,
        enabled: false,
        now: new Date('2026-09-08T18:15:00Z'),
        lastPublishedAt: null,
      }),
    ).toBeNull();
  });

  it('returns null when no run inside the window would be due', () => {
    expect(
      nextPublishingRunAfter({
        ...guards,
        cadenceHours: 24 * 30,
        now: new Date('2026-09-08T18:15:00Z'),
        lastPublishedAt: new Date('2026-09-08T17:42:00Z'),
      }),
    ).toBeNull();
  });
});

describe('describeOutcome', () => {
  it('names the counts when a run published', () => {
    expect(
      describeOutcome('published', {
        outcome: 'published',
        ranAt: '2026-09-10T01:17:00Z',
        cadenceHours: 24,
        lastPublishedAt: null,
        runsPublished: 35,
        entriesPublished: 190,
      }),
    ).toContain('35 boards, 190 entries');
  });

  it('explains a skip without a status code', () => {
    const text = describeOutcome('skipped_cadence');
    expect(text).not.toMatch(/CADENCE_NOT_DUE/);
    expect(text.toLowerCase()).toContain('cadence');
  });
});
