import { LoadingScreen } from '@/components/ui/spinner';

/**
 * Own loading boundary for the Clubs tab (master_plan §2BH decision H / finding 3) - see
 * `home/loading.tsx` for why every top-level tab needs its own file rather than relying on the
 * shared `app/(app)/loading.tsx`.
 */
export default function Loading() {
  return <LoadingScreen />;
}
