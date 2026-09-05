import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { CreateClubForm } from '@/components/clubs/create-club-form';

export const metadata: Metadata = { title: 'Create a club' };

export default async function NewClubPage() {
  await requireUser('/clubs/new');
  return (
    <section className="mx-auto max-w-md space-y-5">
      <div>
        <Link href="/clubs" className="text-foreground-muted hover:text-foreground text-sm">
          ← Clubs
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">Create a club</h1>
        <p className="text-foreground-muted mt-1 text-sm">
          Start a community. You can invite and approve members once it&apos;s created.
        </p>
      </div>
      <div className="border-border bg-surface rounded-2xl border p-5">
        <CreateClubForm />
      </div>
    </section>
  );
}
