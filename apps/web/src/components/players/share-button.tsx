'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

/**
 * Share action (handover §28): native Web Share API where available, else copy-link fallback.
 * Not a protected action - available to everyone.
 */
export function ShareButton({
  url,
  title,
  text,
  size = 'md',
}: {
  url: string;
  title: string;
  text?: string;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState(false);
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';

  async function share() {
    const shareData = { title, text: text ?? title, url };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed - fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked - no-op
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={`border-border bg-surface text-foreground hover:bg-surface-muted inline-flex items-center justify-center gap-2 rounded-xl border font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${pad}`}
    >
      {copied ? (
        <Check size={size === 'sm' ? 14 : 16} aria-hidden />
      ) : (
        <Share2 size={size === 'sm' ? 14 : 16} aria-hidden />
      )}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
