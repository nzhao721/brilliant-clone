import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaderboard, type UseLeaderboardResult } from '../leaderboard/useLeaderboard';
import { useClasses, type UseClassesResult } from '../classes/useClasses';
import { useClassLeaderboard } from '../classes/useClassLeaderboard';
import type { ClassRecord } from '../classes/classData';
import { LeaderboardPage } from './LeaderboardPage';

/* The page composes useLeaderboard + useClasses + useClassLeaderboard; all three mocked to drive each board/tab state without Firebase. */
vi.mock('../leaderboard/useLeaderboard', () => ({ useLeaderboard: vi.fn() }));
vi.mock('../classes/useClasses', () => ({ useClasses: vi.fn() }));
vi.mock('../classes/useClassLeaderboard', () => ({ useClassLeaderboard: vi.fn() }));

const mockedUseLeaderboard = vi.mocked(useLeaderboard);
const mockedUseClasses = vi.mocked(useClasses);
const mockedUseClassLeaderboard = vi.mocked(useClassLeaderboard);

function leaderboardResult(overrides: Partial<UseLeaderboardResult> = {}): UseLeaderboardResult {
  return {
    status: 'ready',
    entries: [],
    currentUserRank: null,
    currentUserOutsideTop: null,
    topN: 10,
    ...overrides,
  };
}

function makeClassManager(overrides: Partial<UseClassesResult> = {}): UseClassesResult {
  return {
    available: false,
    signedIn: false,
    status: 'unavailable',
    classes: [],
    error: false,
    displayName: 'You',
    createClass: vi.fn(),
    joinClass: vi.fn(),
    leaveClass: vi.fn(),
    updateDisplayName: vi.fn(),
    ...overrides,
  };
}

function makeClassRecord(overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    code: 'ALPHA1',
    name: 'Alpha Class',
    ownerUid: 'me',
    memberUids: ['me'],
    memberCount: 1,
    createdAtMillis: null,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LeaderboardPage />
    </MemoryRouter>,
  );
}

const rankedEntries = [
  { id: 'u1', displayName: 'Aria Khanna', xp: 2400, rank: 1, isCurrentUser: false },
  { id: 'u2', displayName: 'Maya Johnson', xp: 1800, rank: 2, isCurrentUser: true },
  { id: 'u3', displayName: 'Carl Gauss', xp: 900, rank: 3, isCurrentUser: false },
];

beforeEach(() => {
  mockedUseLeaderboard.mockReset();
  mockedUseClasses.mockReset();
  mockedUseClassLeaderboard.mockReset();
  // Default: no classes (unavailable), so only the Global board shows.
  mockedUseClasses.mockReturnValue(makeClassManager());
  mockedUseClassLeaderboard.mockReturnValue(leaderboardResult());
});

describe('LeaderboardPage (global board)', () => {
  it('always renders the page heading', () => {
    mockedUseLeaderboard.mockReturnValue(leaderboardResult({ status: 'loading' }));

    renderPage();

    expect(screen.getByRole('heading', { name: 'Leaderboard' })).toBeInTheDocument();
  });

  it('shows a loading indicator while building the board', () => {
    mockedUseLeaderboard.mockReturnValue(leaderboardResult({ status: 'loading' }));

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading leaderboard' })).toBeInTheDocument();
  });

  it('surfaces an error state', () => {
    mockedUseLeaderboard.mockReturnValue(leaderboardResult({ status: 'error' }));

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load the leaderboard/i);
  });

  it('shows an empty state when there are no ranked learners', () => {
    mockedUseLeaderboard.mockReturnValue(leaderboardResult({ status: 'ready', entries: [] }));

    renderPage();

    expect(screen.getByText('No scores yet')).toBeInTheDocument();
  });

  it('renders ranked rows in order with XP and highlights the current user', () => {
    mockedUseLeaderboard.mockReturnValue(
      leaderboardResult({ status: 'ready', entries: rankedEntries, currentUserRank: 2 }),
    );

    renderPage();

    const list = screen.getByRole('list', { name: /Top 10 learners ranked by XP/i });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('Aria Khanna');
    expect(rows[1]).toHaveTextContent('Maya Johnson');
    expect(rows[2]).toHaveTextContent('Carl Gauss');
    expect(rows[0]).toHaveTextContent('2,400');
    expect(rows[0]).toHaveClass('leaderboard-row-rank-1');

    const ownRow = screen.getByText('Maya Johnson').closest('li') as HTMLElement;
    expect(ownRow).toHaveAttribute('aria-current', 'true');
    expect(within(ownRow).getByText('You')).toBeInTheDocument();

    expect(screen.getByText('Your standing')).toBeInTheDocument();
    expect(screen.getByText(/#2/)).toBeInTheDocument();
  });

  it('pins the current user below the list when they rank outside the top window', () => {
    mockedUseLeaderboard.mockReturnValue(
      leaderboardResult({
        status: 'ready',
        entries: rankedEntries.map((entry) => ({ ...entry, isCurrentUser: false })),
        currentUserRank: 57,
        currentUserOutsideTop: {
          id: 'me',
          displayName: 'Solo Learner',
          xp: 120,
          rank: 57,
          isCurrentUser: true,
        },
      }),
    );

    renderPage();

    expect(screen.getByRole('separator')).toBeInTheDocument();

    const ownRow = screen.getByText('Solo Learner').closest('li') as HTMLElement;
    expect(ownRow).toHaveAttribute('aria-current', 'true');
    expect(ownRow).toHaveTextContent('57');
    expect(ownRow).toHaveTextContent('120');
  });
});

describe('LeaderboardPage (class tabs)', () => {
  beforeEach(() => {
    mockedUseLeaderboard.mockReturnValue(
      leaderboardResult({ status: 'ready', entries: rankedEntries, currentUserRank: 2 }),
    );
  });

  it('only shows the Global tab when the user has no classes', () => {
    renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Leaderboards' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveTextContent('Global');
  });

  it('renders a tab per joined class and switches to its board on click', async () => {
    const user = userEvent.setup();
    mockedUseClasses.mockReturnValue(
      makeClassManager({
        available: true,
        signedIn: true,
        status: 'ready',
        classes: [makeClassRecord()],
        displayName: 'Maya',
      }),
    );
    mockedUseClassLeaderboard.mockReturnValue(
      leaderboardResult({
        status: 'ready',
        currentUserRank: 1,
        entries: [
          { id: 'me', displayName: 'Maya', xp: 500, rank: 1, isCurrentUser: true },
          { id: 'pat', displayName: 'Pat', xp: 300, rank: 2, isCurrentUser: false },
        ],
      }),
    );

    renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Leaderboards' });
    const classTab = within(tablist).getByRole('tab', { name: 'Alpha Class' });

    await user.click(classTab);

    const classList = await screen.findByRole('list', {
      name: /Alpha Class members ranked by XP/i,
    });
    const rows = within(classList).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Maya'),
      expect.stringContaining('Pat'),
    ]);

    // The viewer's own row is highlighted in the class board too.
    const ownRow = within(classList).getByText('Maya').closest('li') as HTMLElement;
    expect(ownRow).toHaveAttribute('aria-current', 'true');
  });

  it('falls back to the Global board when the active class disappears', async () => {
    const user = userEvent.setup();
    mockedUseClasses.mockReturnValue(
      makeClassManager({
        available: true,
        signedIn: true,
        status: 'ready',
        classes: [makeClassRecord()],
        displayName: 'Maya',
      }),
    );
    mockedUseClassLeaderboard.mockReturnValue(
      leaderboardResult({ status: 'ready', entries: [], currentUserRank: 1 }),
    );

    const { rerender } = renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Leaderboards' });
    await user.click(within(tablist).getByRole('tab', { name: 'Alpha Class' }));

    // The class is removed (e.g. the user left it): the page should fall back.
    mockedUseClasses.mockReturnValue(
      makeClassManager({ available: true, signedIn: true, status: 'ready', classes: [], displayName: 'Maya' }),
    );
    rerender(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('list', { name: /Top 10 learners ranked by XP/i })).toBeInTheDocument(),
    );
  });
});
