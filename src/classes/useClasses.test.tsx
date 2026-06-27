import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClasses } from './useClasses';
import type { ClassRecord } from './classData';

// Auth, progress, Firebase `db`, the classes data layer, and the public-profile
// upsert are all mocked (mirroring useLeaderboard.test.tsx) so each test pins the
// viewer + availability and asserts the orchestration without a network.
type ViewerUser = { uid: string; displayName: string | null; email: string | null };
const viewer: { user: ViewerUser | null } = { user: null };
const local = { totalXp: 0 };

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  createClass: vi.fn(),
  joinClass: vi.fn(),
  leaveClass: vi.fn(),
  subscribeJoinedClasses: vi.fn(),
  upsertLeaderboardEntry: vi.fn(),
  updateDisplayName: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: viewer.user, updateDisplayName: mocks.updateDisplayName }),
}));

vi.mock('../data/lessons', () => ({ lessons: [] }));

vi.mock('../lessons/lessonProgress', () => ({
  useLessonProgress: () => ({ progress: { totalXp: local.totalXp } }),
}));

vi.mock('../lib/firebase', () => ({
  get db() {
    return mocks.db;
  },
  auth: null,
}));

vi.mock('../leaderboard/leaderboardFirestore', () => ({
  upsertLeaderboardEntry: mocks.upsertLeaderboardEntry,
}));

vi.mock('./classData', () => ({
  createClass: mocks.createClass,
  joinClass: mocks.joinClass,
  leaveClass: mocks.leaveClass,
  subscribeJoinedClasses: mocks.subscribeJoinedClasses,
}));

function makeRecord(overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    code: 'ABCD12',
    name: 'Alpha',
    ownerUid: 'me',
    memberUids: ['me'],
    memberCount: 1,
    createdAtMillis: null,
    ...overrides,
  };
}

beforeEach(() => {
  viewer.user = null;
  local.totalXp = 0;
  mocks.db = null;
  mocks.createClass.mockReset();
  mocks.joinClass.mockReset();
  mocks.leaveClass.mockReset();
  mocks.subscribeJoinedClasses.mockReset();
  mocks.subscribeJoinedClasses.mockReturnValue(() => {});
  mocks.upsertLeaderboardEntry.mockReset();
  mocks.upsertLeaderboardEntry.mockResolvedValue(undefined);
  mocks.updateDisplayName.mockReset();
  mocks.updateDisplayName.mockResolvedValue(undefined);
});

describe('useClasses availability', () => {
  it('is unavailable (and never subscribes) when Firebase is not configured', async () => {
    mocks.db = null;
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };

    const { result } = renderHook(() => useClasses());

    expect(result.current.available).toBe(false);
    expect(result.current.status).toBe('unavailable');
    expect(mocks.subscribeJoinedClasses).not.toHaveBeenCalled();

    let createResult;
    await act(async () => {
      createResult = await result.current.createClass('Team');
    });
    expect(createResult).toMatchObject({ ok: false });
    expect(mocks.createClass).not.toHaveBeenCalled();
  });

  it('is unavailable when signed out even with Firebase configured', () => {
    mocks.db = { name: 'db' };
    viewer.user = null;

    const { result } = renderHook(() => useClasses());

    expect(result.current.available).toBe(true);
    expect(result.current.signedIn).toBe(false);
    expect(result.current.status).toBe('unavailable');
    expect(mocks.subscribeJoinedClasses).not.toHaveBeenCalled();
  });
});

describe('useClasses live list', () => {
  it('subscribes for the signed-in user and exposes the joined classes', async () => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    mocks.subscribeJoinedClasses.mockImplementation((_db, _uid, onClasses) => {
      onClasses([makeRecord({ code: 'ALPHA1', name: 'Alpha' })]);
      return () => {};
    });

    const { result } = renderHook(() => useClasses());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.classes).toHaveLength(1);
    expect(result.current.classes[0]).toMatchObject({ code: 'ALPHA1', name: 'Alpha' });
    expect(result.current.displayName).toBe('Maya');
    expect(mocks.subscribeJoinedClasses).toHaveBeenCalledWith(
      mocks.db,
      'me',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('flags an error when the live listener fails', async () => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    mocks.subscribeJoinedClasses.mockImplementation((_db, _uid, _onClasses, onError) => {
      onError();
      return () => {};
    });

    const { result } = renderHook(() => useClasses());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.status).toBe('ready');
  });
});

describe('useClasses actions', () => {
  beforeEach(() => {
    mocks.db = { name: 'db' };
    viewer.user = { uid: 'me', displayName: 'Maya', email: 'maya@example.com' };
    local.totalXp = 450;
  });

  it('creates a class and syncs the public profile on success', async () => {
    mocks.createClass.mockResolvedValue({ ok: true, record: makeRecord({ code: 'CALC26' }) });

    const { result } = renderHook(() => useClasses());

    let created;
    await act(async () => {
      created = await result.current.createClass('Period 3', 'CALC26');
    });

    expect(created).toMatchObject({ ok: true });
    expect(mocks.createClass).toHaveBeenCalledWith(mocks.db, {
      ownerUid: 'me',
      customCode: 'CALC26',
      name: 'Period 3',
    });
    expect(mocks.upsertLeaderboardEntry).toHaveBeenCalledWith(mocks.db, {
      uid: 'me',
      displayName: 'Maya',
      totalXp: 450,
    });
  });

  it('does not sync the profile when create fails', async () => {
    mocks.createClass.mockResolvedValue({ ok: false, reason: 'code-taken', message: 'taken' });

    const { result } = renderHook(() => useClasses());

    await act(async () => {
      await result.current.createClass('Period 3', 'CALC26');
    });

    expect(mocks.upsertLeaderboardEntry).not.toHaveBeenCalled();
  });

  it('joins a class and syncs the public profile on success', async () => {
    mocks.joinClass.mockResolvedValue({
      ok: true,
      alreadyMember: false,
      record: makeRecord({ code: 'TEAMX9' }),
    });

    const { result } = renderHook(() => useClasses());

    let joined;
    await act(async () => {
      joined = await result.current.joinClass('teamx9');
    });

    expect(joined).toMatchObject({ ok: true });
    expect(mocks.joinClass).toHaveBeenCalledWith(mocks.db, { uid: 'me', code: 'teamx9' });
    expect(mocks.upsertLeaderboardEntry).toHaveBeenCalled();
  });

  it('leaves a class via the data layer', async () => {
    mocks.leaveClass.mockResolvedValue({ ok: true, wasMember: true });

    const { result } = renderHook(() => useClasses());

    let left;
    await act(async () => {
      left = await result.current.leaveClass('TEAMX9');
    });

    expect(left).toMatchObject({ ok: true });
    expect(mocks.leaveClass).toHaveBeenCalledWith(mocks.db, { uid: 'me', code: 'TEAMX9' });
  });

  it('updates the display name through auth and re-syncs the profile', async () => {
    const { result } = renderHook(() => useClasses());

    let renamed;
    await act(async () => {
      renamed = await result.current.updateDisplayName('Ada Lovelace');
    });

    expect(renamed).toEqual({ ok: true });
    expect(mocks.updateDisplayName).toHaveBeenCalledWith('Ada Lovelace');
    expect(mocks.upsertLeaderboardEntry).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ uid: 'me', displayName: 'Ada Lovelace' }),
    );
  });

  it('rejects an empty display name without calling auth', async () => {
    const { result } = renderHook(() => useClasses());

    let renamed;
    await act(async () => {
      renamed = await result.current.updateDisplayName('   ');
    });

    expect(renamed).toMatchObject({ ok: false });
    expect(mocks.updateDisplayName).not.toHaveBeenCalled();
  });
});
