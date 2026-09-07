import { describe, expect, it } from 'vitest';
import { TOURNAMENT_COVER_SOURCE_MAX_BYTES, validateTournamentCoverInput } from './cover';

describe('validateTournamentCoverInput', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts supported %s files', (mimeType) => {
    expect(validateTournamentCoverInput({ mimeType, size: 1000 })).toEqual({ ok: true });
  });

  it('accepts the exact source-size boundary', () => {
    expect(
      validateTournamentCoverInput({
        mimeType: 'image/jpeg',
        size: TOURNAMENT_COVER_SOURCE_MAX_BYTES,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects empty, oversized, and unsupported sources with stable codes', () => {
    expect(validateTournamentCoverInput({ mimeType: 'image/png', size: 0 })).toEqual({
      ok: false,
      code: 'empty',
    });
    expect(
      validateTournamentCoverInput({
        mimeType: 'image/png',
        size: TOURNAMENT_COVER_SOURCE_MAX_BYTES + 1,
      }),
    ).toEqual({ ok: false, code: 'too_large' });
    expect(validateTournamentCoverInput({ mimeType: 'image/gif', size: 1000 })).toEqual({
      ok: false,
      code: 'unsupported_type',
    });
  });
});
