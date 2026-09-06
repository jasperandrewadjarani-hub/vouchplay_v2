'use client';

import { useState, useTransition } from 'react';
import { ShieldOff, BadgeCheck, UserCog } from 'lucide-react';
import { grantRole, revokeRole, setManualSkillVerified } from '@/lib/actions/admin-users';
import { applyAccountAction, type AccountAction } from '@/lib/actions/moderation';

type Msg = { ok: boolean; text: string } | null;

const GRANTABLE = ['coach', 'organizer', 'moderator', 'support'] as const;
const PRIVILEGED = ['admin', 'super_admin'] as const;

const ACCOUNT_ACTIONS: {
  action: AccountAction;
  label: string;
  timed?: boolean;
  danger?: boolean;
}[] = [
  { action: 'warn', label: 'Warn' },
  { action: 'restrict_vouching', label: 'Restrict vouching', timed: true },
  { action: 'restrict_account', label: 'Restrict account' },
  { action: 'suspend', label: 'Suspend', timed: true, danger: true },
  { action: 'ban', label: 'Ban', danger: true },
  { action: 'lift_status', label: 'Lift restriction' },
];

export function UserAdminPanel({
  userId,
  activeRoles,
  skillVerified,
  canManagePrivileged,
}: {
  userId: string;
  activeRoles: string[];
  skillVerified: boolean;
  canManagePrivileged: boolean;
}) {
  const roleOptions = [...GRANTABLE, ...(canManagePrivileged ? PRIVILEGED : [])].filter(
    (r) => !activeRoles.includes(r),
  );

  return (
    <div className="space-y-4">
      <RolesSection userId={userId} activeRoles={activeRoles} roleOptions={roleOptions} />
      <SkillVerifiedSection userId={userId} skillVerified={skillVerified} />
      <AccountSection userId={userId} />
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Result({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      className={`mt-2 text-xs ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
    >
      {msg.text}
    </p>
  );
}

const reasonInput =
  'border-border bg-background w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';
const btn = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60';

function RolesSection({
  userId,
  activeRoles,
  roleOptions,
}: {
  userId: string;
  activeRoles: string[];
  roleOptions: string[];
}) {
  const [reason, setReason] = useState('');
  const [role, setRole] = useState(roleOptions[0] ?? '');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  function doGrant() {
    if (!role) return;
    setMsg(null);
    start(async () => {
      const res = await grantRole(userId, role, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
    });
  }
  function doRevoke(r: string) {
    setMsg(null);
    start(async () => {
      const res = await revokeRole(userId, r, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
    });
  }

  return (
    <Card icon={UserCog} title="Roles">
      <div className="mb-3 flex flex-wrap gap-2">
        {activeRoles.length === 0 && (
          <span className="text-foreground-muted text-xs">No roles (regular player).</span>
        )}
        {activeRoles.map((r) => (
          <span
            key={r}
            className="border-border text-foreground flex items-center gap-2 rounded-full border px-2 py-1 text-xs"
          >
            <span className="capitalize">{r.replace('_', ' ')}</span>
            <button
              type="button"
              onClick={() => doRevoke(r)}
              disabled={pending}
              className="text-red-600 hover:underline disabled:opacity-60 dark:text-red-400"
            >
              revoke
            </button>
          </span>
        ))}
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required, audited)"
        className={reasonInput}
      />

      {roleOptions.length > 0 && (
        <div className="mt-2 flex gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border-border bg-background rounded-lg border px-3 py-1.5 text-xs capitalize"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={doGrant}
            disabled={pending || !role}
            className={`${btn} vp-gradient text-white`}
          >
            Grant role
          </button>
        </div>
      )}
      <Result msg={msg} />
    </Card>
  );
}

function SkillVerifiedSection({
  userId,
  skillVerified,
}: {
  userId: string;
  skillVerified: boolean;
}) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  function toggle(on: boolean) {
    setMsg(null);
    start(async () => {
      const res = await setManualSkillVerified(userId, on, reason);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
    });
  }

  return (
    <Card icon={BadgeCheck} title="Skill-Verified override">
      <p className="text-foreground-muted mb-2 text-xs">
        Currently{' '}
        <span className="text-foreground font-medium">
          {skillVerified ? 'Skill-Verified' : 'not Skill-Verified'}
        </span>
        . An override sets the badge without changing the calculated STS/CSL.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required, audited)"
        className={reasonInput}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={pending}
          className={`${btn} border-border text-foreground hover:border-primary border`}
        >
          Set override
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          disabled={pending}
          className={`${btn} border-border text-foreground-muted hover:text-foreground border`}
        >
          Remove override
        </button>
      </div>
      <Result msg={msg} />
    </Card>
  );
}

function AccountSection({ userId }: { userId: string }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  function run(action: AccountAction, timed?: boolean) {
    setMsg(null);
    const duration = timed && days.trim() ? Number(days) : undefined;
    start(async () => {
      const res = await applyAccountAction(userId, action, reason, duration);
      setMsg({ ok: !!res.ok, text: res.ok ? (res.message ?? 'Done.') : (res.error ?? 'Failed.') });
    });
  }

  return (
    <Card icon={ShieldOff} title="Account actions">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required, audited)"
        className={reasonInput}
      />
      <div className="mt-2 flex items-center gap-2">
        <label className="text-foreground-muted text-xs">Duration (days, optional):</label>
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="border-border bg-background w-20 rounded-lg border px-2 py-1 text-xs"
          placeholder="∞"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {ACCOUNT_ACTIONS.map((a) => (
          <button
            key={a.action}
            type="button"
            onClick={() => run(a.action, a.timed)}
            disabled={pending}
            className={`${btn} border ${
              a.danger
                ? 'border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400'
                : 'border-border text-foreground hover:border-primary'
            }`}
          >
            {a.label}
            {a.timed ? ' ⏱' : ''}
          </button>
        ))}
      </div>
      <Result msg={msg} />
    </Card>
  );
}
