import { describe, expect, it } from 'vitest';
import { buildPaymentNotificationEmail, type PaymentNotificationInput } from './notification';

const fullFixture: PaymentNotificationInput = {
  tournamentName: 'Hermosa Open',
  tournamentSlug: 'hermosa-open-ab12cd',
  divisionName: "Men's Doubles - Beginner",
  submittedByEmail: 'jasper@example.com',
  teamName: 'Jasper/Tane',
  players: [
    { fullName: 'Jasper Adjarani', email: 'jasper@example.com' },
    { fullName: 'Tane Cruz', email: 'tane@example.com' },
  ],
  amountSubmitted: 1000,
  currency: 'PHP',
  method: 'GCash',
  payerName: 'Jasper Adjarani',
  transactionReference: 'TXN-000123',
  receiptUrl: 'https://storage.example.com/signed/receipt.webp',
  receiptExpiresDays: 7,
  manageUrl: 'https://vouchplay.app/tournaments/hermosa-open-ab12cd/manage',
};

describe('buildPaymentNotificationEmail (master_plan §2AK)', () => {
  it('formats the subject exactly', () => {
    const { subject } = buildPaymentNotificationEmail(fullFixture);
    expect(subject).toBe(
      "Registration payment notification - Hermosa Open - Jasper/Tane - Men's Doubles - Beginner",
    );
  });

  it('renders every label, in order, for a full fixture', () => {
    const { text } = buildPaymentNotificationEmail(fullFixture);
    expect(text).toBe(
      [
        'Tournament: Hermosa Open',
        'Submitted by: jasper@example.com',
        'Team: Jasper/Tane',
        "Category: Men's Doubles - Beginner",
        'Player 1: Jasper Adjarani <jasper@example.com>',
        'Player 2: Tane Cruz <tane@example.com>',
        'Amount submitted: PHP 1000.00',
        'Mode of payment: GCash',
        'Payer name: Jasper Adjarani',
        'Payment reference / transaction no.: TXN-000123',
        'Receipt: https://storage.example.com/signed/receipt.webp (link works for 7 days)',
        'Open in Manage: https://vouchplay.app/tournaments/hermosa-open-ab12cd/manage',
      ].join('\n'),
    );
  });

  it('renders "-" for every missing value and omits the Payer name line entirely', () => {
    const sparse: PaymentNotificationInput = {
      ...fullFixture,
      submittedByEmail: null,
      amountSubmitted: null,
      method: null,
      payerName: null,
      transactionReference: null,
      receiptUrl: null,
      players: [{ fullName: 'Solo Player', email: null }],
    };
    const { text } = buildPaymentNotificationEmail(sparse);
    expect(text).toBe(
      [
        'Tournament: Hermosa Open',
        'Submitted by: -',
        'Team: Jasper/Tane',
        "Category: Men's Doubles - Beginner",
        'Player 1: Solo Player <->',
        'Amount submitted: -',
        'Mode of payment: -',
        'Payment reference / transaction no.: -',
        'Receipt: -',
        'Open in Manage: https://vouchplay.app/tournaments/hermosa-open-ab12cd/manage',
      ].join('\n'),
    );
    expect(text).not.toContain('Payer name');
  });

  it('escapes a malicious player name in the html output', () => {
    const malicious: PaymentNotificationInput = {
      ...fullFixture,
      players: [{ fullName: '<script>alert(1)</script>', email: 'p1@example.com' }],
    };
    const { html } = buildPaymentNotificationEmail(malicious);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('names the receipt expiry window in both text and html', () => {
    const { text, html } = buildPaymentNotificationEmail({ ...fullFixture, receiptExpiresDays: 3 });
    expect(text).toContain('(link works for 3 days)');
    expect(html).toContain('Link works for 3 days.');
  });
});

describe('buildPaymentNotificationEmail summary block (master_plan §2AL)', () => {
  const summary = {
    total: 28,
    perDivision: [
      { division: "Men's Doubles", count: 12 },
      { division: 'Mixed Doubles', count: 5 },
      { division: "Women's Doubles", count: 4 },
      { division: "Men's Doubles Advanced", count: 3 },
      { division: "Women's Doubles High Intermediate", count: 2 },
      { division: '45 and Up Men', count: 1 },
      { division: 'Mixed Doubles Advanced', count: 1 },
    ],
  };

  it('appends the total and one indented line per division, below the payment details, in text', () => {
    const { text } = buildPaymentNotificationEmail({ ...fullFixture, summary });
    expect(text).toBe(
      [
        'Tournament: Hermosa Open',
        'Submitted by: jasper@example.com',
        'Team: Jasper/Tane',
        "Category: Men's Doubles - Beginner",
        'Player 1: Jasper Adjarani <jasper@example.com>',
        'Player 2: Tane Cruz <tane@example.com>',
        'Amount submitted: PHP 1000.00',
        'Mode of payment: GCash',
        'Payer name: Jasper Adjarani',
        'Payment reference / transaction no.: TXN-000123',
        'Receipt: https://storage.example.com/signed/receipt.webp (link works for 7 days)',
        'Open in Manage: https://vouchplay.app/tournaments/hermosa-open-ab12cd/manage',
        '',
        'Paid teams so far: 28',
        "  Men's Doubles: 12",
        '  Mixed Doubles: 5',
        "  Women's Doubles: 4",
        "  Men's Doubles Advanced: 3",
        "  Women's Doubles High Intermediate: 2",
        '  45 and Up Men: 1',
        '  Mixed Doubles Advanced: 1',
      ].join('\n'),
    );
  });

  it('renders a heading with the total and every division in html, ordered count desc then name asc', () => {
    const { html } = buildPaymentNotificationEmail({ ...fullFixture, summary });
    expect(html).toContain('Paid teams so far');
    expect(html).toContain('28');
    const menIdx = html.indexOf("Men's Doubles<");
    const mixedIdx = html.indexOf('Mixed Doubles<');
    const advancedIdx = html.indexOf('45 and Up Men');
    const mixedAdvancedIdx = html.indexOf('Mixed Doubles Advanced');
    expect(menIdx).toBeGreaterThan(-1);
    expect(menIdx).toBeLessThan(mixedIdx);
    // Tied at count=1: "45 and Up Men" sorts before "Mixed Doubles Advanced" alphabetically.
    expect(advancedIdx).toBeLessThan(mixedAdvancedIdx);
  });

  it('escapes a malicious division name in the summary html', () => {
    const malicious = {
      total: 1,
      perDivision: [{ division: '<script>alert(1)</script>', count: 1 }],
    };
    const { html } = buildPaymentNotificationEmail({ ...fullFixture, summary: malicious });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('omits every summary trace when summary is undefined', () => {
    const { text, html } = buildPaymentNotificationEmail(fullFixture);
    expect(text).not.toContain('Paid teams so far');
    expect(html).not.toContain('Paid teams so far');
  });
});
