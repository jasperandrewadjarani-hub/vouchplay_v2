import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

/** Layout for the main app surface - header, sidebar, bottom nav (handover §5). */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
