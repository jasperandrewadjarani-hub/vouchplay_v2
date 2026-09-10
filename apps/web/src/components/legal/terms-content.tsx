import { BRAND, LEGAL } from '@vouchplay/config';
import { LegalDoc, LegalSection, LegalList } from './legal-doc';

/**
 * Terms of Service (master_plan §2R). Plain-language, Philippine-context draft for {BRAND.name},
 * operated by {LEGAL.entity}. Reviewed-by-counsel is pending; bump LEGAL.version on any material
 * change so every player re-accepts.
 */
export function TermsContent() {
  return (
    <LegalDoc title="Terms of Service">
      <p>
        Welcome to {BRAND.name}. These Terms of Service (&ldquo;Terms&rdquo;) are an agreement
        between you and {LEGAL.entity} (&ldquo;{BRAND.name},&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;), the operator of the {BRAND.name} platform (the &ldquo;Service&rdquo;). By
        creating an account or using the Service, you agree to these Terms. If you do not agree,
        please do not use the Service.
      </p>

      <LegalSection heading="1. What VouchPlay is">
        <p>
          {BRAND.name} is a community-powered sports platform where a player&rsquo;s profile and
          skill reputation are built by the people they actually play with, and where organizers can
          run tournaments. We provide the platform; the vouches, ratings, comments, and tournaments
          come from our community and from independent organizers, not from us.
        </p>
      </LegalSection>

      <LegalSection heading="2. Eligibility and your account">
        <LegalList
          items={[
            'You must be able to enter into a binding agreement to use the Service. If you are a minor under the law of your place of residence, you may use the Service only with the consent and supervision of a parent or legal guardian, who accepts these Terms on your behalf.',
            'You are responsible for the accuracy of the information on your profile and for all activity under your account. Keep your login secure and do not share it.',
            'One person, one account. Do not impersonate anyone or misrepresent your identity, skill, or affiliations.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Community content, vouches, and reputation">
        <p>
          Vouches, skill ratings, comments, and similar community signals are the opinions of the
          members who give them. They are not statements or endorsements by {BRAND.name}, and we do
          not guarantee that any rating, vouch, or profile is accurate, complete, or current.
        </p>
        <LegalList
          items={[
            'When you vouch, rate, or comment, do so honestly and in good faith, based on real experience. Do not post content that is false, misleading, harassing, defamatory, discriminatory, hateful, or that invades another person’s privacy.',
            'You are responsible for the content you submit. You grant us a non-exclusive, worldwide, royalty-free licence to host, display, and use your content for the purpose of operating and improving the Service.',
            'We may moderate, hide, or remove content, and limit or suspend accounts, that we reasonably believe violate these Terms or harm the community. Some vouching may be anonymous to other users; we handle the identity behind it in line with our Privacy Policy.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Tournaments, registration, and payments">
        <p>
          Tournaments are created and run by independent organizers. When you register for a
          tournament, your agreement for that event &mdash; including fees, schedules, rules,
          refunds, and cancellations &mdash; is between you and the organizer. {BRAND.name} provides
          the tools but is not a party to that agreement.
        </p>
        <LegalList
          items={[
            'Registration fees are set and collected by organizers. A slot is only secured once the organizer confirms it as described in the Service; submitting a payment proof is not, by itself, a confirmed slot.',
            'Payment proofs you upload are stored privately and shared only with the tournament’s organizers and authorized staff for verification, as described in our Privacy Policy.',
            'Refunds, disputes, and changes to a tournament are the responsibility of the organizer running it. We may help facilitate communication but are not responsible for an organizer’s decisions or conduct.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            'Break any law, or use the Service to harm, harass, defraud, or deceive others;',
            'Manipulate vouches, ratings, or rankings, create fake accounts, or coordinate to distort a player’s reputation;',
            'Scrape, harvest, or misuse other people’s personal information;',
            'Interfere with, probe, or attempt to gain unauthorized access to the Service, its security, or other accounts;',
            'Upload malware, or content you do not have the right to share.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Intellectual property">
        <p>
          The {BRAND.name} name, logo, software, and design are owned by {LEGAL.entity} and its
          licensors. These Terms do not give you any right to use them except as needed to use the
          Service normally. You keep ownership of the content you submit, subject to the licence in
          Section 3.
        </p>
      </LegalSection>

      <LegalSection heading="7. Service &ldquo;as is&rdquo;">
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To
          the fullest extent permitted by law, we disclaim all warranties, express or implied,
          including accuracy of community ratings, fitness for a particular purpose, and
          uninterrupted or error-free operation.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL.entity} will not be liable for any
          indirect, incidental, or consequential damages, or for loss of data, reputation, or
          opportunity, arising from your use of the Service, from community content, or from
          tournaments and payments handled by organizers. Nothing in these Terms limits liability
          that cannot be limited under applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="9. Suspension and termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you
          violate these Terms or to protect the community or the Service. Some records may be
          retained as described in our Privacy Policy and as required by law.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes">
        <p>
          We may update the Service and these Terms. When we make material changes, we will update
          the version and date above and ask you to review and accept the updated Terms before
          continuing to use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="11. Governing law">
        <p>
          These Terms are governed by the laws of {LEGAL.jurisdiction}. Disputes will be handled by
          the competent courts of the Philippines, without prejudice to any non-waivable rights you
          have under applicable consumer or data-protection law.
        </p>
      </LegalSection>

      <LegalSection heading="12. Contact">
        <p>
          Questions about these Terms? Reach {LEGAL.entity} through the{' '}
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
