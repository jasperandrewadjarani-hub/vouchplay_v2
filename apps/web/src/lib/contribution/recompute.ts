import 'server-only';
import {
  computeContribution,
  CONTRIBUTION_ALGORITHM_VERSION,
  type ContributionEvent,
} from '@vouchplay/core';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllRows } from '@/lib/supabase/fetch-all';
import { getContributionSettings } from '@/lib/settings';

interface VouchFact {
  voucher_id: string;
  target_id: string;
  created_at: string;
}

/** Four bounded queries, no N+1. Only aggregate facts reach the public contribution row. */
export async function recomputePlayerContribution(playerId: string): Promise<void> {
  const settings = await getContributionSettings();
  if (!settings.enabled || settings.activeVersion !== CONTRIBUTION_ALGORITHM_VERSION) return;
  const svc = createServiceClient();
  try {
    const { data: outgoing, count: outgoingCount } = await svc
      .from('vouches')
      .select('voucher_id, target_id, created_at', { count: 'exact' })
      .eq('voucher_id', playerId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(settings.maxFactRows);
    if ((outgoingCount ?? 0) > settings.maxFactRows)
      throw new Error('contribution_source_bound_exceeded');
    if (outgoingCount !== null && (outgoing?.length ?? 0) < outgoingCount)
      throw new Error('contribution_source_truncated');
    const own = (outgoing ?? []) as VouchFact[];
    const targets = [...new Set(own.map((row) => row.target_id))];
    let incoming: VouchFact[] = [];
    let reverse: VouchFact[] = [];
    let incomingTruncated = false;
    if (targets.length) {
      const [incomingResult, reverseResult] = await Promise.all([
        svc
          .from('vouches')
          .select('voucher_id, target_id, created_at', { count: 'exact' })
          .in('target_id', targets)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(settings.maxFactRows),
        svc
          .from('vouches')
          .select('voucher_id, target_id, created_at')
          .in('voucher_id', targets)
          .eq('target_id', playerId)
          .eq('status', 'active')
          .limit(settings.maxFactRows),
      ]);
      incoming = (incomingResult.data ?? []) as VouchFact[];
      incomingTruncated =
        (incomingResult.count ?? 0) > settings.maxFactRows ||
        (incomingResult.count !== null && incoming.length < incomingResult.count);
      reverse = (reverseResult.data ?? []) as VouchFact[];
    }
    const { data: ringFlags, count: ringFlagCount } = await svc
      .from('fraud_flags')
      .select('flag_type, severity', { count: 'exact' })
      .eq('subject_id', playerId)
      .in('subject_type', ['user', 'coach'])
      .in('status', ['open', 'reviewing'])
      .limit(50);
    const ringRisk =
      (ringFlagCount ?? 0) > (ringFlags?.length ?? 0) ||
      (ringFlags ?? []).some((flag) => {
        const f = flag as { flag_type: string; severity: string | null };
        return (
          (f.severity === 'high' || f.severity === 'critical') &&
          /ring|recipro|collusion/i.test(f.flag_type)
        );
      });
    const reverseTargets = new Set(reverse.map((row) => row.voucher_id));
    const events: ContributionEvent[] = own.map((row) => {
      const before = incomingTruncated
        ? settings.config.newcomerThreshold + 1
        : new Set(
            incoming
              .filter(
                (item) =>
                  item.target_id === row.target_id &&
                  Date.parse(item.created_at) < Date.parse(row.created_at),
              )
              .map((item) => item.voucher_id),
          ).size;
      return {
        targetKey: row.target_id,
        occurredAt: row.created_at,
        targetDistinctVouchersBefore: before,
        reciprocal: reverseTargets.has(row.target_id),
        ringRisk,
      };
    });
    const result = computeContribution(events, settings.config, new Date());
    await svc.from('player_contributions').upsert({
      player_id: playerId,
      algorithm_version: result.algorithmVersion,
      score: result.score,
      level: result.level,
      distinct_players_helped: result.distinctPlayersHelped,
      newcomer_players_helped: result.newcomerPlayersHelped,
      current_streak_weeks: result.currentStreakWeeks,
      badges: result.badges,
      explanation_facts: {
        distinctPlayersHelped: result.distinctPlayersHelped,
        newcomerPlayersHelped: result.newcomerPlayersHelped,
        currentStreakWeeks: result.currentStreakWeeks,
        sourceBounded: true,
        incomingTruncated,
      },
      calculated_at: new Date().toISOString(),
    });
  } catch {
    // Migration may not be applied yet; contribution must never break the vouch transaction.
  }
}

/** Initial/cadence backfill. Two bounded reads and one bulk upsert, independent of player count. */
export async function recomputeAllContributions(): Promise<number> {
  const settings = await getContributionSettings();
  if (!settings.enabled || settings.activeVersion !== CONTRIBUTION_ALGORITHM_VERSION) return 0;
  const svc = createServiceClient();
  // Page through the sources rather than `.limit()`: PostgREST caps a response at ~1000 rows, so a
  // single `.limit(maxFactRows)` silently truncated once active vouches passed 1,000 and the old
  // truncation guard then killed every rebuild (master_plan §2I). The (voucher_id, target_id) pair
  // is unique among active vouches, so created_at + that pair is a stable total order for paging.
  const [vouchResult, flagResult] = await Promise.all([
    fetchAllRows<VouchFact>(
      (from, to) =>
        svc
          .from('vouches')
          .select('voucher_id, target_id, created_at', { count: 'exact' })
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .order('voucher_id', { ascending: true })
          .order('target_id', { ascending: true })
          .range(from, to),
      settings.maxFactRows,
      'contribution_source',
    ),
    fetchAllRows<{ subject_id: string; flag_type: string; severity: string }>(
      (from, to) =>
        svc
          .from('fraud_flags')
          .select('subject_id, flag_type, severity', { count: 'exact' })
          .in('subject_type', ['user', 'coach'])
          .in('status', ['open', 'reviewing'])
          .in('severity', ['high', 'critical'])
          .order('subject_id', { ascending: true })
          .order('flag_type', { ascending: true })
          .range(from, to),
      settings.maxFactRows,
      'contribution_fraud_source',
    ),
  ]);
  // Only a genuine overload past the configured cap is an error now; ordinary growth is paged.
  if (vouchResult.capped) throw new Error('contribution_source_bound_exceeded');
  const rows = vouchResult.rows;
  const flagRows = flagResult.rows;
  const ringSubjects = new Set(
    ((flagRows ?? []) as { subject_id: string; flag_type: string }[])
      .filter((flag) => /ring|recipro|collusion/i.test(flag.flag_type))
      .map((flag) => flag.subject_id),
  );
  const firstByPair = new Map<string, VouchFact>();
  for (const row of rows) {
    const key = `${row.voucher_id}:${row.target_id}`;
    if (!firstByPair.has(key)) firstByPair.set(key, row);
  }
  const eventsByVoucher = new Map<string, ContributionEvent[]>();
  const priorVouchersByTarget = new Map<string, Set<string>>();
  const firstEvents = [...firstByPair.values()].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      a.voucher_id.localeCompare(b.voucher_id) ||
      a.target_id.localeCompare(b.target_id),
  );
  let groupAt: number | null = null;
  let sameTimeGroup: VouchFact[] = [];
  const commitGroup = () => {
    for (const event of sameTimeGroup) {
      const prior = priorVouchersByTarget.get(event.target_id) ?? new Set<string>();
      prior.add(event.voucher_id);
      priorVouchersByTarget.set(event.target_id, prior);
    }
    sameTimeGroup = [];
  };
  for (const row of firstEvents) {
    const occurredAt = Date.parse(row.created_at);
    if (groupAt !== null && occurredAt !== groupAt) commitGroup();
    groupAt = occurredAt;
    const prior = priorVouchersByTarget.get(row.target_id) ?? new Set<string>();
    const before = prior.size;
    const events = eventsByVoucher.get(row.voucher_id) ?? [];
    events.push({
      targetKey: row.target_id,
      occurredAt: row.created_at,
      targetDistinctVouchersBefore: before,
      reciprocal: firstByPair.has(`${row.target_id}:${row.voucher_id}`),
      ringRisk: ringSubjects.has(row.voucher_id),
    });
    eventsByVoucher.set(row.voucher_id, events);
    sameTimeGroup.push(row);
  }
  commitGroup();
  const now = new Date();
  const aggregates = [...eventsByVoucher.entries()].map(([playerId, events]) => {
    const result = computeContribution(events, settings.config, now);
    return {
      player_id: playerId,
      algorithm_version: result.algorithmVersion,
      score: result.score,
      level: result.level,
      distinct_players_helped: result.distinctPlayersHelped,
      newcomer_players_helped: result.newcomerPlayersHelped,
      current_streak_weeks: result.currentStreakWeeks,
      badges: result.badges,
      explanation_facts: {
        distinctPlayersHelped: result.distinctPlayersHelped,
        newcomerPlayersHelped: result.newcomerPlayersHelped,
        currentStreakWeeks: result.currentStreakWeeks,
        sourceBounded: true,
        sourceTruncated: rows.length >= settings.maxFactRows,
      },
      calculated_at: now.toISOString(),
    };
  });
  if (aggregates.length) await svc.from('player_contributions').upsert(aggregates);
  return aggregates.length;
}
