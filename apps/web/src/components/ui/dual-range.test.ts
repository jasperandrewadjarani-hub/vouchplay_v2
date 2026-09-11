import { describe, it, expect } from 'vitest';
import { nextDualRangeValue } from './dual-range';

/**
 * Value-clamping logic behind `DualRange` (master_plan §2AG A2). Tested as a pure function rather
 * than by rendering the component - this repo's Vitest environment is plain `node`, not `jsdom`.
 */
describe('nextDualRangeValue', () => {
  it('moves the low thumb freely while it stays below the high thumb', () => {
    expect(nextDualRangeValue([0, 10], 'lo', 3)).toEqual([3, 10]);
  });

  it('moves the high thumb freely while it stays above the low thumb', () => {
    expect(nextDualRangeValue([0, 10], 'hi', 7)).toEqual([0, 7]);
  });

  it('clamps the low thumb at the high thumb instead of crossing it', () => {
    expect(nextDualRangeValue([2, 5], 'lo', 9)).toEqual([5, 5]);
  });

  it('clamps the high thumb at the low thumb instead of crossing it', () => {
    expect(nextDualRangeValue([2, 5], 'hi', 0)).toEqual([2, 2]);
  });

  it('allows both thumbs to meet at the same value', () => {
    expect(nextDualRangeValue([0, 10], 'lo', 10)).toEqual([10, 10]);
    expect(nextDualRangeValue([0, 10], 'hi', 0)).toEqual([0, 0]);
  });

  it('leaves the untouched thumb exactly where it was', () => {
    expect(nextDualRangeValue([1.5, 8.5], 'lo', 2)).toEqual([2, 8.5]);
    expect(nextDualRangeValue([1.5, 8.5], 'hi', 8)).toEqual([1.5, 8]);
  });
});
