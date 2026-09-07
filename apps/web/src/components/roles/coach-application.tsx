'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, ClipboardCheck, FileCheck2, ShieldCheck } from 'lucide-react';
import type { CoachApplicationDTO } from '@/lib/coach/queries';
import type { ApplicationStatus } from '@vouchplay/db';
import {
  resubmitCoachApplication,
  submitCoachApplication,
  withdrawCoachApplication,
} from '@/lib/actions/coach';
import type { SafetyActionState } from '@/lib/actions/report';
import { Field, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: SafetyActionState = {};
const COACH_STATUS_LABEL: Readonly<Record<ApplicationStatus, string>> = {
  pending: 'Pending review',
  reviewing: 'Under review',
  information_requested: 'More information needed',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
const specialties = [
  'Beginner development',
  'Doubles strategy',
  'Singles strategy',
  'Skills and drills',
  'Tournament preparation',
  'Youth coaching',
] as const;

export function CoachApplication({
  activeCoach,
  coachRole,
  application,
  enabled,
  slaDays,
  maxFiles,
  maxBytes,
}: {
  activeCoach: boolean;
  coachRole: { status: string; reason: string | null; revokedAt: string | null } | null;
  application: CoachApplicationDTO | null;
  enabled: boolean;
  slaDays: number;
  maxFiles: number;
  maxBytes: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [showForm, setShowForm] = useState(!application);
  const [withdrawMessage, setWithdrawMessage] = useState<SafetyActionState>({});
  const [withdrawing, startWithdraw] = useTransition();
  const isResubmit = application?.status === 'information_requested';
  const action = isResubmit
    ? resubmitCoachApplication.bind(null, application.id)
    : submitCoachApplication;
  const [state, formAction] = useActionState(action, empty);
  const answers = application?.answers ?? {};

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (activeCoach) {
    return (
      <div className="border-success/40 bg-success/10 rounded-2xl border p-5" role="status">
        <div className="flex items-center gap-2">
          <BadgeCheck className="text-success" size={22} aria-hidden />
          <h2 className="text-foreground font-semibold">Approved Coach</h2>
        </div>
        <p className="text-foreground-muted mt-2 text-sm">
          Your public Coach badge comes from your active approved role. “Vouch as a Coach” is still
          explicit and off by default on each vouch.
        </p>
      </div>
    );
  }

  const revoked = coachRole?.status === 'revoked';

  const open =
    application && ['pending', 'reviewing', 'information_requested'].includes(application.status);
  if (application && !showForm) {
    return (
      <div className="space-y-4">
        {revoked && (
          <section className="border-danger/40 bg-danger/5 rounded-2xl border p-5" role="status">
            <h2 className="text-foreground font-semibold">Coach role revoked</h2>
            <p className="text-foreground-muted mt-2 text-sm">
              Your earlier application remains an approved historical record, but your public Coach
              badge and Coach permissions are no longer active.
            </p>
            {coachRole.reason && (
              <p className="text-foreground-muted mt-2 text-sm">Reason: {coachRole.reason}</p>
            )}
            {coachRole.revokedAt && (
              <p className="text-foreground-muted mt-1 text-xs">
                Revoked {new Date(coachRole.revokedAt).toLocaleDateString()}
              </p>
            )}
          </section>
        )}
        <section
          className="border-border bg-surface rounded-2xl border p-5"
          aria-labelledby="coach-status"
        >
          <div className="flex items-start gap-3">
            <ClipboardCheck className="text-primary mt-0.5" size={20} aria-hidden />
            <div>
              <h2 id="coach-status" className="text-foreground font-semibold">
                {COACH_STATUS_LABEL[application.status]}
              </h2>
              <p className="text-foreground-muted mt-1 text-sm">
                Submitted {new Date(application.submittedAt).toLocaleDateString()}. Target review
                SLA: {slaDays} days.
              </p>
            </div>
          </div>
          {application.reviewReason && (
            <div className="border-warning/40 bg-warning/10 mt-4 rounded-xl border p-3">
              <p className="text-foreground text-sm font-medium">Message from JT</p>
              <p className="text-foreground-muted mt-1 text-sm">{application.reviewReason}</p>
            </div>
          )}
          {application.evidence.length > 0 && (
            <p className="text-foreground-muted mt-3 flex items-center gap-2 text-xs">
              <FileCheck2 size={15} aria-hidden /> {application.evidence.length} private evidence
              file(s) securely stored.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {application.status === 'information_requested' && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="vp-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white"
              >
                Respond and resubmit
              </button>
            )}
            {open && (
              <button
                type="button"
                disabled={withdrawing}
                onClick={() =>
                  startWithdraw(async () => {
                    const result = await withdrawCoachApplication(application.id);
                    setWithdrawMessage(result);
                    if (result.ok) router.refresh();
                  })
                }
                className="border-border text-foreground rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {withdrawing ? 'Withdrawing…' : 'Withdraw application'}
              </button>
            )}
            {!open && (application.status !== 'approved' || revoked) && enabled && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="border-border text-foreground rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Apply again
              </button>
            )}
          </div>
          <FormError>{withdrawMessage.error}</FormError>
          <FormMessage>{withdrawMessage.message}</FormMessage>
        </section>
        {application.events.length > 0 && (
          <section className="border-border bg-surface rounded-2xl border p-5">
            <h2 className="text-foreground text-sm font-semibold">Application history</h2>
            <ol className="mt-3 space-y-3">
              {application.events.map((event) => (
                <li key={event.id} className="border-border border-l-2 pl-3 text-sm">
                  <p className="text-foreground font-medium capitalize">
                    {event.type.replaceAll('_', ' ')}
                  </p>
                  {event.message && <p className="text-foreground-muted">{event.message}</p>}
                  <time className="text-foreground-muted text-xs">
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    );
  }

  if (!enabled) {
    return (
      <p className="border-border bg-surface text-foreground-muted rounded-2xl border p-5 text-sm">
        Coach applications are temporarily closed.
      </p>
    );
  }

  const selected = Array.isArray(answers.specialties) ? answers.specialties.map(String) : [];
  return (
    <form action={formAction} className="border-border bg-surface rounded-2xl border p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-foreground font-semibold">
            {isResubmit ? 'Respond to JT' : 'Coach application'}
          </h2>
          <p className="text-foreground-muted text-xs">Step {step} of 3</p>
        </div>
        <div className="flex gap-1" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 w-8 rounded-full ${n <= step ? 'vp-gradient' : 'bg-surface-muted'}`}
            />
          ))}
        </div>
      </div>
      <FormError>{state.error}</FormError>
      <FormMessage>{state.message}</FormMessage>

      <fieldset className={step === 1 ? 'space-y-4' : 'hidden'}>
        <legend className="sr-only">Coaching background</legend>
        <Field label="Coaching experience" htmlFor="experience" required>
          <textarea
            id="experience"
            name="experience"
            rows={5}
            required
            minLength={20}
            maxLength={3000}
            defaultValue={String(answers.experience ?? '')}
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Years of coaching experience" htmlFor="yearsExperience" required>
          <input
            id="yearsExperience"
            name="yearsExperience"
            type="number"
            min={0}
            max={80}
            required
            defaultValue={Number(answers.yearsExperience ?? 0)}
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Clubs or organizations coached" htmlFor="organizations">
          <textarea
            id="organizations"
            name="organizations"
            rows={3}
            maxLength={1500}
            defaultValue={String(answers.organizations ?? '')}
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
      </fieldset>

      <fieldset className={step === 2 ? 'space-y-4' : 'hidden'}>
        <legend className="sr-only">Locations and specialties</legend>
        <Field label="Coaching locations" htmlFor="locations" required>
          <textarea
            id="locations"
            name="locations"
            rows={3}
            required
            maxLength={1000}
            defaultValue={String(answers.locations ?? '')}
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
        <fieldset>
          <legend className="text-foreground text-sm font-medium">Coaching specialties</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {specialties.map((item) => (
              <label
                key={item}
                className="border-border bg-background text-foreground flex items-center gap-2 rounded-xl border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="specialties"
                  value={item}
                  defaultChecked={selected.includes(item)}
                />{' '}
                {item}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Certifications or accreditation" htmlFor="certifications">
          <textarea
            id="certifications"
            name="certifications"
            rows={3}
            maxLength={2000}
            defaultValue={String(answers.certifications ?? '')}
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
      </fieldset>

      <fieldset className={step === 3 ? 'space-y-4' : 'hidden'}>
        <legend className="sr-only">References and evidence</legend>
        <Field label="Public reference links (one per line)" htmlFor="references" required>
          <textarea
            id="references"
            name="references"
            rows={3}
            required
            defaultValue={Array.isArray(answers.references) ? answers.references.join('\n') : ''}
            placeholder="https://club.example/coach-profile"
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Private supporting evidence" htmlFor="evidence">
          <input
            id="evidence"
            name="evidence"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
        <p className="text-foreground-muted text-xs">
          Up to {maxFiles} files, {Math.floor(maxBytes / 1048576)} MB each. Images are decoded and
          metadata-stripped; PDFs are decoded. Files stay private and JT can open them only through
          short-lived AAL2-authorized links.
        </p>
        <Field label="Optional note" htmlFor="note">
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={2000}
            defaultValue={String(answers.note ?? '')}
            className="border-border bg-background text-foreground w-full rounded-xl border px-3 py-2 text-sm"
          />
        </Field>
        <label className="border-border bg-background text-foreground flex items-start gap-3 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            required
            defaultChecked={answers.consent === true}
            className="mt-1"
          />
          <span>I confirm these claims are accurate and consent to VouchPlay checking them.</span>
        </label>
        <div className="border-primary/30 bg-primary/5 flex gap-2 rounded-xl border p-3 text-xs">
          <ShieldCheck className="text-primary shrink-0" size={17} aria-hidden />
          <p className="text-foreground-muted">
            Pending or rejected applications never create a public Coach badge.
          </p>
        </div>
      </fieldset>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((v) => Math.max(1, v - 1))}
          className="border-border text-foreground rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((v) => Math.min(3, v + 1))}
            className="vp-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white"
          >
            Continue
          </button>
        ) : (
          <SubmitButton pendingLabel={isResubmit ? 'Resubmitting…' : 'Submitting…'}>
            {isResubmit ? 'Resubmit application' : 'Submit application'}
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
