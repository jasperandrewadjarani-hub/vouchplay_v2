import { describe, expect, it } from 'vitest';
import { onboardingSchema } from './profile';

const base = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  nickname: 'JDC',
  sex: 'male' as const,
  selfRatedSkill: 2,
};

const INVALID_CITY_MESSAGE = 'Please choose your city from the list.';

/** Pulls the `city` field error message out of a failed safeParse result. */
function cityError(city: unknown): string | undefined {
  const result = onboardingSchema.safeParse({ ...base, city });
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path[0] === 'city')?.message;
}

describe('onboardingSchema - strict city validation (master_plan §2AI)', () => {
  it('accepts a canonical city and passes it through unchanged', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'Zamboanga City' });
    expect(parsed.city).toBe('Zamboanga City');
  });

  it('accepts and normalizes a bare municipality name', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'jolo' });
    expect(parsed.city).toBe('Jolo');
  });

  it('accepts a city case-insensitively and normalizes it', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'DAVAO CITY' });
    expect(parsed.city).toBe('Davao City');
  });

  it('normalizes a messy live spelling before validating', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'Zamboanga city' });
    expect(parsed.city).toBe('Zamboanga City');
  });

  it('normalizes a typo via the alias map', () => {
    const parsed = onboardingSchema.parse({ ...base, city: 'Isabella city' });
    expect(parsed.city).toBe('Isabela City');
  });

  it('rejects garbage ("Za") with the exact non-technical message', () => {
    expect(cityError('Za')).toBe(INVALID_CITY_MESSAGE);
  });

  it('rejects a bare province ("Bulacan") with the exact message', () => {
    expect(cityError('Bulacan')).toBe(INVALID_CITY_MESSAGE);
  });

  it('rejects an unrecognised place rather than silently accepting it', () => {
    expect(cityError('some far barangay')).toBe(INVALID_CITY_MESSAGE);
  });

  it('rejects a blank city (required field)', () => {
    const result = onboardingSchema.safeParse({ ...base, city: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing city', () => {
    const result = onboardingSchema.safeParse({ ...base });
    expect(result.success).toBe(false);
  });

  it('rejects a city over 80 characters', () => {
    const result = onboardingSchema.safeParse({ ...base, city: 'a'.repeat(81) });
    expect(result.success).toBe(false);
  });
});
