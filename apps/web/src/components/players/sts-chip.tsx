'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HelpCircle, Users, ShieldCheck, Scale } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

/**
 * STS chip (Skill-Trust Score, 0-5 confidence) with a tap-to-explain dialog.
 *
 * The number alone reads as a mysterious rating to newcomers, and the previous `title` tooltip was
 * invisible on touch devices and to keyboard users - which is where most players meet it. So the chip
 * is a real button that opens an accessible explainer instead. The copy leads with what STS is NOT
 * (a skill score or a ranking), because that is the confusion it actually causes (§3.3, §6, §8.4:
 * CSL, STS, Identity Verified and Skill Verified are four separate concepts, and VouchPlay never
 * ranks players by STS).
 */
export function StsChip({ sts }: { sts: number | null }) {
  const [open, setOpen] = useState(false);
  if (sts == null) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Skill-Trust Score ${sts.toFixed(1)} out of 5. What does this mean?`}
        className="border-border text-foreground-muted hover:border-primary hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        STS {sts.toFixed(1)}
        <HelpCircle size={11} aria-hidden />
      </button>

      {open && (
        <Modal
          title="What is STS?"
          subtitle="Skill-Trust Score"
          onClose={() => setOpen(false)}
          align="center"
        >
          <div className="space-y-3.5">
            <p className="text-foreground text-[15px] leading-relaxed font-semibold">
              How confident we are about a player&rsquo;s skill level - not how good they are.
              Scored 0 to 5.
            </p>

            <div>
              <p className="text-foreground text-sm font-semibold">What raises it</p>
              <ul className="mt-1.5 space-y-1.5">
                <li className="text-foreground-muted flex items-start gap-2 text-sm">
                  <Users size={15} className="text-primary mt-0.5 shrink-0" aria-hidden />
                  More people vouching for you
                </li>
                <li className="text-foreground-muted flex items-start gap-2 text-sm">
                  <ShieldCheck size={15} className="text-primary mt-0.5 shrink-0" aria-hidden />
                  Vouches from ID-verified players and coaches
                </li>
                <li className="text-foreground-muted flex items-start gap-2 text-sm">
                  <Scale size={15} className="text-primary mt-0.5 shrink-0" aria-hidden />
                  Vouchers agreeing with each other
                </li>
              </ul>
            </div>

            <p className="text-foreground-muted text-sm leading-relaxed">
              A low STS does not mean a weak player - usually just fewer vouches so far.
            </p>

            <div className="flex flex-col gap-2 pt-0.5">
              <Link
                href="/players"
                onClick={() => setOpen(false)}
                className="vp-gradient w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Get a vouch
              </Link>
              <Link
                href="/faq"
                onClick={() => setOpen(false)}
                className="text-foreground-muted hover:text-foreground text-center text-sm font-medium"
              >
                Read the FAQ
              </Link>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
