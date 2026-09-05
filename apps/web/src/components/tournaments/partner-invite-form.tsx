'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invitePartner, type RegistrationActionState } from '@/lib/actions/registration';
import { Input, FormError, FormMessage } from '@/components/ui/field';

const empty: RegistrationActionState = {};

/** Invite a partner to a doubles division by profile handle (handover §20.2). */
export function PartnerInviteForm({
  tournamentId,
  divisionId,
}: {
  tournamentId: string;
  divisionId: string;
}) {
  const router = useRouter();
  const action = invitePartner.bind(null, tournamentId);
  const [state, formAction] = useActionState(action, empty);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="divisionId" value={divisionId} />
      <FormMessage>{state.ok ? state.message : undefined}</FormMessage>
      <FormError>{state.error}</FormError>
      <div className="flex gap-2">
        <Input name="inviteeSlug" placeholder="Partner's handle (e.g. jt-df136b)" required />
        <button
          type="submit"
          className="vp-gradient shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white"
        >
          Invite
        </button>
      </div>
    </form>
  );
}
