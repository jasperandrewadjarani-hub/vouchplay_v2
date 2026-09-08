'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

/**
 * The contents of a numbered pagination link: the page number, swapped in place for a spinner while
 * that navigation is pending. Rendered inside the <Link> so `useLinkStatus` can see it.
 *
 * The swap happens inside a fixed-size button, so the row never reflows mid-navigation - a shifting
 * pagination bar under a thumb is how you tap the wrong page.
 */
export function PageLinkLabel({ page }: { page: number }) {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <>{page}</>;
}
