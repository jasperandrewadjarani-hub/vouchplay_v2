import { describe, it, expect } from 'vitest';
import { phInputToIso, phDateInputToIso, isoToPhInput, isoToPhDateInput } from './ph-time';

describe('phInputToIso', () => {
  it('treats the typed value as PH time, not the host timezone', () => {
    // The live bug: an organizer typing 5:00 PM must not store 17:00Z.
    expect(phInputToIso('2026-09-09T17:00')).toBe('2026-09-09T09:00:00.000Z');
  });

  it('rolls back a day when PH morning precedes UTC midnight', () => {
    expect(phInputToIso('2026-09-09T07:30')).toBe('2026-09-08T23:30:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(phInputToIso('')).toBeNull();
    expect(phInputToIso('2026-09-09')).toBeNull();
    expect(phInputToIso('nonsense')).toBeNull();
  });
});

describe('isoToPhInput', () => {
  it('is the exact inverse of phInputToIso', () => {
    for (const v of ['2026-09-09T17:00', '2026-01-01T00:00', '2026-12-31T23:59']) {
      expect(isoToPhInput(phInputToIso(v) as string)).toBe(v);
    }
  });

  it('renders a stored UTC instant as PH wall-clock time', () => {
    expect(isoToPhInput('2026-09-09T09:00:00.000Z')).toBe('2026-09-09T17:00');
    // The value currently stored for B-Steel, which read as 1:26 AM on the 10th in Manila.
    expect(isoToPhInput('2026-09-09T17:26:00+00:00')).toBe('2026-09-10T01:26');
  });

  it('is empty for missing or invalid input', () => {
    expect(isoToPhInput(null)).toBe('');
    expect(isoToPhInput('not-a-date')).toBe('');
  });
});

describe('date-only helpers', () => {
  it('maps a PH calendar date to PH midnight in UTC', () => {
    expect(phDateInputToIso('2026-10-17')).toBe('2026-10-16T16:00:00.000Z');
  });

  it('round-trips a PH calendar date', () => {
    expect(isoToPhDateInput(phDateInputToIso('2026-10-17') as string)).toBe('2026-10-17');
  });
});
