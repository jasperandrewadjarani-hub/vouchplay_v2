import type { ReactNode } from 'react';
import { Wrench, Megaphone } from 'lucide-react';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { BottomNav } from './bottom-nav';
import { loadSettingFlag, loadSettingText } from '@/lib/settings';
import { viewerIsStaff } from '@/lib/moderation/staff';

/**
 * App shell: sticky header, desktop sidebar, mobile bottom nav, centered max-width content
 * (handover §5.4). Also renders the admin-controlled site-wide announcement banner and enforces
 * maintenance mode (§30.7) - when on, non-staff visitors see a maintenance screen; staff keep full
 * access so they can turn it back off from /admin.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [bannerEnabled, bannerText, maintenance] = await Promise.all([
    loadSettingFlag('announcement_banner_enabled', false),
    loadSettingText('announcement_banner', ''),
    loadSettingFlag('maintenance_mode', false),
  ]);
  const showBanner = bannerEnabled && bannerText.trim().length > 0;
  const staff = maintenance ? await viewerIsStaff() : false;
  const gated = maintenance && !staff;

  return (
    <div className="min-h-dvh">
      {showBanner && (
        <div className="vp-gradient text-white">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm font-medium">
            <Megaphone size={16} className="shrink-0" aria-hidden />
            <span className="min-w-0">{bannerText.trim()}</span>
          </div>
        </div>
      )}
      <Header />
      <div className="mx-auto flex w-full max-w-6xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:pb-8">
          {gated ? <MaintenanceScreen /> : children}
        </main>
      </div>
      <BottomNav />
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
