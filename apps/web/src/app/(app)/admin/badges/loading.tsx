import { LoadingScreen } from '@/components/ui/spinner';

/**
 * Own loading boundary for Admin → Badges (master_plan §2BK B), mirroring the pattern used by every
 * other top-level admin/tab page (see `players/loading.tsx`).
 */
export default function Loading() {
  return <LoadingScreen />;
}
