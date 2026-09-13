import Link from 'next/link';
import type { RegistrationHeadline } from '@/lib/tournaments/registration-status';

/**
 * The one three-state headline chip (master_plan §2AS B, §2AP E) - "Slot not secured" / "Payment for
 * verification" / "Confirmed" - wherever a player's own payment state needs to appear next to
 * something else. Unsecured is the loud one: white on `--danger`, because nothing is held yet and the
 * slot can go to someone else. Verifying stays amber-neutral (the player has done their part).
 * Confirmed stays success green.
 */
export function ViewerStatusPill({
  headline,
  href,
}: {
  headline: RegistrationHeadline;
  /** Present only for the unsecured state - links straight to the action (master_plan §2AS B). */
  href?: string;
}) {
  if (headline === 'confirmed') {
    return (
      <span className="bg-success/15 text-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
        Confirmed
      </span>
    );
  }

  if (headline === 'verifying') {
    return (
      <span className="bg-warning/15 text-warning inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
        Payment for verification
      </span>
    );
  }

  // With a "Pay now" button the right padding is tight so the white pill sits snug; WITHOUT it (the
  // tournament card just states the status) the chip needs symmetric padding, or the text is jammed
  // against the right edge (the reported "too condensed" bug).
  return (
    <span
      className={`bg-danger inline-flex items-center gap-1.5 rounded-full py-0.5 text-xs font-semibold text-white ${
        href ? 'pr-0.5 pl-2' : 'px-2.5'
      }`}
    >
      Slot not secured
      {href && (
        <Link
          href={href}
          className="text-danger inline-flex h-6 items-center rounded-full bg-white px-2.5 text-[11px] font-semibold"
        >
          Pay now
        </Link>
      )}
    </span>
  );
}
