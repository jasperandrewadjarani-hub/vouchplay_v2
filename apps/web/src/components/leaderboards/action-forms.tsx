'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ui/button';
import {
  activateLeaderboardSnapshot,
  requestAndBuildLeaderboards,
  setLeaderboardExclusion,
  setLeaderboardPrivacy,
} from '@/lib/actions/leaderboards';

const empty = {};
function State({ state }: { state: { error?: string; message?: string } }) {
  return state.error ? (
    <p className="text-danger text-sm" role="alert">
      {state.error}
    </p>
  ) : state.message ? (
    <p className="text-success text-sm" role="status">
      {state.message}
    </p>
  ) : null;
}

export function PrivacyForm({ hidden }: { hidden: boolean }) {
  const [state, action] = useActionState(setLeaderboardPrivacy, empty);
  return (
    <form action={action} className="border-border bg-surface space-y-4 rounded-2xl border p-5">
      <fieldset>
        <legend className="text-foreground font-semibold">Public leaderboard visibility</legend>
        <p className="text-foreground-muted mt-1 text-sm">
          Opting out removes you from public snapshots after the next rebuild, while Your momentum
          stays private and available.
        </p>
        <label className="text-foreground mt-4 flex items-start gap-3 text-sm">
          <input
            type="radio"
            name="leaderboards"
            value="public"
            defaultChecked={!hidden}
            className="mt-1"
          />
          Public when eligible
        </label>
        <label className="text-foreground mt-3 flex items-start gap-3 text-sm">
          <input
            type="radio"
            name="leaderboards"
            value="hidden"
            defaultChecked={hidden}
            className="mt-1"
          />
          Hidden from public leaderboards
        </label>
      </fieldset>
      <State state={state} />
      <SubmitButton pendingLabel="Saving privacy…">Save privacy</SubmitButton>
    </form>
  );
}

export function RebuildForm() {
  const [state, action] = useActionState(requestAndBuildLeaderboards, empty);
  return (
    <form action={action} className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <h2 className="text-foreground font-semibold">Rebuild all snapshots</h2>
      <label className="text-foreground-muted block text-xs">
        Reason
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={500}
          className="border-border bg-background text-foreground mt-1 min-h-20 w-full rounded-xl border p-3 text-sm"
        />
      </label>
      <State state={state} />
      <SubmitButton pendingLabel="Building snapshots…">Queue and build</SubmitButton>
    </form>
  );
}

export function ExclusionForm() {
  const [state, action] = useActionState(setLeaderboardExclusion, empty);
  return (
    <form action={action} className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <h2 className="text-foreground font-semibold">Exclude or restore</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-foreground-muted text-xs">
          Entity
          <select
            name="entityType"
            className="border-border bg-background text-foreground mt-1 w-full rounded-xl border p-2"
          >
            <option value="player">Player</option>
            <option value="club">Club</option>
          </select>
        </label>
        <label className="text-foreground-muted text-xs">
          Category
          <select
            name="category"
            className="border-border bg-background text-foreground mt-1 w-full rounded-xl border p-2"
          >
            <option value="">All applicable</option>
            <option value="players">Players</option>
            <option value="community">Community</option>
            <option value="clubs">Clubs</option>
          </select>
        </label>
      </div>
      <label className="text-foreground-muted block text-xs">
        Entity UUID
        <input
          name="entityId"
          required
          className="border-border bg-background text-foreground mt-1 w-full rounded-xl border p-2 text-sm"
        />
      </label>
      <label className="text-foreground-muted block text-xs">
        Action
        <select
          name="excluded"
          className="border-border bg-background text-foreground mt-1 w-full rounded-xl border p-2"
        >
          <option value="true">Exclude</option>
          <option value="false">Restore</option>
        </select>
      </label>
      <label className="text-foreground-muted block text-xs">
        Reason
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={500}
          className="border-border bg-background text-foreground mt-1 min-h-20 w-full rounded-xl border p-3 text-sm"
        />
      </label>
      <State state={state} />
      <SubmitButton pendingLabel="Saving exclusion…">Save exclusion</SubmitButton>
    </form>
  );
}

export function ActivateForm({ runId }: { runId: string }) {
  const [state, action] = useActionState(activateLeaderboardSnapshot, empty);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <input
        name="reason"
        required
        minLength={10}
        maxLength={500}
        placeholder="Rollback reason"
        aria-label="Rollback reason"
        className="border-border bg-background text-foreground w-full rounded-lg border p-2 text-xs"
      />
      <State state={state} />
      <SubmitButton pendingLabel="Activating…" variant="secondary" className="py-2 text-xs">
        Activate
      </SubmitButton>
    </form>
  );
}
