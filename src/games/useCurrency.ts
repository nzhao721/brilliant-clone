import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthContext';
import { lessons } from '../data/lessons';
import { useLessonProgress } from '../lessons/lessonProgress';

// Dual-currency model (local-only):
//
//   • XP — the LIFETIME metric. It is `useLessonProgress(...).progress.totalXp`,
//     only ever grows, and is what the leaderboard ranks by. Never spent.
//
//   • COINS — scarcer and more valuable than XP. Lifetime "coins earned" is its
//     OWN accumulation, `useLessonProgress(...).progress.totalCoinsEarned` (a
//     fraction of each correct answer's XP plus flat lesson-completion bonuses;
//     streak bonuses add XP only). It is NO LONGER derived from totalXp. The
//     spendable "coin balance" is lifetime coins earned PLUS a separate "coins
//     granted" ledger MINUS a separate "coins spent" ledger, with the final
//     balance clamped at zero. Both ledgers are persisted below and clamped at
//     zero. Coins are spent in the arcade; a spend only ever ADDS to the spent
//     ledger. Granted coins are awarded outside of lessons (e.g. the coins
//     collected on the Slipstream race track). NEITHER a spend nor a grant ever
//     touches XP/totalXp, so the leaderboard standing is unaffected by playing
//     games.
//
// (This replaces the former arcade "spendable XP" model. The spent ledger key
// was renamed from `brilliant-clone.arcade-spent-xp` to the coins key below.)
export const coinsSpentStorageKey = 'brilliant-clone.coins-spent';
// Coins added to the spendable balance independent of lessons — e.g. the coins
// collected on the Slipstream race track (addCoins). Kept in its own ledger so
// it never inflates lifetime XP, lifetime coins earned, or the leaderboard —
// only the spendable balance.
export const coinsGrantedStorageKey = 'brilliant-clone.coins-granted';

// Floors to a NON-NEGATIVE integer (NaN/∞/negatives → 0). Used for every coin
// quantity, none of which can be negative: lifetime XP, lifetime coins earned,
// and both the spent and granted ledgers.
function clampCoins(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// ---------------------------------------------------------------------------
// Reactive coin-ledger store.
//
// The spent and granted ledgers live in localStorage, but localStorage is NOT
// reactive: a spend from the GameShell's useCurrency() instance, or a grant
// from the Slipstream race track, would not — on its own — tell the header HUD's
// instance (AppLayout → HeaderStats) or the GamesPage banner to re-render.
// They'd show a stale balance until a reload. The earned side is already React
// state (via useLessonProgress) and updates live; this store gives BOTH the
// spent AND granted sides the same liveness.
//
// Every useCurrency() consumer subscribes to this single module-level store via
// React's useSyncExternalStore, so any spend or grant immediately re-renders
// ALL of them with no remount and no change to the consuming components. The
// window `storage` event keeps additional browser tabs in sync as well.
// ---------------------------------------------------------------------------
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

// getSnapshot returns a primitive number read straight from a ledger, so it is
// referentially stable whenever that ledger is unchanged (no cache needed) and
// always reflects the freshest persisted value.
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
 * Clears BOTH coin ledgers (spent + granted) and notifies every mounted
 * consumer so the spendable balance recomputes live. This is ledger-only: it
 * never touches lifetime XP/totalXp or lifetime coins earned
 * (progress.totalCoinsEarned), so the leaderboard is unaffected. Paired with a
 * lesson-progress reset — which zeroes lifetime coins earned — it drops the
 * spendable balance to 0 reactively across the header HUD and the games page.
 * Other browser tabs sync via the `storage` event that removeItem fires.
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
  // Lifetime coins earned is its own accumulation tracked in progress, NOT
  // derived from XP. The spent and granted ledgers are persisted separately.
  const coinsEarned = clampCoins(progress.totalCoinsEarned ?? 0);
  // Shared reactive views of both ledgers: a spend or grant from ANY
  // useCurrency() instance re-renders every instance subscribed here (no
  // remount needed). Both hooks share one module-level store/listener set.
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
