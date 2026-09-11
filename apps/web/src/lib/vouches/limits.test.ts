import { describe, it, expect } from 'vitest';
import { effectiveVouchLimit } from './limits';

describe('effectiveVouchLimit (§2AJ)', () => {
  it('applies the newcomer cap when the global cap is unlimited (the launch setting)', () => {
    expect(effectiveVouchLimit(0, 5)).toBe(5);
  });

  it('keeps a stricter global cap', () => {
    expect(effectiveVouchLimit(3, 5)).toBe(3);
  });

  it('uses the stricter newcomer cap over a looser global cap', () => {
    expect(effectiveVouchLimit(20, 5)).toBe(5);
  });

  it('is unlimited only when both are unlimited', () => {
    expect(effectiveVouchLimit(0, 0)).toBe(0);
    expect(effectiveVouchLimit(-1, 0)).toBe(0);
  });

  it('ignores a disabled newcomer cap (0) for established behaviour', () => {
    expect(effectiveVouchLimit(7, 0)).toBe(7);
  });
});
