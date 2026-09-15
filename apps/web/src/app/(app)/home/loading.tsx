import { LoadingScreen } from '@/components/ui/spinner';

/**
 * Own loading boundary for the Home tab (master_plan §2BH decision H / finding 3). The shared
 * `app/(app)/loading.tsx` boundary only shows on the FIRST navigation into any route under that
 * layout - React does not re-show an already-revealed Suspense fallback for a transition between
 * sibling routes, so tab-to-tab taps rendered no skeleton at all and looked frozen. A per-route
 * `loading.tsx` is its own boundary, keyed to this segment, so it reliably shows on every tap here.
 */
export default function Loading() {
  return <LoadingScreen />;
}
