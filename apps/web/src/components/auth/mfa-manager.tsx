'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Field, Input, FormError, FormMessage } from '@/components/ui/field';

interface FactorView {
  id: string;
  friendlyName: string | null;
  status: string;
}

/**
 * TOTP MFA manager (enroll / verify / remove). Runs client-side against the Supabase browser client
 * so the session upgrades to aal2 in place after verification. Part of the Admin MFA framework
 * (lib/auth/mfa.ts is the server guard side).
 */
export function MfaManager({
  factors,
  hasVerified,
}: {
  factors: FactorView[];
  hasVerified: boolean;
}) {
  const router = useRouter();
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(
    null,
  );
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function startEnroll() {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || !data) {
        setError(error?.message ?? 'Could not start enrollment.');
        return;
      }
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setError('MFA is not available right now.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!enroll) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (challenge.error || !challenge.data) {
        setError(challenge.error?.message ?? 'Could not start verification.');
        return;
      }
      const verified = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) {
        setError(verified.error.message);
        return;
      }
      setEnroll(null);
      setCode('');
      setMessage('Authenticator added. Two-factor authentication is now on.');
      router.refresh();
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(factorId: string) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        setError(error.message);
        return;
      }
      setMessage('Authenticator removed.');
      router.refresh();
    } catch {
      setError('Could not remove that authenticator.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <FormMessage>{message}</FormMessage>
      <FormError>{error}</FormError>

      {factors.length > 0 && (
        <ul className="space-y-2">
          {factors.map((f) => (
            <li
              key={f.id}
              className="border-border bg-surface flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <span className="inline-flex items-center gap-2 text-sm">
                <ShieldCheck size={16} className="text-success" aria-hidden />
                {f.friendlyName || 'Authenticator app'}
                <span className="text-foreground-muted text-xs">({f.status})</span>
              </span>
              <button
                type="button"
                onClick={() => remove(f.id)}
                disabled={busy}
                className="text-danger hover:bg-danger/10 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-60"
              >
                <Trash2 size={14} aria-hidden />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!enroll ? (
        <button
          type="button"
          onClick={startEnroll}
          disabled={busy}
          className="bg-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          <ShieldCheck size={16} aria-hidden />
          {hasVerified ? 'Add another authenticator' : 'Set up authenticator app'}
        </button>
      ) : (
        <div className="border-border bg-surface space-y-3 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            Scan this QR code in your authenticator app, then enter the 6-digit code.
          </p>
          {/* qr_code is an inline SVG data URL from Supabase. eslint-disable for the raw <img>. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="TOTP QR code" className="h-44 w-44 rounded-lg bg-white p-2" />
          <p className="text-foreground-muted text-xs break-all">
            Or enter this key manually:{' '}
            <span className="text-foreground font-mono">{enroll.secret}</span>
          </p>
          <Field label="6-digit code" htmlFor="mfa-code" required>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.trim().length < 6}
              className="bg-primary rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Verify &amp; enable
            </button>
            <button
              type="button"
              onClick={() => {
                setEnroll(null);
                setCode('');
              }}
              disabled={busy}
              className="border-border text-foreground hover:bg-surface-muted rounded-xl border px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
