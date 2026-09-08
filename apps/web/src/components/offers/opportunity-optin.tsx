'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { setOpportunityOptIn } from '@/lib/actions/offer';

/** Reversible "open to club opportunities" toggle (Phase 14A). Off by default. */
export function OpportunityOptIn({ optedIn }: { optedIn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(optedIn);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setMsg(null);
    start(async () => {
      const res = await setOpportunityOptIn(next);
      if (res.ok) {
        setOn(next);
        router.refresh();
      }
      setMsg(res.error ?? null);
    });
  }

  return (
    <div className="border-primary/30 bg-primary/5 rounded-2xl border p-4">
      <div className="flex items-start gap-2">
        <Sparkles size={18} className="text-primary mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            {on ? 'You are open to opportunities' : 'Open to club opportunities?'}
          </p>
          <p className="text-foreground-muted mt-0.5 text-xs">
            {on
              ? 'Clubs can see you here and you can respond to offers. Turn this off anytime.'
              : 'Turn this on to respond to club recruitment and sponsorship offers.'}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={toggle}
          aria-pressed={on}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            on ? 'border-border text-foreground border' : 'vp-gradient text-white'
          }`}
        >
          {pending ? 'Saving…' : on ? 'Opt out' : 'Opt in'}
        </button>
      </div>
      {msg && <p className="text-danger mt-2 text-xs">{msg}</p>}
    </div>
  );
}
