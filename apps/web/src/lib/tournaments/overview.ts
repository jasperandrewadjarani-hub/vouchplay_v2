/**
 * Organizer dashboard overview (handover §26.1). Pure computation over the registrations the manage
 * page already loads (no extra query): totals, confirmed teams, payments to review, waitlist,
 * eligibility review count, divisions nearing capacity, and collected revenue.
 */

export interface OverviewRegInput {
  divisionId: string;
  status: string;
  eligibilityStatus: string;
  paymentStatus: string | null;
  amountDue: number | null;
  currency: string | null;
}

export interface OverviewDivisionInput {
  id: string;
  name: string;
  capacityTeams: number;
}

export interface DivisionCapacity {
  name: string;
  active: number;
  capacity: number;
}

export interface OrganizerOverview {
  totalRegistrations: number; // active (non-terminal)
  confirmedTeams: number;
  paymentsToReview: number; // proof submitted, awaiting organizer verification
  waitlistCount: number;
  eligibilityReviewCount: number; // review + skill_mismatch + hard-rule
  revenueCollected: number; // sum of verified payment amounts
  currency: string | null;
  nearingCapacity: DivisionCapacity[]; // >= 80% of capacity
}

const TERMINAL = new Set(['withdrawn', 'cancelled', 'rejected']);
// Statuses that occupy (or hold) a division slot for capacity purposes (mirror register_team §23.2).
const SLOT_HOLDING = new Set(['confirmed', 'payment_submitted', 'under_review', 'payment_pending']);
const ELIGIBILITY_REVIEW = new Set(['review', 'skill_mismatch', 'ineligible_hard_rule']);
const NEARING_THRESHOLD = 0.8;

export function computeOverview(
  registrations: OverviewRegInput[],
  divisions: OverviewDivisionInput[],
): OrganizerOverview {
  let confirmedTeams = 0;
  let paymentsToReview = 0;
  let waitlistCount = 0;
  let eligibilityReviewCount = 0;
  let revenueCollected = 0;
  let totalRegistrations = 0;
  let currency: string | null = null;

  const activeByDivision = new Map<string, number>();

  for (const r of registrations) {
    if (!TERMINAL.has(r.status)) totalRegistrations++;
    if (r.status === 'confirmed') confirmedTeams++;
    if (r.status === 'waitlisted') waitlistCount++;
    if (r.paymentStatus === 'submitted') paymentsToReview++;
    if (ELIGIBILITY_REVIEW.has(r.eligibilityStatus) && !TERMINAL.has(r.status)) {
      eligibilityReviewCount++;
    }
    if (r.paymentStatus === 'verified' && r.amountDue != null) {
      revenueCollected += r.amountDue;
      if (!currency && r.currency) currency = r.currency;
    }
    if (SLOT_HOLDING.has(r.status)) {
      activeByDivision.set(r.divisionId, (activeByDivision.get(r.divisionId) ?? 0) + 1);
    }
  }

  const nearingCapacity: DivisionCapacity[] = [];
  for (const d of divisions) {
    const active = activeByDivision.get(d.id) ?? 0;
    if (d.capacityTeams > 0 && active >= Math.ceil(d.capacityTeams * NEARING_THRESHOLD)) {
      nearingCapacity.push({ name: d.name, active, capacity: d.capacityTeams });
    }
  }
  nearingCapacity.sort((a, b) => b.active / b.capacity - a.active / a.capacity);

  return {
    totalRegistrations,
    confirmedTeams,
    paymentsToReview,
    waitlistCount,
    eligibilityReviewCount,
    revenueCollected,
    currency,
    nearingCapacity,
  };
}
