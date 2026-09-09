import { Home, Users, Shield, Trophy, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Locked primary navigation - five tabs (handover §5.1). Settings is NOT a primary tab. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  // Home lives at /home, not /, because / redirects to the tournament list while registration is
  // open (§2E). Pointing this tab at '/' would bounce every tap through that redirect.
  { href: '/home', label: 'Home', icon: Home },
  { href: '/players', label: 'Players', icon: Users },
  { href: '/clubs', label: 'Clubs', icon: Shield },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/me', label: 'Me', icon: User },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
