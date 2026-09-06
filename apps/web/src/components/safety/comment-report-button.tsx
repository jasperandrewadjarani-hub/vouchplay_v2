'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportModal } from './report-modal';

/**
 * Small "Report" affordance shown on each vouch comment (handover §14.2 - all public UGC is
 * reportable). Anonymous viewers are not shown the control (the profile-level Report gate handles
 * signup).
 */
export function CommentReportButton({
  commentId,
  authorName,
}: {
  commentId: string;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-foreground-muted hover:text-danger inline-flex items-center gap-1 text-xs"
        aria-label={`Report comment by ${authorName}`}
      >
        <Flag size={12} aria-hidden />
        Report
      </button>
      {open && (
        <ReportModal
          targetType="comment"
          targetId={commentId}
          targetLabel={`comment by ${authorName}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
