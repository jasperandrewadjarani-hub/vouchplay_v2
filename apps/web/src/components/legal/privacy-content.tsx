import { BRAND, LEGAL } from '@vouchplay/config';
import { LegalDoc, LegalSection, LegalList } from './legal-doc';

/**
 * Privacy Policy (master_plan §2R). Plain-language draft aligned to the Philippine Data Privacy Act
 * (RA 10173) for {BRAND.name}, operated by {LEGAL.entity}. Reviewed-by-counsel is pending; bump
 * LEGAL.version on any material change so every player re-accepts.
 */
export function PrivacyContent() {
  return (
    <LegalDoc title="Privacy Policy">
      <p>
        This Privacy Policy explains how {LEGAL.entity} (&ldquo;{BRAND.name},&rdquo;
        &ldquo;we&rdquo;) collects, uses, shares, and protects your personal data when you use{' '}
        {BRAND.name}. We are the personal information controller for that data and we handle it in
        line with the Philippine Data Privacy Act of 2012 (RA 10173) and its implementing rules.
      </p>

      <LegalSection heading="1. Information we collect">
        <LegalList
          items={[
            'Account details: your email address and login information.',
            'Profile information you provide: name, nickname, city, sex, date of birth, self-rated skill, short bio, photo, and links such as Facebook.',
            'Community activity: the vouches, skill ratings, comments, clubs, and partner/sponsorship availability you create or receive.',
            'Tournament activity: your registrations, teams and partners, and payment proofs you upload (for example, a screenshot or PDF of a bank or e-wallet transfer, which may contain your name and a reference number).',
            'Technical information needed to run and secure the app, including limited, privacy-safe error diagnostics. We do not sell your data and we do not build advertising profiles.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How we use your information">
        <LegalList
          items={[
            'To create and operate your profile and account;',
            'To build your community skill reputation from the vouches and ratings of people you play with;',
            'To let you join and let organizers run tournaments, including verifying payments;',
            'To keep the community safe: moderation, preventing fraud and manipulation, and enforcing our Terms;',
            'To maintain, secure, and improve the Service.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Our legal bases">
        <p>
          We process your data based on: your <strong>consent</strong> (which you give when you
          accept this Policy and when you choose what to share); the{' '}
          <strong>performance of our agreement</strong> with you to provide the Service; and our{' '}
          <strong>legitimate interests</strong> in operating a safe, trustworthy community, balanced
          against your rights. Sensitive personal information is processed only where the law
          allows, such as with your consent or to establish, exercise, or defend a legal claim.
        </p>
      </LegalSection>

      <LegalSection heading="4. How we share information">
        <LegalList
          items={[
            'With other users: your public profile and community reputation are visible according to your visibility settings. Some vouching may be shown anonymously to other users; the identity behind a vouch is restricted to authorized moderation and is not exposed to the community.',
            'With tournament organizers: when you register for a tournament, the organizer and their authorized staff can see your registration and your payment proof for that event, to verify and manage entries.',
            'With service providers who host and run the app on our behalf (for example, cloud hosting and database providers) under confidentiality obligations.',
            'When required by law, or to protect the rights, safety, and property of our users, the public, or us.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Payment proofs">
        <p>
          Payment proofs are stored in a private location and are not public. They are made
          available only to the organizers and authorized staff of the tournament you are paying
          for, and to our staff for support and safety. Access links used for organizer review are
          time-limited. We keep payment proofs only as long as needed for the tournament, financial
          record-keeping, and dispute resolution, and then delete or de-identify them in line with
          our retention practices.
        </p>
      </LegalSection>

      <LegalSection heading="6. How long we keep data">
        <p>
          We keep your personal data for as long as your account is active and as needed to provide
          the Service, and afterward only as required for legitimate business, legal, accounting, or
          safety purposes. When it is no longer needed, we delete or anonymize it.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>Under the Data Privacy Act, you have the right to:</p>
        <LegalList
          items={[
            'Be informed about how your data is processed;',
            'Access the personal data we hold about you;',
            'Correct inaccurate or outdated data;',
            'Object to certain processing, or withdraw consent;',
            'Have your data erased or blocked where the law allows;',
            'Data portability for data you provided; and',
            'Lodge a complaint with the National Privacy Commission (privacy.gov.ph).',
          ]}
        />
        <p>
          To exercise any of these, contact us using the details below. Some rights have legal
          limits &mdash; for example, we may need to keep certain records or cannot remove another
          person&rsquo;s account of a shared game.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          We use reasonable organizational, physical, and technical measures &mdash; including
          access controls and encryption in transit &mdash; to protect your data. No system is
          perfectly secure, but we work to protect your information and to respond promptly to any
          incident as required by law.
        </p>
      </LegalSection>

      <LegalSection heading="9. Where your data is processed">
        <p>
          The Service runs on reputable cloud providers whose servers may be located outside the
          Philippines. Where data is transferred abroad, we take steps to ensure it remains
          protected consistent with the Data Privacy Act.
        </p>
      </LegalSection>

      <LegalSection heading="10. Children">
        <p>
          {BRAND.name} is intended for players who can consent to this Policy, or whose parent or
          legal guardian consents on their behalf. If you believe a child&rsquo;s data has been
          provided without proper consent, contact us and we will address it.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to this Policy">
        <p>
          We may update this Policy. When changes are material, we will update the version and date
          above and ask you to review and accept the updated Policy before continuing to use the
          Service.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact us">
        <p>
          For privacy questions or to exercise your rights, reach {LEGAL.entity} through the{' '}
          <a
            href={BRAND.jtFacebookUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium underline underline-offset-2"
          >
            JT Consulting &amp; Analytics Inc. page
          </a>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
