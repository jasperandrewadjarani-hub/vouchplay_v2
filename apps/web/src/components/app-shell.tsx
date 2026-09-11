import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wrench, Megaphone, ShieldAlert } from 'lucide-react';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { BottomNav } from './bottom-nav';
import { PageResumeRefresh } from './ui/page-resume-refresh';
import { WelcomeModal } from './welcome-modal';
import { LegalConsentGate } from './legal/legal-consent-gate';
import { SiteFooter } from './site-footer';
import { IdentityNudgeBanner } from './identity/identity-nudge-banner';
import { loadSettingFlag, loadSettingText } from '@/lib/settings';
import { viewerIsStaff } from '@/lib/moderation/staff';
import {
  getOptionalUser,
  getViewerReputationNudge,
  getViewerLegalStatus,
  getViewerIdentityNudge,
} from '@/lib/auth';

/**
 * App shell: sticky header, desktop sidebar, mobile bottom nav, centered max-width content
 * (handover §5.4). Also renders the admin-controlled site-wide announcement banner and enforces
 * maintenance mode (§30.7) - when on, non-staff visitors see a maintenance screen; staff keep full
 * access so they can turn it back off from /admin.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [bannerEnabled, bannerText, maintenance, welcomeEnabled] = await Promise.all([
    loadSettingFlag('announcement_banner_enabled', false),
    loadSettingText('announcement_banner', ''),
    loadSettingFlag('maintenance_mode', false),
    loadSettingFlag('welcome_modal_enabled', false),
  ]);
  const showBanner = bannerEnabled && bannerText.trim().length > 0;
  const staff = maintenance ? await viewerIsStaff() : false;
  const gated = maintenance && !staff;
  // Nudge an onboarded player who has no vouches yet: their reputation is empty until people they
  // have played with vouch for them (§2O). Skipped under maintenance gating.
  const nudge = gated ? { unvouched: false, slug: null } : await getViewerReputationNudge();
  // Identity self-nudge (master_plan §2AG Phase C, D2): only one self-nudge strip is ever visible at
  // a time, and the unvouched nudge wins when both would otherwise show - so this is skipped
  // entirely whenever that one is already showing.
  const identityNudge = gated || nudge.unvouched ? { show: false } : await getViewerIdentityNudge();
  // Blocking Terms/Privacy acceptance (§2R). Skipped under maintenance gating (staff resolve that
  // first) and fail-open in the reader, so it never locks anyone out. Rendered as an overlay below.
  const legal = gated ? { needsAcceptance: false } : await getViewerLegalStatus();

  // Launch/campaign pop-up: only loaded when an Admin has switched it on.
  const welcome = welcomeEnabled
    ? await (async () => {
        const [
          version,
          headline,
          subhead,
          eventLabel,
          eventName,
          detail,
          ctaNote,
          imageUrl,
          linkUrl,
          user,
        ] = await Promise.all([
          loadSettingText('welcome_modal_version', ''),
          loadSettingText('welcome_modal_headline', ''),
          loadSettingText('welcome_modal_subhead', ''),
          loadSettingText('welcome_modal_event_label', ''),
          loadSettingText('welcome_modal_event_name', ''),
          loadSettingText('welcome_modal_detail', ''),
          loadSettingText('welcome_modal_cta_note', ''),
          loadSettingText('welcome_modal_image_url', ''),
          loadSettingText('welcome_modal_link_url', ''),
          getOptionalUser(),
        ]);
        if (!headline.trim()) return null;
        return {
          copy: {
            version: version.trim() || 'default',
            headline,
            subhead,
            eventLabel,
            eventName,
            detail,
            ctaNote,
            imageUrl: imageUrl.trim(),
            linkUrl: linkUrl.trim(),
          },
          authed: !!user,
        };
      })()
    : null;

  return (
    <div className="min-h-dvh">
      <PageResumeRefresh />
      {welcome && !gated && <WelcomeModal copy={welcome.copy} authed={welcome.authed} />}
      {showBanner && (
        <div className="vp-gradient text-white">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm font-medium">
            <Megaphone size={16} className="shrink-0" aria-hidden />
            <span className="min-w-0">{bannerText.trim()}</span>
          </div>
        </div>
      )}
      <Header />
      {/* A quiet amber strip just below the logo for a player with no vouches yet - a nudge, not an
          interruption. It links to their profile so they can share it and ask for vouches (§2O). */}
      {nudge.unvouched && !gated && (
        <div className="border-warning/40 bg-warning/10 border-b">
          <div className="text-foreground mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-xs sm:text-sm">
            <ShieldAlert size={16} className="text-warning shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              Your profile has no vouches yet. Ask players you&rsquo;ve played with to vouch for you
              so your skill is trusted.
            </span>
            {nudge.slug && (
              <Link
                href={`/players/${nudge.slug}`}
                className="text-warning shrink-0 font-semibold underline underline-offset-2"
              >
                My profile
              </Link>
            )}
          </div>
        </div>
      )}
      {identityNudge.show && !gated && <IdentityNudgeBanner />}
      <div className="mx-auto flex w-full max-w-6xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:pb-8">
          {gated ? <MaintenanceScreen /> : children}
          {!gated && <SiteFooter />}
        </main>
      </div>
      <BottomNav />
      {legal.needsAcceptance && <LegalConsentGate />}
    </div>
  );
}

function MaintenanceScreen() {
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <div className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-8">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <Wrench className="text-primary mx-auto" size={28} aria-hidden />
        <h1 className="text-foreground mt-3 text-lg font-semibold">We&rsquo;ll be right back</h1>
        <p className="text-foreground-muted mt-2 text-sm">
          VouchPlay is undergoing scheduled maintenance. Please check back shortly.
        </p>
      </div>
    </section>
  );
}
