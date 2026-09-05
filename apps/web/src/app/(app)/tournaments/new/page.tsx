import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { createTournament } from '@/lib/actions/tournament';
import { TournamentForm } from '@/components/tournaments/tournament-form';

export const metadata: Metadata = { title: 'Create a tournament' };

export default async function NewTournamentPage() {
  const user = await requireUser('/tournaments/new');
  // Gate the page on the organizer role (§17.1) — the action re-checks server-side.
  const svc = createServiceClient();
  const { data } = await svc
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['organizer', 'admin', 'super_admin']);
  if ((data ?? []).length === 0) redirect('/me?organizer=1');

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/tournaments" className="text-foreground-muted hover:text-foreground text-sm">
          ← Tournaments
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">
          Create a tournament
        </h1>
        <p className="text-foreground-muted mt-1 text-sm">
          It starts as a draft. You&apos;ll add divisions and publish when ready.
        </p>
      </div>
      <div className="border-border bg-surface rounded-2xl border p-5">
        <TournamentForm action={createTournament} submitLabel="Create tournament" />
      </div>
    </section>
  );
}
