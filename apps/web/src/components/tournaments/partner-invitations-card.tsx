import Link from 'next/link';
import { Mail } from 'lucide-react';
import type { ViewerInvitation } from '@/lib/tournaments/registration-queries';
import { InvitationActions } from './invitation-actions';

/**
 * Partner invitations, on their own card above My registrations (master_plan §2AP D) - split out of
 * the division list so a decision the OTHER team made never reads as one of the viewer's own entries.
 * One row per invitation: who it is with, which division, a prepaid note when it applies, and Accept /
 * Decline (incoming) or Withdraw (outgoing).
 */
export function PartnerInvitationsCard({ invitations }: { invitations: ViewerInvitation[] }) {
  if (invitations.length === 0) return null;
  const fullWidthPanel = (i: ViewerInvitation) => i.direction === 'incoming' && i.prepaid;

  return (
    <details
      id="partner-invitations"
      open
      className="border-primary/30 bg-primary/5 scroll-mt-24 rounded-2xl border"
    >
      <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 p-4 text-base font-semibold">
        <Mail size={18} className="text-primary" aria-hidden />
        Partner invitations ({invitations.length})
        <span className="text-foreground-muted ml-auto text-xs font-normal">Show</span>
      </summary>
      <ul className="space-y-2 px-4 pb-4">
        {invitations.map((i) => (
          <li key={i.id} className="border-border bg-surface space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-foreground min-w-0 text-sm">
                {i.direction === 'incoming' ? 'From ' : 'To '}
                {i.otherSlug ? (
                  <Link href={`/players/${i.otherSlug}`} className="text-primary font-medium">
                    {i.otherName}
                  </Link>
                ) : (
                  <span className="font-medium">{i.otherName}</span>
                )}
              </span>
              {!fullWidthPanel(i) && (
                <InvitationActions
                  invitationId={i.id}
                  direction={i.direction}
                  prepaid={i.prepaid}
                  partnerName={i.otherName}
                />
              )}
            </div>
            <p className="text-foreground-muted text-xs">
              {i.divisionName}
              {i.prepaid && ' · Prepaid'}
            </p>
            {fullWidthPanel(i) && (
              <InvitationActions
                invitationId={i.id}
                direction={i.direction}
                prepaid={i.prepaid}
                partnerName={i.otherName}
              />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
