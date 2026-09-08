import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/moderation/staff';
import { listClubsForAdministration } from '@/lib/moderation/queries';
import { ClubsPanel } from '@/components/moderation/clubs-panel';

export const metadata: Metadata = { title: 'Club administration' };

/** Broad Admin club management view. Every mutation remains AAL2-staff authorized and audited. */
export default async function AdminClubsPage() {
  await requireAdminPage('/admin/clubs');
  const clubs = await listClubsForAdministration();
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/admin" className="text-foreground-muted hover:text-foreground text-sm">
          ← Admin
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">
          Club administration
        </h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Review every active club. Verification and activity changes require the existing AAL2
          check and are written to the audit log.
        </p>
      </div>
      <ClubsPanel items={clubs} />
    </section>
  );
}
