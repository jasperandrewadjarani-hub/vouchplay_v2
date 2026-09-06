'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/**
 * Inline navigation spinner. Place inside a <Link> to show a spinner while that navigation is
 * pending (Next App Router `useLinkStatus`), giving immediate feedback on click without losing
 * native link semantics (prefetch, middle-click, cmd-click).
 */
export function LinkSpinner({ size = 14 }: { size?: number }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 size={size} className="animate-spin" aria-hidden /> : null;
}
