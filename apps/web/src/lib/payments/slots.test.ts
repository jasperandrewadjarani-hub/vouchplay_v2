import { describe, expect, it } from 'vitest';
import { raisedAmountDue } from './slots';

describe('raisedAmountDue (master_plan §2AO A4/A5)', () => {
  it('raises amount_due to the new division quote when it is higher', () => {
    expect(raisedAmountDue(500, 800)).toBe(800);
  });

  it('never lowers amount_due when the new division is cheaper', () => {
    expect(raisedAmountDue(800, 500)).toBe(800);
  });

  it('is a no-op when the two amounts are equal', () => {
    expect(raisedAmountDue(500, 500)).toBe(500);
  });
});
