import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/moderation/staff';
import { getAdminSettings } from '@/lib/admin/settings';
import { SettingsForm } from '@/components/admin/settings-form';

export const metadata: Metadata = { title: 'System settings' };

/** Admin system-settings editor page (handover §30.7). */
export default async function AdminSettingsPage() {
  await requireAdminPage('/admin/settings');
  const { values, meta } = await getAdminSettings();

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/admin" className="text-foreground-muted hover:text-foreground text-sm">
          ← Admin
        </Link>
        <h1 className="text-foreground mt-2 text-xl font-semibold tracking-tight">
          System settings
        </h1>
        <p className="text-foreground-muted mt-1 text-sm">
          These values drive the whole platform at runtime. Changes take effect immediately and are
          audited.
        </p>
      </div>
      <SettingsForm values={values} meta={meta} />
    </section>
  );
}
