'use client';

import { useEffect, useRef } from 'react';

/**
 * Make the phone's Back gesture close the top open sheet instead of leaving the page (master_plan §2BH A).
 *
 * One module-level stack mirrors the history entries sheets have pushed. A single `popstate` listener
 * hands every Back to the TOP sheet only, so nested sheets close one layer at a time and nothing depends
 * on the timing of `history.back()`.
 *
 * - Opening pushes a same-URL entry (the router's own state is spread in, so Next.js keeps its tree).
 * - Back pops it and calls `onBack`. If the sheet is still open afterwards (a multi-level sheet that only
 *   stepped back, e.g. step -> menu, or a wizard step), it re-arms with a fresh entry.
 * - Closing any other way (×, backdrop, an action) removes its entries in one batched `history.go(-n)`,
 *   which the listener ignores. If the page has navigated elsewhere meanwhile (e.g. a profile link inside
 *   the sheet), nothing is popped - that would send the user back off their new page.
 */

type Entry = { onBack: () => void; href: string };

const stack: Entry[] = [];
let skipPops = 0;
let listening = false;
let pendingRemoval: Entry[] = [];
let flushQueued = false;
/** Callers waiting for our own history clean-up to finish (see `whenSheetsSettled`). */
let settleWaiters: (() => void)[] = [];

function releaseWaiters() {
  const waiters = settleWaiters;
  settleWaiters = [];
  for (const w of waiters) w();
}

function handlePop() {
  if (skipPops > 0) {
    skipPops -= 1;
    if (skipPops === 0 && !flushQueued) releaseWaiters();
    return;
  }
  const top = stack.pop();
  top?.onBack();
}

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', handlePop);
}

function scheduleRemoval(entry: Entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  pendingRemoval.push(entry);
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const removed = pendingRemoval;
    pendingRemoval = [];
    if (removed.length === 0) {
      if (skipPops === 0) releaseWaiters();
      return;
    }
    // Navigated away while the sheet was open: its entries now sit behind the new page. Leave them.
    if (removed.some((e) => e.href !== window.location.href)) {
      if (skipPops === 0) releaseWaiters();
      return;
    }
    skipPops += 1; // history.go fires a single popstate however many steps it moves
    window.history.go(-removed.length);
  });
}

/**
 * Resolves once any sheet that is closing has finished removing its history entry (master_plan §2BM).
 *
 * Closing a sheet pops its entry with `history.go(-1)`, which lands a moment later. Anything that
 * navigates or refreshes right after closing a sheet (apply a filter, refresh after an action) must wait
 * for that pop - otherwise the pop lands on top of the new navigation and silently undoes it (the
 * "tap Show players and nothing happens" bug). Call it AFTER `onClose()`:
 *
 *   onClose(); await whenSheetsSettled(); router.push(href);
 *
 * It first yields one task so React can commit the unmount that schedules the pop, then waits for the pop
 * (bounded by a safety timeout so a caller is never stuck).
 */
export function whenSheetsSettled(timeoutMs = 400): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    setTimeout(() => {
      if (!flushQueued && skipPops === 0 && pendingRemoval.length === 0) {
        finish();
        return;
      }
      settleWaiters.push(finish);
      setTimeout(finish, timeoutMs);
    }, 0);
  });
}

/**
 * The framework-free core, exported for tests: arm one sheet. `onBack` runs when Back pops this sheet's
 * entry; `stillOpen` is consulted just after, to re-arm a sheet that only stepped back a level.
 * Returns `release` - call it when the sheet closes for any other reason (or unmounts).
 */
export function armSheet(onBack: () => void, stillOpen: () => boolean): () => void {
  ensureListener();
  let released = false;
  let entry: Entry | null = null;

  const arm = () => {
    const e: Entry = {
      href: window.location.href,
      onBack: () => {
        entry = null; // Back already consumed this entry
        onBack();
        setTimeout(() => {
          if (!released && entry === null && stillOpen()) arm();
        }, 0);
      },
    };
    entry = e;
    const current = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...current, __vpSheet: stack.length + 1 }, '');
    stack.push(e);
  };
  arm();

  return () => {
    released = true;
    if (entry) scheduleRemoval(entry);
    entry = null;
  };
}

/** Test-only: reset module state between cases. */
export function __resetBackStackForTests(): void {
  stack.length = 0;
  skipPops = 0;
  pendingRemoval = [];
  flushQueued = false;
  listening = false;
  settleWaiters = [];
}

export function useBackToClose(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    return armSheet(
      () => onCloseRef.current(),
      () => openRef.current,
    );
  }, [open]);
}
