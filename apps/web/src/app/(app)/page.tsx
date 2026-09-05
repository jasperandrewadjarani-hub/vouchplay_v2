import type { ReactNode } from 'react';
import Link from 'next/link';
import { Users, ShieldCheck, Trophy } from 'lucide-react';
import { getOptionalUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const user = await getOptionalUser();

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="border-border bg-surface vp-hero vp-in relative overflow-hidden rounded-3xl border p-7 sm:p-10">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <p className="vp-label text-primary mb-3">Community-verified skill</p>
        <h1 className="text-foreground max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Your game, <span className="vp-gradient-text">vouched for</span> by the players you
          actually play with.
        </h1>
        <p className="text-foreground-muted mt-3 max-w-xl text-sm sm:text-base">
          Skill reputation built by real community vouches — not self-declaration. Find players,
          build a trusted profile, and give organizers the evidence to run fair brackets.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/players">
            <Button className="px-5 py-3">Browse players</Button>
          </Link>
          {user ? (
            <Link href="/me">
              <Button variant="secondary" className="px-5 py-3">
                My profile
              </Button>
            </Link>
          ) : (
            <Link href="/signup">
              <Button variant="secondary" className="px-5 py-3">
                Create your profile
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* What you can do */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FeatureCard
          icon={<Users size={20} aria-hidden />}
          title="Discover players"
          body="Search the directory by skill, city and role. Every profile is backed by community vouches."
        />
        <FeatureCard
          icon={<ShieldCheck size={20} aria-hidden />}
          title="Build trust"
          body="Get vouched by players and coaches. Your Community Skill and Skill-Trust Score grow with real evidence."
        />
        <FeatureCard
          icon={<Trophy size={20} aria-hidden />}
          title="Play more"
          body="Join clubs, find partners, and register for tournaments with a profile organizers can trust."
        />
      </section>

      <p className="text-foreground-muted text-center text-xs">
        Your personalized dashboard — skill summary, requests, and tournament activity — arrives in a
        later release (handover §6).
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="border-border bg-surface vp-card rounded-2xl border p-5">
      <span className="vp-gradient text-white inline-flex h-10 w-10 items-center justify-center rounded-xl">
        {icon}
      </span>
      <h2 className="text-foreground mt-3 font-semibold">{title}</h2>
      <p className="text-foreground-muted mt-1 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
