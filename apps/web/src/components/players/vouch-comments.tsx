'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquarePlus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import {
  submitProfileComment,
  editProfileComment,
  deleteProfileComment,
  type CommentActionState,
} from '@/lib/actions/comment';
import { CommentReportButton } from '@/components/safety/comment-report-button';
import { SubmitButton } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import { SectionCard } from './profile-sections';
import { PlayerAvatar } from './player-avatar';
import { formatDate } from '@/lib/format-date';

export interface CommentView {
  id: string;
  authorId: string;
  authorName: string;
  authorSlug: string | null;
  authorInitials: string;
  authorAvatarUrl: string | null;
  date: string;
  edited: boolean;
  body: string;
}

const empty: CommentActionState = {};

const textareaClass =
  'border-border bg-background text-foreground placeholder:text-foreground-muted w-full rounded-xl border px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Profile comments (handover §9.3, master_plan §2B).
 *
 * A comment used to be a field on the vouch form, so saying anything about a player required also
 * asserting a skill level for them, and once written it was permanent. Comments now stand on their
 * own and their author can change or remove them.
 *
 * ONE ACTIVE COMMENT PER AUTHOR, which is what keeps this UI simple: the viewer either has a comment
 * here (with Edit and Delete on it) or does not (with one Add control). There is no list of your own
 * comments to disambiguate between.
 *
 * Comments are ALWAYS attributed (§10.1) - the anonymity option on a vouch covers the rating only,
 * and the vouch form says so.
 */
export function VouchComments({
  comments,
  authed,
  viewerId,
  isOwnProfile,
  targetId,
  targetName,
  slug,
}: {
  comments: CommentView[];
  authed: boolean;
  viewerId: string | null;
  isOwnProfile: boolean;
  targetId: string;
  targetName: string;
  slug: string;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [createState, createAction] = useActionState(submitProfileComment, empty);
  const [editState, editAction] = useActionState(editProfileComment, empty);

  useEffect(() => {
    if (createState.ok) {
      setComposing(false);
      router.refresh();
    }
  }, [createState.ok, router]);

  useEffect(() => {
    if (editState.ok) {
      setEditingId(null);
      router.refresh();
    }
  }, [editState.ok, router]);

  const mine = viewerId ? comments.find((c) => c.authorId === viewerId) : undefined;
  const canComment = authed && !isOwnProfile;
  const title = comments.length > 0 ? `Comments (${comments.length})` : 'Comments';

  return (
    <SectionCard title={title}>
      {comments.length === 0 && (
        <p className="text-foreground-muted text-sm">
          No comments yet. Comments are always shown with their author&apos;s name, even when a
          skill rating is anonymous.
        </p>
      )}

      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => {
            const isMine = viewerId != null && c.authorId === viewerId;
            const isEditing = editingId === c.id;
            return (
              <li
                key={c.id}
                className="border-border flex gap-3 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <PlayerAvatar
                  url={c.authorAvatarUrl}
                  initials={c.authorInitials}
                  name={c.authorName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {c.authorSlug ? (
                      <Link
                        href={`/players/${c.authorSlug}`}
                        className="hover:text-primary text-sm font-medium"
                      >
                        {c.authorName}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{c.authorName}</span>
                    )}
                    <span className="text-foreground-muted shrink-0 text-xs">
                      <time>{formatDate(c.date)}</time>
                      {/* Said out loud rather than quietly rewritten under a reader who saw the
                          original (§2B). */}
                      {c.edited && <span className="ml-1 italic">edited</span>}
                    </span>
                  </div>

                  {isEditing ? (
                    <form action={editAction} className="mt-2 space-y-2">
                      <input type="hidden" name="commentId" value={c.id} />
                      <FormError>{editState.error}</FormError>
                      <textarea
                        name="body"
                        defaultValue={c.body}
                        maxLength={1000}
                        rows={3}
                        required
                        aria-label="Edit your comment"
                        className={textareaClass}
                      />
                      <div className="flex items-center gap-2">
                        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-foreground-muted hover:text-foreground min-h-[44px] px-2 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-foreground mt-0.5 text-sm whitespace-pre-wrap">{c.body}</p>
                  )}

                  {!isEditing && (
                    <div className="mt-1 flex items-center gap-3">
                      {isMine ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingId(c.id)}
                            className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
                          >
                            <Pencil size={12} aria-hidden />
                            Edit
                          </button>
                          <DeleteCommentButton commentId={c.id} />
                        </>
                      ) : (
                        authed && <CommentReportButton commentId={c.id} authorName={c.authorName} />
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* The composer. Inline rather than a dialog: this sits at the foot of a long page with room
          to spare, and a modal would hide the comments you are replying to. */}
      {canComment && !mine && (
        <div className="mt-4">
          {composing ? (
            <form action={createAction} className="space-y-2">
              <input type="hidden" name="targetId" value={targetId} />
              <FormError>{createState.error}</FormError>
              <textarea
                name="body"
                maxLength={1000}
                rows={3}
                required
                autoFocus
                aria-label={`Your comment about ${targetName}`}
                placeholder={`What is it like to play with ${targetName}?`}
                className={textareaClass}
              />
              <p className="text-foreground-muted text-xs">
                Shown publicly with your name. You can edit or delete it later.
              </p>
              <div className="flex items-center gap-2">
                <SubmitButton pendingLabel="Posting…">Post comment</SubmitButton>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="text-foreground-muted hover:text-foreground min-h-[44px] px-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="border-border text-foreground hover:border-primary inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
            >
              <MessageSquarePlus size={16} aria-hidden />
              Add a comment
            </button>
          )}
        </div>
      )}

      {!authed && (
        <p className="text-foreground-muted mt-4 text-sm">
          <Link
            href={`/signup?next=${encodeURIComponent(`/players/${slug}`)}`}
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </Link>{' '}
          to leave a comment. You do not need to rate them.
        </p>
      )}
    </SectionCard>
  );
}

/**
 * Delete is a two-tap confirm in place rather than a `window.confirm`: a native dialog is
 * unstyleable, easy to dismiss by accident on a phone, and blocks the whole tab.
 */
function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setPending(true);
    setError(null);
    const result = await deleteProfileComment(commentId);
    if (result.error) {
      setError(result.error);
      setPending(false);
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (error) {
    return <span className="text-danger text-xs">{error}</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
      >
        <Trash2 size={12} aria-hidden />
        Delete
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-foreground-muted">Delete this comment?</span>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="text-danger inline-flex items-center gap-1 font-semibold disabled:opacity-60"
      >
        {pending && <Loader2 size={11} className="animate-spin" aria-hidden />}
        Yes, delete
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-foreground-muted hover:text-foreground inline-flex items-center gap-0.5 font-medium"
      >
        <X size={11} aria-hidden />
        Keep
      </button>
    </span>
  );
}
