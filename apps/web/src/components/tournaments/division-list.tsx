import { Users, Coins, ShieldCheck } from 'lucide-react';
import type { DivisionDTO } from '@/lib/tournaments/dto';

/** Read-only division display (handover §18) for the public tournament page. */
export function DivisionList({ divisions }: { divisions: DivisionDTO[] }) {
  const visible = divisions.filter((d) => d.status !== 'draft' && d.status !== 'cancelled');
  if (visible.length === 0) {
    return <p className="text-foreground-muted text-sm">No divisions published yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {visible.map((d) => (
        <li key={d.id} className="border-border rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground text-sm font-semibold">{d.name}</span>
            <span className="text-foreground-muted text-xs capitalize">{d.status}</span>
          </div>
          <div className="text-foreground-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="capitalize">{d.format}</span>
            {d.capacityTeams > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users size={12} aria-hidden />
                {d.capacityTeams} teams
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Coins size={12} aria-hidden />
              {d.feeAmount > 0 ? `${d.currency} ${d.feeAmount.toLocaleString()}` : 'Free'}
            </span>
            {d.skillVerifiedRequired && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={12} aria-hidden />
                Skill-verified only
              </span>
            )}
            {d.minimumSts != null && <span>Min STS {d.minimumSts.toFixed(1)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
