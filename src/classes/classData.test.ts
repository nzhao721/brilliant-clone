import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arrayRemove, arrayUnion, onSnapshot, runTransaction } from 'firebase/firestore';
import {
  CLASS_CODE_ALPHABET,
  GENERATED_CLASS_CODE_LENGTH,
  createClass,
  generateClassCode,
  isValidClassCodeFormat,
  joinClass,
  leaveClass,
  normalizeClassCode,
  normalizeClassName,
  normalizeClassRecord,
  subscribeJoinedClasses,
} from './classData';

// Firestore is mocked so the data layer is exercised WITHOUT a network: refs are
// plain objects, sentinels stand in for serverTimestamp/arrayUnion/arrayRemove,
// and transactions/queries are driven per-test. Mirrors the hoisted-mock pattern
// used across the suite (see useLeaderboard.test.tsx / AuthContext.test.tsx).
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collectionPath: string, id: string) => ({
    path: `${collectionPath}/${id}`,
    id,
  })),
  collection: vi.fn((_db: unknown, collectionPath: string) => ({ collectionPath })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '__SERVER_TS__'),
  arrayUnion: vi.fn((...values: unknown[]) => ({ __arrayUnion: values })),
  arrayRemove: vi.fn((...values: unknown[]) => ({ __arrayRemove: values })),
}));

const mockedRunTransaction = vi.mocked(runTransaction);
const mockedOnSnapshot = vi.mocked(onSnapshot);

const db = { name: 'mock-db' } as never;

type SetCall = { ref: { id: string }; data: Record<string, unknown> };
type UpdateCall = { ref: { id: string }; data: Record<string, unknown> };

// Drives runTransaction: each call sees the next `exists`/`data` pair (so random
// retries / membership reads can be scripted) and records set/update calls.
function scriptTransactions(
  steps: Array<{ exists: boolean; data?: Record<string, unknown> }>,
): { setCalls: SetCall[]; updateCalls: UpdateCall[] } {
  const setCalls: SetCall[] = [];
  const updateCalls: UpdateCall[] = [];
  let index = 0;

  mockedRunTransaction.mockImplementation(async (_db: unknown, updateFn: unknown) => {
    const step = steps[index] ?? { exists: false };
    index += 1;

    const transaction = {
      get: async () => ({ exists: () => step.exists, data: () => step.data ?? {} }),
      set: (ref: { id: string }, data: Record<string, unknown>) => setCalls.push({ ref, data }),
      update: (ref: { id: string }, data: Record<string, unknown>) =>
        updateCalls.push({ ref, data }),
    };

    return (updateFn as (tx: typeof transaction) => unknown)(transaction);
  });

  return { setCalls, updateCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('class code helpers (pure)', () => {
  const codes = Array.from({ length: 300 }, () => generateClassCode());

  it('generates fixed-length codes from the unambiguous alphabet', () => {
    const allowed = new Set(CLASS_CODE_ALPHABET);

    for (const code of codes) {
      expect(code).toHaveLength(GENERATED_CLASS_CODE_LENGTH);
      expect(code).toBe(code.toUpperCase());
      for (const char of code) {
        expect(allowed.has(char)).toBe(true);
      }
    }
  });

  it('never generates ambiguous characters (O, 0, I, 1, L)', () => {
    for (const code of codes) {
      expect(code).not.toMatch(/[O0I1L]/);
    }
  });

  it('produces varied codes', () => {
    expect(new Set(codes).size).toBeGreaterThan(100);
  });

  it('normalizes user-typed codes (uppercase, strips separators)', () => {
    expect(normalizeClassCode('abcd-1234')).toBe('ABCD1234');
    expect(normalizeClassCode('  team x9 ')).toBe('TEAMX9');
    expect(normalizeClassCode('a@b#c$d')).toBe('ABCD');
  });

  it('validates the 4–12 char A–Z/0–9 format', () => {
    expect(isValidClassCodeFormat('ABCD')).toBe(true);
    expect(isValidClassCodeFormat('CALC2026')).toBe(true);
    expect(isValidClassCodeFormat('ABC')).toBe(false); // too short
    expect(isValidClassCodeFormat('A'.repeat(13))).toBe(false); // too long
    expect(isValidClassCodeFormat('abcd')).toBe(false); // lowercase
    expect(isValidClassCodeFormat('AB-CD')).toBe(false); // symbol
  });

  it('defaults and length-caps class names', () => {
    expect(normalizeClassName('  Period 3  ', 'ABCD')).toBe('Period 3');
    expect(normalizeClassName('', 'ABCD')).toBe('Class ABCD');
    expect(normalizeClassName(undefined, 'ABCD')).toBe('Class ABCD');
    expect(normalizeClassName('x'.repeat(200), 'ABCD')).toHaveLength(60);
  });
});

describe('normalizeClassRecord', () => {
  it('uses the doc id for the code and de-duplicates members', () => {
    expect(
      normalizeClassRecord('TEAMX9', {
        name: '  Team X ',
        ownerUid: 'owner',
        memberUids: ['owner', 'a', 'a', 'b', 42],
        createdAt: { toMillis: () => 1000 },
      }),
    ).toEqual({
      code: 'TEAMX9',
      name: 'Team X',
      ownerUid: 'owner',
      memberUids: ['owner', 'a', 'b'],
      memberCount: 3,
      createdAtMillis: 1000,
    });
  });

  it('defaults a missing/garbled doc to a safe record', () => {
    expect(normalizeClassRecord('CODE12', null)).toEqual({
      code: 'CODE12',
      name: 'Class CODE12',
      ownerUid: '',
      memberUids: [],
      memberCount: 0,
      createdAtMillis: null,
    });
  });
});

describe('createClass', () => {
  it('creates a class with a normalized custom code and auto-joins the owner', async () => {
    const { setCalls } = scriptTransactions([{ exists: false }]);

    const result = await createClass(db, {
      ownerUid: 'owner-1',
      customCode: 'calc-2026',
      name: 'Period 3',
    });

    expect(result).toEqual({
      ok: true,
      record: {
        code: 'CALC2026',
        name: 'Period 3',
        ownerUid: 'owner-1',
        memberUids: ['owner-1'],
        memberCount: 1,
        createdAtMillis: null,
      },
    });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].ref.id).toBe('CALC2026');
    expect(setCalls[0].data).toMatchObject({
      code: 'CALC2026',
      name: 'Period 3',
      ownerUid: 'owner-1',
      memberUids: ['owner-1'],
      createdAt: '__SERVER_TS__',
      updatedAt: '__SERVER_TS__',
    });
  });

  it('rejects a custom code that already exists', async () => {
    const { setCalls } = scriptTransactions([{ exists: true }]);

    const result = await createClass(db, { ownerUid: 'owner-1', customCode: 'TAKEN1' });

    expect(result).toEqual({
      ok: false,
      reason: 'code-taken',
      message: expect.stringContaining('TAKEN1'),
    });
    expect(setCalls).toHaveLength(0);
  });

  it('rejects a malformed custom code without touching Firestore', async () => {
    const result = await createClass(db, { ownerUid: 'owner-1', customCode: 'ab' });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-code' });
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });

  it('generates a random unique code, retrying past a collision', async () => {
    const { setCalls } = scriptTransactions([{ exists: true }, { exists: false }]);

    const result = await createClass(db, { ownerUid: 'owner-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(result.record.memberUids).toEqual(['owner-1']);
    }
    // Two attempts: the first collided, the second succeeded.
    expect(mockedRunTransaction).toHaveBeenCalledTimes(2);
    expect(setCalls).toHaveLength(1);
  });

  it('returns a typed error when the transaction throws', async () => {
    mockedRunTransaction.mockRejectedValue(new Error('network down'));

    const result = await createClass(db, { ownerUid: 'owner-1', customCode: 'GOODCODE' });

    expect(result).toMatchObject({ ok: false, reason: 'error', message: 'network down' });
  });
});

describe('joinClass', () => {
  it('adds the caller to an existing class (idempotent membership write)', async () => {
    const { updateCalls } = scriptTransactions([
      { exists: true, data: { name: 'Team X', ownerUid: 'owner', memberUids: ['owner'] } },
    ]);

    const result = await joinClass(db, { uid: 'me', code: 'team-x9' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyMember).toBe(false);
      expect(result.record.memberUids).toEqual(['owner', 'me']);
      expect(result.record.memberCount).toBe(2);
    }
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].data).toEqual({
      memberUids: { __arrayUnion: ['me'] },
      updatedAt: '__SERVER_TS__',
    });
    expect(arrayUnion).toHaveBeenCalledWith('me');
  });

  it('is idempotent: re-joining a class does not write again', async () => {
    const { updateCalls } = scriptTransactions([
      { exists: true, data: { ownerUid: 'owner', memberUids: ['owner', 'me'] } },
    ]);

    const result = await joinClass(db, { uid: 'me', code: 'TEAMX9' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyMember).toBe(true);
    }
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects an unknown class code', async () => {
    scriptTransactions([{ exists: false }]);

    const result = await joinClass(db, { uid: 'me', code: 'NOPE12' });

    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('rejects a malformed code without touching Firestore', async () => {
    const result = await joinClass(db, { uid: 'me', code: '??' });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-code' });
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });
});

describe('leaveClass', () => {
  it('removes the caller when they are a member', async () => {
    const { updateCalls } = scriptTransactions([
      { exists: true, data: { ownerUid: 'owner', memberUids: ['owner', 'me'] } },
    ]);

    const result = await leaveClass(db, { uid: 'me', code: 'TEAMX9' });

    expect(result).toEqual({ ok: true, wasMember: true });
    expect(updateCalls[0].data).toEqual({
      memberUids: { __arrayRemove: ['me'] },
      updatedAt: '__SERVER_TS__',
    });
    expect(arrayRemove).toHaveBeenCalledWith('me');
  });

  it('is a no-op when the caller is not a member', async () => {
    const { updateCalls } = scriptTransactions([
      { exists: true, data: { ownerUid: 'owner', memberUids: ['owner'] } },
    ]);

    const result = await leaveClass(db, { uid: 'me', code: 'TEAMX9' });

    expect(result).toEqual({ ok: true, wasMember: false });
    expect(updateCalls).toHaveLength(0);
  });
});

describe('subscribeJoinedClasses', () => {
  it('normalizes + sorts the live snapshot and forwards errors', () => {
    let emit: ((snapshot: unknown) => void) | undefined;
    let fail: (() => void) | undefined;
    const unsubscribe = vi.fn();

    mockedOnSnapshot.mockImplementation(
      (_query: unknown, onNext: unknown, onError: unknown) => {
        emit = onNext as (snapshot: unknown) => void;
        fail = onError as () => void;
        return unsubscribe;
      },
    );

    const onClasses = vi.fn();
    const onError = vi.fn();
    const stop = subscribeJoinedClasses(db, 'me', onClasses, onError);

    emit?.({
      docs: [
        { id: 'BCLASS', data: () => ({ name: 'B', ownerUid: 'o', memberUids: ['me'] }) },
        { id: 'ACLASS', data: () => ({ name: 'A', ownerUid: 'o', memberUids: ['me'] }) },
      ],
    });

    expect(onClasses).toHaveBeenCalledWith([
      expect.objectContaining({ code: 'ACLASS', name: 'A' }),
      expect.objectContaining({ code: 'BCLASS', name: 'B' }),
    ]);

    fail?.();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(stop).toBe(unsubscribe);
  });
});
