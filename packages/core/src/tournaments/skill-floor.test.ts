import { describe, it, expect } from 'vitest';
import { evaluateSkillFloor, effectivePlayerSkill } from './skill-floor';

// Bands: Beginner=1, Novice=2, Low Intermediate=3, High Intermediate=4, Advanced=5.
describe('evaluateSkillFloor', () => {
  const band = (min: number | null, max: number | null, enforce = true) => ({
    skillPolicy: 'band' as const,
    divisionMinimumSkill: min,
    divisionMaximumSkill: max,
    enforce,
  });

  it('blocks a Novice from a Beginner-only division when enforced', () => {
    const r = evaluateSkillFloor({ effectiveSkill: 2, ...band(1, 1) });
    expect(r.blocked).toBe(true);
    expect(r.above).toBe(false);
  });

  it('allows a Novice into a Novice division (equal)', () => {
    const r = evaluateSkillFloor({ effectiveSkill: 2, ...band(2, 2) });
    expect(r.blocked).toBe(false);
    expect(r.above).toBe(false);
  });

  it('allows a Novice into higher divisions but warns (above)', () => {
    const r = evaluateSkillFloor({ effectiveSkill: 2, ...band(4, 5) });
    expect(r.blocked).toBe(false);
    expect(r.above).toBe(true);
  });

  it('does not block when the floor is off, but still warns above', () => {
    const off = evaluateSkillFloor({ effectiveSkill: 3, ...band(1, 1, false) });
    expect(off.blocked).toBe(false);
    const aboveOff = evaluateSkillFloor({ effectiveSkill: 2, ...band(4, 5, false) });
    expect(aboveOff.above).toBe(true);
  });

  it('never blocks or warns for open divisions', () => {
    const r = evaluateSkillFloor({
      effectiveSkill: 5,
      skillPolicy: 'open',
      divisionMinimumSkill: null,
      divisionMaximumSkill: null,
      enforce: true,
    });
    expect(r).toEqual({ blocked: false, above: false });
  });

  it('never blocks a player with no known skill', () => {
    const r = evaluateSkillFloor({ effectiveSkill: null, ...band(1, 1) });
    expect(r.blocked).toBe(false);
    expect(r.above).toBe(false);
  });
});

describe('effectivePlayerSkill', () => {
  it('prefers community over self-rating', () => {
    expect(effectivePlayerSkill(3, 5)).toBe(3);
  });
  it('falls back to self-rating', () => {
    expect(effectivePlayerSkill(null, 4)).toBe(4);
  });
  it('is null when neither is set', () => {
    expect(effectivePlayerSkill(null, null)).toBeNull();
  });
});
