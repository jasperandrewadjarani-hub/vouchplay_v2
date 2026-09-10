'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { BRAND } from '@vouchplay/config';
import { TermsContent } from './terms-content';
import { PrivacyContent } from './privacy-content';
import { acceptCurrentLegalTerms } from '@/lib/actions/legal';

/**
 * Blocking consent gate (master_plan §2R). Shown once to any signed-in player who has not accepted
 * the current Terms/Privacy version - the existing 350+ on rollout, then anyone we re-prompt after a
 * material change. The documents are embedded and scrollable here (not linked out) so a player reads
 * and accepts in one place without navigating away from the gate. It overlays everything, above the
 * header and bottom nav, so nothing else is usable until they accept.
 */
export function LegalConsentGate() {
  const router = useRouter();
  const [tab, setTab] = useState<'terms' | 'privacy'>('terms');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptCurrentLegalTerms();
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? 'Something went wrong. Please try again.');
      }
    });
  };

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      active ? 'bg-primary text-white' : 'text-foreground-muted hover:text-foreground'
    }`;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-gate-title"
    >
      <div className="border-border bg-surface flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-xl">
        <div className="border-border border-b p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary shrink-0" size={20} aria-hidden />
            <h1 id="legal-gate-title" className="text-foreground text-base font-semibold">
              A quick update before you continue
            </h1>
          </div>
          <p className="text-foreground-muted mt-1 text-sm">
            We&rsquo;ve published {BRAND.name}&rsquo;s Terms of Service and Privacy Policy. Please
            review and accept them to keep using the app.
          </p>
          <div className="bg-surface-muted mt-3 flex gap-1 rounded-xl p-1">
            <button
              type="button"
              className={tabClass(tab === 'terms')}
              onClick={() => setTab('terms')}
            >
              Terms
            </button>
            <button
              type="button"
              className={tabClass(tab === 'privacy')}
              onClick={() => setTab('privacy')}
            >
              Privacy
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>

        <div className="border-border bg-surface border-t p-5">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="text-foreground">
              I have read and agree to the Terms of Service and Privacy Policy.
            </span>
          </label>
          {error && <p className="text-danger mt-2 text-sm">{error}</p>}
          <button
            type="button"
            onClick={accept}
            disabled={!agreed || pending}
            className="bg-primary mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Agree and continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
