'use client';

import { useActionState } from 'react';
import {
  SETTINGS_CATALOG,
  SETTING_GROUPS,
  type SettingField,
  type SettingValue,
} from '@vouchplay/config';
import { updateSystemSettings } from '@/lib/actions/admin-settings';
import { SubmitButton } from '@/components/ui/button';
import { FormError, FormMessage } from '@/components/ui/field';

interface SettingMeta {
  updatedAt: string | null;
  updatedByName: string | null;
}

interface Props {
  values: Record<string, SettingValue>;
  meta: Record<string, SettingMeta>;
}

/**
 * Admin system-settings editor (handover §30.7). Renders one grouped form from the catalog and
 * posts to updateSystemSettings, which validates + audits server-side and saves only changed keys.
 */
export function SettingsForm({ values, meta }: Props) {
  const [state, action] = useActionState(
    updateSystemSettings,
    {} as { ok?: boolean; error?: string; message?: string },
  );

  return (
    <form action={action} className="space-y-6">
      {SETTING_GROUPS.map((group) => {
        const fields = SETTINGS_CATALOG.filter((f) => f.group === group.key);
        if (fields.length === 0) return null;
        return (
          <fieldset key={group.key} className="border-border bg-surface rounded-2xl border p-4">
            <legend className="text-foreground px-1 text-sm font-semibold">{group.label}</legend>
            {group.help && <p className="text-foreground-muted mb-3 text-xs">{group.help}</p>}
            <div className="space-y-3">
              {fields.map((f) => (
                <SettingRow key={f.key} field={f} value={values[f.key]} meta={meta[f.key]} />
              ))}
            </div>
          </fieldset>
        );
      })}

      {state?.error && <FormError>{state.error}</FormError>}
      {state?.ok && state?.message && <FormMessage>{state.message}</FormMessage>}

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}

function SettingRow({
  field,
  value,
  meta,
}: {
  field: SettingField;
  value: SettingValue | undefined;
  meta?: SettingMeta;
}) {
  const changedNote =
    meta?.updatedByName && meta.updatedAt
      ? `Last changed by ${meta.updatedByName} · ${new Date(meta.updatedAt).toLocaleDateString()}`
      : 'Default';

  if (field.kind === 'bool') {
    return (
      <label
        className={`flex items-start gap-3 rounded-xl border p-3 ${
          field.sensitive ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-background'
        }`}
      >
        <input
          type="checkbox"
          name={field.key}
          defaultChecked={value === true}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="text-foreground block text-sm font-medium">{field.label}</span>
          {field.help && <span className="text-foreground-muted block text-xs">{field.help}</span>}
          <span className="text-foreground-muted block text-[11px]">{changedNote}</span>
        </span>
      </label>
    );
  }

  if (field.kind === 'text') {
    return (
      <div>
        <label htmlFor={field.key} className="text-foreground block text-sm font-medium">
          {field.label}
        </label>
        {field.help && <p className="text-foreground-muted text-xs">{field.help}</p>}
        <textarea
          id={field.key}
          name={field.key}
          defaultValue={typeof value === 'string' ? value : ''}
          maxLength={field.maxLength}
          rows={2}
          className="border-border bg-background mt-1 w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <span className="text-foreground-muted text-[11px]">{changedNote}</span>
      </div>
    );
  }

  // int | float
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={field.key} className="min-w-0">
        <span className="text-foreground block text-sm font-medium">{field.label}</span>
        {field.help && <span className="text-foreground-muted block text-xs">{field.help}</span>}
        <span className="text-foreground-muted block text-[11px]">{changedNote}</span>
      </label>
      <input
        id={field.key}
        name={field.key}
        type="number"
        inputMode={field.kind === 'int' ? 'numeric' : 'decimal'}
        step={field.step ?? (field.kind === 'int' ? 1 : 'any')}
        min={field.min}
        max={field.max}
        defaultValue={typeof value === 'number' ? value : ''}
        className="border-border bg-background w-28 shrink-0 rounded-lg border px-3 py-2 text-right text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
    </div>
  );
}
