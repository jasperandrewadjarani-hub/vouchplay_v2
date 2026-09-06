import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers to common questions about VouchPlay - vouching, skill, and tournaments.',
};

interface QA {
  q: string;
  a: React.ReactNode;
}
interface Group {
  title: string;
  items: QA[];
}

/** FAQ page (handover §29.1, §5.3.1). Native <details> accordions - accessible, no JS. */
const GROUPS: Group[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'What is VouchPlay?',
        a: 'A community-powered player profile for racket sports. Your skill reputation is built by the players and coaches you actually play with - not by rating yourself - so organizers can run fairer brackets.',
      },
      {
        q: 'How is my information used?',
        a: (
          <>
            We show only the profile fields you choose to make public, and use your data to run
            vouching, tournaments, and safety features. See our{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>{' '}
            for details.
          </>
        ),
      },
      {
        q: 'How do I delete my account?',
        a: (
          <>
            Contact us from{' '}
            <Link href="/me/support" className="text-primary hover:underline">
              Support &amp; appeals
            </Link>{' '}
            and we&apos;ll process your deletion request. Full self-serve deletion is coming.
          </>
        ),
      },
    ],
  },
  {
    title: 'Vouching',
    items: [
      {
        q: 'What is a vouch?',
        a: 'A vouch is one player vouching for another player’s skill level, based on having played with or against them. Vouches are how your Community Skill Level is built.',
      },
      {
        q: 'Is a vouch anonymous?',
        a: 'Your skill rating is anonymous by default - the player you vouch for sees the rating but not who gave it. VouchPlay staff can still see it for safety and anti-abuse. You can choose to make a rating non-anonymous.',
      },
      {
        q: 'Are comments anonymous?',
        a: 'No. Any comment you add to a vouch always shows your name. Only the numeric skill rating can be anonymous.',
      },
      {
        q: 'Can I change my vouch?',
        a: 'Yes. You have one active vouch per player; updating it replaces your previous rating (a short cooldown applies between changes). You can also withdraw it.',
      },
      {
        q: 'What happens if someone rates me incorrectly?',
        a: 'You can request a skill review, or report abuse. Fake or reciprocal-only vouching is detected and can be invalidated by our moderation team.',
      },
      {
        q: 'How do I request a skill review?',
        a: 'Open the player’s profile (or your own concern) and use “Request skill review”. A reviewer looks into whether the displayed skill is materially inaccurate.',
      },
    ],
  },
  {
    title: 'Skill & verification',
    items: [
      {
        q: 'What is Community Skill?',
        a: (
          <>
            Community Skill Level (CSL) is the skill band the community says you play at - a
            weighted median of your vouches. It is never self-declared. See{' '}
            <Link href="/about" className="text-primary hover:underline">
              About
            </Link>{' '}
            for the full skill ladder.
          </>
        ),
      },
      {
        q: 'What is STS?',
        a: 'The Skill-Trust Score (0-5) measures how well-evidenced your skill is: more unique vouchers, higher-weighted vouchers, and more agreement raise it. It is a confidence signal, not a ranking or leaderboard.',
      },
      {
        q: 'What does Skill Verified mean?',
        a: 'A badge shown when your community skill is backed by enough independent, agreeing vouches. It reflects consensus and never changes anyone’s vouch weight.',
      },
      {
        q: 'What does Identity Verified mean?',
        a: 'It confirms you are a real person (a document check reviewed by staff). It does not prove skill and is kept separate from your rating.',
      },
    ],
  },
  {
    title: 'Tournaments & clubs',
    items: [
      {
        q: 'How do tournament eligibility checks work?',
        a: 'When you register, VouchPlay compares your community skill and evidence against the division’s rules and shows the organizer a neutral result (eligible, review, or potential skill mismatch). It is decision-support - it never labels a person and never auto-blocks you.',
      },
      {
        q: 'What if my skill isn’t vouched yet?',
        a: 'You can still register, but organizers may not approve an entry with no community vouches. Get vouched by players who know your game so your level is credible - share your profile and request vouches from real teammates and opponents.',
      },
      {
        q: 'Can organizers override a mismatch?',
        a: 'Yes. The eligibility result is guidance only; the organizer decides, and every override is recorded for accountability.',
      },
      {
        q: 'How do I create or join a club?',
        a: (
          <>
            Browse{' '}
            <Link href="/clubs" className="text-primary hover:underline">
              Clubs
            </Link>{' '}
            to request to join one, or create your own from the Clubs page. Public clubs join
            instantly; others need manager approval.
          </>
        ),
      },
      {
        q: 'How do I find a partner?',
        a: 'For now, invite a partner when you register for a tournament - open a tournament and add your partner by name. A profile-level Partner Finder that suggests compatible partners is coming.',
      },
      {
        q: 'How do I become an Organizer?',
        a: (
          <>
            Apply from your{' '}
            <Link href="/me" className="text-primary hover:underline">
              Me
            </Link>{' '}
            page. An admin reviews the application; once approved you can create and manage
            tournaments.
          </>
        ),
      },
      {
        q: 'How do I become a Coach?',
        a: 'Coach status is granted by VouchPlay admins to verified coaches. Reach out via Support if you coach and would like the Coach role.',
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <section className="vp-in mx-auto max-w-2xl space-y-6">
      <header className="border-border bg-surface vp-hero relative overflow-hidden rounded-2xl border p-6">
        <div className="vp-gradient absolute inset-x-0 top-0 h-1" aria-hidden />
        <h1 className="text-foreground text-2xl font-extrabold tracking-tight">
          Frequently asked questions
        </h1>
        <p className="text-foreground-muted mt-2 text-sm">
          New to VouchPlay? Start with{' '}
          <Link href="/about" className="text-primary hover:underline">
            About
          </Link>
          .
        </p>
      </header>

      {GROUPS.map((group) => (
        <div key={group.title}>
          <h2 className="text-foreground mb-2 text-lg font-semibold">{group.title}</h2>
          <div className="border-border bg-surface divide-border divide-y overflow-hidden rounded-2xl border">
            {group.items.map((item) => (
              <details key={item.q} className="group">
                <summary className="text-foreground hover:bg-surface-muted flex cursor-pointer items-center justify-between gap-3 p-4 text-sm font-medium select-none">
                  <span>{item.q}</span>
                  <span
                    className="text-foreground-muted shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden
                  >
                    ⌄
                  </span>
                </summary>
                <div className="text-foreground-muted px-4 pb-4 text-sm leading-relaxed">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}

      <div className="border-border bg-surface rounded-2xl border p-4 text-center text-sm">
        <p className="text-foreground-muted">Still have a question?</p>
        <Link href="/me/support" className="text-primary font-medium hover:underline">
          Contact support →
        </Link>
      </div>
    </section>
  );
}
