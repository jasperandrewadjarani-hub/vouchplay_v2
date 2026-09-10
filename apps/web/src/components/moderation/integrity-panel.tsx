'use client';

import { useState, useTransition } from 'react';
import { skillByOrdinal, FRAUD_FLAG_STATUS_LABELS, type FraudFlagStatus } from '@vouchplay/config';
import type { IntegrityQueueItem } from '@/lib/moderation/queries';
import { reinstateHeldVouches, keepHold, reviewFraudFlag } from '@/lib/actions/moderation';
import { QueueCard, MiniLink } from './queue-card';

/**
 * Staff → Moderation → "Vouch integrity" (master_plan §2AF "Workflow and UX"): the STS_V2 anomaly
 * queue. Plain-language, calm, non-accusatory by design - no voucher identity ever appears here, only
 * a subject, a reason, the honest evidence numbers, and a few reversible actions. The generic Fraud
 * flags tab still lists these rows too (unchanged, §2AF E4 scope note); this panel is the friendlier
 * front door for the same underlying `fraud_flags` rows.
 */

const FLAG_TITLES: Record<string, string> = {
  VELOCITY_BURST: 'Sudden burst of vouches',
  LOW_TRUST_SWARM: 'Many vouches from brand-new accounts',
  RECIPROCAL_RING: 'Mutual vouching group',
  CLUB_BLOC: 'One club is driving this rating',
  SPIKE: 'Rating looks out of line with the evidence',
};

const SEVERITY_STYLE: Record<string, string> = {
  high: 'bg-danger/10 text-danger',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-surface-muted text-foreground-muted',
};

function bandLabel(ordinal: number | null): string {
  if (ordinal == null) return '—';
  return skillByOrdinal(Math.round(ordinal))?.label ?? String(ordinal);
}

/** One labelled stat in the compact skill line. */
function SkillStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-background rounded-lg border px-2 py-1.5 text-center">
      <p className="text-foreground-muted text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground text-xs font-semibold">{value}</p>
    </div>
  );
}

/**
 * Shared note + action buttons for one integrity card. Every action here requires a short note
 * (§2AF "every action audited") - the same reasoning as `ResolveForm`, but with multiple
 * differently-shaped actions sharing one note field instead of a single status dropdown.
 */
function IntegrityActions({ item }: { item: IntegrityQueueItem }) {
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const canReleaseHold = item.flagType === 'VELOCITY_BURST' && item.heldCount > 0;
  const disabled = pending || !note.trim();

  function run(action: () => ReturnType<typeof reviewFraudFlag>) {
    setMsg(null);
    start(async () => {
      const res = await action();
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
      if (res.ok) setNote('');
    });
  }

  const input =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';
  const primaryBtn =
    'vp-gradient min-h-11 inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50';
  const secondaryBtn =
    'border-border text-foreground min-h-11 inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50';

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="A short note (required)"
        aria-label="Note for this action"
        className={input}
      />
      <div className="flex flex-wrap gap-2">
        {canReleaseHold && (
          <>
            <button
              type="button"
              onClick={() => run(() => reinstateHeldVouches(item.id, note))}
              disabled={disabled}
              className={primaryBtn}
            >
              {pending ? 'Saving…' : 'Release the held vouches'}
            </button>
            <button
              type="button"
              onClick={() => run(() => keepHold(item.id, note))}
              disabled={disabled}
              className={secondaryBtn}
            >
              Keep them on hold
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => run(() => reviewFraudFlag(item.id, 'cleared', note))}
          disabled={disabled}
          className={secondaryBtn}
        >
          Mark reviewed – nothing wrong
        </button>
        <button
          type="button"
          onClick={() => run(() => reviewFraudFlag(item.id, 'action_taken', note))}
          disabled={disabled}
          className={secondaryBtn}
        >
          Mark reviewed – action taken
        </button>
      </div>
      <p className="text-foreground-muted text-xs">
        Releasing puts the vouches back into the rating. Nothing here is visible to players.
      </p>
      {msg && <p className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}

export function IntegrityPanel({ items }: { items: IntegrityQueueItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-foreground-muted border-border bg-surface rounded-2xl border p-6 text-center text-sm">
        No integrity flags right now.
      </p>
    );

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <QueueCard
          key={item.id}
          title={FLAG_TITLES[item.flagType] ?? item.flagType}
          status={FRAUD_FLAG_STATUS_LABELS[item.status as FraudFlagStatus] ?? item.status}
          createdAt={item.createdAt}
        >
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.severity && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.low
                }`}
              >
                {item.severity}
              </span>
            )}
            <span className="text-foreground-muted text-xs">
              <MiniLink p={item.subject} />
            </span>
          </div>

          {item.reason && <p className="text-foreground mt-1.5 text-sm">{item.reason}</p>}

          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <SkillStat label="Self-rated" value={bandLabel(item.skill.self)} />
            <SkillStat label="Community (current)" value={bandLabel(item.skill.v1.csl)} />
            <SkillStat
              label="Independent-evidence model"
              value={item.skill.v2 ? bandLabel(item.skill.v2.csl) : '—'}
            />
            <SkillStat
              label="Independent players"
              value={item.skill.nEff != null ? item.skill.nEff.toFixed(1) : '—'}
            />
          </div>

          {item.heldCount > 0 && (
            <p className="text-warning mt-2 text-xs font-medium">
              {item.heldCount} vouch{item.heldCount === 1 ? '' : 'es'} are on hold and not counting.
            </p>
          )}

          <IntegrityActions item={item} />
        </QueueCard>
      ))}
    </div>
  );
}
