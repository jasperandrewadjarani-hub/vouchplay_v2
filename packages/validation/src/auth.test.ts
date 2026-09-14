import { describe, expect, it } from 'vitest';
import { resetPasswordWithCodeSchema } from './auth';

const base = {
  email: 'player@example.com',
  token: '123456',
  password: 'correct-horse',
  confirm: 'correct-horse',
};

describe('resetPasswordWithCodeSchema (master_plan §2BD-A)', () => {
  it('accepts a valid email + 6-digit code + matching password pair', () => {
    const parsed = resetPasswordWithCodeSchema.parse(base);
    expect(parsed).toEqual(base);
  });

  it('rejects a non-6-digit token', () => {
    const result = resetPasswordWithCodeSchema.safeParse({ ...base, token: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects a token with non-digit characters', () => {
    const result = resetPasswordWithCodeSchema.safeParse({ ...base, token: 'abcdef' });
    expect(result.success).toBe(false);
  });

  it('rejects a password under 8 characters', () => {
    const result = resetPasswordWithCodeSchema.safeParse({
      ...base,
      password: 'short',
      confirm: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched password/confirm with the exact message on the confirm field', () => {
    const result = resetPasswordWithCodeSchema.safeParse({ ...base, confirm: 'different-pass' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'confirm');
      expect(issue?.message).toBe('Passwords do not match');
    }
  });

  it('rejects an invalid email', () => {
    const result = resetPasswordWithCodeSchema.safeParse({ ...base, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});
