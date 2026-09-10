import type { ReactNode } from 'react';
import { LEGAL } from '@vouchplay/config';

/**
 * Presentational primitives shared by the Terms and Privacy documents (master_plan §2R). No
 * 'use client' and no server-only imports, so the same content renders both in the server-rendered
 * /terms and /privacy pages and inside the client-side consent gate.
 */

export function LegalDoc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="text-foreground mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-foreground-muted mt-1 text-xs">
        Last updated {LEGAL.effectiveDate} · Version {LEGAL.version}
      </p>
      <div className="mt-6 space-y-6 text-sm leading-relaxed">{children}</div>
    </article>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-foreground text-base font-semibold">{heading}</h2>
      <div className="text-foreground-muted space-y-2">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
