import 'server-only';
import { skillByOrdinal } from '@vouchplay/config';
import { createServiceClient } from '@/lib/supabase/service';
import { divisionName } from '@/lib/tournaments/dto';
import {
  ENTERED_BY,
  TEAM_STATUS_MAP,
  EXPORTED_REGISTRATION_STATUSES,
  DIVISION_DEFAULTS,
  ELIGIBILITY_EXPORT_LABELS,
  PAYMENT_EXPORT_LABELS,
  SYSTEM_SCHEMA_VERSION,
  type TournamentExportSnapshot,
  type ExportDivisionRow,
  type ExportTeamRow,
  type ExportPlayerRow,
  type ExportRegistrationRow,
  type ExportDateRow,
} from './schema';

/**
 * Assemble a TournamentExportSnapshot from the live DB for one tournament (handover §26.11.2). Runs
 * server-side via the service client AFTER the caller authorized the organizer (export permission).
 * Emails come from auth (profiles carry no email) and are included because the operational handover
 * keys players by email; this is an authorized organizer export of their own participants.
 */
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const dateOrNull = (iso: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function buildTournamentSnapshot(
  tournamentId: string,
): Promise<TournamentExportSnapshot> {
  const svc = createServiceClient();
  const exportedAt = new Date();

  const { data: tData } = await svc
    .from('tournaments')
    .select('name, city, start_at, end_at')
    .eq('id', tournamentId)
    .maybeSingle();
  const t = (tData as {
    name: string;
    city: string | null;
    start_at: string | null;
    end_at: string | null;
  } | null) ?? { name: 'Tournament', city: null, start_at: null, end_at: null };

  // --- Divisions (all, ordered) -> DIV-01.. ---
  const { data: divData } = await svc
    .from('divisions')
    .select(
      'id, name_override, skill_policy, minimum_skill, maximum_skill, format, sex_classification, minimum_age, maximum_age, capacity_teams, created_at',
    )
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  const divisionRows = (divData ?? []) as {
    id: string;
    name_override: string | null;
    skill_policy: string;
    minimum_skill: number | null;
    maximum_skill: number | null;
    format: string;
    sex_classification: string;
    minimum_age: number | null;
    maximum_age: number | null;
    capacity_teams: number;
    created_at: string;
  }[];
  const divCode = new Map<string, string>();
  divisionRows.forEach((d, i) => divCode.set(d.id, `DIV-${pad(i + 1, 2)}`));
  const divName = new Map<string, string>();
  const divSkillLabel = new Map<string, string>();
  const divisions: ExportDivisionRow[] = divisionRows.map((d) => {
    const name = divisionName(d);
    divName.set(d.id, name);
    const skillLabel =
      d.skill_policy === 'band' && d.minimum_skill != null
        ? (skillByOrdinal(d.minimum_skill)?.label ?? '')
        : d.skill_policy === 'open'
          ? 'Open'
          : '';
    divSkillLabel.set(d.id, skillLabel);
    return {
      divisionId: divCode.get(d.id) as string,
      name,
      playType: skillLabel,
      skillLevel: skillLabel,
      status: DIVISION_DEFAULTS.status,
      numPools: DIVISION_DEFAULTS.numPools,
      advancePerPool: DIVISION_DEFAULTS.advancePerPool,
      pointsToWin: DIVISION_DEFAULTS.pointsToWin,
      winBy: DIVISION_DEFAULTS.winBy,
      createdBy: ENTERED_BY,
      playoffFieldMode: DIVISION_DEFAULTS.playoffFieldMode,
      playoffFixedSize: DIVISION_DEFAULTS.playoffFixedSize,
      scoringRules: DIVISION_DEFAULTS.scoringRules,
      scheduleBlocks: DIVISION_DEFAULTS.scheduleBlocks,
      maxTeams: d.capacity_teams,
      playoffSeeding: DIVISION_DEFAULTS.playoffSeeding,
    };
  });

  // --- Registrations (exported statuses only), ordered -> TEAM-001.. ---
  const { data: regData } = await svc
    .from('registrations')
    .select('id, division_id, team_id, status, eligibility_status, created_at')
    .eq('tournament_id', tournamentId)
    .in('status', [...EXPORTED_REGISTRATION_STATUSES])
    .order('created_at', { ascending: true });
  const regs = (regData ?? []) as {
    id: string;
    division_id: string;
    team_id: string;
    status: string;
    eligibility_status: string;
    created_at: string;
  }[];
  const teamCode = new Map<string, string>();
  regs.forEach((r, i) => teamCode.set(r.team_id, `TEAM-${pad(i + 1, 3)}`));

  const teamIds = regs.map((r) => r.team_id);
  const regIds = regs.map((r) => r.id);

  // --- Team members (ordered) ---
  const { data: memData } = teamIds.length
    ? await svc
        .from('team_members')
        .select('team_id, player_id, member_order')
        .in('team_id', teamIds)
    : { data: [] };
  const members = (
    (memData ?? []) as {
      team_id: string;
      player_id: string;
      member_order: number;
    }[]
  ).sort((a, b) => a.member_order - b.member_order);
  const membersByTeam = new Map<string, string[]>();
  for (const m of members) {
    const arr = membersByTeam.get(m.team_id) ?? [];
    arr.push(m.player_id);
    membersByTeam.set(m.team_id, arr);
  }

  // --- Distinct players -> profiles + emails + skill ---
  const playerIds = Array.from(new Set(members.map((m) => m.player_id)));
  const { data: profData } = playerIds.length
    ? await svc
        .from('profiles')
        .select('id, first_name, last_name, nickname, sex, created_at')
        .in('id', playerIds)
    : { data: [] };
  const profById = new Map(
    (
      (profData ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        nickname: string | null;
        sex: 'male' | 'female' | null;
        created_at: string;
      }[]
    ).map((p) => [p.id, p]),
  );
  const { data: skillData } = playerIds.length
    ? await svc
        .from('player_skill_profiles')
        .select('player_id, community_skill_level')
        .in('player_id', playerIds)
    : { data: [] };
  const skillByPlayer = new Map(
    ((skillData ?? []) as { player_id: string; community_skill_level: number | null }[]).map(
      (s) => [s.player_id, s.community_skill_level],
    ),
  );

  // Emails from auth (profiles carry none). getUserById per distinct member (bounded per tournament).
  const emailById = new Map<string, string>();
  await Promise.all(
    playerIds.map(async (id) => {
      try {
        const { data } = await svc.auth.admin.getUserById(id);
        if (data?.user?.email) emailById.set(id, data.user.email);
      } catch {
        // leave email blank on lookup failure
      }
    }),
  );

  // Payments + waitlist for the exported registrations.
  const { data: payData } = regIds.length
    ? await svc
        .from('payments')
        .select('registration_id, status, amount_due, currency')
        .in('registration_id', regIds)
    : { data: [] };
  const payByReg = new Map(
    (
      (payData ?? []) as {
        registration_id: string;
        status: string;
        amount_due: number;
        currency: string;
      }[]
    ).map((p) => [p.registration_id, p]),
  );
  const { data: wlData } = regIds.length
    ? await svc
        .from('waitlist_entries')
        .select('registration_id, position_rank, status')
        .in('registration_id', regIds)
        .eq('status', 'waiting')
    : { data: [] };
  const wlByReg = new Map(
    ((wlData ?? []) as { registration_id: string; position_rank: number }[]).map((w) => [
      w.registration_id,
      w.position_rank,
    ]),
  );

  // Club representations (player -> club names) for this tournament.
  const { data: repData } = await svc
    .from('tournament_player_club_representations')
    .select('player_id, club_id, display_order')
    .eq('tournament_id', tournamentId)
    .order('display_order', { ascending: true });
  const reps = (repData ?? []) as { player_id: string; club_id: string; display_order: number }[];
  const clubIds = Array.from(new Set(reps.map((r) => r.club_id)));
  const { data: clubData } = clubIds.length
    ? await svc.from('clubs').select('id, name').in('id', clubIds)
    : { data: [] };
  const clubName = new Map(
    ((clubData ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const clubsByPlayer = new Map<string, string[]>();
  for (const r of reps) {
    const arr = clubsByPlayer.get(r.player_id) ?? [];
    arr.push(clubName.get(r.club_id) ?? 'Club');
    clubsByPlayer.set(r.player_id, arr);
  }

  const displayName = (id: string): { first: string; last: string; nick: string } => {
    const p = profById.get(id);
    return {
      first: p?.first_name ?? '',
      last: p?.last_name ?? '',
      nick: p?.nickname ?? '',
    };
  };
  const surname = (id: string): string => {
    const p = profById.get(id);
    return (p?.last_name || p?.nickname || p?.first_name || 'Player').trim();
  };

  // Players sheet rows (PLY-001..), in first-appearance order across the roster.
  const playerCode = new Map<string, string>();
  const players: ExportPlayerRow[] = playerIds.map((id, i) => {
    playerCode.set(id, `PLY-${pad(i + 1, 3)}`);
    const p = profById.get(id);
    const ord = skillByPlayer.get(id);
    return {
      playerId: `PLY-${pad(i + 1, 3)}`,
      firstName: p?.first_name ?? '',
      lastName: p?.last_name ?? '',
      nickname: p?.nickname ?? '',
      email: emailById.get(id) ?? '',
      phone: '',
      gender: p?.sex === 'male' ? 'Male' : p?.sex === 'female' ? 'Female' : '',
      skillLevel: ord != null ? (skillByOrdinal(ord)?.label ?? '') : '',
      registeredAt: dateOrNull(p?.created_at ?? null),
      enteredBy: ENTERED_BY,
    };
  });

  // Teams sheet rows.
  const teams: ExportTeamRow[] = regs.map((r) => {
    const memberIds = membersByTeam.get(r.team_id) ?? [];
    const teamName = memberIds.map((id) => surname(id)).join('/') || 'Team';
    return {
      teamId: teamCode.get(r.team_id) as string,
      divisionId: divCode.get(r.division_id) ?? '',
      teamName,
      player1Email: emailById.get(memberIds[0] ?? '') ?? '',
      player2Email: emailById.get(memberIds[1] ?? '') ?? '',
      registeredAt: dateOrNull(r.created_at),
      status: TEAM_STATUS_MAP[r.status] ?? 'Pending',
      pool: '',
      enteredBy: ENTERED_BY,
    };
  });

  // Rich registration rows (normalized / CSV).
  const registrations: ExportRegistrationRow[] = regs.map((r) => {
    const memberIds = membersByTeam.get(r.team_id) ?? [];
    const memberStrings = memberIds.map((id) => {
      const n = displayName(id);
      const name = [n.first, n.last].filter(Boolean).join(' ').trim() || n.nick || 'Player';
      const email = emailById.get(id);
      return email ? `${name} <${email}>` : name;
    });
    const pay = payByReg.get(r.id);
    const clubs = Array.from(new Set(memberIds.flatMap((id) => clubsByPlayer.get(id) ?? [])));
    return {
      teamId: teamCode.get(r.team_id) as string,
      divisionId: divCode.get(r.division_id) ?? '',
      divisionName: divName.get(r.division_id) ?? 'Division',
      teamName: memberIds.map((id) => surname(id)).join('/') || 'Team',
      members: memberStrings.join('; '),
      status: TEAM_STATUS_MAP[r.status] ?? 'Pending',
      eligibilityStatus: ELIGIBILITY_EXPORT_LABELS[r.eligibility_status] ?? r.eligibility_status,
      paymentStatus: pay ? (PAYMENT_EXPORT_LABELS[pay.status] ?? pay.status) : 'Not required',
      amountDue: pay ? Number(pay.amount_due) : null,
      currency: pay?.currency ?? null,
      waitlistPosition: wlByReg.get(r.id) ?? null,
      representedClubs: clubs.join(', '),
      registeredAt: dateOrNull(r.created_at),
    };
  });

  // TournamentDates (one row per day across start..end).
  const dates: ExportDateRow[] = [];
  const start = dateOrNull(t.start_at);
  const end = dateOrNull(t.end_at) ?? start;
  if (start) {
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = end ?? start;
    const lastUtc = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
    let day = 1;
    while (cursor.getTime() <= lastUtc && day <= 60) {
      dates.push({ dateId: `DATE-${pad(day, 3)}`, date: new Date(cursor), label: `Day ${day}` });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      day++;
    }
  }

  // Config (non-sensitive metadata only - NEVER secrets).
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
  const config = [
    { key: 'TournamentName', value: t.name },
    { key: 'City', value: t.city ?? '' },
    { key: 'StartDate', value: iso(start) },
    { key: 'EndDate', value: iso(end) },
    { key: 'ExportedAt', value: exportedAt.toISOString() },
    { key: 'Source', value: 'VouchPlay' },
    { key: 'SchemaVersion', value: SYSTEM_SCHEMA_VERSION },
  ];

  return {
    tournamentName: t.name,
    city: t.city,
    startDate: start,
    endDate: end,
    exportedAt,
    players,
    teams,
    divisions,
    dates,
    config,
    registrations,
  };
}
