import { describe, expect, it } from 'vitest';
import { onboardingSchema } from './profile';

const base = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  nickname: 'JDC',
  sex: 'male' as const,
  selfRatedSkill: 2,
};

describe('onboardingSchema - city normalization (master_plan §2AG Phase B)', () => {
  it('normalizes a messy live spelling to its canonical form', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'Zamboanga city' });
    expect(parsed.city).toBe('Zamboanga City');
  });

  it('normalizes a typo via the alias map', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'Isabella city' });
    expect(parsed.city).toBe('Isabela City');
  });

  it('keeps an unrecognised place, cleaned and Title-Cased, rather than rejecting it', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'some far barangay' });
    expect(parsed.city).toBe('Some Far Barangay');
  });

  it('still rejects a blank city', () => {
    const result = onboardingSchema.safeParse({ ...base, city: '   ' });
    expect(result.success).toBe(false);
  });

  it('still rejects a city over 80 characters', () => {
    const result = onboardingSchema.safeParse({ ...base, city: 'a'.repeat(81) });
    expect(result.success).toBe(false);
  });
});
