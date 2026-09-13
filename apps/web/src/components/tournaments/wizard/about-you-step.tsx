'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SKILL_BANDS } from '@vouchplay/config';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { registerNext } from '@/lib/tournaments/register-link';
import type { GuestFacts } from './types';

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Step 0, guests only (master_plan §2AU Decision A): five facts, one screen, big controls - the same
 * facts onboarding asks for anyway, front-loaded so the Division step right after can be honest about
 * eligibility. Collects only - nothing is created until Pay actually commits (Decision D). A hidden
 * honeypot (`website`) rides along for the server to quietly refuse bots (Decision G).
 */
export function AboutYouStep({
  slug,
  initial,
  onContinue,
}: {
  slug: string;
  /** Re-fills the form after Back from Division - the wizard keeps whatever was collected before. */
  initial?: Partial<GuestFacts> | null;
  onContinue: (facts: GuestFacts) => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [sex, setSex] = useState<'male' | 'female' | null>(initial?.sex ?? null);
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? '');
  const [selfRatedSkill, setSelfRatedSkill] = useState<number | null>(
    initial?.selfRatedSkill ?? null,
  );
  const [acceptedTerms, setAcceptedTerms] = useState(initial?.acceptedTerms ?? false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !sex ||
      selfRatedSkill == null ||
      !acceptedTerms
    ) {
      setError('Please fill in your details and agree to the Terms to continue.');
      return;
    }
    setError(null);
    onContinue({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      sex,
      dateOfBirth,
      selfRatedSkill,
      acceptedTerms,
      website,
    });
  }

  return (
    <div className="space-y-4">
      {/* Honeypot (master_plan §2AU Decision G) - visually and programmatically hidden; a real
          visitor never tabs into or fills it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      >
        <label htmlFor="ay-website">Website</label>
        <input
          id="ay-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="ay-first-name" required>
          <Input
            id="ay-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            required
          />
        </Field>
        <Field label="Last name" htmlFor="ay-last-name" required>
          <Input
            id="ay-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            required
          />
        </Field>
      </div>

      <Field
        label="Email"
        htmlFor="ay-email"
        required
        hint="We'll send you a code to confirm it before your entry is final."
      >
        <Input
          id="ay-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <div>
        <p className="text-foreground mb-1.5 block text-sm font-medium">
          Sex<span className="text-danger ml-0.5">*</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['male', 'female'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sex === value}
              onClick={() => setSex(value)}
              className={`min-h-11 rounded-xl border px-4 text-sm font-semibold capitalize transition-colors ${
                sex === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-foreground hover:border-primary/50'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Birthday"
        htmlFor="ay-dob"
        hint="Optional - only needed for age-limited divisions."
      >
        <Input
          id="ay-dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          max={TODAY}
        />
      </Field>

      <div>
        <p className="text-foreground mb-1.5 block text-sm font-medium">
          Self-rated skill<span className="text-danger ml-0.5">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {SKILL_BANDS.map((band) => {
            const selected = selfRatedSkill === band.ordinal;
            return (
              <button
                key={band.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelfRatedSkill(band.ordinal)}
                style={
                  selected
                    ? { backgroundColor: band.color, borderColor: band.color, color: '#fff' }
                    : { borderColor: band.color, color: band.color }
                }
                className="bg-surface min-h-11 rounded-full border-2 px-3.5 text-sm font-semibold transition-colors"
              >
                {band.label}
              </button>
            );
          })}
        </div>
        <p className="text-foreground-muted mt-1.5 text-xs">
          Your own estimate. The community&rsquo;s rating builds from vouches once you&rsquo;re
          playing.
        </p>
      </div>

      <label className="border-border bg-surface-muted flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="text-foreground">
          I agree to the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium underline underline-offset-2"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium underline underline-offset-2"
          >
            Privacy Policy
          </a>
          .
        </span>
      </label>

      <Button type="button" onClick={handleContinue} className="w-full">
        Continue
      </Button>

      <p className="text-foreground-muted text-center text-sm">
        Have an account?{' '}
        <Link
          href={`/login?next=${encodeURIComponent(registerNext(slug))}`}
          className="text-primary font-medium hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
