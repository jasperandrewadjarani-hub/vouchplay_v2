import 'server-only';
import type { ApplicationStatus } from '@vouchplay/db';
import { createServiceClient } from '@/lib/supabase/service';

export interface CoachEvidenceDTO {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface CoachEventDTO {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
}

export interface CoachApplicationDTO {
  id: string;
  status: ApplicationStatus;
  answers: Record<string, unknown>;
  reviewReason: string | null;
  submittedAt: string;
  reviewStartedAt: string | null;
  respondedAt: string | null;
  decidedAt: string | null;
  retentionDeleteAfter: string | null;
  evidence: CoachEvidenceDTO[];
  events: CoachEventDTO[];
}

const APPLICATION_COLS =
  'id, user_id, status, answers, review_reason, submitted_at, review_started_at, responded_at, decided_at, retention_delete_after, created_at';

export async function getMyCoachState(userId: string): Promise<{
  activeCoach: boolean;
  coachRole: { status: string; reason: string | null; revokedAt: string | null } | null;
  application: CoachApplicationDTO | null;
  available: boolean;
}> {
  const svc = createServiceClient();
  try {
    const [{ data: role }, { data: app }] = await Promise.all([
      svc
        .from('user_roles')
        .select('status, reason, revoked_at')
        .eq('user_id', userId)
        .eq('role', 'coach')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      svc
        .from('role_applications')
        .select(APPLICATION_COLS)
        .eq('user_id', userId)
        .eq('role_requested', 'coach')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const coachRole = role
      ? {
          status: String((role as Record<string, unknown>).status),
          reason: ((role as Record<string, unknown>).reason as string | null) ?? null,
          revokedAt: ((role as Record<string, unknown>).revoked_at as string | null) ?? null,
        }
      : null;
    if (!app)
      return {
        activeCoach: coachRole?.status === 'active',
        coachRole,
        application: null,
        available: true,
      };
    const row = app as Record<string, unknown>;
    const [{ data: evidence }, { data: events }] = await Promise.all([
      svc
        .from('role_application_evidence')
        .select('id, original_filename, mime_type, size_bytes, uploaded_at')
        .eq('application_id', row.id as string)
        .is('deleted_at', null)
        .order('uploaded_at'),
      svc
        .from('role_application_events')
        .select('id, event_type, applicant_message, created_at')
        .eq('application_id', row.id as string)
        .order('created_at'),
    ]);
    return {
      activeCoach: coachRole?.status === 'active',
      coachRole,
      available: true,
      application: {
        id: row.id as string,
        status: row.status as ApplicationStatus,
        answers: (row.answers as Record<string, unknown>) ?? {},
        reviewReason: (row.review_reason as string | null) ?? null,
        submittedAt: (row.submitted_at as string) ?? (row.created_at as string),
        reviewStartedAt: (row.review_started_at as string | null) ?? null,
        respondedAt: (row.responded_at as string | null) ?? null,
        decidedAt: (row.decided_at as string | null) ?? null,
        retentionDeleteAfter: (row.retention_delete_after as string | null) ?? null,
        evidence: (evidence ?? []).map((e) => {
          const x = e as Record<string, unknown>;
          return {
            id: x.id as string,
            filename: x.original_filename as string,
            mimeType: x.mime_type as string,
            sizeBytes: x.size_bytes as number,
            uploadedAt: x.uploaded_at as string,
          };
        }),
        events: (events ?? []).map((e) => {
          const x = e as Record<string, unknown>;
          return {
            id: x.id as string,
            type: x.event_type as string,
            message: (x.applicant_message as string | null) ?? null,
            createdAt: x.created_at as string,
          };
        }),
      },
    };
  } catch {
    return { activeCoach: false, coachRole: null, application: null, available: false };
  }
}

export interface CoachQueueItem {
  id: string;
  status: ApplicationStatus;
  submittedAt: string;
  applicantName: string;
  applicantSlug: string | null;
  city: string | null;
  evidenceCount: number;
  overdue: boolean;
}

export async function getCoachOpenCount(): Promise<number> {
  try {
    const { count } = await createServiceClient()
      .from('role_applications')
      .select('id', { count: 'exact', head: true })
      .eq('role_requested', 'coach')
      .in('status', ['pending', 'reviewing', 'information_requested']);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function listCoachApplications(slaDays: number): Promise<CoachQueueItem[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('role_applications')
    .select('id, user_id, status, submitted_at, created_at')
    .eq('role_requested', 'coach')
    .in('status', ['pending', 'reviewing', 'information_requested'])
    .order('created_at', { ascending: true })
    .limit(200);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => r.user_id as string);
  const appIds = rows.map((r) => r.id as string);
  const [{ data: profiles }, { data: evidence }] = await Promise.all([
    ids.length
      ? svc.from('profiles').select('id, first_name, last_name, nickname, slug, city').in('id', ids)
      : Promise.resolve({ data: [] }),
    appIds.length
      ? svc.from('role_application_evidence').select('application_id').in('application_id', appIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileMap = new Map(
    (profiles ?? []).map((p) => {
      const x = p as Record<string, unknown>;
      return [x.id as string, x] as const;
    }),
  );
  const evidenceCount = new Map<string, number>();
  for (const e of evidence ?? []) {
    const id = (e as { application_id: string }).application_id;
    evidenceCount.set(id, (evidenceCount.get(id) ?? 0) + 1);
  }
  const cutoff = Date.now() - slaDays * 86400000;
  return rows.map((r) => {
    const p = profileMap.get(r.user_id as string);
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() ||
      (p?.nickname as string | undefined) ||
      'VouchPlay player';
    const submittedAt = (r.submitted_at as string) ?? (r.created_at as string);
    return {
      id: r.id as string,
      status: r.status as ApplicationStatus,
      submittedAt,
      applicantName: name,
      applicantSlug: (p?.slug as string | null) ?? null,
      city: (p?.city as string | null) ?? null,
      evidenceCount: evidenceCount.get(r.id as string) ?? 0,
      overdue: Date.parse(submittedAt) < cutoff,
    };
  });
}

export interface CoachReviewDetail extends CoachApplicationDTO {
  userId: string;
  applicantName: string;
  applicantSlug: string | null;
  accountStatus: string;
  city: string | null;
  safety: { openReports: number; openFraudFlags: number; priorRoleDecisions: number };
  auditHistory: Array<{ id: string; action: string; reason: string | null; createdAt: string }>;
}

export async function getCoachReviewDetail(
  applicationId: string,
): Promise<CoachReviewDetail | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from('role_applications')
    .select(APPLICATION_COLS)
    .eq('id', applicationId)
    .eq('role_requested', 'coach')
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const userId = r.user_id as string;
  const [profile, evidence, events, reports, flags, decisions, audit] = await Promise.all([
    svc
      .from('profiles')
      .select('first_name, last_name, nickname, slug, city, account_status')
      .eq('id', userId)
      .maybeSingle(),
    svc
      .from('role_application_evidence')
      .select('id, original_filename, mime_type, size_bytes, uploaded_at')
      .eq('application_id', applicationId)
      .is('deleted_at', null)
      .order('uploaded_at'),
    svc
      .from('role_application_events')
      .select('id, event_type, applicant_message, created_at')
      .eq('application_id', applicationId)
      .order('created_at'),
    svc
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('target_id', userId)
      .in('status', ['open', 'reviewing']),
    svc
      .from('fraud_flags')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', userId)
      .in('status', ['open', 'reviewing'])
      .in('severity', ['high', 'critical']),
    svc
      .from('role_applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['approved', 'rejected', 'withdrawn']),
    svc
      .from('audit_logs')
      .select('id, action, reason, created_at')
      .eq('entity_id', applicationId)
      .order('created_at'),
  ]);
  const p = (profile.data ?? {}) as Record<string, unknown>;
  const name =
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
    (p.nickname as string | undefined) ||
    'VouchPlay player';
  return {
    id: r.id as string,
    userId,
    status: r.status as ApplicationStatus,
    answers: (r.answers as Record<string, unknown>) ?? {},
    reviewReason: (r.review_reason as string | null) ?? null,
    submittedAt: (r.submitted_at as string) ?? (r.created_at as string),
    reviewStartedAt: (r.review_started_at as string | null) ?? null,
    respondedAt: (r.responded_at as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    retentionDeleteAfter: (r.retention_delete_after as string | null) ?? null,
    applicantName: name,
    applicantSlug: (p.slug as string | null) ?? null,
    accountStatus: (p.account_status as string | null) ?? 'unknown',
    city: (p.city as string | null) ?? null,
    evidence: (evidence.data ?? []).map((e) => {
      const x = e as Record<string, unknown>;
      return {
        id: x.id as string,
        filename: x.original_filename as string,
        mimeType: x.mime_type as string,
        sizeBytes: x.size_bytes as number,
        uploadedAt: x.uploaded_at as string,
      };
    }),
    events: (events.data ?? []).map((e) => {
      const x = e as Record<string, unknown>;
      return {
        id: x.id as string,
        type: x.event_type as string,
        message: (x.applicant_message as string | null) ?? null,
        createdAt: x.created_at as string,
      };
    }),
    safety: {
      openReports: reports.count ?? 0,
      openFraudFlags: flags.count ?? 0,
      priorRoleDecisions: decisions.count ?? 0,
    },
    auditHistory: (audit.data ?? []).map((a) => {
      const x = a as Record<string, unknown>;
      return {
        id: x.id as string,
        action: x.action as string,
        reason: (x.reason as string | null) ?? null,
        createdAt: x.created_at as string,
      };
    }),
  };
}

export const COACH_STATUS_LABEL: Readonly<Record<ApplicationStatus, string>> = {
  pending: 'Pending review',
  reviewing: 'Under review',
  information_requested: 'More information needed',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
