import Link from 'next/link';
import { SKILL_BANDS } from '@vouchplay/config';
import { formatDate } from '@/lib/format-date';
import { VouchModerationPanel } from '@/components/moderation/vouch-moderation-panel';
import type {
  StaffVouchGiven,
  StaffVouchReceived,
  StaffComment,
  StaffIntegrityFlag,
  StaffAccountHistoryItem,
} from '@/lib/moderation/player-activity';

/**
 * The five collapsible sections of `/staff/players/[slug]` (master_plan §2AN decision 6). Pure
 * server-rendered markup - no client JS here except the embedded `VouchModerationPanel`, which loads
 * and acts on its own. `<details>` is used the same way the club Manage page uses it: no extra
 * disclosure library, keyboard/AT-friendly for free.
 */

function bandLabel(ordinal: number): string {
  return SKILL_BANDS.find((b) => b.ordinal === ordinal)?.label ?? String(ordinal);
}

function PlayerLink({ slug, name }: { slug: string | null; name: string }) {
  if (!slug) return <span className="text-foreground font-medium">{name}</span>;
  return (
    <Link href={`/players/${slug}`} className="text-primary font-medium hover:underline">
      {name}
    </Link>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'text-success'
      : status === 'invalidated'
        ? 'text-danger'
        : 'text-foreground-muted';
  return <span className={`font-medium ${tone}`}>{status}</span>;
}

function Section({
  title,
  hint,
  open,
  children,
}: {
  title: string;
  hint?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="border-border bg-surface rounded-2xl border p-4"
      {...(open ? { open: true } : {})}
    >
      <summary className="text-foreground cursor-pointer text-sm font-semibold">{title}</summary>
      {hint && <p className="text-foreground-muted mt-1 text-xs">{hint}</p>}
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-foreground-muted text-xs">{children}</p>;
}

export function VouchesReceivedSection({
  vouches,
  targetId,
  targetName,
}: {
  vouches: StaffVouchReceived[];
  targetId: string;
  targetName: string;
}) {
  return (
    <Section
      title="Vouches received"
      hint="Voucher identity is shown here - staff-only, every open of this page is audited."
      open
    >
      {vouches.length === 0 ? (
        <Empty>No vouches received.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="text-foreground-muted">
                <th className="py-1 pr-3 font-medium">Voucher</th>
                <th className="py-1 pr-3 font-medium">Level</th>
                <th className="py-1 pr-3 font-medium">Weight</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {vouches.map((v) => (
                <tr key={v.id} className="border-border border-t">
                  <td className="py-1.5 pr-3">
                    <PlayerLink slug={v.voucherSlug} name={v.voucherName} />
                    {v.anonymous && (
                      <span className="text-foreground-muted"> · anonymous publicly</span>
                    )}
                    {v.usedCoachWeight && <span className="text-foreground-muted"> · coach</span>}
                  </td>
                  <td className="text-foreground-muted py-1.5 pr-3">{bandLabel(v.skillLevel)}</td>
                  <td className="text-foreground-muted py-1.5 pr-3">
                    {v.effectiveWeight.toFixed(2)}x
                  </td>
                  <td className="py-1.5 pr-3">
                    <StatusChip status={v.status} />
                    {v.invalidationReason && (
                      <span className="text-foreground-muted block">{v.invalidationReason}</span>
                    )}
                  </td>
                  <td className="text-foreground-muted py-1.5">{formatDate(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <VouchModerationPanel targetId={targetId} targetName={targetName} />
    </Section>
  );
}

export function VouchesGivenSection({ vouches }: { vouches: StaffVouchGiven[] }) {
  return (
    <Section title="Vouches given" open>
      {vouches.length === 0 ? (
        <Empty>No vouches given.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="text-foreground-muted">
                <th className="py-1 pr-3 font-medium">Target</th>
                <th className="py-1 pr-3 font-medium">Level</th>
                <th className="py-1 pr-3 font-medium">Weight</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {vouches.map((v) => (
                <tr key={v.id} className="border-border border-t">
                  <td className="py-1.5 pr-3">
                    <PlayerLink slug={v.targetSlug} name={v.targetName} />
                    {v.anonymous && (
                      <span className="text-foreground-muted"> · anonymous publicly</span>
                    )}
                    {v.usedCoachWeight && <span className="text-foreground-muted"> · coach</span>}
                  </td>
                  <td className="text-foreground-muted py-1.5 pr-3">{bandLabel(v.skillLevel)}</td>
                  <td className="text-foreground-muted py-1.5 pr-3">
                    {v.effectiveWeight.toFixed(2)}x
                  </td>
                  <td className="py-1.5 pr-3">
                    <StatusChip status={v.status} />
                    {v.invalidationReason && (
                      <span className="text-foreground-muted block">{v.invalidationReason}</span>
                    )}
                  </td>
                  <td className="text-foreground-muted py-1.5">{formatDate(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function CommentList({ comments }: { comments: StaffComment[] }) {
  if (comments.length === 0) return <Empty>No comments.</Empty>;
  return (
    <ul className="space-y-2">
      {comments.map((c) => (
        <li key={c.id} className="border-border border-b pb-2 text-xs last:border-b-0 last:pb-0">
          <div className="flex items-center gap-2">
            <PlayerLink slug={c.otherSlug} name={c.otherName} />
            <span className="text-foreground-muted ml-auto">{formatDate(c.createdAt)}</span>
          </div>
          <p className="text-foreground mt-0.5">{c.body}</p>
          {c.status !== 'active' && <StatusChip status={c.status} />}
        </li>
      ))}
    </ul>
  );
}

export function CommentsSection({
  given,
  received,
}: {
  given: StaffComment[];
  received: StaffComment[];
}) {
  return (
    <Section title="Comments">
      <div className="space-y-4">
        <div>
          <h3 className="text-foreground-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
            Received
          </h3>
          <CommentList comments={received} />
        </div>
        <div>
          <h3 className="text-foreground-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
            Given
          </h3>
          <CommentList comments={given} />
        </div>
      </div>
    </Section>
  );
}

export function IntegrityFlagsSection({ flags }: { flags: StaffIntegrityFlag[] }) {
  return (
    <Section title="Integrity flags">
      {flags.length === 0 ? (
        <Empty>No integrity flags on this player.</Empty>
      ) : (
        <ul className="space-y-2">
          {flags.map((f) => (
            <li
              key={f.id}
              className="border-border border-b pb-2 text-xs last:border-b-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">{f.flagType}</span>
                <StatusChip status={f.status} />
                {f.severity && <span className="text-foreground-muted">{f.severity}</span>}
                <span className="text-foreground-muted ml-auto">{formatDate(f.createdAt)}</span>
              </div>
              {f.reason && <p className="text-foreground-muted mt-0.5">{f.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function AccountHistorySection({ history }: { history: StaffAccountHistoryItem[] }) {
  return (
    <Section title="Account history">
      {history.length === 0 ? (
        <Empty>No recorded account history.</Empty>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li
              key={h.id}
              className="border-border border-b pb-2 text-xs last:border-b-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">{h.action}</span>
                <span className="text-foreground-muted">by {h.actorName}</span>
                <span className="text-foreground-muted ml-auto">{formatDate(h.createdAt)}</span>
              </div>
              {h.reason && <p className="text-foreground-muted mt-0.5">{h.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
