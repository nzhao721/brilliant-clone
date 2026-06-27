import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { useLessonProgress } from '../lessons/lessonProgress';

// Dual-currency model (local-only):
//   • XP — lifetime metric (progress.totalXp). Only grows; the leaderboard ranks
//     by it. Never spent.
//   • COINS — spendable balance = lifetime coins earned (progress.totalCoinsEarned,
//     its own accumulation) + a "granted" ledger − a "spent" ledger, clamped at
//     zero. Coins are spent in the arcade and granted outside lessons (e.g. the
//     Slipstream race track). Neither a spend nor a grant ever touches XP, so the
//     leaderboard is unaffected by playing games.
export const coinsSpentStorageKey = 'brilliant-clone.coins-spent';
// Coins added to the spendable balance independent of lessons — e.g. the coins
// collected on the Slipstream race track (addCoins). Kept in its own ledger so
// it never inflates lifetime XP, lifetime coins earned, or the leaderboard —
// only the spendable balance.
export const coinsGrantedStorageKey = 'brilliant-clone.coins-granted';

// Floors to a non-negative integer (NaN/∞/negatives → 0) — every coin quantity.
function clampCoins(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Reactive coin-ledger store. localStorage is not reactive, so a spend (from the
// GameShell) or grant (from the race track) wouldn't re-render other consumers —
// the header HUD, the GamesPage banner — until a reload. Every useCurrency()
// consumer subscribes here via useSyncExternalStore so a spend/grant re-renders
// them all live; the window `storage` event syncs other tabs too.
type StoreListener = () => void;
const ledgerListeners = new Set<StoreListener>();

// Both ledgers clamp at zero; missing/invalid values read as 0.
function readCoinLedger(storageKey: string): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const raw = window.localStorage.getItem(storageKey);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return clampCoins(parsed);
}

function readCoinsSpent(): number {
  return readCoinLedger(coinsSpentStorageKey);
}

function readCoinsGranted(): number {
  return readCoinLedger(coinsGrantedStorageKey);
}

function notifyLedgerListeners() {
  for (const listener of ledgerListeners) {
    listener();
  }
}

// Cross-tab sync: the `storage` event fires in OTHER tabs when this origin's
// localStorage changes (never in the tab that made the change). Re-broadcast so
// every mounted hook re-reads the new ledgers. A full clear reports key === null.
function handleStorageEvent(event: StorageEvent) {
  if (
    event.key === null ||
    event.key === coinsSpentStorageKey ||
    event.key === coinsGrantedStorageKey
  ) {
    notifyLedgerListeners();
  }
}

function subscribeToCoinLedgers(listener: StoreListener): () => void {
  // Attach the cross-tab listener only while at least one consumer is mounted.
  if (ledgerListeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  ledgerListeners.add(listener);

  return () => {
    ledgerListeners.delete(listener);

    if (ledgerListeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

// getSnapshot returns a primitive read straight from the ledger: referentially
// stable while unchanged (no cache needed) and always the freshest value.
function getCoinsSpentSnapshot(): number {
  return readCoinsSpent();
}

function getCoinsGrantedSnapshot(): number {
  return readCoinsGranted();
}

// No persisted ledger exists during SSR / non-DOM rendering.
function getCoinLedgerServerSnapshot(): number {
  return 0;
}

// Persists a ledger AND notifies every consumer in this tab. The `storage`
// event does not fire in the originating tab, so the in-tab broadcast here is
// what makes sibling hooks (header HUD, GamesPage banner) update instantly.
// Both ledgers clamp at zero.
function writeCoinLedger(storageKey: string, nextValue: number) {
  const safeValue = clampCoins(nextValue);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, String(safeValue));
  }

  notifyLedgerListeners();
}

/**
 * Clears both coin ledgers (spent + granted) and notifies every consumer so the
 * balance recomputes live. Ledger-only: never touches XP or lifetime coins
 * earned, so the leaderboard is unaffected (a lesson-progress reset zeroes the
 * earned side). Other tabs sync via the `storage` event removeItem fires.
 */
export function resetCoins(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(coinsSpentStorageKey);
    window.localStorage.removeItem(coinsGrantedStorageKey);
  }

  notifyLedgerListeners();
}

export type UseCurrencyResult = {
  /** Lifetime XP earned. Only grows; never spent. The leaderboard metric. */
  xp: number;
  /**
   * Lifetime coins earned: its own accumulation (a fraction of each correct
   * answer's XP plus flat lesson-completion bonuses), independent of {@link xp}.
   */
  coinsEarned: number;
  /**
   * Granted-coins ledger applied to the spendable balance outside of lessons
   * (e.g. coins collected on the Slipstream race track via {@link addCoins}).
   * Never affects XP.
   */
  coinsGranted: number;
  /**
   * Spendable coin balance: lifetime coins earned plus granted bonus coins,
   * minus the spent ledger (clamped at zero).
   */
  coinBalance: number;
  /** Total coins ever spent in the arcade. */
  coinsSpent: number;
  /**
   * Attempts to spend `amount` coins from the balance. Returns false (a no-op)
   * when the amount is invalid or unaffordable; otherwise records the spend in
   * the ledger and returns true. NEVER touches lifetime XP/totalXp.
   */
  spendCoins: (amount: number) => boolean;
  /**
   * Grants `amount` bonus coins straight to the spendable balance (a no-op for
   * invalid/non-positive amounts), recording them in the granted ledger so the
   * top bar and games page update live. Used for coins awarded outside of
   * lessons, e.g. the pickups collected on the Slipstream race track. NEVER
   * touches lifetime XP/totalXp or the leaderboard.
   */
  addCoins: (amount: number) => void;
};

export function useCurrency(): UseCurrencyResult {
  const { user } = useAuth();
  const { progress } = useLessonProgress(lessons, user?.uid);
  const xp = clampCoins(progress.totalXp);
  const coinsEarned = clampCoins(progress.totalCoinsEarned ?? 0);
  // Reactive views of both ledgers: a spend/grant from any instance re-renders
  // every subscribed instance (they share one module-level store).
  const coinsSpent = useSyncExternalStore(
    subscribeToCoinLedgers,
    getCoinsSpentSnapshot,
    getCoinLedgerServerSnapshot,
  );
  const coinsGranted = useSyncExternalStore(
    subscribeToCoinLedgers,
    getCoinsGrantedSnapshot,
    getCoinLedgerServerSnapshot,
  );

  // Clamp at zero: a progress reset can drop lifetime below what was spent, and
  // a negative balance is meaningless.
  const coinBalance = Math.max(0, coinsEarned + coinsGranted - coinsSpent);

  const spendCoins = useCallback(
    (amount: number): boolean => {
      const cost = Math.floor(amount);

      if (!Number.isFinite(cost) || cost <= 0) {
        return false;
      }

      // Recompute affordability from the freshest ledgers (not the closed-over
      // state) so back-to-back spends or a just-granted top-up are reflected and
      // can't overdraw the balance.
      const currentCoinsSpent = readCoinsSpent();
      const currentCoinBalance = Math.max(
        0,
        coinsEarned + readCoinsGranted() - currentCoinsSpent,
      );

      if (cost > currentCoinBalance) {
        return false;
      }

      writeCoinLedger(coinsSpentStorageKey, currentCoinsSpent + cost);
      return true;
    },
    [coinsEarned],
  );

  // Grants are unconditional (any positive amount succeeds) and read the
  // freshest granted ledger so back-to-back grants accumulate rather than
  // clobber one another. No dependency on render state, so the callback is
  // stable for the lifetime of the consumer.
  const addCoins = useCallback((amount: number): void => {
    const grant = Math.floor(amount);

    if (!Number.isFinite(grant) || grant <= 0) {
      return;
    }

    writeCoinLedger(coinsGrantedStorageKey, readCoinsGranted() + grant);
  }, []);

  return {
    xp,
    coinsEarned,
    coinsGranted,
    coinBalance,
    coinsSpent,
    spendCoins,
    addCoins,
  };
}
