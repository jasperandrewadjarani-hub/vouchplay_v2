'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import { StsChip } from './sts-chip';

/**
 * Trailing column of a compact player row: the STS chip, replaced by a spinner while that row's
 * navigation is pending.
 *
 * Tapping a compact row previously gave no feedback at all until the profile rendered. The cue is
 * placed here rather than in a column of its own because the STS slot is already a fixed 66px that
 * every row shares - reusing it means the pending state costs no horizontal space, so the names and
 * skill pills to its left keep exactly the width they had and cannot start wrapping (an added
 * trailing column made the longer "High Intermediate - Community" pills wrap onto a second line and
 * left the list ragged).
 */
export function CompactRowTrailing({ sts }: { sts: number | null }) {
  const { pending } = useLinkStatus();
  return (
    <span className="flex w-[66px] shrink-0 items-center justify-end">
      {pending ? (
        <Loader2 size={16} className="text-primary animate-spin" aria-hidden />
      ) : (
        <StsChip sts={sts} interactive={false} />
      )}
    </span>
  );
}
