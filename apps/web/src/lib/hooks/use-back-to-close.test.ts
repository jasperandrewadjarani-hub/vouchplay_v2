import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetBackStackForTests, armSheet, whenSheetsSettled } from './use-back-to-close';

/**
 * A minimal browser-history simulator: pushState truncates forward entries, go() moves the cursor and
 * fires ONE async popstate (as browsers do), location.href follows the current entry. Enough to prove
 * the Back-to-close stack keeps history and open sheets in step (master_plan §2BH A).
 */
function installFakeWindow(startHref = 'https://app.test/tournaments/hermosa/manage') {
  const entries: { state: unknown; href: string }[] = [{ state: { __NA: true }, href: startHref }];
  let index = 0;
  const listeners: (() => void)[] = [];
  const win = {
    history: {
      get state() {
        return entries[index]!.state;
      },
      pushState(state: unknown, _t: string, url?: string) {
        entries.splice(index + 1);
        entries.push({ state, href: url ?? entries[index]!.href });
        index = entries.length - 1;
      },
      go(delta: number) {
        const target = Math.max(0, Math.min(entries.length - 1, index + delta));
        if (target === index) return;
        index = target;
        setTimeout(() => listeners.forEach((l) => l()), 0);
      },
      back() {
        this.go(-1);
      },
    },
    location: {
      get href() {
        return entries[index]!.href;
      },
    },
    addEventListener(type: string, fn: () => void) {
      if (type === 'popstate') listeners.push(fn);
    },
  };
  (globalThis as unknown as { window: typeof win }).window = win;
  return {
    get index() {
      return index;
    },
    userBack: () => win.history.go(-1),
    navigate: (href: string) => win.history.pushState({ __NA: true }, '', href),
  };
}

/** Drain the async chain deterministically: go() -> popstate (timer 0) -> onBack -> re-arm (timer 0).
 *  Zero-delay timers run FIFO, so a few rounds always land after that chain, however loaded the runner
 *  is (a fixed wall-clock wait was flaky under the parallel suite). */
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('Back closes the top sheet (useBackToClose core)', () => {
  let h: ReturnType<typeof installFakeWindow>;
  beforeEach(() => {
    __resetBackStackForTests();
    h = installFakeWindow();
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('Back closes a single open sheet and returns history to where it was', async () => {
    let closed = 0;
    armSheet(
      () => closed++,
      () => false,
    );
    expect(h.index).toBe(1);
    h.userBack();
    await flush();
    expect(closed).toBe(1);
    expect(h.index).toBe(0);
  });

  it('closing with × removes the entry without calling onBack', async () => {
    let closed = 0;
    const release = armSheet(
      () => closed++,
      () => false,
    );
    release();
    await flush();
    expect(closed).toBe(0);
    expect(h.index).toBe(0);
  });

  it('nested sheets close one layer per Back', async () => {
    const calls: string[] = [];
    armSheet(
      () => calls.push('card'),
      () => false,
    );
    armSheet(
      () => calls.push('menu'),
      () => false,
    );
    expect(h.index).toBe(2);
    h.userBack();
    await flush();
    expect(calls).toEqual(['menu']);
    expect(h.index).toBe(1);
    h.userBack();
    await flush();
    expect(calls).toEqual(['menu', 'card']);
    expect(h.index).toBe(0);
  });

  it('a multi-level sheet steps back and re-arms until it is fully closed', async () => {
    let level = 3; // e.g. wizard step 3
    armSheet(
      () => level--,
      () => level > 0,
    );
    h.userBack();
    await flush();
    expect(level).toBe(2);
    expect(h.index).toBe(1); // re-armed
    h.userBack();
    await flush();
    h.userBack();
    await flush();
    expect(level).toBe(0);
    expect(h.index).toBe(0); // no leftover entry
  });

  it('closing a card and its open menu together leaves no dead entries', async () => {
    const releaseCard = armSheet(
      () => {},
      () => false,
    );
    const releaseMenu = armSheet(
      () => {},
      () => false,
    );
    releaseMenu();
    releaseCard();
    await flush();
    expect(h.index).toBe(0);
  });

  it('swapping one layer for another in the same tick keeps the count right', async () => {
    const calls: string[] = [];
    armSheet(
      () => calls.push('card'),
      () => false,
    );
    const releaseMenu = armSheet(
      () => calls.push('menu'),
      () => false,
    );
    releaseMenu(); // menu closes...
    armSheet(
      () => calls.push('step'),
      () => false,
    ); // ...step opens in the same render
    await flush();
    expect(h.index).toBe(2); // card + step
    h.userBack();
    await flush();
    expect(calls).toEqual(['step']);
    h.userBack();
    await flush();
    expect(calls).toEqual(['step', 'card']);
    expect(h.index).toBe(0);
  });

  it('close-then-navigate: waiting for the sheet to settle keeps the new navigation (§2BM)', async () => {
    // The "Show players does nothing" bug: close the sheet, then navigate. Without waiting, the sheet's
    // history pop lands on top of the new entry and undoes it.
    const release = armSheet(
      () => {},
      () => false,
    );
    expect(h.index).toBe(1);
    release(); // sheet closes (unmount cleanup)
    await whenSheetsSettled();
    h.navigate('https://app.test/players?badges=legend'); // router.push after settling
    await flush();
    expect(h.index).toBe(1); // base + the filtered page; nothing popped it
  });

  it('whenSheetsSettled resolves immediately when no sheet is closing', async () => {
    let resolved = false;
    void whenSheetsSettled().then(() => (resolved = true));
    await flush();
    expect(resolved).toBe(true);
  });

  it('never pops history after the page navigated away from inside the sheet', async () => {
    const release = armSheet(
      () => {},
      () => false,
    );
    h.navigate('https://app.test/players/rene');
    const before = h.index;
    release();
    await flush();
    expect(h.index).toBe(before); // still on the profile page
  });
});
