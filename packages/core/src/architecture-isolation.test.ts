import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(relative: string): string {
  const directory = resolve(process.cwd(), relative);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => readFileSync(resolve(directory, name), 'utf8'))
    .join('\n');
}

describe('contribution and leaderboard isolation guard', () => {
  it('does not allow reputation or eligibility engines to import engagement scoring', () => {
    const protectedEngines = `${sourceFiles('src/vouches')}\n${sourceFiles('src/eligibility')}`;
    expect(protectedEngines).not.toMatch(/from\s+['"][^'"]*(contribution|leaderboard)/i);
    expect(protectedEngines).not.toMatch(/player_contributions|leaderboard_snapshot/i);
  });

  it('keeps public rank engines independent from raw STS and vouch weights', () => {
    const ranking = sourceFiles('src/leaderboards');
    expect(ranking).not.toMatch(/\bsts\b|effective_weight|skill_level|voucher_id/i);
  });
});
