'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LinkSpinner } from './link-spinner';

type Variant = 'primary' | 'secondary' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-0';

const variants: Record<Variant, string> = {
  primary: 'vp-gradient vp-glow text-white hover:-translate-y-0.5 hover:brightness-110',
  secondary:
    'border border-border bg-surface text-foreground hover:border-primary hover:-translate-y-0.5',
  ghost: 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/**
 * A Next `<Link>` styled as a Button, with a built-in navigation spinner (handover §33.5A - every
 * primary CTA gives immediate feedback on tap). Use for links that read as buttons; keeps native
 * link semantics (prefetch, middle/cmd-click).
 */
export function ButtonLink({
  href,
  variant = 'primary',
  className = '',
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
      <LinkSpinner />
    </Link>
  );
}

/** Submit button that disables + shows a label while the enclosing form action is pending. */
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
  variant = 'primary',
  className = '',
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${base} ${variants[variant]} w-full ${className}`}
    >
      {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {pending ? pendingLabel : children}
    </button>
  );
}
