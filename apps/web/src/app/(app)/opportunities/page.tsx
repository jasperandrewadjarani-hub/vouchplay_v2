import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';
import { effectivePlayerSkill, offerRelevanceToPlayer } from '@vouchplay/core';
import { getViewerContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { loadSettingFlag } from '@/lib/settings';
import { listOpenOffers, getMyResponseOfferIds } from '@/lib/offers/queries';
import { OpportunityOptIn } from '@/components/offers/opportunity-optin';
import { OpportunityCard } from '@/components/offers/opportunity-card';

export const metadata: Metadata = { title: 'Opportunities' };

export default async function OpportunitiesPage() {
  const enabled = await loadSettingFlag('recruitment_enabled', true);
  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-foreground-muted text-sm">Opportunities are not available right now.</p>
      </div>
    );
  }

  const viewer = await getViewerContext();
  const offers = await listOpenOffers();

  let optedIn = false;
  let city: string | null = null;
  let skill: number | null = null;
  let respondedIds = new Set<string>();
  if (viewer.viewerId) {
    const svc = createServiceClient();
    const [{ data: profile }, { data: skillRow }, responded] = await Promise.all([
      svc
        .from('profiles')
        .select('city, self_rated_skill, open_for_sponsorship')
        .eq('id', viewer.viewerId)
        .maybeSingle(),
      svc
        .from('player_skill_profiles')
        .select('community_skill_level')
        .eq('player_id', viewer.viewerId)
        .maybeSingle(),
      getMyResponseOfferIds(viewer.viewerId),
    ]);
    const p = profile as {
      city: string | null;
      self_rated_skill: number | null;
      open_for_sponsorship: boolean;
    } | null;
    optedIn = !!p?.open_for_sponsorship;
    city = p?.city ?? null;
    skill = effectivePlayerSkill(
      (skillRow as { community_skill_level: number | null } | null)?.community_skill_level ?? null,
      p?.self_rated_skill ?? null,
    );
    respondedIds = responded;
  }

  const ranked = offers
    .map((offer) => ({
      offer,
      relevance: offerRelevanceToPlayer(
        { city: offer.city, minSkill: offer.minSkill, maxSkill: offer.maxSkill },
        { city, skill },
      ),
    }))
    .sort((a, b) => b.relevance.score - a.relevance.score);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-foreground flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Megaphone size={20} className="text-primary" aria-hidden />
          Opportunities
        </h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Recruitment and sponsorship offers from verified clubs.
        </p>
      </div>

      {viewer.viewerId && <OpportunityOptIn optedIn={optedIn} />}

      {ranked.length === 0 ? (
        <p className="text-foreground-muted text-sm">No open opportunities right now.</p>
      ) : (
        <ul className="space-y-3">
          {ranked.map(({ offer, relevance }) => (
            <OpportunityCard
              key={offer.id}
              offer={offer}
              relevanceLabel={relevance.label}
              canRespond={!!viewer.viewerId && optedIn}
              alreadyResponded={respondedIds.has(offer.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
