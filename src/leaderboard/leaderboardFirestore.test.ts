import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc } from 'firebase/firestore';
import { getLeaderboardEntriesByIds } from './leaderboardFirestore';

/* Firestore + the firebase singletons are mocked so this exercises the per-class
 * fan-out read without a network. */
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collectionPath: string, id: string) => ({
    path: `${collectionPath}/${id}`,
    id,
  })),
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
}));

vi.mock('../lib/firebase', () => ({ auth: null }));

const mockedGetDoc = vi.mocked(getDoc);
const db = { name: 'mock-db' } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getLeaderboardEntriesByIds', () => {
  it('fetches each profile by id, skips missing rows, and normalizes the rest', async () => {
    mockedGetDoc.mockImplementation(async (ref: unknown) => {
      const { id } = ref as { id: string };

      if (id === 'missing') {
        return { exists: () => false } as never;
      }

      const data: Record<string, Record<string, unknown>> = {
        alpha: { displayName: '  Alpha ', totalXp: 300.9 },
        bravo: { displayName: 'Bravo', totalXp: 120 },
      };

      return { exists: () => true, id, data: () => data[id] } as never;
    });

    const entries = await getLeaderboardEntriesByIds(db, ['alpha', 'missing', 'bravo']);

    expect(entries).toEqual([
      { id: 'alpha', displayName: 'Alpha', xp: 300 },
      { id: 'bravo', displayName: 'Bravo', xp: 120 },
    ]);
  });

  it('de-duplicates ids and ignores empties (one read per unique uid)', async () => {
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'alpha',
      data: () => ({ displayName: 'Alpha', totalXp: 10 }),
    } as never);

    await getLeaderboardEntriesByIds(db, ['alpha', 'alpha', '', 'alpha']);

    expect(mockedGetDoc).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when there are no ids', async () => {
    const entries = await getLeaderboardEntriesByIds(db, []);
    expect(entries).toEqual([]);
    expect(mockedGetDoc).not.toHaveBeenCalled();
  });
});
