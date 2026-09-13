'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { startEntry } from '@/lib/actions/registration';
import type { ViewerRegistrationState } from '@/lib/tournaments/registration-queries';
import { DivisionStep } from './wizard/division-step';
import { PartnerStep } from './wizard/partner-step';
import { PayStep } from './wizard/pay-step';
import { ReceiptStep } from './wizard/receipt-step';
import { DoneStep } from './wizard/done-step';
import { StepRail } from './wizard/step-rail';
import type {
  WizardInitial,
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
 */

interface InternalState {
  step: WizardStep;
  divisionId: string | null;
  /** "I'll choose a division later" was chosen - a bare-slot reservation, no division at all yet. */
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
}

function initialState(initial: WizardInitial): InternalState {
  return {
    step: initial.step ?? 'division',
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
  };
}

export function RegistrationWizard({
  tournament,
  state,
  initial,
  onClose,
}: {
  tournament: WizardTournament;
  state: ViewerRegistrationState;
  initial: WizardInitial;
  onClose: () => void;
}) {
  const router = useRouter();
  const [wizard, setWizard] = useState<InternalState>(() => initialState(initial));

  // The division for the current step, resolved either from the id chosen on this visit or - when
  // the wizard was opened straight at Pay/Receipt for an existing entry (PayNowCell, `?entered=`) -
  // by finding which division that registration belongs to.
  const division = useMemo(() => {
    if (wizard.divisionId) {
      return tournament.divisions.find((d) => d.id === wizard.divisionId) ?? null;
    }
    if (wizard.registrationId) {
      const found = Object.entries(state.registrationsByDivision).find(
        ([, reg]) => reg.id === wizard.registrationId,
      );
      if (found) return tournament.divisions.find((d) => d.id === found[0]) ?? null;
    }
    return null;
  }, [
    wizard.divisionId,
    wizard.registrationId,
    tournament.divisions,
    state.registrationsByDivision,
  ]);

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

  function handleReceiptSuccess() {
    setWizard((w) => ({ ...w, paidNow: true, step: 'done' }));
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

  function goBack() {
    setWizard((w) => {
      if (w.step === 'receipt') return { ...w, step: 'pay' };
      if (w.step === 'pay') {
        if (w.reservationOnly) return { ...w, step: 'division' };
        return { ...w, step: isDoubles ? 'partner' : 'division' };
      }
      if (w.step === 'partner') return { ...w, step: 'division' };
      return w;
    });
  }

  const subtitle =
    wizard.step === 'division'
      ? 'Choose a division'
      : wizard.reservationOnly
        ? 'Reserve a slot'
        : (division?.name ?? undefined);

  return (
    <Modal title={tournament.name} subtitle={subtitle} size="lg" align="center" onClose={onClose}>
      <div key={wizard.step} className="vp-in">
        {wizard.step !== 'division' && wizard.step !== 'done' && (
          <button
            type="button"
            onClick={goBack}
            className="text-foreground-muted hover:text-foreground mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft size={15} aria-hidden />
            Back
          </button>
        )}
        {wizard.step !== 'done' && <StepRail step={wizard.step} includePartner={isDoubles} />}
        {wizard.error && (
          <p role="status" className="text-danger mb-3 text-sm">
            {wizard.error}
          </p>
        )}

        {wizard.step === 'division' && (
          <DivisionStep
            tournament={tournament}
            state={state}
            preselectedId={wizard.preselectConsumed ? null : wizard.divisionId}
            initialSelectedId={wizard.preselectConsumed ? wizard.divisionId : null}
            onClose={onClose}
            onContinue={handleDivisionContinue}
            onChooseLater={handleChooseDivisionLater}
          />
        )}

        {wizard.step === 'partner' && division && (
          <PartnerStep divisionId={division.id} state={state} onContinue={handlePartnerContinue} />
        )}

        {wizard.step === 'pay' && (
          <PayStep
            tournament={tournament}
            division={wizard.reservationOnly ? null : division}
            state={state}
            pending={wizard.submitting}
            onChoose={(payFor) => void handlePayChoose(payFor)}
            onPayLater={() => void handlePayLater()}
          />
        )}

        {wizard.step === 'receipt' && wizard.payFor && (
          <ReceiptStep
            tournament={tournament}
            division={wizard.reservationOnly ? null : division}
            state={state}
            registrationId={wizard.registrationId}
            payFor={wizard.payFor}
            onChangePayFor={handleChangePayFor}
            onSuccess={handleReceiptSuccess}
          />
        )}

        {wizard.step === 'done' && (
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
            state={state}
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
 * `?register=1` opens at Division, `?pay=<id>` opens straight at the Receipt for that registration
 * (master_plan §2AT Decision E; replaces the old `?entered=`, which now only opens the My
 * registrations panel - see `MyRegistrations`/`page.tsx` - and never the wizard). Mounted once near
 * the top of the tournament page; every other entry point (Enter on a division row, Pay now, Choose
 * your division) mounts its own `RegistrationWizard` directly with a more specific `initial`.
 */
export function RegistrationWizardLauncher({
  tournament,
  state,
  children,
}: {
  tournament: WizardTournament;
  state: ViewerRegistrationState | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<WizardInitial>({ step: 'division' });

  // Runs ONCE per mount, on purpose. `state` and `tournament` are fresh objects after every
  // router.refresh(), and re-running on them would re-open the wizard every time the page refreshed
  // with `?pay=` still in the URL - including the refresh that follows a successful receipt. A
  // registration that already has a receipt (or whose seat is paid) is never re-opened at Receipt.
  const stateRef = useRef(state);
  stateRef.current = state;
  const tournamentRef = useRef(tournament);
  tournamentRef.current = tournament;
  useEffect(() => {
    const current = stateRef.current;
    if (!current) return;
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const pay = params.get('pay');
    if (pay) {
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
      setInitial({ step: 'division' });
      setOpen(true);
    }
  }, []);

  if (!state) return <>{children}</>;

  return (
    <>
      <span
        role="presentation"
        className="contents"
        onClick={() => {
          setInitial({ step: 'division' });
          setOpen(true);
        }}
      >
        {children}
      </span>
      {open && (
        <RegistrationWizard
          tournament={tournament}
          state={state}
          initial={initial}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
