import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coinsGrantedStorageKey, coinsSpentStorageKey, resetCoins, useCurrency } from './useCurrency';

// Lifetime XP and lifetime coins earned are now INDEPENDENT accumulations, so
// each test sets both on a single ref the mocked progress hook reads.
const lifetime = { totalXp: 0, totalCoinsEarned: 0 };

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../data/lessons', () => ({
  lessons: [],
}));

vi.mock('../lessons/lessonProgress', () => ({
  useLessonProgress: () => ({
    progress: { totalXp: lifetime.totalXp, totalCoinsEarned: lifetime.totalCoinsEarned },
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  lifetime.totalXp = 0;
  lifetime.totalCoinsEarned = 0;
});

describe('useCurrency', () => {
  it('exposes lifetime coins earned independently of XP, with a full balance when nothing is spent', () => {
    lifetime.totalXp = 250;
    // Coins are scarcer than XP and tracked separately, so they differ from XP.
    lifetime.totalCoinsEarned = 80;

    const { result } = renderHook(() => useCurrency());

    expect(result.current.xp).toBe(250);
    expect(result.current.coinsEarned).toBe(80);
    expect(result.current.coinBalance).toBe(80);
    expect(result.current.coinsSpent).toBe(0);
  });

  it('spends coins from the balance and persists the ledger without touching XP', () => {
    lifetime.totalXp = 100;
    lifetime.totalCoinsEarned = 40;

    const { result } = renderHook(() => useCurrency());

    let ok = false;
    act(() => {
      ok = result.current.spendCoins(30);
    });

    expect(ok).toBe(true);
    // Balance comes from coins earned (40), not XP.
    expect(result.current.coinBalance).toBe(10);
    expect(result.current.coinsSpent).toBe(30);
    // XP (the leaderboard metric) is never affected by spending.
    expect(result.current.xp).toBe(100);
    expect(result.current.coinsEarned).toBe(40);
    expect(window.localStorage.getItem(coinsSpentStorageKey)).toBe('30');
  });

  it('refuses to overspend and ignores non-positive amounts', () => {
    // Far more XP than coins: affordability is judged against coins, not XP.
    lifetime.totalXp = 200;
    lifetime.totalCoinsEarned = 40;

    const { result } = renderHook(() => useCurrency());

    let ok = true;
    act(() => {
      ok = result.current.spendCoins(50);
    });
    expect(ok).toBe(false);
    expect(result.current.coinBalance).toBe(40);

    act(() => {
      result.current.spendCoins(0);
      result.current.spendCoins(-10);
    });
    expect(result.current.coinsSpent).toBe(0);
    expect(result.current.coinBalance).toBe(40);
  });

  it('reads an existing spent ledger and clamps a negative balance to zero', () => {
    lifetime.totalXp = 999;
    lifetime.totalCoinsEarned = 20;
    // Spent exceeds earned coins (e.g. after a progress reset dropped lifetime).
    window.localStorage.setItem(coinsSpentStorageKey, '50');

    const { result } = renderHook(() => useCurrency());

    expect(result.current.coinBalance).toBe(0);
    expect(result.current.coinsEarned).toBe(20);
  });

  it('reflects a spend in a separately-rendered consumer without a remount', () => {
    lifetime.totalXp = 500;
    lifetime.totalCoinsEarned = 100;

    // Two independent useCurrency() instances, mirroring how the GameShell (the
    // spender) and the header HUD / GamesPage banner (passive observers) each
    // mount their own hook. They are separate render roots that share the
    // module-level spent store, so a spend from one must update the other live.
    const spender = renderHook(() => useCurrency());
    const observer = renderHook(() => useCurrency());

    expect(spender.result.current.coinBalance).toBe(100);
    expect(observer.result.current.coinBalance).toBe(100);

    let ok = false;
    act(() => {
      ok = spender.result.current.spendCoins(30);
    });

    expect(ok).toBe(true);
    // The spender updates...
    expect(spender.result.current.coinBalance).toBe(70);
    expect(spender.result.current.coinsSpent).toBe(30);
    // ...and so does the OTHER consumer, with no remount in between.
    expect(observer.result.current.coinBalance).toBe(70);
    expect(observer.result.current.coinsSpent).toBe(30);
  });

  it('grants bonus coins that raise the spendable balance and persist to the granted ledger', () => {
    lifetime.totalXp = 100;
    lifetime.totalCoinsEarned = 40;

    const { result } = renderHook(() => useCurrency());

    expect(result.current.coinBalance).toBe(40);
    expect(result.current.coinsGranted).toBe(0);

    act(() => {
      result.current.addCoins(10000);
    });

    // The grant lands in its own ledger and lifts the spendable balance...
    expect(result.current.coinsGranted).toBe(10000);
    expect(result.current.coinBalance).toBe(10040);
    // ...but never the lifetime XP / coins-earned (leaderboard) metrics.
    expect(result.current.xp).toBe(100);
    expect(result.current.coinsEarned).toBe(40);
    expect(window.localStorage.getItem(coinsGrantedStorageKey)).toBe('10000');
  });

  it('accumulates repeated grants and ignores non-positive amounts', () => {
    const { result } = renderHook(() => useCurrency());

    act(() => {
      result.current.addCoins(10000);
      result.current.addCoins(5000);
    });
    expect(result.current.coinsGranted).toBe(15000);
    expect(result.current.coinBalance).toBe(15000);

    act(() => {
      result.current.addCoins(0);
      result.current.addCoins(-100);
    });
    // Invalid amounts are no-ops; the ledger is unchanged.
    expect(result.current.coinsGranted).toBe(15000);
    expect(result.current.coinBalance).toBe(15000);
  });

  it('spends from a granted balance using the earned + granted − spent formula', () => {
    lifetime.totalCoinsEarned = 10;

    const { result } = renderHook(() => useCurrency());

    act(() => {
      result.current.addCoins(100);
    });
    expect(result.current.coinBalance).toBe(110);

    let ok = false;
    act(() => {
      ok = result.current.spendCoins(80);
    });

    expect(ok).toBe(true);
    // 10 earned + 100 granted − 80 spent.
    expect(result.current.coinBalance).toBe(30);
    expect(result.current.coinsSpent).toBe(80);
    expect(result.current.coinsGranted).toBe(100);
  });

  it('reflects a grant in a separately-rendered consumer without a remount', () => {
    // Mirrors the spend-reactivity test: the GamesPage dev tool grants coins
    // while the header HUD / banner observe via their own hook instance. The
    // shared module-level ledger store must update the observer live.
    const granter = renderHook(() => useCurrency());
    const observer = renderHook(() => useCurrency());

    expect(granter.result.current.coinBalance).toBe(0);
    expect(observer.result.current.coinBalance).toBe(0);

    act(() => {
      granter.result.current.addCoins(10000);
    });

    expect(granter.result.current.coinBalance).toBe(10000);
    // The OTHER consumer sees the grant with no remount in between.
    expect(observer.result.current.coinBalance).toBe(10000);
    expect(observer.result.current.coinsGranted).toBe(10000);
  });

  it('resetCoins clears both ledgers and reactively zeroes the balance for every consumer', () => {
    // Simulate the state AFTER a progress reset has zeroed lifetime coins earned
    // but left stale spent/granted ledgers on disk — the exact bug this fixes.
    lifetime.totalCoinsEarned = 0;
    window.localStorage.setItem(coinsSpentStorageKey, '20');
    window.localStorage.setItem(coinsGrantedStorageKey, '500');

    // Two instances mirror the header HUD and the games-page banner.
    const header = renderHook(() => useCurrency());
    const banner = renderHook(() => useCurrency());

    // 0 earned + 500 granted − 20 spent = 480 before the reset.
    expect(header.result.current.coinBalance).toBe(480);
    expect(banner.result.current.coinBalance).toBe(480);

    act(() => {
      resetCoins();
    });

    // Both ledgers are wiped from storage entirely...
    expect(window.localStorage.getItem(coinsSpentStorageKey)).toBeNull();
    expect(window.localStorage.getItem(coinsGrantedStorageKey)).toBeNull();
    // ...and EVERY mounted consumer reflects an empty balance live (no remount).
    for (const instance of [header, banner]) {
      expect(instance.result.current.coinsSpent).toBe(0);
      expect(instance.result.current.coinsGranted).toBe(0);
      expect(instance.result.current.coinBalance).toBe(0);
    }
  });

  it('resetCoins is ledger-only: it never touches lifetime XP or coins earned', () => {
    lifetime.totalXp = 300;
    lifetime.totalCoinsEarned = 150;
    window.localStorage.setItem(coinsSpentStorageKey, '40');
    window.localStorage.setItem(coinsGrantedStorageKey, '60');

    const { result } = renderHook(() => useCurrency());
    // 150 earned + 60 granted − 40 spent = 170.
    expect(result.current.coinBalance).toBe(170);

    act(() => {
      resetCoins();
    });

    // Ledgers gone → balance falls back to exactly lifetime coins earned.
    expect(result.current.coinsSpent).toBe(0);
    expect(result.current.coinsGranted).toBe(0);
    expect(result.current.coinBalance).toBe(150);
    // Lifetime metrics (the leaderboard inputs) are untouched — clearing those
    // is the progress reset's job, not resetCoins'.
    expect(result.current.xp).toBe(300);
    expect(result.current.coinsEarned).toBe(150);
  });
});
