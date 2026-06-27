import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GamePlayPage } from './GamePlayPage';

/* Resolve only one known id to exercise the found + not-found branches without the real registry. */
vi.mock('../games', () => ({
  getGameById: (id: string) =>
    id === 'flappy-bird'
      ? {
          id: 'flappy-bird',
          name: 'Flappy',
          description: 'Flap through the gaps.',
          billing: { mode: 'per-second', coinsPerSecond: 2 },
          Component: () => null,
        }
      : undefined,
}));

/* Shell has its own suite; here just confirm the matched game is handed to it. */
vi.mock('../games/GameShell', () => ({
  GameShell: ({ game }: { game: { name: string } }) => <div>Now playing {game.name}</div>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games" element={<div>Arcade homepage</div>} />
        <Route path="/games/:gameId" element={<GamePlayPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GamePlayPage', () => {
  it('renders the shell for a known game id', () => {
    renderAt('/games/flappy-bird');

    expect(screen.getByText('Now playing Flappy')).toBeInTheDocument();
  });

  it('redirects an unknown game id back to the arcade homepage', () => {
    renderAt('/games/does-not-exist');

    expect(screen.getByText('Arcade homepage')).toBeInTheDocument();
    expect(screen.queryByText(/now playing/i)).not.toBeInTheDocument();
  });
});
