import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewerContext } from '@/lib/auth';
import { getClubBySlug, getClubMembers } from '@/lib/clubs/queries';
import { getClubOffers, getResponsesForClub } from '@/lib/offers/queries';
import { ClubSettingsForm } from '@/components/clubs/club-settings-form';
import { ClubMembersManager } from '@/components/clubs/club-members-manager';
import { ClubDangerZone } from '@/components/clubs/club-danger-zone';
import { OfferCreateForm } from '@/components/offers/offer-create-form';
import { ClubOffersManager } from '@/components/offers/club-offers-manager';

export const metadata: Metadata = { title: 'Manage club' };

interface Params {
  params: Promise<{ slug: string }>;
}

export default async function ManageClubPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewerContext();
  if (!viewer.viewerId) redirect(`/login?next=${encodeURIComponent(`/clubs/${slug}/manage`)}`);

  const club = await getClubBySlug(slug, { viewerId: viewer.viewerId, isStaff: viewer.isStaff });
  if (!club) notFound();
  if (!club.canManage) redirect(`/clubs/${slug}`);

  const members = await getClubMembers(club.id);
  const offers = club.verified ? await getClubOffers(club.id) : [];
  const responsesByOffer = club.verified
    ? Object.fromEntries(await getResponsesForClub(club.id))
    : {};

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link
          href={`/clubs/${slug}`}
          className="text-foreground-muted hover:text-foreground text-sm"
        >
          ← {club.name}
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">Manage club</h1>
      </div>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Members</h2>
        <ClubMembersManager clubId={club.id} slug={slug} members={members} isOwner={club.isOwner} />
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-3 text-base font-semibold">Club settings</h2>
        <ClubSettingsForm
          clubId={club.id}
          slug={slug}
          initial={{
            name: club.name,
            city: club.city,
            description: club.description,
            privacy: club.privacy,
            contact: club.contact,
            logoUrl: club.logoUrl,
          }}
        />
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5">
        <h2 className="text-foreground mb-1 text-base font-semibold">Opportunities</h2>
        <p className="text-foreground-muted mb-3 text-xs">
          Publish recruitment or sponsorship offers for players to respond to.
        </p>
        {club.verified ? (
          <div className="space-y-4">
            <details className="border-border rounded-xl border p-3">
              <summary className="text-foreground cursor-pointer text-sm font-semibold">
                New offer
              </summary>
              <div className="mt-3">
                <OfferCreateForm clubId={club.id} />
              </div>
            </details>
            <ClubOffersManager offers={offers} responsesByOffer={responsesByOffer} />
          </div>
        ) : (
          <p className="text-foreground-muted text-sm">
            Your club must be verified before you can publish offers.
          </p>
        )}
      </section>

      {club.isOwner && (
        <section className="border-border bg-surface rounded-2xl border p-5">
          <h2 className="text-foreground mb-3 text-base font-semibold">Owner controls</h2>
          <ClubDangerZone
            clubId={club.id}
            slug={slug}
            clubName={club.name}
            activityStatus={club.activityStatus}
          />
        </section>
      )}
    </div>
  );
}
