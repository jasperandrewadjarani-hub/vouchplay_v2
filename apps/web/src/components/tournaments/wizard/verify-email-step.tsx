'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { requestGuestOtp, verifyGuestOtpInline } from '@/lib/actions/guest-registration';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * The inline OTP screen shared by the guest wizard's two "confirm this email" moments (master_plan
 * §2AU Decision B/D, item 6): a brand-new guest verifying to keep their entry (default heading/copy),
 * and the "you already have an account" branch reusing the identical mechanics with different copy
 * and a different `onVerified` (Decision B: continues as signed-in at the same step vs. re-opens the
 * wizard in player mode at the same division). One file, two moments - not two near-duplicate forms.
 *
 * Requests a code once on mount (never again on re-render), then a 6-digit input + Verify, with a
 * 30-second-cooldown Resend. Success hands control entirely back to the caller - this component never
 * refreshes the router or reads any tournament state itself.
 */
export function VerifyEmailStep({
  email,
  heading = 'Create your account',
  description,
  onVerified,
}: {
  email: string;
  heading?: string;
  /** Defaults to the new-guest copy; the existing-account branch passes its own. */
  description?: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const requestedOnce = useRef(false);

  // Auto-send once per mount - a fresh mount (a new `email`, or re-entering this step) is exactly
  // when a new code is wanted; React StrictMode's double-invoke and ordinary re-renders are not.
  useEffect(() => {
    if (requestedOnce.current) return;
    requestedOnce.current = true;
    void requestGuestOtp(email);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleVerify() {
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await verifyGuestOtpInline(email, code.trim());
    setSubmitting(false);
    if (!res?.ok) {
      setError(res?.error ?? 'That code did not work. Please try again.');
      return;
    }
    onVerified();
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    await requestGuestOtp(email);
    setResending(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  const body = description ?? `Enter the code we sent to ${email} to keep this entry.`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-foreground text-lg font-semibold">{heading}</p>
        <p className="text-foreground-muted mt-1 text-sm">{body}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-start gap-1.5 rounded-lg px-3 py-2 text-sm"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Field label="6-digit code" htmlFor="verify-token" required>
        <Input
          id="verify-token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </Field>

      <Button
        type="button"
        onClick={() => void handleVerify()}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? 'Verifying…' : 'Verify'}
      </Button>

      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={cooldown > 0 || resending}
        className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium underline underline-offset-2 disabled:opacity-50"
      >
        {cooldown > 0 ? `Resend code (${cooldown}s)` : resending ? 'Sending…' : 'Resend code'}
      </button>
    </div>
  );
}
