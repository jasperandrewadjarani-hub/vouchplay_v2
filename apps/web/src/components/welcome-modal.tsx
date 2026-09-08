'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';

/**
 * Launch / campaign welcome pop-up. Shown once per visitor per version, on whichever route they land
 * on, while an Admin enables it. All copy comes from Admin settings so a campaign can change (or be
 * switched off) without a deploy; bumping the version re-shows it to everyone.
 *
 * It renders nothing during server rendering and only decides after mount, because the "already seen"
 * flag lives in localStorage - reading that during render would make the server and client disagree
 * and trip a hydration mismatch.
 */
export interface WelcomeModalCopy {
  version: string;
  headline: string;
  subhead: string;
  eventLabel: string;
  eventName: string;
  detail: string;
  ctaNote: string;
  imageUrl: string;
  linkUrl: string;
}

const STORAGE_PREFIX = 'vp:welcome:';

export function WelcomeModal({ copy, authed }: { copy: WelcomeModalCopy; authed: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `${STORAGE_PREFIX}${copy.version}`;
    try {
      if (window.localStorage.getItem(key) !== 'seen') setOpen(true);
    } catch {
      // Private mode or blocked storage: show it rather than hide the launch message.
      setOpen(true);
    }
  }, [copy.version]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${copy.version}`, 'seen');
    } catch {
      // Non-fatal: the pop-up simply shows again next visit.
    }
  }

  if (!open) return null;

  return (
    <Modal title={copy.headline} subtitle={copy.subhead || undefined} onClose={dismiss} size="lg">
      <div className="space-y-5">
        {copy.imageUrl && (
          <div className="border-border bg-surface-muted overflow-hidden rounded-2xl border">
            {/* Admin-supplied campaign artwork. Rendered at its natural aspect ratio: a poster often
                carries essential text at its very top and bottom edges, so it must never be cropped
                to fit a fixed box. The event name is the alt text, so a screen reader still gets it
                even though the visible duplicate below is hidden when artwork is present. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={copy.imageUrl}
              alt={copy.eventName || 'Event announcement'}
              className="block h-auto w-full"
            />
          </div>
        )}

        {copy.eventName && !copy.imageUrl && (
          <div className="border-primary/30 bg-primary/5 rounded-2xl border p-4 text-center">
            {copy.eventLabel && <p className="vp-label text-primary">{copy.eventLabel}</p>}
            <p className="text-foreground mt-1.5 text-lg leading-snug font-bold sm:text-xl">
              {copy.eventName}
            </p>
          </div>
        )}

        <div className="space-y-1 text-center">
          {copy.detail && (
            <p className="text-foreground text-base font-semibold sm:text-lg">{copy.detail}</p>
          )}
          {copy.ctaNote && <p className="text-foreground-muted text-sm">{copy.ctaNote}</p>}
        </div>

        <div className="flex flex-col gap-2.5">
          {!authed && (
            <Link
              href="/signup"
              onClick={dismiss}
              className="vp-gradient vp-glow w-full rounded-xl px-4 py-3.5 text-center text-base font-semibold text-white"
            >
              Create free account
            </Link>
          )}
          {copy.linkUrl && (
            <Link
              href={copy.linkUrl}
              onClick={dismiss}
              className={`w-full rounded-xl px-4 py-3.5 text-center text-base font-semibold ${
                authed
                  ? 'vp-gradient vp-glow text-white'
                  : 'border-border text-foreground hover:bg-surface-muted border'
              }`}
            >
              See the tournament
            </Link>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-foreground-muted hover:text-foreground w-full rounded-xl px-4 py-2.5 text-center text-sm font-medium"
          >
            Maybe later
          </button>
        </div>
      </div>
    </Modal>
  );
}
