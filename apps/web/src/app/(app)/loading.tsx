import { LoadingScreen } from '@/components/ui/spinner';

/** Route-transition fallback for the app shell — a centered spinner while the next page loads. */
export default function Loading() {
  return <LoadingScreen />;
}
