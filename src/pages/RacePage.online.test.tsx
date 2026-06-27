import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSnapshot, RaceMatch } from '../race/raceMatch';
import { useRaceMatch } from '../race/useRaceMatch';
import { RacePage } from './RacePage';

/* Online (N-player) RacePage flows: host lobby, multi-opponent hand-off, ranked result. Needs db + full
   match control, so mock useRaceMatch, stub RaceView to a probe of its opponent list, and mock auth + progress.
   (Bot flows live in RacePage.test.tsx.) */
vi.mock('../lib/firebase', () => ({ db: { name: 'mock-db' } }));

vi.mock('../auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { uid: 'me', displayName: 'Me' }, loading: false, isConfigured: true }),
}));

vi.mock('../lessons/lessonProgress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lessons/lessonProgress')>();
  return {
    ...actual,
    /* Stub only the hook so RacePage renders without Firestore; the rest of the module stays real for callers like unlockedChapters. */
    useLessonProgress: () => ({ completedLessonIds: [], awardPracticeQuestion: () => {} }),
  };
});

/* Probe RaceView: renders the opponent names it got (to assert N opponents wired per mode) and a
   "finish" button firing onPlayerFinish (to simulate the local crossing + optimistic result). */
vi.mock('../race/RaceView', () => ({
  RaceView: ({
    opponents,
    onPlayerFinish,
  }: {
    opponents: Array<{ id: string; name: string }>;
    onPlayerFinish?: (snapshot: {
      playerPosition: number;
      opponentPosition: number;
      at: number;
    }) => void;
  }) => (
    <div data-testid="race-view">
      {opponents.map((opponent) => (
        <span key={opponent.id} data-testid="race-opponent">
          {opponent.name}
        </span>
      ))}
      <button
        type="button"
        data-testid="race-finish"
        onClick={() => onPlayerFinish?.({ playerPosition: 2500, opponentPosition: 1800, at: 1000 })}
      >
        finish
      </button>
    </div>
  ),
}));

vi.mock('../race/useRaceMatch', () => ({ useRaceMatch: vi.fn() }));

const mockUseRaceMatch = vi.mocked(useRaceMatch);

function makeMatch(overrides: Partial<RaceMatch> = {}): RaceMatch {
  return {
    code: 'ABCDE',
    status: 'waiting',
    seed: 1,
    chapterIds: [],
    raceDistance: 2500,
    hostUid: 'me',
    participants: ['me'],
    winnerUid: null,
    ...overrides,
  };
}

function makePlayer(uid: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    uid,
    displayName: uid.toUpperCase(),
    position: 0,
    velocity: 0,
    finished: false,
    finishedAt: null,
    ...overrides,
  };
}

function setRace(overrides: Partial<ReturnType<typeof useRaceMatch>> = {}) {
  const value: ReturnType<typeof useRaceMatch> = {
    match: null,
    me: null,
    opponents: [],
    players: [],
    participants: [],
    isHost: false,
    status: 'waiting',
    error: null,
    createMatch: vi.fn(),
    joinMatch: vi.fn(),
    startRace: vi.fn(),
    reportMyCar: vi.fn(),
    claimFinish: vi.fn(),
    ...overrides,
  };
  mockUseRaceMatch.mockReturnValue(value);
  return value;
}

/* Deep-link route into online mode + friend lobby; live match status drives lobby/race/result. */
function appTree(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/race" element={<RacePage />} />
        <Route path="/race/:matchId" element={<RacePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAt(path: string) {
  return render(appTree(path));
}

/* A hand-resolved promise to hold a create/join in flight and assert the loading UI. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* From the choose screen, open the friend create/join panel (signed in, online, not in a room). */
function openFriendLobby() {
  renderAt('/race');
  fireEvent.click(screen.getByRole('button', { name: /play a friend/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('RacePage online lobby (host-controlled, N players)', () => {
  it('lists every joined player and badges the host', () => {
    setRace({
      match: makeMatch({ hostUid: 'host', participants: ['host', 'me', 'b'] }),
      me: makePlayer('me'),
      participants: ['host', 'me', 'b'],
      players: [
        makePlayer('host', { displayName: 'Hank' }),
        makePlayer('me', { displayName: 'Me' }),
        makePlayer('b', { displayName: 'Bea' }),
      ],
      isHost: false,
      status: 'waiting',
    });

    renderAt('/race/ABCDE');

    const roster = screen.getByRole('region', { name: /players in this race/i });
    expect(roster).toHaveTextContent('Hank');
    expect(roster).toHaveTextContent('Me');
    expect(roster).toHaveTextContent('Bea');
    // The host row is badged; the player count reflects all three.
    expect(screen.getByText('Host')).toBeInTheDocument();
  });

  it("disables the host's Start until a second player joins", () => {
    setRace({
      match: makeMatch({ participants: ['me'] }),
      me: makePlayer('me'),
      participants: ['me'],
      players: [makePlayer('me')],
      isHost: true,
      status: 'waiting',
    });

    renderAt('/race/ABCDE');

    expect(screen.getByRole('button', { name: /start race/i })).toBeDisabled();
    expect(screen.getByText(/waiting for at least one more player/i)).toBeInTheDocument();
  });

  it('enables the host Start with 2+ players and calls startRace on click', () => {
    const race = setRace({
      match: makeMatch({ participants: ['me', 'a', 'b'] }),
      me: makePlayer('me'),
      opponents: [makePlayer('a'), makePlayer('b')],
      participants: ['me', 'a', 'b'],
      players: [makePlayer('me'), makePlayer('a'), makePlayer('b')],
      isHost: true,
      status: 'waiting',
    });

    renderAt('/race/ABCDE');

    const start = screen.getByRole('button', { name: /start race/i });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(race.startRace).toHaveBeenCalledTimes(1);
  });

  it('shows non-hosts a waiting-for-host message (no Start control)', () => {
    setRace({
      match: makeMatch({ hostUid: 'host', participants: ['host', 'me'] }),
      me: makePlayer('me'),
      opponents: [makePlayer('host')],
      participants: ['host', 'me'],
      players: [makePlayer('host'), makePlayer('me')],
      isHost: false,
      status: 'waiting',
    });

    renderAt('/race/ABCDE');

    expect(screen.getByText(/waiting for the host to start/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start race/i })).not.toBeInTheDocument();
  });
});

describe('RacePage online race + result (N players)', () => {
  it('wires every opponent into the race view once racing', () => {
    setRace({
      match: makeMatch({ status: 'racing', participants: ['me', 'a', 'b', 'c'] }),
      me: makePlayer('me'),
      opponents: [
        makePlayer('a', { displayName: 'Aaa' }),
        makePlayer('b', { displayName: 'Bbb' }),
        makePlayer('c', { displayName: 'Ccc' }),
      ],
      participants: ['me', 'a', 'b', 'c'],
      players: [makePlayer('me'), makePlayer('a'), makePlayer('b'), makePlayer('c')],
      isHost: true,
      status: 'racing',
    });

    renderAt('/race/ABCDE');

    const opponents = screen.getAllByTestId('race-opponent');
    expect(opponents).toHaveLength(3);
    expect(opponents.map((node) => node.textContent)).toEqual(['Aaa', 'Bbb', 'Ccc']);
  });

  it('ranks ALL participants by finish order on the result screen (3+ players)', () => {
    setRace({
      match: makeMatch({ status: 'finished', participants: ['me', 'a', 'b'], winnerUid: 'a' }),
      me: makePlayer('me', { position: 2500, finished: true, finishedAt: 1000 }),
      opponents: [
        makePlayer('a', { displayName: 'Aaa', position: 2500, finished: true, finishedAt: 500 }),
        makePlayer('b', { displayName: 'Bbb', position: 1500 }),
      ],
      participants: ['me', 'a', 'b'],
      players: [
        makePlayer('me', { displayName: 'Me', position: 2500, finished: true, finishedAt: 1000 }),
        makePlayer('a', { displayName: 'Aaa', position: 2500, finished: true, finishedAt: 500 }),
        makePlayer('b', { displayName: 'Bbb', position: 1500 }),
      ],
      isHost: false,
      status: 'finished',
    });

    const { container } = renderAt('/race/ABCDE');

    /* Earliest finisher leads, viewer second, unfinished last — every participant ranked, not just two. */
    const rows = container.querySelectorAll('.race-result-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Aaa');
    expect(rows[1].textContent).toContain('Me');
    expect(rows[2].textContent).toContain('Bbb');

    // Headline names the winner; since the viewer lost it is not "You win!".
    expect(screen.getByText('Aaa wins')).toBeInTheDocument();
    expect(screen.queryByText('You win!')).not.toBeInTheDocument();
  });

  it('celebrates the viewer when they win the N-player race', () => {
    setRace({
      match: makeMatch({ status: 'finished', participants: ['me', 'a', 'b'], winnerUid: 'me' }),
      me: makePlayer('me', { position: 2500, finished: true, finishedAt: 400 }),
      opponents: [makePlayer('a'), makePlayer('b')],
      participants: ['me', 'a', 'b'],
      players: [
        makePlayer('me', { displayName: 'Me', position: 2500, finished: true, finishedAt: 400 }),
        makePlayer('a', { displayName: 'Aaa', position: 2500, finished: true, finishedAt: 900 }),
        makePlayer('b', { displayName: 'Bbb', position: 2000 }),
      ],
      isHost: true,
      status: 'finished',
    });

    renderAt('/race/ABCDE');

    expect(screen.getByText('You win!')).toBeInTheDocument();
  });

  it('shows the result the INSTANT the local player finishes — no server round-trip', () => {
    const race = setRace({
      match: makeMatch({ status: 'racing', participants: ['me', 'a'], winnerUid: null }),
      me: makePlayer('me', { displayName: 'Me' }),
      opponents: [makePlayer('a', { displayName: 'Aaa' })],
      participants: ['me', 'a'],
      players: [makePlayer('me', { displayName: 'Me' }), makePlayer('a', { displayName: 'Aaa' })],
      isHost: true,
      status: 'racing',
    });

    renderAt('/race/ABCDE');

    // Racing: the (probe) race view is up and there is no result yet.
    expect(screen.getByTestId('race-view')).toBeInTheDocument();
    expect(screen.queryByText('You win!')).not.toBeInTheDocument();

    // The local car crosses the line.
    fireEvent.click(screen.getByTestId('race-finish'));

    /* Result appears at once and the race view is gone, even though the match is still 'racing' with no winnerUid — the label is optimistic. */
    expect(screen.getByText('You win!')).toBeInTheDocument();
    expect(screen.queryByTestId('race-view')).not.toBeInTheDocument();
    /* …and the finish was reported at once (write + claim), stamped with the crossing time so the true earliest finisher still wins. */
    expect(race.claimFinish).toHaveBeenCalledWith(1000);
  });

  it('reconciles an optimistic "You win!" to the opponent if the server says they crossed first', () => {
    setRace({
      match: makeMatch({ status: 'racing', participants: ['me', 'a'], winnerUid: null }),
      me: makePlayer('me', { displayName: 'Me' }),
      opponents: [makePlayer('a', { displayName: 'Aaa' })],
      participants: ['me', 'a'],
      players: [makePlayer('me', { displayName: 'Me' }), makePlayer('a', { displayName: 'Aaa' })],
      isHost: true,
      status: 'racing',
    });

    const { rerender } = renderAt('/race/ABCDE');
    fireEvent.click(screen.getByTestId('race-finish'));
    // Optimistic celebration first…
    expect(screen.getByText('You win!')).toBeInTheDocument();

    /* …then the authoritative result lands: the opponent finished first (earlier finishedAt, recorded winner). */
    setRace({
      match: makeMatch({ status: 'finished', participants: ['me', 'a'], winnerUid: 'a' }),
      me: makePlayer('me', { displayName: 'Me', finished: true, finishedAt: 1000, position: 2500 }),
      opponents: [
        makePlayer('a', { displayName: 'Aaa', finished: true, finishedAt: 500, position: 2500 }),
      ],
      participants: ['me', 'a'],
      players: [
        makePlayer('me', { displayName: 'Me', finished: true, finishedAt: 1000, position: 2500 }),
        makePlayer('a', { displayName: 'Aaa', finished: true, finishedAt: 500, position: 2500 }),
      ],
      isHost: true,
      status: 'finished',
    });
    rerender(appTree('/race/ABCDE'));

    // The headline reconciles to the true winner; "You win!" is gone.
    expect(screen.getByText('Aaa wins')).toBeInTheDocument();
    expect(screen.queryByText('You win!')).not.toBeInTheDocument();
  });
});

describe('RacePage friend lobby — create/join feedback', () => {
  it('shows a spinner and disables Create the instant it is clicked (no frozen button)', async () => {
    // Hold the create write "in flight" so the loading state is observable.
    const pending = deferred<string | null>();
    setRace({ createMatch: vi.fn(() => pending.promise) });

    openFriendLobby();

    fireEvent.click(screen.getByRole('button', { name: /^create race$/i }));

    /* Immediate feedback: label goes busy, button disabled (no second match) + aria-busy. */
    const busy = await screen.findByRole('button', { name: /creating race/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy.querySelector('.race-spinner')).not.toBeNull();
  });

  it('surfaces a clear error and clears the spinner when create fails (returns null)', async () => {
    /* createMatch → null is the hook's failure signal; the click must not be a silent no-op. */
    setRace({ createMatch: vi.fn().mockResolvedValue(null) });

    openFriendLobby();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^create race$/i }));
    });

    // A user-facing reason appears…
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't create the race/i);
    // …and the button has returned to its idle, clickable state (spinner gone).
    const createButton = screen.getByRole('button', { name: /^create race$/i });
    expect(createButton).toBeEnabled();
    expect(createButton).toHaveAttribute('aria-busy', 'false');
  });

  it('guards against double-submits while a create is in flight', async () => {
    const pending = deferred<string | null>();
    const createMatch = vi.fn(() => pending.promise);
    setRace({ createMatch });

    openFriendLobby();

    const create = screen.getByRole('button', { name: /^create race$/i });
    fireEvent.click(create);
    // Second click while the first is still pending must be ignored.
    fireEvent.click(await screen.findByRole('button', { name: /creating race/i }));

    expect(createMatch).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner on Join and surfaces an error when the join fails', async () => {
    setRace({ joinMatch: vi.fn().mockResolvedValue(false) });

    openFriendLobby();

    fireEvent.change(screen.getByLabelText(/race code/i), { target: { value: 'ABCDE' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^join race$/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't join the race/i);
    expect(screen.getByRole('button', { name: /^join race$/i })).toBeEnabled();
  });
});
