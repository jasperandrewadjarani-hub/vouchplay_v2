'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { startEntry } from '@/lib/actions/registration';
import { startGuestEntry, getGuestState } from '@/lib/actions/guest-registration';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { AboutYouStep } from './wizard/about-you-step';
import { DivisionStep } from './wizard/division-step';
import { PartnerStep, GuestPartnerStep } from './wizard/partner-step';
import { PayStep } from './wizard/pay-step';
import { ReceiptStep } from './wizard/receipt-step';
import { VerifyEmailStep } from './wizard/verify-email-step';
import { DoneStep } from './wizard/done-step';
import { StepRail } from './wizard/step-rail';
import { guestViewerState } from './wizard/shared';
import type {
  GuestFacts,
  WizardInitial,
  WizardMode,
  WizardPartner,
  WizardPayFor,
  WizardStep,
  WizardTournament,
} from './wizard/types';

export type { WizardTournament, WizardInitial } from './wizard/types';

/**
 * `payFor` for an existing registration jumping straight to the receipt (master_plan §2AT Decision
 * E) - `seat` for a doubles division (paying only your own slot), `team` for singles (paying the
 * whole, one-person "team"). Falls back to `team` if the registration cannot be resolved to a
 * division at all - conservative, since `team` is always a valid payer of last resort.
 */
export function resolvePayFor(
  tournament: WizardTournament,
  state: ViewerRegistrationState,
  registrationId: string,
): WizardPayFor {
  const found = Object.entries(state.registrationsByDivision).find(
    ([, reg]) => reg.id === registrationId,
  );
  if (!found) return 'team';
  const division = tournament.divisions.find((d) => d.id === found[0]);
  return division?.format === 'doubles' ? 'seat' : 'team';
}

/**
 * "Building a team in a game" (master_plan §2AO B): one step-at-a-time modal that replaces the three
 * old inline entry forms (partner search + acknowledge, "enter now choose a partner later", singles
 * register) and the top "Register" scroll. One decision per screen - Division, Partner (doubles
 * only), Pay, Receipt, Done - a step rail so a player always sees how many taps are left, big option
 * cards, one primary Continue and a plain Back.
 *
 * The wizard itself never touches money or a division until the player actually commits at the Pay
 * step: `startEntry` (one action that creates the team + registration, with or without a partner) is
 * called only when a payment option is chosen, when "I'll pay later" is confirmed for a division
 * entry, or immediately for a free division - never merely for picking a division or a partner.
 *
 * `mode: 'guest'` (master_plan §2AU) inserts About-you before Division and Verify-your-email after
 * Pay/Receipt, for a visitor with no account yet. Every guest fact stays LOCAL to this component
 * until Pay actually commits (`startGuestEntry`) - exactly the same "nothing happens until you
 * commit" rule the player-mode wizard already follows, just with one more up-front step. Player mode
 * (the default) is unchanged in every particular: same steps, same handlers, same behaviour.
 */

interface InternalState {
  step: WizardStep;
  divisionId: string | null;
  /** "I'll choose a division later" was chosen - a bare-slot reservation, no division at all yet.
   *  Never reachable in guest mode (master_plan §2AU §3 - hidden for guests in v1). */
  reservationOnly: boolean;
  playingDown: boolean;
  partner: WizardPartner | null;
  /** "I'll choose a partner later" was chosen instead of naming someone. */
  partnerChosenLater: boolean;
  acknowledgedPartner: boolean;
  registrationId: string | null;
  teamId: string | null;
  payFor: WizardPayFor | null;
  /** A receipt was actually submitted this visit (Receipt step succeeded). */
  paidNow: boolean;
  submitting: boolean;
  error: string | null;
  /** True once the initial pre-selected division has been handled (master_plan §2AS A1/Finding 1) -
   *  a recommended pre-selection behaves like a real tap and should only ever fire ONCE, on the
   *  wizard's very first mount. Set the first time Division's `onContinue` fires; from then on Back
   *  re-mounts Division with the previous choice merely highlighted, never auto-advancing again. */
  preselectConsumed: boolean;
  /** Guest mode only: the About-you facts, collected but nothing created from them yet (master_plan
   *  §2AU Decision A). Also doubles as "About-you is done" - null means still on that step. */
  guest: GuestFacts | null;
  /** Guest mode only: the partner's name, as a plain note - not an account, not an invitation yet
   *  (master_plan §2AU Decision D). */
  guestPartnerNote: string | null;
  /** Guest mode only: set when `startGuestEntry` reports the email already has an account - the
   *  wizard switches to the existing-account OTP branch for this address (master_plan §2AU
   *  Decision B). */
  existingAccountEmail: string | null;
}

function initialState(initial: WizardInitial, mode: WizardMode): InternalState {
  return {
    step: initial.step ?? (mode === 'guest' ? 'about-you' : 'division'),
    divisionId: initial.divisionId ?? null,
    reservationOnly: initial.payFor === 'reservation' && !initial.divisionId,
    playingDown: false,
    partner: null,
    partnerChosenLater: false,
    acknowledgedPartner: false,
    registrationId: initial.registrationId ?? null,
    teamId: null,
    payFor: initial.payFor ?? null,
    paidNow: false,
    submitting: false,
    error: null,
    preselectConsumed: false,
    guest: null,
    guestPartnerNote: null,
    existingAccountEmail: null,
  };
}

export function RegistrationWizard({
  tournament,
  state,
  mode = 'player',
  initial,
  onClose,
}: {
  tournament: WizardTournament;
  /** Null for a guest who has not created a shadow account yet (master_plan §2AU §1) - player mode
   *  always gets a real state, unchanged. */
  state: ViewerRegistrationState | null;
  mode?: WizardMode;
  initial: WizardInitial;
  onClose: () => void;
}) {
  const router = useRouter();
  const [wizard, setWizard] = useState<InternalState>(() => initialState(initial, mode));
  // The REAL state once a guest's shadow account exists (after `startGuestEntry` + `getGuestState`) -
  // from that point on Pay/Receipt/Done read exactly what an authed player's wizard would (master_plan
  // §2AU §1). Always null in player mode; the `state` prop is the real thing from the start there.
  const [guestState, setGuestState] = useState<ViewerRegistrationState | null>(null);

  // The state every step actually reads: the real prop (player mode, or a guest whose account now
  // exists), else - for a guest still on About-you/Division/Partner - a synthetic state built purely
  // from their own facts (master_plan §2AU §3), else null (About-you itself needs no state at all).
  const effectiveState: ViewerRegistrationState | null =
    state ??
    guestState ??
    (wizard.guest ? guestViewerState(wizard.guest, tournament.startAt) : null);

  // The division for the current step, resolved either from the id chosen on this visit or - when
  // the wizard was opened straight at Pay/Receipt for an existing entry (PayNowCell, `?entered=`) -
  // by finding which division that registration belongs to.
  const division = useMemo(() => {
    if (wizard.divisionId) {
      return tournament.divisions.find((d) => d.id === wizard.divisionId) ?? null;
    }
    if (wizard.registrationId && effectiveState) {
      const found = Object.entries(effectiveState.registrationsByDivision).find(
        ([, reg]) => reg.id === wizard.registrationId,
      );
      if (found) return tournament.divisions.find((d) => d.id === found[0]) ?? null;
    }
    return null;
  }, [wizard.divisionId, wizard.registrationId, tournament.divisions, effectiveState]);

  const isDoubles = Boolean(division && division.format === 'doubles');
  const isReservation = wizard.reservationOnly || wizard.payFor === 'reservation';

  async function createEntry(): Promise<{ ok: boolean; registrationId?: string; teamId?: string }> {
    if (!wizard.divisionId) return { ok: false };
    setWizard((w) => ({ ...w, submitting: true, error: null }));
    const res = await startEntry(tournament.id, {
      divisionId: wizard.divisionId,
      partnerSlug: wizard.partner?.slug ?? null,
      acknowledgedPartner: wizard.acknowledgedPartner,
      acknowledgedPlayDown: wizard.playingDown,
    });
    if (!res.ok || !res.registrationId) {
      setWizard((w) => ({
        ...w,
        submitting: false,
        error: res.error ?? 'Could not start your entry. Please try again.',
      }));
      return { ok: false };
    }
    setWizard((w) => ({
      ...w,
      submitting: false,
      registrationId: res.registrationId ?? null,
      teamId: res.teamId ?? null,
    }));
    return { ok: true, registrationId: res.registrationId, teamId: res.teamId };
  }

  /**
   * Guest equivalent of `createEntry` (master_plan §2AU Decision B/D) - calls `startGuestEntry` with
   * the About-you facts plus whatever this specific call needs, then loads the real state so Pay/
   * Receipt take over unchanged. `divisionId`/`playingDown`/`partnerNote` are taken as PARAMETERS
   * rather than read off `wizard` - every caller of this function sets one of those fields on `wizard`
   * in the very same synchronous handler that calls it, and a `setWizard` update is not visible to a
   * closure created before it, so reading `wizard.*` here would silently see the value from BEFORE
   * this call.
   */
  async function createGuestEntry(
    divisionId: string,
    playingDown: boolean,
    partnerNote: string | null,
  ): Promise<{
    ok: boolean;
    existingAccount?: true;
    registrationId?: string;
    teamId?: string;
  }> {
    if (!wizard.guest) return { ok: false };
    const guest = wizard.guest;
    setWizard((w) => ({ ...w, submitting: true, error: null }));
    const res = await startGuestEntry(tournament.id, {
      email: guest.email,
      firstName: guest.firstName,
      lastName: guest.lastName,
      sex: guest.sex,
      dateOfBirth: guest.dateOfBirth,
      selfRatedSkill: guest.selfRatedSkill,
      acceptedTerms: guest.acceptedTerms,
      divisionId,
      partnerNote,
      acknowledgedPlayDown: playingDown,
      website: guest.website,
    });
    if (res?.existingAccount) {
      setWizard((w) => ({ ...w, submitting: false, existingAccountEmail: guest.email }));
      return { ok: false, existingAccount: true };
    }
    if (!res?.ok || !res.registrationId) {
      setWizard((w) => ({
        ...w,
        submitting: false,
        error: res?.error ?? 'Could not start your entry. Please try again.',
      }));
      return { ok: false };
    }
    const fresh = await getGuestState(tournament.id);
    setGuestState(fresh);
    setWizard((w) => ({
      ...w,
      submitting: false,
      registrationId: res.registrationId ?? null,
      teamId: res.teamId ?? null,
    }));
    return { ok: true, registrationId: res.registrationId, teamId: res.teamId };
  }

  function handleAboutYouContinue(facts: GuestFacts) {
    setWizard((w) => ({ ...w, guest: facts, step: 'division' }));
  }

  function handleDivisionContinue(divisionId: string, playingDown: boolean) {
    const d = tournament.divisions.find((x) => x.id === divisionId);
    if (!d) return;
    if (d.format === 'doubles') {
      setWizard((w) => ({
        ...w,
        divisionId,
        playingDown,
        reservationOnly: false,
        preselectConsumed: true,
        step: 'partner',
      }));
      return;
    }
    if (d.feeAmount <= 0) {
      setWizard((w) => ({
        ...w,
        divisionId,
        playingDown,
        reservationOnly: false,
        preselectConsumed: true,
      }));
      void (async () => {
        if (mode === 'guest') {
          const res = await createGuestEntry(divisionId, playingDown, null);
          if (res.existingAccount) {
            setWizard((w) => ({ ...w, step: 'existing-account' }));
            return;
          }
          if (res.ok) setWizard((w) => ({ ...w, step: 'verify' }));
          return;
        }
        const res = await createEntry();
        if (res.ok) setWizard((w) => ({ ...w, step: 'done' }));
      })();
      return;
    }
    setWizard((w) => ({
      ...w,
      divisionId,
      playingDown,
      reservationOnly: false,
      preselectConsumed: true,
      step: 'pay',
    }));
  }

  function handleChooseDivisionLater() {
    // Unreachable in guest mode - the synthetic state's `slotsEnabled: false` hides the "choose a
    // division later" control entirely (master_plan §2AU §3). Kept for player mode, unchanged.
    setWizard((w) => ({
      ...w,
      divisionId: null,
      reservationOnly: true,
      payFor: 'reservation',
      step: 'pay',
    }));
  }

  function handlePartnerContinue(partner: WizardPartner | null, acknowledgedPartner: boolean) {
    setWizard((w) => ({ ...w, partner, partnerChosenLater: !partner, acknowledgedPartner }));
    if (division && division.feeAmount <= 0) {
      void (async () => {
        const res = await createEntry();
        if (res.ok) setWizard((w) => ({ ...w, step: 'done' }));
      })();
      return;
    }
    setWizard((w) => ({ ...w, step: 'pay' }));
  }

  function handleGuestPartnerContinue(partnerNote: string | null) {
    setWizard((w) => ({ ...w, guestPartnerNote: partnerNote }));
    if (division && division.feeAmount <= 0 && wizard.divisionId) {
      const divisionId = wizard.divisionId;
      const playingDown = wizard.playingDown;
      void (async () => {
        const res = await createGuestEntry(divisionId, playingDown, partnerNote);
        if (res.existingAccount) {
          setWizard((w) => ({ ...w, step: 'existing-account' }));
          return;
        }
        if (res.ok) setWizard((w) => ({ ...w, step: 'verify' }));
      })();
      return;
    }
    setWizard((w) => ({ ...w, step: 'pay' }));
  }

  async function handlePayChoose(payFor: WizardPayFor) {
    if (payFor === 'reservation') {
      setWizard((w) => ({ ...w, payFor, step: 'receipt' }));
      return;
    }
    if (wizard.registrationId) {
      setWizard((w) => ({ ...w, payFor, step: 'receipt' }));
      return;
    }
    const res = await createEntry();
    if (res.ok) setWizard((w) => ({ ...w, payFor, step: 'receipt' }));
  }

  async function handleGuestPayChoose(payFor: WizardPayFor) {
    if (!wizard.divisionId) return;
    const res = await createGuestEntry(
      wizard.divisionId,
      wizard.playingDown,
      wizard.guestPartnerNote,
    );
    if (res.existingAccount) {
      setWizard((w) => ({ ...w, step: 'existing-account' }));
      return;
    }
    if (res.ok) setWizard((w) => ({ ...w, payFor, step: 'receipt' }));
  }

  async function handlePayLater() {
    // "I'll pay later" closes the wizard outright now (master_plan §2AT Decision F) - no Done screen
    // for this path. A reservation creates nothing, so there is nothing to look at afterwards.
    if (isReservation) {
      onClose();
      return;
    }
    if (wizard.registrationId) {
      onClose();
      router.push(`?entered=${wizard.registrationId}#my-registrations`, { scroll: false });
      router.refresh();
      return;
    }
    const res = await createEntry();
    if (res.ok && res.registrationId) {
      onClose();
      router.push(`?entered=${res.registrationId}#my-registrations`, { scroll: false });
      router.refresh();
    }
  }

  async function handleGuestPayLater() {
    // Guests never close outright here (master_plan §2AU Decision D item 5) - they must at least see
    // how to come back, so this always lands on Verify rather than closing the wizard.
    if (!wizard.divisionId) return;
    const res = await createGuestEntry(
      wizard.divisionId,
      wizard.playingDown,
      wizard.guestPartnerNote,
    );
    if (res.existingAccount) {
      setWizard((w) => ({ ...w, step: 'existing-account' }));
      return;
    }
    if (res.ok) setWizard((w) => ({ ...w, step: 'verify' }));
  }

  function handleReceiptSuccess() {
    // Guests still need to verify their email before this is truly "done" (master_plan §2AU
    // Decision D) - a receipt succeeding does not skip that step.
    setWizard((w) => ({ ...w, paidNow: true, step: mode === 'guest' ? 'verify' : 'done' }));
  }

  /** The receipt screen's "Paying for: My slot / Whole team" switch (master_plan §2AS A/Decision A) -
   *  changes what is owed without a trip back through Pay. */
  function handleChangePayFor(payFor: WizardPayFor) {
    setWizard((w) => ({ ...w, payFor }));
  }

  function handleViewRegistrations() {
    const regId = wizard.registrationId;
    onClose();
    if (regId) router.push(`?entered=${regId}#my-registrations`, { scroll: false });
    router.refresh();
  }

  /** New-guest branch of Verify succeeds (master_plan §2AU Decision D item 6) - the session now
   *  exists, so a refresh picks it up everywhere else on the page; the wizard itself just continues
   *  to Done with the state it already loaded from `getGuestState`. */
  function handleGuestVerified() {
    router.refresh();
    setWizard((w) => ({ ...w, step: 'done' }));
  }

  /** Existing-account branch of Verify succeeds (master_plan §2AU Decision B) - this is now a signed-
   *  in PLAYER, not a guest continuing their own wizard: close this wizard and hand off to the normal
   *  player-mode entry point at the same division, via the launcher's own `?register=1&division=`
   *  handling (see `RegistrationWizardLauncher` below). Simplest correct option per the plan - no
   *  in-place re-mount needed. */
  function handleExistingAccountVerified() {
    const divisionId = wizard.divisionId;
    onClose();
    router.push(divisionId ? `?register=1&division=${divisionId}` : '?register=1', {
      scroll: false,
    });
    router.refresh();
  }

  function goBack() {
    setWizard((w) => {
      if (w.step === 'receipt') return { ...w, step: 'pay' };
      if (w.step === 'pay') {
        if (w.reservationOnly) return { ...w, step: 'division' };
        return { ...w, step: isDoubles ? 'partner' : 'division' };
      }
      if (w.step === 'partner') return { ...w, step: 'division' };
      if (w.step === 'division' && mode === 'guest') return { ...w, step: 'about-you' };
      return w;
    });
  }

  // Guests must at least see how to come back if they close mid-verification (master_plan §2AU
  // Decision D) - intercepted here so the Modal's X / overlay / Escape all go through it, instead of
  // vanishing the whole wizard the way every other step still does.
  function handleModalClose() {
    if (mode === 'guest' && wizard.step === 'verify') {
      setWizard((w) => ({ ...w, step: 'verify-later' }));
      return;
    }
    onClose();
  }

  const NO_BACK_STEPS: WizardStep[] = [
    'about-you',
    'done',
    'verify',
    'existing-account',
    'verify-later',
  ];
  const showBack =
    !NO_BACK_STEPS.includes(wizard.step) && !(wizard.step === 'division' && mode === 'player');

  const subtitle =
    wizard.step === 'about-you'
      ? 'About you'
      : wizard.step === 'division'
        ? 'Choose a division'
        : wizard.step === 'verify' ||
            wizard.step === 'existing-account' ||
            wizard.step === 'verify-later'
          ? 'Verify your email'
          : wizard.reservationOnly
            ? 'Reserve a slot'
            : (division?.name ?? undefined);

  return (
    <Modal
      title={tournament.name}
      subtitle={subtitle}
      size="lg"
      align="center"
      onClose={handleModalClose}
    >
      <div key={wizard.step} className="vp-in">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
            className="text-foreground-muted hover:text-foreground mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft size={15} aria-hidden />
            Back
          </button>
        )}
        {wizard.step !== 'done' && (
          <StepRail step={wizard.step} includePartner={isDoubles} mode={mode} />
        )}
        {wizard.error && (
          <p role="status" className="text-danger mb-3 text-sm">
            {wizard.error}
          </p>
        )}

        {wizard.step === 'about-you' && (
          <AboutYouStep
            slug={tournament.slug}
            initial={wizard.guest}
            onContinue={handleAboutYouContinue}
          />
        )}

        {wizard.step === 'division' && effectiveState && (
          <DivisionStep
            tournament={tournament}
            state={effectiveState}
            preselectedId={wizard.preselectConsumed ? null : wizard.divisionId}
            initialSelectedId={wizard.preselectConsumed ? wizard.divisionId : null}
            onClose={onClose}
            onContinue={handleDivisionContinue}
            onChooseLater={handleChooseDivisionLater}
          />
        )}

        {wizard.step === 'partner' &&
          division &&
          (mode === 'guest' ? (
            <GuestPartnerStep onContinue={handleGuestPartnerContinue} />
          ) : (
            effectiveState && (
              <PartnerStep
                divisionId={division.id}
                state={effectiveState}
                prefillSlug={initial.partnerSlug ?? null}
                onContinue={handlePartnerContinue}
              />
            )
          ))}

        {wizard.step === 'pay' && effectiveState && (
          <PayStep
            tournament={tournament}
            division={wizard.reservationOnly ? null : division}
            state={effectiveState}
            pending={wizard.submitting}
            onChoose={(payFor) =>
              void (mode === 'guest' ? handleGuestPayChoose(payFor) : handlePayChoose(payFor))
            }
            onPayLater={() => void (mode === 'guest' ? handleGuestPayLater() : handlePayLater())}
          />
        )}

        {wizard.step === 'receipt' && wizard.payFor && effectiveState && (
          <ReceiptStep
            tournament={tournament}
            division={wizard.reservationOnly ? null : division}
            state={effectiveState}
            registrationId={wizard.registrationId}
            payFor={wizard.payFor}
            onChangePayFor={handleChangePayFor}
            onSuccess={handleReceiptSuccess}
          />
        )}

        {wizard.step === 'verify' && wizard.guest && (
          <VerifyEmailStep email={wizard.guest.email} onVerified={handleGuestVerified} />
        )}

        {wizard.step === 'existing-account' && wizard.existingAccountEmail && (
          <VerifyEmailStep
            email={wizard.existingAccountEmail}
            heading="You already have an account"
            description={`We'll send a code to ${wizard.existingAccountEmail}.`}
            onVerified={handleExistingAccountVerified}
          />
        )}

        {wizard.step === 'verify-later' && wizard.guest && (
          <div className="space-y-4 text-center">
            <p className="text-foreground text-lg font-semibold">Your entry is saved</p>
            <p className="text-foreground-muted text-sm">
              Your entry is saved under{' '}
              <span className="text-foreground font-medium">{wizard.guest.email}</span>. Enter the
              code from your email any time, or sign in with that address.
            </p>
            <Button type="button" onClick={onClose} className="w-full">
              Close
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-foreground-muted hover:text-foreground min-h-11 w-full text-center text-sm font-medium underline underline-offset-2"
            >
              Wrong email? Start again
            </button>
          </div>
        )}

        {wizard.step === 'done' && effectiveState && (
          <DoneStep
            outcome={{
              registrationId: wizard.registrationId,
              payFor: wizard.payFor,
              paidNow: wizard.paidNow,
              partnerNamed: Boolean(wizard.partner) && !wizard.partnerChosenLater,
              partnerChosenLater: wizard.partnerChosenLater,
              isReservation,
              registrationCloseAt: tournament.registrationCloseAt ?? null,
            }}
            tournament={tournament}
            state={effectiveState}
            onViewRegistrations={handleViewRegistrations}
            onClose={onClose}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Renders a trigger (`children`) that opens the wizard, and auto-opens it from a shared link:
 * `?register=1` opens at Division (or About-you in guest mode), `?pay=<id>` opens straight at the
 * Receipt for that registration (master_plan §2AT Decision E; replaces the old `?entered=`, which now
 * only opens the My registrations panel - see `MyRegistrations`/`page.tsx` - and never the wizard).
 * `?register=1&division=<id>` also pre-selects that division - used by the guest wizard's
 * existing-account recovery (master_plan §2AU Decision B) to re-open in player mode exactly where the
 * guest left off, once they have verified and `mode` has flipped back to `'player'`.
 *
 * Mounted once near the top of the tournament page; every other entry point (Enter on a division row,
 * Pay now, Choose your division) mounts its own `RegistrationWizard` directly with a more specific
 * `initial`.
 */
export function RegistrationWizardLauncher({
  tournament,
  state,
  mode = 'player',
  children,
}: {
  tournament: WizardTournament;
  state: ViewerRegistrationState | null;
  /** Anonymous + `guestRegistrationEnabled` opens the wizard in guest mode instead of requiring an
   *  account first (master_plan §2AU Decision H). Defaults to 'player' - every existing caller is
   *  unaffected. */
  mode?: WizardMode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<WizardInitial>({
    step: mode === 'guest' ? 'about-you' : 'division',
  });

  // `state` and `tournament` are fresh objects after every router.refresh() - re-running the effect
  // on them would re-open the wizard every time the page refreshed with `?pay=` still in the URL
  // (including the refresh that follows a successful receipt), UNLESS the actual URL query string is
  // unchanged. So the guard is the search string itself, not "did this run before": a genuine query
  // change - a fresh `?register=1`, or the guest existing-account recovery's own
  // `router.push('?register=1&division=...')` once the viewer is signed in (master_plan §2AU
  // Decision B) - still gets processed even though this component never unmounts across that
  // transition (`mode` flips from 'guest' to 'player' via a prop change, not a remount).
  const stateRef = useRef(state);
  stateRef.current = state;
  const tournamentRef = useRef(tournament);
  tournamentRef.current = tournament;
  const lastHandledSearch = useRef<string | null>(null);

  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const search = params.toString();
    if (lastHandledSearch.current === search) return;
    // A player-mode auto-open needs real viewer state to resolve `?pay=`/registration lookups; guest
    // mode has none yet by design - state stays null until About-you + startGuestEntry.
    if (mode === 'player' && !stateRef.current) return;
    lastHandledSearch.current = search;

    const pay = params.get('pay');
    if (pay) {
      const current = stateRef.current;
      if (!current) return;
      const found = Object.entries(current.registrationsByDivision).find(([, r]) => r.id === pay);
      const reg = found?.[1];
      const alreadyPaying =
        !reg ||
        reg.paymentSummary?.anyReceipt ||
        reg.paymentStatus === 'submitted' ||
        reg.mySeat === 'paid' ||
        reg.mySeat === 'submitted';
      if (!alreadyPaying && found) {
        const division = tournamentRef.current.divisions.find((d) => d.id === found[0]);
        const payFor: WizardPayFor = division?.format === 'doubles' ? 'seat' : 'team';
        setInitial({ step: 'receipt', registrationId: pay, payFor });
        setOpen(true);
      }
      return;
    }
    if (params.get('register') === '1') {
      const divisionId = params.get('division');
      // `?partner=<slug>` (master_plan §2AV F "enter together" door) - carried through to the
      // Partner step below; player mode only, a guest has no accounts to pre-select from.
      const partnerSlug = params.get('partner');
      setInitial(
        mode === 'guest'
          ? { step: 'about-you' }
          : { step: 'division', divisionId: divisionId || null, partnerSlug: partnerSlug || null },
      );
      setOpen(true);
    }
  }, [state, mode]);

  if (mode === 'player' && !state) return <>{children}</>;

  return (
    <>
      <span
        role="presentation"
        className="contents"
        onClick={() => {
          setInitial({ step: mode === 'guest' ? 'about-you' : 'division' });
          setOpen(true);
        }}
      >
        {children}
      </span>
      {open && (
        <RegistrationWizard
          tournament={tournament}
          state={state}
          mode={mode}
          initial={initial}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
