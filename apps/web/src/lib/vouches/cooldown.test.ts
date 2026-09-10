import { describe, it, expect } from 'vitest';
import { formatVouchCooldown } from './cooldown';

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe('formatVouchCooldown', () => {
  it('handles now / sub-minute', () => {
    expect(formatVouchCooldown(0)).toBe('now');
    expect(formatVouchCooldown(-5)).toBe('now');
    expect(formatVouchCooldown(30_000)).toBe('less than a minute');
  });

  it('rounds minutes up', () => {
    expect(formatVouchCooldown(MIN)).toBe('1 minute');
    expect(formatVouchCooldown(MIN + 1)).toBe('2 minutes');
    expect(formatVouchCooldown(59 * MIN)).toBe('59 minutes');
  });

  it('rounds hours up', () => {
    expect(formatVouchCooldown(HR)).toBe('1 hour');
    expect(formatVouchCooldown(HR + 1)).toBe('2 hours');
    expect(formatVouchCooldown(23 * HR)).toBe('23 hours');
  });

  it('rounds days up', () => {
    expect(formatVouchCooldown(DAY)).toBe('1 day');
    expect(formatVouchCooldown(DAY + 1)).toBe('2 days');
  });
});
