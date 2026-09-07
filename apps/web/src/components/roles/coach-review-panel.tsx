'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, FileLock2, ShieldAlert } from 'lucide-react';
import type { CoachReviewDetail } from '@/lib/coach/queries';
import {
  decideCoachApplication,
  getCoachEvidenceSignedUrl,
  startCoachReview,
} from '@/lib/actions/coach';
import { LinkSpinner } from '@/components/ui/link-spinner';

export function CoachReviewPanel({ detail }: { detail: CoachReviewDetail }) {
  const router = useRouter();
  const [applicantReason, setApplicantReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [evidenceLinks, setEvidenceLinks] = useState<Record<string, string>>({});
  const answers = detail.answers;

  function run(
    key: string,
    action: () => Promise<{ ok?: boolean; error?: string; message?: string }>,
  ) {
    setMessage(null);
    setBusy(key);
    startTransition(async () => {
      const result = await action();
      setMessage({ ok: !!result.ok, text: result.message ?? result.error ?? 'Action failed.' });
      setBusy(null);
      if (result.ok) router.refresh();
    });
  }

  function decide(decision: 'request_information' | 'approve' | 'reject') {
    run(decision, () => decideCoachApplication(detail.id, decision, applicantReason, internalNote));
  }

  function openEvidence(id: string) {
    setMessage(null);
    setBusy(`evidence:${id}`);
    startTransition(async () => {
      const result = await getCoachEvidenceSignedUrl(id);
      if (result.url) setEvidenceLinks((current) => ({ ...current, [id]: result.url! }));
      else setMessage({ ok: false, text: result.error ?? 'Could not open evidence.' });
      setBusy(null);
    });
  }

  const open = ['pending', 'reviewing', 'information_requested'].includes(detail.status);
  const rows: Array<[string, unknown]> = [
    ['Experience', answers.experience],
    ['Years', answers.yearsExperience],
    ['Organizations', answers.organizations],
    ['Locations', answers.locations],
    [
      'Specialties',
      Array.isArray(answers.specialties) ? answers.specialties.join(', ') : answers.specialties,
    ],
    ['Certifications', answers.certifications],
    ['Applicant note', answers.note],
  ];
  const references = Array.isArray(answers.references) ? answers.references.map(String) : [];

  return (
    <div className="space-y-4">
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-5">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-primary text-xs font-semibold tracking-widest uppercase">
              Coach application
            </p>
            <h1 className="text-foreground mt-1 text-xl font-semibold">{detail.applicantName}</h1>
            <p className="text-foreground-muted text-sm">
              {detail.city ?? 'City not supplied'} · account {detail.accountStatus}
            </p>
          </div>
          <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold capitalize">
            {detail.status.replaceAll('_', ' ')}
          </span>
        </div>
        {detail.applicantSlug && (
          <Link
            href={`/players/${detail.applicantSlug}`}
            className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium"
          >
            Open public profile <ExternalLink size={14} /> <LinkSpinner size={14} />
          </Link>
        )}
      </header>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground font-semibold">Application answers</h2>
        <dl className="mt-3 space-y-3">
          {rows.map(([label, value]) =>
            value !== null && value !== undefined && String(value).trim() ? (
              <div key={label}>
                <dt className="text-foreground-muted text-xs font-medium uppercase">{label}</dt>
                <dd className="text-foreground mt-0.5 text-sm whitespace-pre-wrap">
                  {String(value)}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
        {references.length > 0 && (
          <div className="mt-4">
            <h3 className="text-foreground-muted text-xs font-medium uppercase">
              Public references
            </h3>
            <ul className="mt-1 space-y-1">
              {references.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm break-all"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <FileLock2 className="text-primary" size={18} aria-hidden />
          <h2 className="text-foreground font-semibold">Private evidence</h2>
        </div>
        {detail.evidence.length === 0 ? (
          <p className="text-foreground-muted mt-2 text-sm">No private evidence attached.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {detail.evidence.map((file) => (
              <li
                key={file.id}
                className="border-border flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">{file.filename}</p>
                  <p className="text-foreground-muted text-xs">
                    {file.mimeType} · {(file.sizeBytes / 1024).toFixed(0)} KB
                  </p>
                </div>
                {evidenceLinks[file.id] ? (
                  <a
                    href={evidenceLinks[file.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-border text-foreground inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                  >
                    Open private file <ExternalLink size={12} aria-hidden />
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    aria-busy={busy === `evidence:${file.id}`}
                    onClick={() => openEvidence(file.id)}
                    className="border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {busy === `evidence:${file.id}` ? 'Authorizing…' : 'Create secure link'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-warning" size={18} aria-hidden />
          <h2 className="text-foreground font-semibold">Relevant safety facts</h2>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Fact label="Open reports" value={detail.safety.openReports} />
          <Fact label="Open high-risk flags" value={detail.safety.openFraudFlags} />
          <Fact label="Prior role decisions" value={detail.safety.priorRoleDecisions} />
        </dl>
      </section>

      {open && (
        <section className="border-border bg-surface rounded-2xl border p-5">
          <h2 className="text-foreground font-semibold">Decision</h2>
          {detail.status === 'pending' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run('start', () => startCoachReview(detail.id))}
              className="border-border text-foreground mt-3 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === 'start' ? 'Starting…' : 'Start review'}
            </button>
          )}
          <label className="text-foreground mt-4 block text-sm font-medium">
            Applicant-facing reason
            <textarea
              value={applicantReason}
              onChange={(e) => setApplicantReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className="border-border bg-background text-foreground mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Required for information requests and rejection"
            />
          </label>
          <label className="text-foreground mt-3 block text-sm font-medium">
            Internal confirmation note
            <textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              rows={3}
              maxLength={2000}
              className="border-border bg-background text-foreground mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Required for approval; never shown to the applicant"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.status !== 'information_requested' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => decide('request_information')}
                className="border-border text-foreground rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy === 'request_information' ? 'Requesting…' : 'Request information'}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => decide('approve')}
              className="vp-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide('reject')}
              className="border-danger/40 text-danger rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={`mt-3 text-sm ${message.ok ? 'text-success' : 'text-danger'}`}
            >
              {message.text}
            </p>
          )}
        </section>
      )}

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground text-sm font-semibold">Decision history</h2>
        {detail.auditHistory.length === 0 ? (
          <p className="text-foreground-muted mt-2 text-sm">No decisions recorded.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {detail.auditHistory.map((event) => (
              <li key={event.id} className="border-border border-l-2 pl-3 text-sm">
                <p className="text-foreground font-medium">{event.action}</p>
                {event.reason && <p className="text-foreground-muted">{event.reason}</p>}
                <time className="text-foreground-muted text-xs">
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background rounded-xl p-3">
      <dd className="text-foreground text-lg font-semibold">{value}</dd>
      <dt className="text-foreground-muted text-[11px]">{label}</dt>
    </div>
  );
}
