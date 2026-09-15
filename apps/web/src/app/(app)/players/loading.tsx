import { LoadingScreen } from '@/components/ui/spinner';

/**
 * Own loading boundary for the Players tab (master_plan §2BH decision H / finding 3) - see
 * `home/loading.tsx` for why every top-level tab needs its own file rather than relying on the
 * shared `app/(app)/loading.tsx`. This only covers the page's own top-level reads (viewer, filter
 * options, doors); the results list keeps its existing dedicated `PlayerListSkeleton` Suspense
 * boundary for filter/sort/page changes (§2Z) - unchanged.
 */
export default function Loading() {
  return <LoadingScreen />;
}
