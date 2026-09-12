import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { loadSettingFlag, loadSettingNumber } from '@/lib/settings';
import { getMyCoachState, getCoachGateState } from '@/lib/coach/queries';
import { CoachApplication } from '@/components/roles/coach-application';
import { CoachGate } from '@/components/roles/coach-gate';
import { LinkSpinner } from '@/components/ui/link-spinner';

export const metadata: Metadata = { title: 'Become a Coach' };

export default async function CoachRolePage() {
  const user = await requireUser('/me/roles/coach');
  const [state, enabled, slaDays, maxFiles, maxBytes, gate] = await Promise.all([
    getMyCoachState(user.id),
    loadSettingFlag('coach_applications_enabled', true),
    loadSettingNumber('coach_application_review_sla_days', 7),
    loadSettingNumber('coach_evidence_max_files', 5),
    loadSettingNumber('coach_evidence_max_bytes', 5 * 1024 * 1024),
    getCoachGateState(user.id),
  ]);
  // §2AO G: an already-active coach (or a live application) walks straight into `CoachApplication`,
  // which handles those states itself - the gate only stands between a fresh applicant and the form.
  const gated =
    !state.activeCoach &&
    !state.application &&
    (!gate.hasPhoto || gate.identityStatus !== 'approved');

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <Link href="/me" className="text-foreground-muted hover:text-foreground text-sm">
        ← Me <LinkSpinner size={14} />
      </Link>
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <p className="text-primary text-xs font-semibold tracking-widest uppercase">Roles</p>
        <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight">
          Become a Coach
        </h1>
        <p className="text-foreground-muted mt-2 text-sm">
          Tell JT about your coaching background. Coach, Identity Verified, Skill Verified, and
          skill level remain separate facts.
        </p>
      </header>
      {!state.available ? (
        <div
          className="border-warning/40 bg-warning/10 text-foreground rounded-2xl border p-4 text-sm"
          role="status"
        >
          The Coach application database update is not live yet. Your profile is unchanged.
        </div>
      ) : gated ? (
        <CoachGate hasPhoto={gate.hasPhoto} identityStatus={gate.identityStatus} />
      ) : (
        <CoachApplication
          activeCoach={state.activeCoach}
          coachRole={state.coachRole}
          application={state.application}
          enabled={enabled}
          slaDays={slaDays}
          maxFiles={maxFiles}
          maxBytes={maxBytes}
        />
      )}
    </section>
  );
}
