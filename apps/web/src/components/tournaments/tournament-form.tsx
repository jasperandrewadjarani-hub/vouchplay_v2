'use client';

import type { ReactNode } from 'react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TournamentActionState } from '@/lib/actions/tournament';
import { Field, Input, Select, FormError, FormMessage } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/button';

const empty: TournamentActionState = {};

export interface TournamentFormInitial {
  name?: string;
  city?: string;
  venueName?: string;
  description?: string;
  visibility?: string;
  startAt?: string;
  endAt?: string;
  registrationOpenAt?: string;
  registrationCloseAt?: string;
  earlyBirdStartsAt?: string;
  earlyBirdEndsAt?: string;
  contact?: string;
  termsText?: string;
  paymentInstructions?: string;
  paymentMethods?: string;
  /** Organizer-designated address that receives a copy of every uploaded receipt (§2AK). */
  paymentNotificationEmail?: string;
  coverUrl?: string;
  /** Short-lived signed URL for the currently saved payment QR, if any (organizer-only read). */
  paymentQrUrl?: string;
  /** Single tournament-wide club representation lock, as a datetime-local string. */
  clubLockAt?: string;
  /** Partner lock-in, as a datetime-local string; blank means the 7-day default applies (§2AM). */
  partnerLockAt?: string;
  /** Pre-formatted "Currently {date}" label for the effective default lock, shown only when
   *  `partnerLockAt` is blank and a start date exists. Computed by the caller (PH time). */
  partnerLockEffectiveLabel?: string;
  /** Organizer global rules (migration 0022). */
  enforceSkillFloor?: boolean;
  requireSkillVerified?: boolean;
  requireOrganizerApproval?: boolean;
  /** Play one level down (migration 0042, master_plan §2AO C). Only meaningful alongside
   *  `enforceSkillFloor`; the checkbox is nested under it in the form. */
  allowPlayDownOneLevel?: boolean;
}

const textarea =
  'border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

/** Shared create/edit tournament form (handover §17.3). The parent binds the server action. */
export function TournamentForm({
  action,
  initial = {},
  submitLabel,
  refreshOnSuccess = false,
  minimal = false,
  emailDeliveryReady = false,
  testButton,
}: {
  action: (state: TournamentActionState, formData: FormData) => Promise<TournamentActionState>;
  initial?: TournamentFormInitial;
  submitLabel: string;
  refreshOnSuccess?: boolean;
  /** Minimal mode (create): just the essentials; the rest is edited later on Manage. */
  minimal?: boolean;
  /** Whether the server's email channel is configured (§2AK) - shown next to the notification field. */
  emailDeliveryReady?: boolean;
  /** Organizer-only "send a test email" control, rendered under the notification field's hint. */
  testButton?: ReactNode;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, empty);
  const [coverPreview, setCoverPreview] = useState<string | null>(initial.coverUrl ?? null);
  const [selectedCoverName, setSelectedCoverName] = useState<string | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(initial.paymentQrUrl ?? null);
  const [selectedQrName, setSelectedQrName] = useState<string | null>(null);
  const [qrJustSaved, setQrJustSaved] = useState(false);
  const qrSubmittedRef = useRef(false);

  useEffect(() => {
    if (state.ok) {
      setSelectedCoverName(null);
      if (qrSubmittedRef.current) setQrJustSaved(true);
      qrSubmittedRef.current = false;
      setSelectedQrName(null);
      if (refreshOnSuccess) router.refresh();
    }
  }, [state, refreshOnSuccess, router]);

  useEffect(() => {
    if (!selectedCoverName) setCoverPreview(initial.coverUrl ?? null);
  }, [initial.coverUrl, selectedCoverName]);

  useEffect(() => {
    if (!selectedQrName) setQrPreview(initial.paymentQrUrl ?? null);
  }, [initial.paymentQrUrl, selectedQrName]);

  useEffect(() => {
    const timer = qrJustSaved ? setTimeout(() => setQrJustSaved(false), 6000) : undefined;
    return () => clearTimeout(timer);
  }, [qrJustSaved]);

  useEffect(
    () => () => {
      if (qrPreview?.startsWith('blob:')) URL.revokeObjectURL(qrPreview);
    },
    [qrPreview],
  );

  useEffect(
    () => () => {
      if (coverPreview?.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
    },
    [coverPreview],
  );

  return (
    <form
      action={formAction}
      onSubmit={() => {
        qrSubmittedRef.current = Boolean(selectedQrName);
      }}
      className="space-y-4"
    >
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>

      <Field label="Tournament name" htmlFor="name" required>
        <Input id="name" name="name" required maxLength={120} defaultValue={initial.name ?? ''} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" maxLength={120} defaultValue={initial.city ?? ''} />
        </Field>
        {!minimal && (
          <Field label="Venue" htmlFor="venueName">
            <Input
              id="venueName"
              name="venueName"
              maxLength={200}
              defaultValue={initial.venueName ?? ''}
            />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="startAt" hint="Time is optional; a date is enough.">
          <Input id="startAt" name="startAt" type="date" defaultValue={initial.startAt ?? ''} />
        </Field>
        <Field label="End date" htmlFor="endAt">
          <Input id="endAt" name="endAt" type="date" defaultValue={initial.endAt ?? ''} />
        </Field>
      </div>
      <Field label="Visibility" htmlFor="visibility" required>
        <Select
          id="visibility"
          name="visibility"
          defaultValue={initial.visibility ?? 'public'}
          required
        >
          <option value="public">Public (listed in discovery)</option>
          <option value="unlisted">Unlisted (reachable by link only)</option>
        </Select>
      </Field>
      {minimal && (
        <p className="text-foreground-muted text-xs">
          You can add divisions, venue, registration dates, and payment details after creating the
          tournament.
        </p>
      )}
      {!minimal && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Registration opens" htmlFor="registrationOpenAt">
            <Input
              id="registrationOpenAt"
              name="registrationOpenAt"
              type="datetime-local"
              defaultValue={initial.registrationOpenAt ?? ''}
            />
          </Field>
          <Field label="Registration closes" htmlFor="registrationCloseAt">
            <Input
              id="registrationCloseAt"
              name="registrationCloseAt"
              type="datetime-local"
              defaultValue={initial.registrationCloseAt ?? ''}
            />
          </Field>
          {/* One window for the whole tournament, shared by every division (§1V). Dates here and
              amounts on each division: the deadline is one decision made once, while how much off
              can differ per bracket. Eleven copies of the same date is eleven chances to typo it. */}
          <Field
            label="Early bird starts"
            htmlFor="earlyBirdStartsAt"
            hint="Optional. Applies to every division. Set the discounted amount on each division."
          >
            <Input
              id="earlyBirdStartsAt"
              name="earlyBirdStartsAt"
              type="datetime-local"
              defaultValue={initial.earlyBirdStartsAt ?? ''}
            />
          </Field>
          <Field
            label="Early bird ends"
            htmlFor="earlyBirdEndsAt"
            hint="Both dates are needed. If either is blank, the normal fee applies everywhere."
          >
            <Input
              id="earlyBirdEndsAt"
              name="earlyBirdEndsAt"
              type="datetime-local"
              defaultValue={initial.earlyBirdEndsAt ?? ''}
            />
          </Field>
        </div>
      )}
      {!minimal && (
        <fieldset className="border-border space-y-3 rounded-xl border p-4">
          <legend className="text-foreground px-1 text-sm font-semibold">Registration rules</legend>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="enforceSkillFloor"
              defaultChecked={initial.enforceSkillFloor ?? true}
              className="mt-0.5"
            />
            <span>
              <span className="text-foreground block font-medium">
                Only allow players at each division&apos;s level or higher
              </span>
              <span className="text-foreground-muted block text-xs">
                Players cannot join a division below their skill level. Recommended.
              </span>
            </span>
          </label>
          {/* Play one level down (master_plan §2AO C) - nested under the floor rule above, since it
              only has an effect when that rule is on. */}
          <label className="ml-6 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="allowPlayDownOneLevel"
              defaultChecked={initial.allowPlayDownOneLevel ?? false}
              className="mt-0.5"
            />
            <span>
              <span className="text-foreground block font-medium">
                Allow players one level below their skill to enter
              </span>
              <span className="text-foreground-muted block text-xs">
                They see a warning that their division is subject to your final skills assessment,
                and the entry lands in Needs review.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="requireSkillVerified"
              defaultChecked={initial.requireSkillVerified ?? false}
              className="mt-0.5"
            />
            <span>
              <span className="text-foreground block font-medium">
                Require Skill Verified players
              </span>
              <span className="text-foreground-muted block text-xs">
                Applies to every division in this tournament.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="requireOrganizerApproval"
              defaultChecked={initial.requireOrganizerApproval ?? false}
              className="mt-0.5"
            />
            <span>
              <span className="text-foreground block font-medium">
                Require organizer approval to register
              </span>
              <span className="text-foreground-muted block text-xs">
                You review every entry before it is confirmed.
              </span>
            </span>
          </label>
        </fieldset>
      )}
      {!minimal && (
        <Field
          label="Club selection lock"
          htmlFor="clubLockAt"
          hint="After this time players cannot change the clubs they represent. Leave empty to allow changes until the tournament runs."
        >
          <Input
            id="clubLockAt"
            name="clubLockAt"
            type="datetime-local"
            defaultValue={initial.clubLockAt ?? ''}
          />
        </Field>
      )}
      {!minimal && (
        <Field
          label="Partner lock-in"
          htmlFor="partnerLockAt"
          hint="Players must have a confirmed partner by then. Leave blank for 7 days before the start date."
        >
          <Input
            id="partnerLockAt"
            name="partnerLockAt"
            type="datetime-local"
            defaultValue={initial.partnerLockAt ?? ''}
          />
          {!initial.partnerLockAt && initial.partnerLockEffectiveLabel && (
            <p className="text-foreground-muted mt-1 text-xs">
              Currently {initial.partnerLockEffectiveLabel}
            </p>
          )}
        </Field>
      )}
      {!minimal && (
        <>
          <Field label="Description" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={initial.description ?? ''}
              className={textarea}
            />
          </Field>
          <Field
            label="Contact"
            htmlFor="contact"
            hint="A page link, email, or phone for enquiries."
          >
            <Input
              id="contact"
              name="contact"
              maxLength={200}
              defaultValue={initial.contact ?? ''}
            />
          </Field>
          <Field label="Terms / rules" htmlFor="termsText">
            <textarea
              id="termsText"
              name="termsText"
              rows={3}
              maxLength={8000}
              defaultValue={initial.termsText ?? ''}
              className={textarea}
            />
          </Field>
          <Field
            label="Payment instructions"
            htmlFor="paymentInstructions"
            hint="Shown to registrants (payments come in a later phase)."
          >
            <textarea
              id="paymentInstructions"
              name="paymentInstructions"
              rows={2}
              maxLength={2000}
              defaultValue={initial.paymentInstructions ?? ''}
              className={textarea}
            />
          </Field>
          <Field
            label="Accepted payment methods"
            htmlFor="paymentMethods"
            hint="Comma-separated labels, e.g. GCash, Maya, bank transfer."
          >
            <Input
              id="paymentMethods"
              name="paymentMethods"
              maxLength={300}
              defaultValue={initial.paymentMethods ?? ''}
            />
          </Field>
          <div className="space-y-1.5">
            <Field
              label="Send receipt notifications to"
              htmlFor="paymentNotificationEmail"
              hint="Every uploaded payment receipt is emailed here - the person who checks the bank account. Leave blank to turn off."
            >
              <Input
                type="email"
                id="paymentNotificationEmail"
                name="paymentNotificationEmail"
                autoComplete="email"
                placeholder="e.g. treasurer@club.ph"
                maxLength={254}
                defaultValue={initial.paymentNotificationEmail ?? ''}
              />
            </Field>
            {emailDeliveryReady === false && (
              <p className="text-foreground-muted text-xs">
                Email delivery is not switched on for this server yet - ask VouchPlay support.
              </p>
            )}
            {testButton}
          </div>
          <Field
            label="Payment QR"
            htmlFor="paymentQr"
            hint="Private QR image shown only to a registrant during payment. PNG, JPG, or WebP up to 5 MB."
          >
            <div className="space-y-3">
              {qrPreview && (
                <div className="border-border bg-surface-muted h-40 w-40 overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrPreview}
                    alt={
                      selectedQrName ? 'Selected payment QR preview' : 'Current saved payment QR'
                    }
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <input
                id="paymentQr"
                name="paymentQr"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  qrSubmittedRef.current = false;
                  setSelectedQrName(file?.name ?? null);
                  setQrPreview(file ? URL.createObjectURL(file) : (initial.paymentQrUrl ?? null));
                }}
                className="text-foreground-muted file:border-border file:bg-surface file:text-foreground text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="text-foreground-muted text-xs" aria-live="polite">
                {qrJustSaved
                  ? 'Payment QR saved. It is private and visible only to a registrant during payment.'
                  : selectedQrName
                    ? `Ready to upload: ${selectedQrName}`
                    : qrPreview
                      ? 'Saved and private. Choose a new image only to replace it.'
                      : 'No payment QR saved yet.'}
              </p>
            </div>
          </Field>
          <Field
            label="Cover photo (optional)"
            htmlFor="cover"
            hint="PNG, JPG, or WebP up to 4 MB. Landscape works best."
          >
            <div className="space-y-3">
              {coverPreview && (
                <div className="border-border bg-surface-muted aspect-video w-full max-w-xl overflow-hidden rounded-xl border">
                  {/* Browser-selected blob URLs and existing public storage URLs both need a preview. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={coverPreview}
                    alt={
                      selectedCoverName
                        ? 'Selected tournament cover preview'
                        : 'Current tournament cover'
                    }
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <input
                id="cover"
                name="cover"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedCoverName(file?.name ?? null);
                  setCoverPreview(file ? URL.createObjectURL(file) : (initial.coverUrl ?? null));
                }}
                className="text-foreground-muted file:border-border file:bg-surface file:text-foreground text-sm file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="text-foreground-muted text-xs" aria-live="polite">
                {selectedCoverName
                  ? `Ready to upload: ${selectedCoverName}`
                  : initial.coverUrl
                    ? 'Choose a new image only if you want to replace the current cover.'
                    : 'No cover selected.'}
              </p>
            </div>
          </Field>
        </>
      )}

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
