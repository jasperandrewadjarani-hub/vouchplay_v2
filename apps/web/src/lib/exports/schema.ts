/**
 * Canonical Tournament-System XLSX schema + the neutral export snapshot (handover §26.11, §26.11.2).
 *
 * This file is the SINGLE SOURCE OF TRUTH for the locked compatibility contract - the exact sheet
 * names, their order, and each sheet's header row and column order, exactly as inspected from
 * `sample_data_/tournament_googlesheets_sample.xlsx` (see docs/TOURNAMENT_SYSTEM_XLSX_CONTRACT.md).
 * The exporter builds from these constants and the structural compatibility test asserts against
 * them, so a drift is caught at build time (§26.11.1 step 6). Never edit the header text or order to
 * match VouchPlay's internal DB - the downstream JT tournament system depends on this shape.
 *
 * Architecture (§26.11.2): Domain entities -> TournamentExportSnapshot (this file) -> adapters
 * (system-xlsx / normalized-xlsx / csv). The snapshot is DB-agnostic typed rows; adapters never touch
 * the database.
 */

export const SYSTEM_SCHEMA_VERSION = 'SYSTEM_V1';

/** Which snapshot collection fills a sheet's data rows (or `empty` = header row only). */
export type SheetSource = 'empty' | 'teams' | 'players' | 'divisions' | 'dates' | 'config';

export interface SheetSpec {
  name: string;
  headers: readonly string[];
  source: SheetSource;
  /** 1-based column indexes (into `headers`) that carry Excel dates, with their number format. */
  dateColumns?: { index: number; numFmt: string }[];
}

/** LOCKED: sheet order + headers. Do not reorder, rename, add, or remove without the downstream owner. */
export const SYSTEM_SHEETS: readonly SheetSpec[] = [
  {
    name: 'Standings',
    source: 'empty',
    headers: [
      'DivisionID',
      'Pool',
      'TeamID',
      'Wins',
      'Losses',
      'PointsFor',
      'PointsAgainst',
      'Diff',
      'PoolRank',
    ],
  },
  {
    name: 'Matches',
    source: 'empty',
    headers: [
      'MatchID',
      'DivisionID',
      'Phase',
      'Pool',
      'Round',
      'Team1ID',
      'Team2ID',
      'Court',
      'ScheduledTime',
      'Team1Score',
      'Team2Score',
      'SetScores',
      'WinnerTeamID',
      'Status',
      'BracketSlot',
      'NextMatchID',
      'LoserNextMatchID',
      'UpdatedBy',
      'CompletedAt',
    ],
  },
  {
    name: 'Teams',
    source: 'teams',
    headers: [
      'TeamID',
      'DivisionID',
      'TeamName',
      'Player1Email',
      'Player2Email',
      'RegisteredAt',
      'Status',
      'Pool',
      'EnteredBy',
    ],
    dateColumns: [{ index: 6, numFmt: 'yyyy-mm-dd' }],
  },
  {
    name: 'Players',
    source: 'players',
    headers: [
      'PlayerID',
      'FirstName',
      'LastName',
      'Nickname',
      'Email',
      'Phone',
      'Gender',
      'SkillLevel',
      'RegisteredAt',
      'EnteredBy',
    ],
    dateColumns: [{ index: 9, numFmt: 'm/d/yyyy' }],
  },
  {
    name: 'Divisions',
    source: 'divisions',
    headers: [
      'DivisionID',
      'Name',
      'PlayType',
      'SkillLevel',
      'Status',
      'NumPools',
      'AdvancePerPool',
      'PointsToWin',
      'WinBy',
      'CreatedBy',
      'PlayoffFieldMode',
      'PlayoffFixedSize',
      'ScoringRules',
      'ScheduleBlocks',
      'MaxTeams',
      'PlayoffSeeding',
    ],
  },
  {
    name: 'TournamentDates',
    source: 'dates',
    headers: ['DateID', 'Date', 'Label'],
    dateColumns: [{ index: 2, numFmt: 'yyyy-mm-dd' }],
  },
  {
    name: 'Sponsors',
    source: 'empty',
    headers: ['SponsorID', 'Name', 'LogoURL'],
  },
  {
    name: 'Config',
    source: 'config',
    headers: ['Key', 'Value'],
  },
] as const;

export const ENTERED_BY = 'VouchPlay Export';

/** Registration status -> tournament-system Status vocabulary (Teams sheet). Locked vocabulary. */
export const TEAM_STATUS_MAP: Record<string, string> = {
  confirmed: 'Confirmed',
  waitlisted: 'Waitlisted',
  team_formed: 'Pending',
  payment_pending: 'Pending',
  payment_submitted: 'Pending',
  under_review: 'Pending',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/** The registration statuses included in an export roster (active + pending; not terminal). */
export const EXPORTED_REGISTRATION_STATUSES = [
  'confirmed',
  'waitlisted',
  'team_formed',
  'payment_pending',
  'payment_submitted',
  'under_review',
] as const;

/**
 * Bracket/scoring defaults for the Divisions sheet - columns the tournament system needs but VouchPlay
 * does not model. Safe, documented defaults the organizer adjusts in the tournament system; never
 * invented per-division data. JSON config columns are left blank on purpose.
 */
export const DIVISION_DEFAULTS = {
  numPools: 1,
  advancePerPool: 2,
  pointsToWin: 11,
  winBy: 1,
  status: '',
  playoffFieldMode: '',
  playoffFixedSize: '',
  scoringRules: '',
  scheduleBlocks: '',
  playoffSeeding: 'PoolRank',
} as const;

// ---------------------------------------------------------------------------
// TournamentExportSnapshot - DB-agnostic typed rows (§26.11.2).
// ---------------------------------------------------------------------------
export interface ExportPlayerRow {
  playerId: string; // PLY-001
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  phone: string;
  gender: string; // Male | Female | ''
  skillLevel: string; // community skill band label | ''
  registeredAt: Date | null;
  enteredBy: string;
}

export interface ExportTeamRow {
  teamId: string; // TEAM-001
  divisionId: string; // DIV-01 (matches the Divisions sheet)
  teamName: string;
  player1Email: string;
  player2Email: string;
  registeredAt: Date | null;
  status: string; // mapped Status vocabulary
  pool: string;
  enteredBy: string;
}

export interface ExportDivisionRow {
  divisionId: string; // DIV-01
  name: string;
  playType: string; // skill band label
  skillLevel: string; // skill band label
  status: string;
  numPools: number;
  advancePerPool: number;
  pointsToWin: number;
  winBy: number;
  createdBy: string;
  playoffFieldMode: string;
  playoffFixedSize: string;
  scoringRules: string;
  scheduleBlocks: string;
  maxTeams: number;
  playoffSeeding: string;
}

export interface ExportDateRow {
  dateId: string; // DATE-001
  date: Date | null;
  label: string; // Day 1, Day 2, ...
}

export interface ExportConfigRow {
  key: string;
  value: string;
}

/**
 * Rich, human-facing registration detail (handover §26.11 "Normalized XLSX" + CSV). Carries the
 * VouchPlay-specific columns the canonical system sheet intentionally omits: eligibility, payment,
 * waitlist, represented clubs. Used ONLY by the normalized-xlsx and csv adapters.
 */
export interface ExportRegistrationRow {
  teamId: string;
  divisionId: string;
  divisionName: string;
  teamName: string;
  members: string; // "Name <email>" joined by "; "
  status: string; // mapped Status vocabulary
  eligibilityStatus: string; // Eligible / Needs review / Potential skill mismatch / ...
  paymentStatus: string; // Not required / Pending / Submitted / Verified / ...
  amountDue: number | null;
  currency: string | null;
  waitlistPosition: number | null;
  representedClubs: string; // club names joined by ", "
  registeredAt: Date | null;
}

export interface TournamentExportSnapshot {
  tournamentName: string;
  city: string | null;
  startDate: Date | null;
  endDate: Date | null;
  exportedAt: Date;
  players: ExportPlayerRow[];
  teams: ExportTeamRow[];
  divisions: ExportDivisionRow[];
  dates: ExportDateRow[];
  config: ExportConfigRow[];
  /** Rich detail for the normalized/CSV exports (empty is valid; the system sheet ignores it). */
  registrations: ExportRegistrationRow[];
}

/** Registration eligibility_status -> neutral human label for the normalized/CSV exports (§25.6). */
export const ELIGIBILITY_EXPORT_LABELS: Record<string, string> = {
  eligible: 'Eligible',
  review: 'Needs review',
  skill_mismatch: 'Potential skill mismatch',
  ineligible_hard_rule: 'Does not meet a division rule',
};

/** payment status -> human label for the normalized/CSV exports. */
export const PAYMENT_EXPORT_LABELS: Record<string, string> = {
  not_required: 'Not required',
  pending: 'Pending',
  submitted: 'Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

/** Resolve one snapshot row-object to an ordered array of cell values matching a sheet's headers. */
export function rowValuesFor(
  source: SheetSource,
  snapshot: TournamentExportSnapshot,
): (string | number | Date | null)[][] {
  switch (source) {
    case 'teams':
      return snapshot.teams.map((t) => [
        t.teamId,
        t.divisionId,
        t.teamName,
        t.player1Email,
        t.player2Email,
        t.registeredAt,
        t.status,
        t.pool,
        t.enteredBy,
      ]);
    case 'players':
      return snapshot.players.map((p) => [
        p.playerId,
        p.firstName,
        p.lastName,
        p.nickname,
        p.email,
        p.phone,
        p.gender,
        p.skillLevel,
        p.registeredAt,
        p.enteredBy,
      ]);
    case 'divisions':
      return snapshot.divisions.map((d) => [
        d.divisionId,
        d.name,
        d.playType,
        d.skillLevel,
        d.status,
        d.numPools,
        d.advancePerPool,
        d.pointsToWin,
        d.winBy,
        d.createdBy,
        d.playoffFieldMode,
        d.playoffFixedSize,
        d.scoringRules,
        d.scheduleBlocks,
        d.maxTeams,
        d.playoffSeeding,
      ]);
    case 'dates':
      return snapshot.dates.map((d) => [d.dateId, d.date, d.label]);
    case 'config':
      return snapshot.config.map((c) => [c.key, c.value]);
    case 'empty':
    default:
      return [];
  }
}
