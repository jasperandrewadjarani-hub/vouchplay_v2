import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, CalendarDays, Users, Settings, ExternalLink, ClipboardCheck } from 'lucide-react';
import { getViewerContext } from '@/lib/auth';
import { getTournamentBySlug } from '@/lib/tournaments/queries';
import { getViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { publicEnv } from '@/lib/env';
import { ShareButton } from '@/components/players/share-button';
import { InterestButton } from '@/components/tournaments/interest-button';
import { DivisionList } from '@/components/tournaments/division-list';
import { TournamentStatusPill } from '@/components/tournaments/status-pill';
import { RegistrationPanel } from '@/components/tournaments/registration-panel';
import {
  RegisterButton,
  RegisterAnchorScroll,
  registerNext,
} from '@/components/tournaments/register-cta';
import { LinkSpinner } from '@/components/ui/link-spinner';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTournamentBySlug(slug, { viewerId: null, isStaff: false });
  if (!t) return { title: 'Tournament not found' };
  const url = `${publicEnv.siteUrl}/tournaments/${slug}`;
  const description =
    t.description?.trim() ||
    `${t.name}${t.city ? ` · ${t.city}` : ''} - a tournament on VouchPlay.`;
  return {
    title: t.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: `${t.name} · VouchPlay`,
      description,
      images: t.coverUrl ? [{ url: t.coverUrl }] : undefined,
    },
  };
}

function fmt(dt: string | null): string | null {
  if (!dt) return null;
  return new Date(dt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function TournamentPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewerContext();
  const t = await getTournamentBySlug(slug, { viewerId: viewer.viewerId, isStaff: viewer.isStaff });
  if (!t) notFound();

  const authed = viewer.viewerId !== null;
  const isOpen = t.status === 'registration_open';
  const registerable = isOpen || t.status === 'published';
  const regState =
    authed && isOpen ? await getViewerRegistrationState(t.id, viewer.viewerId as string) : null;
  // Shareable link that lands on the registration options (§28.1) when registration is relevant.
  const shareUrl = `${publicEnv.siteUrl}/tournaments/${slug}${registerable ? '?register=1' : ''}`;
  const signupToRegister = `/signup?next=${encodeURIComponent(registerNext(slug))}`;
  const loginToRegister = `/login?next=${encodeURIComponent(registerNext(slug))}`;
  const start = fmt(t.startAt);
  const regOpen = fmt(t.registrationOpenAt);
  const regClose = fmt(t.registrationCloseAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <RegisterAnchorScroll />
      <Link href="/tournaments" className="text-foreground-muted hover:text-foreground text-sm">
        ← All tournaments
      </Link>

      <header className="border-border bg-surface overflow-hidden rounded-2xl border">
        {t.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.coverUrl} alt={t.name} className="h-44 w-full object-cover" />
        )}
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <TournamentStatusPill status={t.status} />
            {t.visibility === 'unlisted' && <span className="vp-label">Unlisted</span>}
          </div>
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">{t.name}</h1>
          <div className="text-foreground-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {t.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} aria-hidden />
                {t.venueName ? `${t.venueName}, ${t.city}` : t.city}
              </span>
            )}
            {start && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={14} aria-hidden />
                {start}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users size={14} aria-hidden />
              {t.interestedCount} interested
            </span>
          </div>
          <p className="text-foreground-muted text-xs">
            Organized by{' '}
            {t.ownerSlug ? (
              <Link href={`/players/${t.ownerSlug}`} className="text-primary">
                {t.ownerName}
              </Link>
            ) : (
              t.ownerName
            )}
          </p>
          {t.description && <p className="text-foreground text-sm">{t.description}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <RegisterButton slug={slug} authed={authed} open={isOpen} />
            <InterestButton
              tournamentId={t.id}
              slug={slug}
              authed={authed}
              interested={t.myInterest}
            />
            <ShareButton
              url={shareUrl}
              title={`${t.name} on VouchPlay`}
              text={registerable ? `Register for ${t.name} on VouchPlay` : `${t.name} on VouchPlay`}
            />
            {t.canManage && (
              <Link
                href={`/tournaments/${slug}/manage`}
                className="border-border bg-surface text-foreground hover:bg-surface-muted inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium"
              >
                <Settings size={15} aria-hidden />
                Manage
                <LinkSpinner />
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="border-border bg-surface rounded-2xl border p-4">
        <h2 className="text-foreground mb-3 text-base font-semibold">Divisions</h2>
        <DivisionList divisions={t.divisions} />
      </section>

      {/* Registration - the shared ?register=1 link scrolls here (handover §19.2, §19.3, §28.1). */}
      <div id="register" className="scroll-mt-24">
        {isOpen && authed && regState ? (
          <RegistrationPanel
            tournamentId={t.id}
            maxClubsPerPlayer={t.maxClubsPerPlayer}
            paymentInstructions={t.paymentInstructions}
            paymentMethods={t.paymentMethods}
            divisions={t.divisions}
            state={regState}
          />
        ) : (
          <section className="border-primary/30 bg-primary/5 rounded-2xl border p-4">
            <h2 className="text-foreground mb-2 text-base font-semibold">Register</h2>
            {(regOpen || regClose) && (
              <p className="text-foreground-muted text-sm">
                {regOpen && <>Opens {regOpen}. </>}
                {regClose && <>Closes {regClose}.</>}
              </p>
            )}
            {isOpen && !authed ? (
              <div className="mt-3">
                <p className="text-foreground text-sm font-medium">Join this tournament</p>
                <p className="text-foreground-muted mt-1 text-sm">
                  Create a free VouchPlay account to register your team. It only takes a minute, and
                  you&apos;ll pick up right where you left off.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={signupToRegister}
                    className="vp-gradient vp-glow inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <ClipboardCheck size={16} aria-hidden />
                    Create account &amp; register
                  </Link>
                  <Link
                    href={loginToRegister}
                    className="border-border text-foreground hover:bg-surface-muted inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-foreground-muted mt-1 text-sm">
                {t.status === 'published'
                  ? 'Registration has not opened yet - tap "I\'m interested" to get notified.'
                  : 'Registration is closed for this tournament.'}
              </p>
            )}
          </section>
        )}
      </div>

      {t.announcements.length > 0 && (
        <section className="border-border bg-surface rounded-2xl border p-4">
          <h2 className="text-foreground mb-3 text-base font-semibold">Announcements</h2>
          <ul className="space-y-3">
            {t.announcements.map((a) => (
              <li key={a.id} className="border-border border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground text-sm font-semibold">{a.title}</span>
                  <time className="text-foreground-muted text-xs">
                    {new Date(a.publishedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </div>
                <p className="text-foreground mt-0.5 text-sm whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(t.termsText || t.contact || t.paymentInstructions) && (
        <section className="border-border bg-surface space-y-3 rounded-2xl border p-4 text-sm">
          {t.contact && (
            <p>
              <span className="text-foreground-muted">Contact: </span>
              <a
                href={/^https?:\/\//i.test(t.contact) ? t.contact : `https://${t.contact}`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary inline-flex items-center gap-1 hover:underline"
              >
                <ExternalLink size={13} aria-hidden />
                {t.contact}
              </a>
            </p>
          )}
          {t.termsText && (
            <div>
              <p className="text-foreground-muted mb-1">Terms &amp; rules</p>
              <p className="text-foreground whitespace-pre-wrap">{t.termsText}</p>
            </div>
          )}
          {t.paymentInstructions && (
            <div>
              <p className="text-foreground-muted mb-1">Payment instructions</p>
              <p className="text-foreground whitespace-pre-wrap">{t.paymentInstructions}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
