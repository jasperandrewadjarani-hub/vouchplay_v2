import { describe, it, expect } from 'vitest';
import { PRIMARY_NAV, isActivePath } from './nav-items';

describe('primary navigation', () => {
  it('is locked to the five tabs in order (handover §5.1)', () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual([
      'Home',
      'Players',
      'Clubs',
      'Tournaments',
      'Me',
    ]);
  });

  it('matches Home only on the exact root path', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/players', '/')).toBe(false);
  });

  it('matches a section on its root and nested routes', () => {
    expect(isActivePath('/players', '/players')).toBe(true);
    expect(isActivePath('/players/abc', '/players')).toBe(true);
    expect(isActivePath('/clubs', '/players')).toBe(false);
  });
});
