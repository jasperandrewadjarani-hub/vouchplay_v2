import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, CalendarDays, Settings, ExternalLink } from 'lucide-react';
import { getViewerContext } from '@/lib/auth';
import { getTournamentBySlug } from '@/lib/tournaments/queries';
import {
  getViewerRegistrationState,
  type ViewerRegistrationState,
} from '@/lib/tournaments/registration-queries';
import { publicEnv } from '@/lib/env';
import { ShareButton } from '@/components/players/share-button';
import { InterestButton } from '@/components/tournaments/interest-button';
import { TournamentDemandSummary } from '@/components/tournaments/demand-summary';
import { TournamentStatusPill } from '@/components/tournaments/status-pill';
import { ViewerStatusPill } from '@/components/tournaments/viewer-status-pill';
import {
  describeRegistrationStatus,
  type RegistrationHeadline,
} from '@/lib/tournaments/registration-status';
import type { DivisionDTO } from '@/lib/tournaments/dto';
import { getPartnerSummary } from '@/lib/partners/deck';
import { FindPartnerCard } from '@/components/partners/find-partner-card';
import { MyRegistrations } from '@/components/tournaments/my-registrations';
import { PartnerInvitationsCard } from '@/components/tournaments/partner-invitations-card';
import { DivisionBrowser } from '@/components/tournaments/division-browser';
import type { WizardTournament } from '@/components/tournaments/registration-wizard';
import { ClubRepSelector } from '@/components/tournaments/club-rep-selector';
import { RegisterButton } from '@/components/tournaments/register-cta';
import { registerNext } from '@/lib/tournaments/register-link';
import { LinkSpinner } from '@/components/ui/link-spinner';
import { getTournamentDemandSettings, loadSettingNumber } from '@/lib/settings';
import { DEFAULT_SYSTEM_SETTINGS } from '@vouchplay/config';
import { demandOptions, mergeLegacyDemand } from '@/lib/tournaments/demand-options';
import { formatDate, formatDateTime, formatMonthDay } from '@/lib/format-date';

interface Params {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

/**
 * Tournament times are shown in Philippine time for everyone, wherever they are viewing from.
 * Start/end come from date-only inputs, so they render without a clock time; registration open/close
 * are real instants and keep theirs.
 */
function fmt(dt: string | null): string | null {
  return dt ? formatDateTime(dt) : null;
}
function fmtDay(dt: string | null): string | null {
  return dt ? formatDate(dt) : null;
}

/**
 * The viewer's own WORST payment state across every entry plus a bare reservation (master_plan §2AS
 * B) - the header pill beside the tournament status pill. Confirmed < verifying < unsecured, so one
 * unsecured entry among several confirmed ones still reads as the loud "pay now" state. Reuses the
 * same `describeRegistrationStatus` headline every other chip reads, so this can never disagree with
 * the tournament card or the My-registrations card. `null` when the viewer holds nothing at all.
 * Also carries the registrationId behind that worst state (null for a bare-slot reservation, which
 * has no registration) so the pill's "Pay now" can jump straight to the receipt (master_plan §2AT E).
 */
function viewerWorstStatus(
  regState: ViewerRegistrationState,
  divisions: DivisionDTO[],
): { headline: RegistrationHeadline; registrationId: string | null } | null {
  const rank: Record<RegistrationHeadline, number> = { confirmed: 0, verifying: 1, unsecured: 2 };
  const byId = new Map(divisions.map((d) => [d.id, d]));
  let worst: { headline: RegistrationHeadline; registrationId: string | null } | null = null;
  const consider = (headline: RegistrationHeadline, registrationId: string | null) => {
    if (worst === null || rank[headline] > rank[worst.headline])
      worst = { headline, registrationId };
  };

  for (const [divisionId, reg] of Object.entries(regState.registrationsByDivision)) {
    const division = byId.get(divisionId);
    if (!division) continue;
    consider(
      describeRegistrationStatus({
        regStatus: reg.status,
        paymentStatus: reg.paymentStatus,
        fee: division.feeAmount,
        paymentSummary: reg.paymentSummary,
        mySeat: reg.mySeat,
      }).headline,
      reg.id,
    );
  }

  if (regState.bareSlot) {
    consider(
      regState.bareSlot.status === 'verified'
        ? 'confirmed'
        : regState.bareSlot.status === 'rejected'
          ? 'unsecured'
          : 'verifying',
      null,
    );
  }

  return worst;
}

export default async function TournamentPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const viewer = await getViewerContext();
  const t = await getTournamentBySlug(slug, { viewerId: viewer.viewerId, isStaff: viewer.isStaff });
  if (!t) notFound();
  const demandSettings = await getTournamentDemandSettings();

  const authed = viewer.viewerId !== null;
  const isOpen = t.status === 'registration_open';
  const registerable = isOpen || t.status === 'published';
  const [regState, slotHoldMinutes, partnerSummary] = authed
    ? await Promise.all([
        getViewerRegistrationState(t.id, viewer.viewerId as string),
        // How long an unpaid entry holds its slot, for the honest "pay later" warning (§2J).
        loadSettingNumber('slot_hold_minutes', DEFAULT_SYSTEM_SETTINGS.slot_hold_minutes),
        // master_plan §2AV B: the Find-a-partner entry card's counts, gated per viewer.
        getPartnerSummary(t.id, viewer.viewerId),
      ])
    : [null, DEFAULT_SYSTEM_SETTINGS.slot_hold_minutes, await getPartnerSummary(t.id, null)];
  // Shareable link that lands on the registration options (§28.1) when registration is relevant.
  const shareUrl = `${publicEnv.siteUrl}/tournaments/${slug}${registerable ? '?register=1' : ''}`;
  const loginToRegister = `/login?next=${encodeURIComponent(registerNext(slug))}`;
  // master_plan §2AU Decision H: the guest wizard's kill switch, tournament-scoped (Admin setting AND
  // registration_open - see `TournamentDetailDTO.guestRegistrationEnabled` in queries.ts).
  const guestRegistrationEnabled = t.guestRegistrationEnabled;

  // The one slice of tournament data the registration wizard needs, assembled once so every entry
  // point (top Register button, division-row Enter, Pay now, Choose your division) reads the same
  // numbers (master_plan §2AO B).
  const wizardTournament: WizardTournament = {
    id: t.id,
    slug: t.slug,
    name: t.name,
    divisions: t.divisions,
    earlyBird: { startsAt: t.earlyBirdStartsAt, endsAt: t.earlyBirdEndsAt },
    enforceSkillFloor: t.enforceSkillFloor,
    allowPlayDownOneLevel: t.allowPlayDownOneLevel,
    requireSkillVerified: t.requireSkillVerified,
    paymentInstructions: t.paymentInstructions,
    paymentMethods: t.paymentMethods,
    registrationOpen: isOpen,
    slotHoldMinutes,
    registrationCloseAt: t.registrationCloseAt,
    maxClubsPerPlayer: t.maxClubsPerPlayer,
    startAt: t.startAt,
    partnerMatchmakingEnabled: partnerSummary.enabled,
  };
  // The header pill beside the tournament status pill (master_plan §2AS B) - nothing when the viewer
  // holds no entry and no reservation. Also carries the registration (if any) behind the worst
  // headline, so an unsecured pill's "Pay now" jumps straight to that entry's receipt (§2AT E).
  const viewerWorst = regState ? viewerWorstStatus(regState, t.divisions) : null;
  const viewerHeadline = viewerWorst?.headline ?? null;
  const viewerPayHref = viewerWorst?.registrationId
    ? `?pay=${viewerWorst.registrationId}#my-registrations`
    : '#my-registrations';
  const interestOptions = demandOptions(t.divisions);
  // Interest recorded under the old planning taxonomy is folded into the matching division, so the
  // breakdown shows one row per division rather than an old and a new row for the same thing.
  const interestCounts = mergeLegacyDemand(t.demand.divisions, t.divisions);
  const start = fmtDay(t.startAt);
  const regOpen = fmt(t.registrationOpenAt);
  const regClose = fmt(t.registrationCloseAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
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
            {viewerHeadline && (
              <ViewerStatusPill
                headline={viewerHeadline}
                href={viewerHeadline === 'unsecured' ? viewerPayHref : undefined}
              />
            )}
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
            {t.publicOrganizers.length > 0 && (
              <>
                {' '}
                with{' '}
                {t.publicOrganizers.map((o, i) => (
                  <span key={o.slug ?? o.name}>
                    {i > 0 && ', '}
                    {o.slug ? (
                      <Link href={`/players/${o.slug}`} className="text-primary">
                        {o.name}
                      </Link>
                    ) : (
                      o.name
                    )}
                  </span>
                ))}
              </>
            )}
          </p>
          {t.description && <p className="text-foreground text-sm">{t.description}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <RegisterButton
              slug={slug}
              authed={authed}
              open={isOpen}
              tournament={wizardTournament}
              state={regState}
              guestRegistrationEnabled={guestRegistrationEnabled}
            />
            {demandSettings.enabled && (
              <InterestButton
                tournamentId={t.id}
                slug={slug}
                authed={authed}
                interested={t.myInterest}
                options={interestOptions}
              />
            )}
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
          <TournamentDemandSummary
            demand={t.demand}
            options={interestOptions}
            divisionCounts={interestCounts}
          />
        </div>
      </header>

      {/* Find a partner (master_plan §2AV B) - replaces the global looking-for-partner toggle that
          used to sit here (that flag stays on the Players page, unchanged). Onboarded viewers only,
          same gate as the toggle it replaces, plus the feature flag and an actual open doubles
          division to search in. */}
      {authed &&
        regState?.viewerOnboarded &&
        partnerSummary.enabled &&
        partnerSummary.hasOpenDoublesDivisions &&
        isOpen && (
          <FindPartnerCard
            tournamentSlug={slug}
            lookingCount={partnerSummary.lookingCount}
            viewerSearchOpen={partnerSummary.viewerSearchOpen}
            openMatches={partnerSummary.openMatches}
          />
        )}

      {/* Partner invitations: split out above My registrations so a decision the OTHER team made
          never reads as one of the viewer's own entries (master_plan §2AP D). */}
      {authed && regState && regState.invitations.length > 0 && (
        <PartnerInvitationsCard invitations={regState.invitations} />
      )}

      {/* My registrations: collapsed manager of the player's own active entries, after details. */}
      {authed && regState && (
        <MyRegistrations
          tournament={wizardTournament}
          state={regState}
          enteredRegistrationId={typeof sp.entered === 'string' ? sp.entered : null}
          partnerMatchmakingEnabled={partnerSummary.enabled}
        />
      )}

      {/* Division browser: collapsed by default; registers a signed-in player into any division. */}
      <div id={authed ? 'register' : undefined} className="scroll-mt-24">
        <DivisionBrowser
          tournament={wizardTournament}
          state={regState}
          authed={authed}
          signInHref={loginToRegister}
          guestRegistrationEnabled={guestRegistrationEnabled}
        />
      </div>

      {/* Clubs you represent: collapsed, independent of division/team (handover §22). */}
      {authed && regState && (
        <details className="border-border bg-surface rounded-2xl border">
          <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 p-4 text-base font-semibold">
            Clubs you represent
            <span className="text-foreground-muted ml-auto text-xs font-normal">Show</span>
          </summary>
          <div className="border-border border-t p-4">
            <ClubRepSelector
              tournamentId={t.id}
              eligibleClubs={regState.eligibleClubs}
              selected={regState.clubReps.map((r) => r.clubId)}
              max={t.maxClubsPerPlayer}
            />
          </div>
        </details>
      )}

      {/* Anon register prompt - the shared ?register=1 link scrolls here (§19.2, §19.3, §28.1). */}
      {!authed && (
        <div id="register" className="scroll-mt-24">
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
                  {guestRegistrationEnabled
                    ? 'Register now - you can create your account at the end.'
                    : 'Register for this tournament.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <RegisterButton
                    slug={slug}
                    authed={authed}
                    open={isOpen}
                    tournament={wizardTournament}
                    state={regState}
                    guestRegistrationEnabled={guestRegistrationEnabled}
                  />
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
        </div>
      )}

      {t.announcements.length > 0 && (
        <section className="border-border bg-surface rounded-2xl border p-4">
          <h2 className="text-foreground mb-3 text-base font-semibold">Announcements</h2>
          <ul className="space-y-3">
            {t.announcements.map((a) => (
              <li key={a.id} className="border-border border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground text-sm font-semibold">{a.title}</span>
                  <time className="text-foreground-muted text-xs">
                    {formatMonthDay(a.publishedAt)}
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
