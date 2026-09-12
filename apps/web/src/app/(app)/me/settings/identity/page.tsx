import type { Metadata } from 'next';
import Link from 'next/link';
import type { IdentityVerificationStatus } from '@vouchplay/db';
import { requireUser, safeNext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadSettingFlag } from '@/lib/settings';
import { IdentityVerificationForm } from '@/components/identity/identity-verification-form';

export const metadata: Metadata = { title: 'Verify your identity' };

interface IdentityVerificationPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

/**
 * Me → Settings → "Verify my identity" (master_plan §2AG Phase C, handover §13.3). Staff-approved
 * only (D1) - this page only ever lets a player submit; nothing here ever sets `approved` itself.
 * Reads are wrapped so a not-yet-applied migration 0036 degrades to "not available yet" rather than
 * a broken page (fail-open, same contract as the submit action).
 */
export default async function IdentityVerificationPage({
  searchParams,
}: IdentityVerificationPageProps) {
  const sp = await searchParams;
  // Same-origin-only redirect target (master_plan §2AO decision 9) - e.g. the Coach application gate
  // sending the player here before returning to `/me/roles/coach`. Submission itself never sets
  // `approved` (D1 above), so the form redirects there once the upload succeeds rather than waiting on
  // a review outcome; absent/unsafe falls back to today's inline "Submitted" behaviour.
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const user = await requireUser(
    next ? `/me/settings/identity?next=${encodeURIComponent(next)}` : '/me/settings/identity',
  );
  const enabled = await loadSettingFlag('identity_verification_enabled', true);

  let hasAvatar = false;
  let status: IdentityVerificationStatus | 'none' = 'none';
  let reviewReason: string | null = null;
  try {
    const svc = createServiceClient();
    const [{ data: profileRow }, { data: verificationRow }] = await Promise.all([
      svc.from('profiles').select('avatar_path').eq('id', user.id).maybeSingle(),
      svc
        .from('identity_verifications')
        .select('status, review_reason')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    hasAvatar = !!(profileRow as { avatar_path: string | null } | null)?.avatar_path;
    const v = verificationRow as {
      status: IdentityVerificationStatus;
      review_reason: string | null;
    } | null;
    if (v) {
      status = v.status;
      reviewReason = v.review_reason;
    }
  } catch {
    // Fail open: treat as "not submitted yet" rather than error the page.
  }

  const canSubmit = status === 'none' || status === 'rejected' || status === 'resubmit_required';

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-foreground text-xl font-semibold">Verify your identity</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Approved verification earns the &ldquo;ID Verified&rdquo; badge and helps other players
          trust your profile. Only VouchPlay staff can see your ID, and we delete the image once
          it&rsquo;s reviewed.
        </p>
      </header>

      {!enabled && (
        <p className="border-border bg-surface text-foreground-muted rounded-2xl border p-4 text-sm">
          Identity verification isn&rsquo;t available right now. Please check back later.
        </p>
      )}

      {enabled && status === 'approved' && (
        <p className="bg-success/10 text-success rounded-2xl p-4 text-sm" role="status">
          Your identity is verified. Thanks for helping keep VouchPlay trustworthy.
        </p>
      )}

      {enabled && (status === 'pending' || status === 'reviewing') && (
        <p className="bg-primary/10 text-primary rounded-2xl p-4 text-sm" role="status">
          Submitted - we&rsquo;ll review it soon.
        </p>
      )}

      {enabled && (status === 'rejected' || status === 'resubmit_required') && (
        <div className="bg-danger/10 text-danger space-y-1 rounded-2xl p-4 text-sm">
          <p>
            Your last submission wasn&rsquo;t approved
            {reviewReason ? `: ${reviewReason}` : '.'}
          </p>
          <p>You can submit again below.</p>
        </div>
      )}

      {enabled && canSubmit && !hasAvatar && (
        <div className="border-border bg-surface space-y-3 rounded-2xl border p-5 text-sm">
          <p className="text-foreground-muted">
            Add a profile photo first - identity verification needs both a photo and an ID.
          </p>
          <Link
            href={`/me/edit?next=${encodeURIComponent(
              next
                ? `/me/settings/identity?next=${encodeURIComponent(next)}`
                : '/me/settings/identity',
            )}`}
            className="text-primary inline-block font-semibold underline underline-offset-2"
          >
            Add a profile photo
          </Link>
        </div>
      )}

      {enabled && canSubmit && hasAvatar && <IdentityVerificationForm next={next} />}
    </div>
  );
}
