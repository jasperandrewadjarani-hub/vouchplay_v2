'use client';

import { useState, useTransition } from 'react';
import { MUTABLE_CATEGORIES, CATEGORY_LABELS } from '@vouchplay/core';
import { updateNotificationPreferences } from '@/lib/actions/notifications';

/**
 * Notification preferences (handover §27.5). Non-critical categories can be turned off; critical
 * account/security + moderation always stay on and are not shown here. Email is a master opt-in that
 * only sends once the app email transport is configured.
 */
export function NotificationPreferencesForm({
  mutedCategories,
  emailEnabled,
  emailChannelReady,
}: {
  mutedCategories: string[];
  emailEnabled: boolean;
  emailChannelReady: boolean;
}) {
  const [muted, setMuted] = useState<Set<string>>(new Set(mutedCategories));
  const [email, setEmail] = useState(emailEnabled);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggleCategory(cat: string) {
    setMuted((cur) => {
      const next = new Set(cur);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateNotificationPreferences(Array.from(muted), email);
      setMsg(res.error ?? 'Preferences saved.');
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-foreground text-sm font-medium">In-app notifications</p>
        <p className="text-foreground-muted text-xs">
          Turn off the kinds you don&apos;t want. Account &amp; security and moderation messages are
          always on.
        </p>
        <ul className="divide-border border-border divide-y rounded-xl border">
          {MUTABLE_CATEGORIES.map((cat) => {
            const on = !muted.has(cat);
            return (
              <li key={cat} className="flex items-center justify-between gap-3 p-3">
                <span className="text-foreground text-sm">{CATEGORY_LABELS[cat]}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggleCategory(cat)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    on ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      on ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-border space-y-1 rounded-xl border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-foreground text-sm">Email me about critical account events</span>
          <input
            type="checkbox"
            checked={email}
            onChange={(e) => setEmail(e.target.checked)}
            className="size-4"
          />
        </label>
        <p className="text-foreground-muted text-xs">
          {emailChannelReady
            ? 'Critical account & security messages will also be emailed to you.'
            : 'Email delivery is not switched on yet - this preference is saved and takes effect once it is.'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="vp-gradient vp-glow rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save preferences'}
        </button>
        {msg && <span className="text-foreground-muted text-xs">{msg}</span>}
      </div>
    </div>
  );
}
