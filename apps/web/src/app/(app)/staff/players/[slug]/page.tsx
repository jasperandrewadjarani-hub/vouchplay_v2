import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/moderation/staff';
import {
  getStaffPlayerHeader,
  listVouchesGiven,
  listVouchesReceived,
  listCommentsGiven,
  listCommentsReceived,
  listIntegrityFlags,
  listAccountHistory,
  auditActivityView,
} from '@/lib/moderation/player-activity';
import { PlayerAvatar } from '@/components/players/player-avatar';
import { nameInitials } from '@/lib/storage';
import { formatDate } from '@/lib/format-date';
import {
  VouchesReceivedSection,
  VouchesGivenSection,
  CommentsSection,
  IntegrityFlagsSection,
  AccountHistorySection,
} from '@/components/staff/player-activity-sections';

export const metadata: Metadata = { title: 'Player activity' };

interface Props {
  params: Promise<{ slug: string }>;
}

const IDENTITY_LABEL: Record<string, string> = {
  approved: 'ID verified',
  pending: 'ID pending review',
  rejected: 'ID rejected',
  none: 'No ID submitted',
};

/**
 * Staff per-player activity view (master_plan §2AN decision 6). This is the sanctioned, audited
 * de-anonymised view - every open is written to `audit_logs` (`staff.player_activity.view`) because
 * "Vouches received" shows real voucher identity, not the "anonymous" label the public site shows.
 * Entry points: `StaffPlayerActivityLink` on player cards / profile headers (staff-only, decided by
 * the caller's `viewer.isStaff`, never by this page's DTO).
 */
export default async function StaffPlayerActivityPage({ params }: Props) {
  const actor = await requireStaffPage('/staff/players');
  const { slug } = await params;

  const header = await getStaffPlayerHeader(slug);
  if (!header) notFound();

  await auditActivityView(header.id, actor.viewerId, actor.role);

  const [given, received, commentsGiven, commentsReceived, flags, history] = await Promise.all([
    listVouchesGiven(header.id),
    listVouchesReceived(header.id),
    listCommentsGiven(header.id),
    listCommentsReceived(header.id),
    listIntegrityFlags(header.id),
    listAccountHistory(header.id),
  ]);

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/staff" className="text-foreground-muted hover:text-foreground text-sm">
          ← Staff
        </Link>
      </div>

      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-4">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex items-center gap-3">
          <PlayerAvatar
            url={header.avatarUrl}
            initials={nameInitials(header.name)}
            name={header.name}
            size="md"
            verified={header.identityStatus === 'approved'}
          />
          <div className="min-w-0">
            <h1 className="text-foreground truncate text-lg font-semibold">{header.name}</h1>
            <p className="text-foreground-muted text-xs">
              <span className="font-medium capitalize">{header.accountStatus}</span>
              {' · '}
              {IDENTITY_LABEL[header.identityStatus]}
              {' · '}Joined {formatDate(header.createdAt)}
              {!header.onboardedAt && ' · not onboarded'}
            </p>
          </div>
          <Link
            href={`/players/${header.slug}`}
            className="text-primary ml-auto shrink-0 text-xs font-medium"
          >
            Public →
          </Link>
        </div>

        {header.statusReason && (
          <p className="text-foreground-muted border-border mt-3 border-t pt-3 text-xs">
            Reason: <span className="text-foreground">{header.statusReason}</span>
          </p>
        )}

        <div className="border-border mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-center">
          <div>
            <div className="text-foreground text-base font-semibold">
              {header.vouchesReceivedActive}
            </div>
            <div className="text-foreground-muted text-[11px]">Active vouches received</div>
          </div>
          <div>
            <div className="text-foreground text-base font-semibold">
              {header.vouchesGivenActive}
            </div>
            <div className="text-foreground-muted text-[11px]">Active vouches given</div>
          </div>
        </div>

        <p className="text-foreground-muted mt-3 text-xs">
          This view shows who gave anonymous vouches. Every open is recorded.
        </p>
      </header>

      <VouchesReceivedSection vouches={received} targetId={header.id} targetName={header.name} />
      <VouchesGivenSection vouches={given} />
      <CommentsSection given={commentsGiven} received={commentsReceived} />
      <IntegrityFlagsSection flags={flags} />
      <AccountHistorySection history={history} />
    </section>
  );
}
