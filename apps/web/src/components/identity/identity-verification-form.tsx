'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ui/button';
import { submitIdentityVerification, type IdentityActionState } from '@/lib/actions/identity';
import { IDENTITY_DOCUMENT_TYPES } from '@/lib/identity/document-types';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  national_id: 'National ID',
  passport: 'Passport',
  drivers_license: "Driver's license",
  other: 'Other government ID',
};

const empty: IdentityActionState = {};

/** Upload form for Me → Settings → "Verify my identity" (master_plan §2AG Phase C). */
export function IdentityVerificationForm() {
  const [state, action] = useActionState(submitIdentityVerification, empty);

  return (
    <form action={action} className="border-border bg-surface space-y-4 rounded-2xl border p-5">
      <div>
        <label htmlFor="documentType" className="text-foreground text-sm font-medium">
          Document type
        </label>
        <select
          id="documentType"
          name="documentType"
          required
          defaultValue=""
          className="border-border bg-background text-foreground mt-1.5 w-full rounded-xl border px-3 py-3 text-base"
        >
          <option value="" disabled>
            Choose a document type
          </option>
          {IDENTITY_DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {DOCUMENT_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="document" className="text-foreground text-sm font-medium">
          Photo of your ID
        </label>
        <input
          id="document"
          name="document"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          required
          className="border-border bg-background text-foreground mt-1.5 w-full rounded-xl border px-3 py-3 text-sm"
        />
        <p className="text-foreground-muted mt-1 text-xs">PNG, JPG, WebP, or PDF, up to 5 MB.</p>
      </div>

      {state.error && (
        <p className="text-danger text-sm" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="text-success text-sm" role="status">
          {state.message}
        </p>
      )}

      <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
    </form>
  );
}
