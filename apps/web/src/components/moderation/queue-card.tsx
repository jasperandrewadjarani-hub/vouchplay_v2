'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface MiniProfile {
  id: string;
  name: string;
  slug: string | null;
}

/** A moderation queue card wrapper: title, status chip, timestamp, and body. */
export function QueueCard({
  title,
  status,
  createdAt,
  children,
}: {
  title: string;
  status: string;
  createdAt: string;
  children: ReactNode;
}) {
  return (
    <article className="border-border bg-surface rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <span className="bg-surface-muted text-foreground-muted shrink-0 rounded-full px-2 py-0.5 text-xs">
          {status}
        </span>
      </div>
      <time className="text-foreground-muted text-xs">
        {new Date(createdAt).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </time>
      {children}
    </article>
  );
}

/** Renders a profile as a link to their public page, or a muted fallback. */
export function MiniLink({ p }: { p: MiniProfile | null }) {
  if (!p) return <span className="text-foreground-muted">unknown</span>;
  if (p.slug)
    return (
      <Link href={`/players/${p.slug}`} className="text-primary font-medium">
        {p.name}
      </Link>
    );
  return <span className="text-foreground font-medium">{p.name}</span>;
}

/** Renders the optional evidence jsonb (note + links). */
export function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const note = typeof evidence?.note === 'string' ? evidence.note : null;
  const links = Array.isArray(evidence?.links)
    ? (evidence.links as unknown[]).filter((l): l is string => typeof l === 'string')
    : [];
  if (!note && links.length === 0) return null;
  return (
    <div className="border-border mt-2 rounded-lg border border-dashed p-2 text-xs">
      <p className="text-foreground-muted font-semibold tracking-wide uppercase">Evidence</p>
      {note && <p className="text-foreground mt-0.5">{note}</p>}
      {links.map((l) => (
        <a
          key={l}
          href={l}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary mt-0.5 block truncate hover:underline"
        >
          {l}
        </a>
      ))}
    </div>
  );
}
