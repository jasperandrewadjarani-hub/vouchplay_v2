'use client';

import { Share, SquarePlus, Check } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const STEPS = [
  { icon: Share, text: 'Tap the Share button at the bottom of Safari' },
  { icon: SquarePlus, text: 'Choose Add to Home Screen' },
  { icon: Check, text: 'Tap Add - VouchPlay appears with your apps' },
];

/**
 * iOS "Show me how" sheet (master_plan §2AY Decision E) - Safari has no install prompt API, so this
 * is the whole install flow for iPhone/iPad. Three steps, one line each, no jargon.
 */
export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Modal title="Add VouchPlay to your Home Screen" onClose={onClose} align="sheet">
      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="border-border bg-surface-muted text-foreground-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
              {i + 1}
            </span>
            <Icon size={18} className="text-foreground-muted shrink-0" aria-hidden />
            <span className="text-foreground text-sm">{text}</span>
          </li>
        ))}
      </ol>
      <p className="text-foreground-muted mt-4 text-xs">
        In another app&apos;s browser? Open this page in Safari first.
      </p>
      <Button type="button" onClick={onClose} className="mt-5 w-full">
        Got it
      </Button>
    </Modal>
  );
}
