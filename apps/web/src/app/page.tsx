import { PagePlaceholder } from '@/components/page-placeholder';

export default function HomePage() {
  return (
    <PagePlaceholder title="Home" phase="Phase 6 · Dashboard">
      <p className="text-foreground mb-3">
        Your personalized dashboard — not a social feed (handover §6).
      </p>
      <p>
        Will surface: skill &amp; STS summary, action-required cards, upcoming tournament
        registrations, partner &amp; vouch requests, club activity, tournament discovery, and recent
        vouches.
      </p>
    </PagePlaceholder>
  );
}
