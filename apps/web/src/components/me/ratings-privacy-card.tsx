'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { setRatingsPrivacy } from '@/lib/actions/profile';

type Field = 'community_rating' | 'self_rating';

/**
 * "Who can see my ratings" (master_plan §2AW) - lives on ME directly under the profile header, and
 * again on Privacy settings above the leaderboard form. Two independent switches: ON (eye) = everyone
 * can see it, OFF (lock) = private - only the owner, tournament organizers of a tournament the player
 * is entered in, and staff. Optimistic: the switch moves immediately and reverts only if the save
 * fails, matching `AvailabilityCard`'s pattern elsewhere on this page.
 */
export function RatingsPrivacyCard({
  communityHidden,
  selfHidden,
}: {
  communityHidden: boolean;
  selfHidden: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState({
    community_rating: communityHidden,
    self_rating: selfHidden,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(field: Field, nextVisible: boolean) {
    const nextHidden = !nextVisible;
    const previous = hidden[field];
    setError(null);
    setHidden((prev) => ({ ...prev, [field]: nextHidden }));
    start(async () => {
      const res = await setRatingsPrivacy(field, nextHidden);
      if (res.ok) {
        router.refresh();
      } else {
        setHidden((prev) => ({ ...prev, [field]: previous }));
        setError(res.error ?? 'Could not save that setting. Please try again.');
      }
    });
  }

  return (
    <div className="border-border bg-surface space-y-1 rounded-2xl border p-4">
      <h2 className="text-foreground text-sm font-semibold">Who can see my ratings</h2>
      <div className="divide-border -mx-1 divide-y">
        <div className="px-1">
          <Switch
            id="ratings-privacy-community"
            checked={!hidden.community_rating}
            onCheckedChange={(on) => toggle('community_rating', on)}
            disabled={pending}
            iconOn={Eye}
            iconOff={Lock}
            label="Community rating & vouch meter"
            description={
              hidden.community_rating
                ? 'Private - only you, organizers and staff'
                : 'Everyone can see this'
            }
          />
        </div>
        <div className="px-1">
          <Switch
            id="ratings-privacy-self"
            checked={!hidden.self_rating}
            onCheckedChange={(on) => toggle('self_rating', on)}
            disabled={pending}
            iconOn={Eye}
            iconOff={Lock}
            label="Self-rated skill"
            description={
              hidden.self_rating
                ? 'Private - only you, organizers and staff'
                : 'Everyone can see this'
            }
          />
        </div>
      </div>
      {error && (
        <p className="text-danger text-xs" role="status">
          {error}
        </p>
      )}
      <p className="text-foreground-muted pt-1 text-xs">
        Going private hides the rating from other players. Tournament organizers, admins and staff
        can still see it, and people can still vouch for you and leave comments.
      </p>
    </div>
  );
}
