import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Users, Award, BadgeCheck } from 'lucide-react';
import { BRAND, SKILL_BANDS } from '@vouchplay/config';

export const metadata: Metadata = {
  title: 'About VouchPlay',
  description: BRAND.tagline,
};

/** About page (handover §29.3, §5.3.1). Mission, how vouching works, the four concepts, skill bands. */
export default function AboutPage() {
  return (
    <section className="vp-in mx-auto max-w-2xl space-y-6">
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-6">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <h1 className="text-foreground text-2xl font-extrabold tracking-tight">
          About <span className="vp-gradient-text">VouchPlay</span>
        </h1>
        <p className="text-foreground-muted mt-2 text-sm leading-relaxed">{BRAND.tagline}</p>
      </header>

      {/* How it works */}
      <div>
        <h2 className="text-foreground mb-3 text-lg font-semibold">How it works</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Step
            icon={Users}
            title="Get vouched"
            body="Players and coaches you've actually played with rate your skill. You never rate your own level."
          />
          <Step
            icon={Award}
            title="Build your profile"
            body="Vouches combine into your Community Skill Level and a Skill-Trust Score that reflect real evidence."
          />
          <Step
            icon={ShieldCheck}
            title="Play fair brackets"
            body="Organizers see trustworthy skill data, so tournament divisions are fairer for everyone."
          />
        </div>
      </div>

      {/* The four concepts */}
      <div>
        <h2 className="text-foreground mb-3 text-lg font-semibold">The four things we measure</h2>
        <div className="space-y-2">
          <Concept
            title="Community Skill Level (CSL)"
            body="The skill band the community says you play at, from a weighted median of your vouches - not a self-rating."
          />
          <Concept
            title="Skill-Trust Score (STS)"
            body="A 0-5 confidence score for how well-evidenced your skill is: more vouchers, higher-weighted vouchers, and more agreement raise it. It is a confidence signal, never a ranking."
          />
          <Concept
            icon={BadgeCheck}
            title="Skill Verified"
            body="A badge that appears when your community skill is backed by enough independent, agreeing vouches. It reflects consensus, and never changes anyone's vouch weight."
          />
          <Concept
            icon={ShieldCheck}
            title="Identity Verified"
            body="Confirms you are a real person (a document check). It does not prove skill and is kept separate from your rating."
          />
        </div>
        <p className="text-foreground-muted mt-2 text-xs">
          These are four separate ideas on purpose - trust in who you are is never mixed with how
          good you play.
        </p>
      </div>

      {/* Skill hierarchy */}
      <div>
        <h2 className="text-foreground mb-3 text-lg font-semibold">Skill levels</h2>
        <ul className="border-border bg-surface divide-border divide-y rounded-2xl border">
          {SKILL_BANDS.map((b) => (
            <li key={b.key} className="flex items-start gap-3 p-3">
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: b.color }}
                aria-hidden
              />
              <div>
                <span className="text-foreground text-sm font-semibold">{b.label}</span>
                {b.blurb && <p className="text-foreground-muted text-xs">{b.blurb}</p>}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-foreground-muted mt-2 text-xs">
          &ldquo;Open&rdquo; and age-defined categories are eligibility groupings, not skill levels.
        </p>
      </div>

      {/* Developed by JT */}
      <div className="border-border bg-surface rounded-2xl border p-5 text-center">
        <p className="text-foreground-muted text-xs">Developed by</p>
        <a
          href={BRAND.jtFacebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-primary mt-1 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
        >
          <Image
            src="/brand/vouchplay-logo-horizontal.png"
            alt="VouchPlay"
            width={866}
            height={288}
            className="h-6 w-auto"
          />
        </a>
        <p className="text-foreground mt-2 text-sm font-medium">{BRAND.developer}</p>
        <a
          href={BRAND.jtFacebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary mt-1 inline-block text-xs font-medium hover:underline"
        >
          Visit us on Facebook →
        </a>
      </div>

      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <Link href="/faq" className="text-primary font-medium hover:underline">
          FAQ
        </Link>
        <Link href="/terms" className="text-foreground-muted hover:text-foreground">
          Terms
        </Link>
        <Link href="/privacy" className="text-foreground-muted hover:text-foreground">
          Privacy
        </Link>
        <Link href="/me/support" className="text-foreground-muted hover:text-foreground">
          Contact support
        </Link>
      </nav>
    </section>
  );
}

function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="border-border bg-surface rounded-2xl border p-4">
      <Icon size={20} className="text-primary" aria-hidden />
      <h3 className="text-foreground mt-2 text-sm font-semibold">{title}</h3>
      <p className="text-foreground-muted mt-1 text-xs leading-relaxed">{body}</p>
    </div>
  );
}

function Concept({
  icon: Icon,
  title,
  body,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="border-border bg-surface rounded-xl border p-3.5">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} className="text-primary" aria-hidden />}
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-foreground-muted mt-1 text-xs leading-relaxed">{body}</p>
    </div>
  );
}
