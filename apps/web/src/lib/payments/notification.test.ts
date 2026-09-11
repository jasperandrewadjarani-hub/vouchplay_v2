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
